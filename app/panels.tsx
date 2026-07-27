"use client";

// Control-plane panels: everything an operator changes or watches, straight against the API.
//   SettingsPanel  – every config key (GET/PUT/DELETE /settings) grouped by section
//   DomainsPanel   – the domain registry (GET/POST/PUT/DELETE /domains)
//   ServicesPanel  – background services + worker fleet + datastore probes
//   MetricsPanel   – the Prometheus text exposition, parsed into readable tables
//
// Config lives in the database (ADR-005), so these panels are the real control surface: no
// config.toml edit + redeploy for anything shown here.

import { AlertTriangle, ArrowLeft, Check, Loader2, Play, Plus, RefreshCw, RotateCcw, Square, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

type Json = Record<string, unknown>;

async function api(path: string, init?: RequestInit) {
  const res = await fetch(`/api/vayurix${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  const type = res.headers.get("content-type") ?? "";
  const body = type.includes("json") ? await res.json().catch(() => null) : await res.text();
  if (!res.ok) {
    const detail = typeof body === "string" ? body : ((body as Json | null)?.error ?? JSON.stringify(body));
    throw new Error(String(detail || res.status));
  }
  return body;
}

const asArray = (v: unknown, key: string): Json[] => {
  if (Array.isArray(v)) return v as Json[];
  const inner = (v as Json | null)?.[key];
  return Array.isArray(inner) ? (inner as Json[]) : [];
};

/** Run an async loader on mount, and optionally on an interval.
 *
 *  The loader flips React state (loading/rows), and React 19's compiler lint rejects calling
 *  setState synchronously inside an effect body (`react-hooks/set-state-in-effect`) because it
 *  cascades renders. Deferring the first call by a macrotask keeps the effect body side-effect
 *  free while behaving identically to the user. */
export function usePoll(load: () => void | Promise<unknown>, everyMs?: number) {
  useEffect(() => {
    const kick = window.setTimeout(() => void load(), 0);
    const tick = everyMs ? window.setInterval(() => void load(), everyMs) : undefined;
    return () => {
      window.clearTimeout(kick);
      if (tick) window.clearInterval(tick);
    };
  }, [load, everyMs]);
}

/** Toast-ish inline feedback shared by all panels. */
function useFlash() {
  const [flash, setFlash] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const show = useCallback((tone: "ok" | "bad", text: string) => {
    setFlash({ tone, text });
    window.setTimeout(() => setFlash(null), 3600);
  }, []);
  const node = flash ? (
    <p className={`flash ${flash.tone}`}>
      {flash.tone === "ok" ? <Check size={14} /> : <AlertTriangle size={14} />}
      {flash.text}
    </p>
  ) : null;
  return { show, node };
}

// ---------------------------------------------------------------- settings

type Setting = { key: string; value: unknown; overridden: boolean };

const scalarText = (v: unknown) => (v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v));

/** Re-encode the edited text using the CURRENT value's type, so PUT keeps the API's schema
 *  (a number stays a number, a bool stays a bool) instead of turning everything into strings. */
function encodeLike(original: unknown, text: string): unknown {
  if (typeof original === "boolean") return text === "true";
  if (typeof original === "number") {
    const n = Number(text);
    if (!Number.isFinite(n)) throw new Error("must be a number");
    return n;
  }
  if (original !== null && typeof original === "object") return JSON.parse(text);
  return text;
}

export function SettingsPanel() {
  const [rows, setRows] = useState<Setting[]>([]);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const { show, node } = useFlash();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const body = await api("/settings");
      setRows(asArray(body, "settings").map(r => ({ key: String(r.key), value: r.value, overridden: r.overridden === true })));
      setDraft({});
    } catch (e) {
      show("bad", `Could not load settings: ${(e as Error).message}`);
    }
    setLoading(false);
  }, [show]);

  usePoll(load);

  const save = async (row: Setting) => {
    setBusy(row.key);
    try {
      const value = encodeLike(row.value, draft[row.key] ?? scalarText(row.value));
      await api("/settings", { method: "PUT", body: JSON.stringify({ key: row.key, value }) });
      show("ok", `${row.key} updated`);
      await load();
    } catch (e) {
      show("bad", `${row.key}: ${(e as Error).message}`);
    }
    setBusy(null);
  };

  const reset = async (row: Setting) => {
    setBusy(row.key);
    try {
      await api(`/settings/${encodeURIComponent(row.key)}`, { method: "DELETE" });
      show("ok", `${row.key} reverted to the file default`);
      await load();
    } catch (e) {
      show("bad", `${row.key}: ${(e as Error).message}`);
    }
    setBusy(null);
  };

  const sections = useMemo(() => {
    const map = new Map<string, Setting[]>();
    for (const r of rows) {
      const section = r.key.split(".")[0] ?? "other";
      map.set(section, [...(map.get(section) ?? []), r]);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [rows]);

  if (loading) return <Loading label="Reading configuration…" />;

  return (
    <section className="stack-panels">
      {node}
      <p className="hint">
        Config lives in the database. Runtime knobs (channel, thresholds, timings) apply immediately;
        start-time ones (kafka, model endpoints, worker timings, loop cadences) need
        <b> Services → Restart</b>. Reverting a key restores the value from <code>config.toml</code>.
      </p>
      {sections.map(([section, items]) => (
        <article className="panel" key={section}>
          <header className="panel-head"><div><p>{items.length} keys</p><h2>{section}</h2></div></header>
          <div className="settings-rows">
            {items.map(row => {
              const text = draft[row.key] ?? scalarText(row.value);
              const dirty = text !== scalarText(row.value);
              const isBool = typeof row.value === "boolean";
              return (
                <div className="setting-row" key={row.key}>
                  <label>
                    <code>{row.key.split(".").slice(1).join(".")}</code>
                    {row.overridden && <em title="Stored in app_settings (differs from / overrides the file)">db</em>}
                  </label>
                  {isBool ? (
                    <select value={text} onChange={e => setDraft(d => ({ ...d, [row.key]: e.target.value }))}>
                      <option value="true">true</option>
                      <option value="false">false</option>
                    </select>
                  ) : (
                    <input value={text} onChange={e => setDraft(d => ({ ...d, [row.key]: e.target.value }))} spellCheck={false} />
                  )}
                  <div className="setting-actions">
                    <button className="primary" disabled={!dirty || busy === row.key} onClick={() => void save(row)}>
                      {busy === row.key ? <Loader2 className="spin" size={13} /> : <Check size={13} />} Save
                    </button>
                    <button className="ghost" title="Revert to the config.toml value" disabled={busy === row.key} onClick={() => void reset(row)}>
                      <RotateCcw size={13} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </article>
      ))}
    </section>
  );
}

// ---------------------------------------------------------------- domains

type Domain = {
  code: string; name: string; path: string; description: string | null; active: boolean;
  position: number; color: string | null; builtin: boolean;
  notify_channel: string | null; escalation_timeout_min: number | null; retention_months: number | null;
};

export function DomainsPanel() {
  const [rows, setRows] = useState<Domain[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ code: "", name: "", color: "#447fe8", position: "50" });
  const [busy, setBusy] = useState<string | null>(null);
  const { show, node } = useFlash();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows((await api("/domains")) as Domain[]);
    } catch (e) {
      show("bad", `Could not load domains: ${(e as Error).message}`);
    }
    setLoading(false);
  }, [show]);

  usePoll(load);

  const create = async () => {
    setBusy("new");
    try {
      await api("/domains", {
        method: "POST",
        body: JSON.stringify({ code: form.code.trim(), name: form.name.trim() || form.code.trim(), color: form.color, position: Number(form.position) || 100 }),
      });
      show("ok", `Domain ${form.code} registered`);
      setForm({ code: "", name: "", color: "#447fe8", position: "50" });
      await load();
    } catch (e) {
      show("bad", (e as Error).message);
    }
    setBusy(null);
  };

  const patch = async (code: string, body: Json, label: string) => {
    setBusy(code);
    try {
      await api(`/domains/${encodeURIComponent(code)}`, { method: "PUT", body: JSON.stringify(body) });
      show("ok", `${code}: ${label}`);
      await load();
    } catch (e) {
      show("bad", `${code}: ${(e as Error).message}`);
    }
    setBusy(null);
  };

  const remove = async (code: string) => {
    setBusy(code);
    try {
      await api(`/domains/${encodeURIComponent(code)}`, { method: "DELETE" });
      show("ok", `${code} deleted`);
      await load();
    } catch (e) {
      show("bad", `${code}: ${(e as Error).message}`);
    }
    setBusy(null);
  };

  if (loading) return <Loading label="Reading the domain registry…" />;

  return (
    <section className="stack-panels">
      {node}
      <p className="hint">
        A domain is the namespace an incident belongs to: its own on-call chain, its own grouping,
        its own SLA. Register one here, then point a webhook at <code>POST /ingest</code> — no deploy.
        The builtin <code>airflow_pipeline</code> domain cannot be deleted (the code depends on it);
        disable it instead if this deployment has no Airflow.
      </p>
      <article className="panel">
        <header className="panel-head"><div><p>{rows.length} registered</p><h2>Domains</h2></div></header>
        <div className="domain-rows">
          {rows.map(d => (
            <div className={`domain-row ${d.active ? "" : "off"}`} key={d.code}>
              <span className="dot" style={{ background: d.color ?? "var(--muted)" }} />
              <div className="domain-id">
                <b>{d.name}</b>
                <small><code>{d.code}</code> · /{d.path} · pos {d.position}{d.builtin && " · builtin"}</small>
              </div>
              <div className="domain-over">
                {d.notify_channel && <em>{d.notify_channel}</em>}
                {d.escalation_timeout_min != null && <em>{d.escalation_timeout_min}m escalation</em>}
                {d.retention_months != null && <em>{d.retention_months}mo retention</em>}
              </div>
              <div className="domain-row-actions">
                <button className="ghost" disabled={busy === d.code} onClick={() => void patch(d.code, { active: !d.active }, d.active ? "disabled" : "enabled")}>
                  {d.active ? <><Square size={13} /> Disable</> : <><Play size={13} /> Enable</>}
                </button>
                <button className="ghost danger" disabled={busy === d.code || d.builtin} title={d.builtin ? "Builtin domain — disable it instead" : "Delete"} onClick={() => void remove(d.code)}>
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </article>
      <article className="panel">
        <header className="panel-head"><div><p>Registry</p><h2>Add a domain</h2></div></header>
        <div className="domain-form">
          <label>code<input placeholder="it_ops" value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} /></label>
          <label>name<input placeholder="IT Operations" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></label>
          <label>position<input value={form.position} onChange={e => setForm({ ...form, position: e.target.value })} /></label>
          <label>colour<input type="color" value={form.color} onChange={e => setForm({ ...form, color: e.target.value })} /></label>
          <button className="primary" disabled={!form.code.trim() || busy === "new"} onClick={() => void create()}>
            {busy === "new" ? <Loader2 className="spin" size={13} /> : <Plus size={13} />} Register
          </button>
        </div>
        <small className="hint-inline">lowercase letters, digits and <code>_</code> only — the slug is derived automatically.</small>
      </article>
    </section>
  );
}

// ---------------------------------------------------------------- services + health

type Service = { name: string; running: boolean; start: boolean };
type WorkerBeat = { role: string; age_sec: number };

export function ServicesPanel() {
  const [services, setServices] = useState<Service[]>([]);
  const [workers, setWorkers] = useState<WorkerBeat[]>([]);
  const [stores, setStores] = useState<Json | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const { show, node } = useFlash();

  const load = useCallback(async () => {
    setLoading(true);
    const [s, w, st] = await Promise.allSettled([api("/services"), api("/health/workers"), api("/health/stores")]);
    if (s.status === "fulfilled") setServices(asArray(s.value, "services").map(r => ({ name: String(r.name), running: r.running === true, start: r.start === true })));
    if (w.status === "fulfilled") setWorkers(asArray(w.value, "workers").map(r => ({ role: String(r.role), age_sec: Number(r.age_sec ?? -1) })));
    if (st.status === "fulfilled") setStores(st.value as Json);
    setLoading(false);
  }, []);

  usePoll(load, 15000);

  const control = async (action: "start" | "stop" | "restart") => {
    setBusy(action);
    try {
      await api(`/services/${action}`, { method: "POST", body: "{}" });
      show("ok", `Services ${action}ed`);
      await load();
    } catch (e) {
      show("bad", (e as Error).message);
    }
    setBusy(null);
  };

  if (loading) return <Loading label="Probing services…" />;

  const storeOk = (k: string) => (stores?.[k] as Json | undefined)?.ok === true;

  return (
    <section className="stack-panels">
      {node}
      <p className="hint">
        Background services are the escalation / SLA / retention / lineage watchers plus the Kafka
        workers. Stopping them persists across restarts; trigger endpoints answer 503 while their
        service is down. <b>Restart</b> is what makes start-time settings take effect.
      </p>
      <article className="panel">
        <header className="panel-head">
          <div><p>Control plane</p><h2>Background services</h2></div>
          <div className="head-actions">
            <button className="ghost" disabled={!!busy} onClick={() => void control("start")}><Play size={13} /> Start all</button>
            <button className="ghost" disabled={!!busy} onClick={() => void control("restart")}><RefreshCw size={13} /> Restart</button>
            <button className="ghost danger" disabled={!!busy} onClick={() => void control("stop")}><Square size={13} /> Stop all</button>
          </div>
        </header>
        <div className="service-rows">
          {services.map(s => (
            <div className="service-row" key={s.name}>
              <i className={s.running ? "on" : "off"} />
              <b>{s.name}</b>
              <span className={`status ${s.running ? "healthy" : "offline"}`}>{s.running ? "running" : "stopped"}</span>
              <small>{s.start ? "starts on boot" : "disabled on boot"}</small>
            </div>
          ))}
        </div>
      </article>
      <section className="split">
        <article className="panel">
          <header className="panel-head"><div><p>Processing plane</p><h2>Worker heartbeats</h2></div></header>
          <div className="service-rows">
            {workers.map(w => {
              const tone = w.age_sec < 0 ? "offline" : w.age_sec <= 60 ? "healthy" : w.age_sec <= 120 ? "degraded" : "offline";
              return (
                <div className="service-row" key={w.role}>
                  <i className={tone === "healthy" ? "on" : "off"} />
                  <b>{w.role}</b>
                  <span className={`status ${tone}`}>{tone}</span>
                  <small>{w.age_sec < 0 ? "no heartbeat" : `${Math.round(w.age_sec)}s ago`}</small>
                </div>
              );
            })}
            {!workers.length && <small className="hint-inline">No heartbeats recorded yet.</small>}
          </div>
        </article>
        <article className="panel">
          <header className="panel-head"><div><p>Datastores</p><h2>Store probes</h2></div></header>
          <div className="service-rows">
            <div className="service-row"><i className={storeOk("age") ? "on" : "off"} /><b>Apache AGE</b><span className={`status ${storeOk("age") ? "healthy" : "offline"}`}>{storeOk("age") ? "cypher ok" : "failing"}</span><small>graph traversal</small></div>
            <div className="service-row"><i className={storeOk("pgvector") ? "on" : "off"} /><b>pgvector</b><span className={`status ${storeOk("pgvector") ? "healthy" : "offline"}`}>{storeOk("pgvector") ? "cosine ok" : "failing"}</span><small>embeddings / RAG</small></div>
          </div>
        </article>
      </section>
    </section>
  );
}

// ---------------------------------------------------------------- metrics

type Sample = { name: string; labels: Record<string, string>; value: number };

/** Minimal Prometheus text-exposition parser: enough for the gauges vayurix exports. */
function parsePrometheus(text: string): Sample[] {
  const out: Sample[] = [];
  for (const line of text.split("\n")) {
    const row = line.trim();
    if (!row || row.startsWith("#")) continue;
    const match = /^([a-zA-Z_:][\w:]*)(\{[^}]*\})?\s+(-?[\d.eE+]+)$/.exec(row);
    if (!match) continue;
    const labels: Record<string, string> = {};
    if (match[2]) {
      for (const pair of match[2].slice(1, -1).split(",")) {
        const eq = pair.indexOf("=");
        if (eq > 0) labels[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim().replace(/^"|"$/g, "");
      }
    }
    out.push({ name: match[1], labels, value: Number(match[3]) });
  }
  return out;
}

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

export function MetricsPanel() {
  const [samples, setSamples] = useState<Sample[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const text = await api("/metrics");
      setSamples(parsePrometheus(typeof text === "string" ? text : JSON.stringify(text)));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
    setLoading(false);
  }, []);

  usePoll(load, 20000);

  const pick = (name: string) => samples.filter(s => s.name === name);
  const single = (name: string) => pick(name)[0]?.value ?? 0;
  // pair up the per-DAG / per-task gauges into rows keyed by their labels
  const table = (names: string[], keys: string[]) => {
    const rows = new Map<string, { labels: Record<string, string>; values: number[] }>();
    names.forEach((name, i) => {
      for (const s of pick(name)) {
        const id = keys.map(k => s.labels[k] ?? "-").join("|");
        const row = rows.get(id) ?? { labels: s.labels, values: names.map(() => 0) };
        row.values[i] = s.value;
        rows.set(id, row);
      }
    });
    return [...rows.values()];
  };

  if (loading) return <Loading label="Scraping /metrics…" />;
  if (error) return <p className="flash bad"><AlertTriangle size={14} />Could not read /metrics: {error}</p>;

  const domainRows = table(["vayurix_domain_open_cases", "vayurix_domain_unassigned_cases", "vayurix_domain_open_incidents"], ["domain"]);
  const taskRows = table(["vayurix_task_failures_total", "vayurix_task_retries_total", "vayurix_task_duration_avg_seconds", "vayurix_task_duration_max_seconds"], ["dag_id", "task_id"])
    .sort((a, b) => b.values[0] - a.values[0] || b.values[1] - a.values[1])
    .slice(0, 12);
  const dagRuns = table(["vayurix_dag_runs_total"], ["dag_id", "status"]);
  const dagAgg = new Map<string, { total: number; failed: number }>();
  for (const r of dagRuns) {
    const dag = r.labels.dag_id ?? "-";
    const agg = dagAgg.get(dag) ?? { total: 0, failed: 0 };
    agg.total += r.values[0];
    if (r.labels.status === "failed") agg.failed += r.values[0];
    dagAgg.set(dag, agg);
  }
  const dagRows = [...dagAgg.entries()].sort((a, b) => b[1].failed - a[1].failed || b[1].total - a[1].total).slice(0, 12);

  return (
    <section className="stack-panels">
      <p className="hint">
        Live scrape of <code>/metrics</code> (Prometheus text), refreshed every 20s — the same series
        you would alert on. Reliability figures cover the last 7 days.
      </p>
      <section className="metrics">
        <Tile label="Open cases" value={fmt(single("vayurix_open_rca_cases"))} detail="not closed" />
        <Tile label="Open incidents" value={fmt(single("vayurix_open_incidents"))} detail="grouped failures" tone={single("vayurix_open_incidents") > 0 ? "amber" : "mint"} />
        <Tile label="Dead letters" value={fmt(single("vayurix_dlq_parked"))} detail="parked messages" tone={single("vayurix_dlq_parked") > 0 ? "red" : "mint"} />
        <Tile label="Worst heartbeat" value={`${fmt(Math.max(0, ...pick("vayurix_worker_heartbeat_age_seconds").map(s => s.value)))}s`} detail="worker liveness" tone={Math.max(0, ...pick("vayurix_worker_heartbeat_age_seconds").map(s => s.value)) > 60 ? "red" : "mint"} />
      </section>
      {domainRows.length > 0 && (
        <article className="panel">
          <header className="panel-head"><div><p>Per domain</p><h2>Workload</h2></div></header>
          <table className="metric-table">
            <thead><tr><th>domain</th><th>open</th><th>unowned</th><th>incidents</th></tr></thead>
            <tbody>{domainRows.map(r => <tr key={r.labels.domain}><td><code>{r.labels.domain}</code></td><td>{fmt(r.values[0])}</td><td className={r.values[1] > 0 ? "warn" : ""}>{fmt(r.values[1])}</td><td>{fmt(r.values[2])}</td></tr>)}</tbody>
          </table>
        </article>
      )}
      <section className="split">
        <article className="panel">
          <header className="panel-head"><div><p>Last 7 days</p><h2>DAG failure rate</h2></div></header>
          <table className="metric-table">
            <thead><tr><th>dag</th><th>runs</th><th>failed</th><th>rate</th></tr></thead>
            <tbody>{dagRows.map(([dag, a]) => <tr key={dag}><td>{dag}</td><td>{fmt(a.total)}</td><td className={a.failed > 0 ? "warn" : ""}>{fmt(a.failed)}</td><td>{a.total ? `${Math.round((a.failed / a.total) * 100)}%` : "—"}</td></tr>)}
              {!dagRows.length && <tr><td colSpan={4}><small className="hint-inline">No runs in the window.</small></td></tr>}</tbody>
          </table>
        </article>
        <article className="panel">
          <header className="panel-head"><div><p>Last 7 days</p><h2>Flaky / slow tasks</h2></div></header>
          <table className="metric-table">
            <thead><tr><th>task</th><th>fail</th><th>retry</th><th>avg</th><th>max</th></tr></thead>
            <tbody>{taskRows.map(r => <tr key={`${r.labels.dag_id}/${r.labels.task_id}`}><td title={`${r.labels.dag_id}/${r.labels.task_id}`}>{r.labels.task_id}</td><td className={r.values[0] > 0 ? "warn" : ""}>{fmt(r.values[0])}</td><td>{fmt(r.values[1])}</td><td>{fmt(r.values[2])}s</td><td>{fmt(r.values[3])}s</td></tr>)}
              {!taskRows.length && <tr><td colSpan={5}><small className="hint-inline">No task activity in the window.</small></td></tr>}</tbody>
          </table>
        </article>
      </section>
    </section>
  );
}

// ---------------------------------------------------------------- pushed events (ADR-005)

type EventRow = {
  id: number; domain: string; source: string; event_key: string; entity_key: string;
  status: string; severity: string | null; title: string | null;
  occurred_at: string | null; received_at: string; case_id: number | null;
};

const when = (iso: string | null) => {
  if (!iso) return "—";
  const ms = new Date(iso).getTime();
  if (!Number.isFinite(ms)) return iso;
  const m = Math.max(1, Math.round((Date.now() - ms) / 60000));
  return m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} hrs ago` : `${Math.round(m / 1440)} days ago`;
};

/** The activity feed for pushed domains — the non-pipeline equivalent of "Pipeline runs".
 *  `openCase` lets the caller jump to the case this event opened. */
export function EventsPanel({ domain, openCase }: { domain: string; openCase?: (id: number) => void }) {
  const [rows, setRows] = useState<EventRow[]>([]);
  const [detail, setDetail] = useState<Json | null>(null);
  const [loading, setLoading] = useState(true);
  const { show, node } = useFlash();

  const load = useCallback(async () => {
    try {
      const scope = domain ? `&domain=${encodeURIComponent(domain)}` : "";
      setRows((await api(`/events?limit=100${scope}`)) as EventRow[]);
    } catch (e) {
      show("bad", `Could not load events: ${(e as Error).message}`);
    }
    setLoading(false);
  }, [domain, show]);

  usePoll(load, 30000);

  if (loading) return <Loading label="Reading the event stream…" />;

  return (
    <section className="stack-panels">
      {node}
      <p className="hint">
        Events pushed to <code>POST /ingest</code> by non-pipeline domains (alerting, SIEM, CI…).
        Each non-recovery event opens or refreshes a case; recoveries close the entity&apos;s open cases.
      </p>
      <article className="panel">
        <header className="panel-head"><div><p>{rows.length} events</p><h2>Event stream</h2></div></header>
        <table className="metric-table">
          <thead><tr><th>received</th><th>domain</th><th>entity</th><th>status</th><th>title</th><th>case</th></tr></thead>
          <tbody>
            {rows.map(e => (
              <tr key={e.id}>
                <td>{when(e.received_at)}</td>
                <td><code>{e.domain}</code></td>
                <td title={e.entity_key}>{e.entity_key}</td>
                <td><span className={`status ${["recovered", "resolved", "ok"].includes(e.status) ? "healthy" : "degraded"}`}>{e.status}</span></td>
                <td title={e.title ?? ""}>{e.title ?? "—"}</td>
                <td className="row-actions">
                  <button className="ghost" onClick={() => void api(`/events/${e.id}`).then(v => setDetail(v as Json)).catch(err => show("bad", (err as Error).message))}>Detail</button>
                  {e.case_id != null && openCase && <button className="ghost" onClick={() => openCase(e.case_id!)}>Case</button>}
                </td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={6}><small className="hint-inline">No pushed events yet{domain ? ` for ${domain}` : ""}.</small></td></tr>}
          </tbody>
        </table>
      </article>
      {detail && (
        <article className="panel">
          <header className="panel-head">
            <div><p>Event #{String(detail.id)}</p><h2>{String(detail.title ?? detail.entity_key)}</h2></div>
            <button className="ghost" onClick={() => setDetail(null)}><ArrowLeft size={13} /> Back to stream</button>
          </header>
          <pre className="raw-json">{JSON.stringify(detail, null, 2)}</pre>
        </article>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- shared bits

function Loading({ label }: { label: string }) {
  return <p className="flash"><Loader2 className="spin" size={14} />{label}</p>;
}

function Tile({ label, value, detail, tone = "blue" }: { label: string; value: string; detail: string; tone?: string }) {
  return (
    <article className={`metric ${tone}`}>
      <p>{label}</p>
      <b>{value}</b>
      <small>{detail}</small>
    </article>
  );
}
