"use client";

import { Activity, AlertTriangle, ArrowLeft, ArrowUpRight, Bell, Check, ChevronRight, CircleGauge, Clock3, Database, GitBranch, Inbox, LayoutDashboard, Menu, Moon, MoreHorizontal, Play, RefreshCw, Search, Settings, ShieldCheck, Sparkles, Sun, Users, X, Zap } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DomainsPanel, EventsPanel, MetricsPanel, ServicesPanel, SettingsPanel, usePoll } from "./panels";

type View = "overview" | "runs" | "events" | "cases" | "incidents" | "dlq" | "sla" | "team" | "domains" | "services" | "metrics" | "settings";
/** Views that only make sense for the Airflow pipeline domain (they read pipeline_runs). */
const PIPELINE_ONLY: View[] = ["runs", "sla"];
const DOMAIN_PIPELINE = "airflow_pipeline";
type Row = Record<string, unknown>;
type Run = { id: number; dag: string; runId: string; status: string; duration: string; started: string; owner: string };
type Case = { id: number; rcaId: string; dag: string; status: string; severity: string; summary: string; age: string; assignee: string; domain?: string };
type Incident = { id: number; signature: string; title: string; runs: number; status: string; opened: string; domain?: string };
// ADR-005 multi-domain: the registry (/domains) + the per-domain rollup (/overview.by_domain).
type Domain = { code: string; name: string; active: boolean; color?: string };
type DomainStat = { code: string; name: string; openCases: number; unassigned: number; openIncidents: number };
type Dlq = { id: number; topic: string; key: string; attempts: number; error: string; received: string };
type Worker = { role: string; age: number; status: string };
type Team = { id: number; name: string; email: string; position: number; active: boolean };
type Sla = { id: number; dag: string; outcome: string; deadline: string; lateness: string };
type Data = { runs: Run[]; cases: Case[]; incidents: Incident[]; dlq: Dlq[]; workers: Worker[]; team: Team[]; sla: Sla[] };

const nav: { id: View; label: string; icon: LucideIcon; group: string }[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard, group: "Operate" },
  { id: "runs", label: "Pipeline runs", icon: GitBranch, group: "Operate" },
  { id: "events", label: "Event stream", icon: Zap, group: "Operate" },
  { id: "cases", label: "RCA cases", icon: Sparkles, group: "Operate" },
  { id: "incidents", label: "Incidents", icon: AlertTriangle, group: "Operate" },
  { id: "dlq", label: "Dead letters", icon: Inbox, group: "Operate" },
  { id: "metrics", label: "Metrics", icon: Activity, group: "Operate" },
  { id: "sla", label: "SLA performance", icon: Clock3, group: "Manage" },
  { id: "team", label: "Escalation team", icon: Users, group: "Manage" },
  { id: "domains", label: "Domains", icon: Database, group: "Manage" },
  { id: "services", label: "Services", icon: Play, group: "Manage" },
  { id: "settings", label: "Configuration", icon: Settings, group: "Manage" },
];

const copy: Record<View, [string, string, string]> = {
  overview: ["Mission control", "Good afternoon, operator.", "Here’s what needs attention across your data platform."],
  runs: ["Pipeline operations", "Runs", "Trace recent DAG activity, duration, ownership, and outcomes."],
  events: ["Pushed signals", "Event stream", "Alerts pushed by non-pipeline domains — each one opens, refreshes or closes a case."],
  cases: ["Root-cause analysis", "RCA cases", "Triage and resolve failures with evidence attached."],
  incidents: ["Failure patterns", "Incidents", "Related failures grouped into a single operational story."],
  dlq: ["Recovery queue", "Dead letters", "Replay or discard messages that exhausted retries."],
  sla: ["Reliability", "SLA performance", "Monitor deadlines and pipelines that need tuning."],
  team: ["Escalation", "Response team", "Manage the people and order used for escalation."],
  metrics: ["Observability", "Metrics", "Live /metrics scrape: queue depth, worker liveness, DAG and task reliability."],
  domains: ["Multi-domain", "Domains", "Register the namespaces vayurix triages — each with its own on-call, grouping and SLA."],
  services: ["Control plane", "Services", "Start, stop or restart the watchers and Kafka workers; watch heartbeats and datastores."],
  settings: ["Workspace", "Configuration", "Every runtime setting, stored in the database — edit or revert to the file default."],
};

const demo: Data = {
  runs: [
    { id: 4839, dag: "daily_revenue_rollup", runId: "scheduled__2026-07-23T04:00", status: "failed", duration: "18m 42s", started: "12 min ago", owner: "analytics" },
    { id: 4838, dag: "customer_360_refresh", runId: "scheduled__2026-07-23T03:30", status: "running", duration: "31m 08s", started: "36 min ago", owner: "data-platform" },
    { id: 4837, dag: "inventory_snapshot", runId: "scheduled__2026-07-23T03:00", status: "success", duration: "12m 16s", started: "1 hr ago", owner: "supply-chain" },
    { id: 4836, dag: "partner_feed_ingest", runId: "scheduled__2026-07-23T02:45", status: "retry", duration: "22m 49s", started: "1 hr ago", owner: "integrations" },
    { id: 4835, dag: "feature_store_materialize", runId: "scheduled__2026-07-23T02:00", status: "success", duration: "27m 03s", started: "2 hrs ago", owner: "ml-platform" },
  ],
  cases: [
    { id: 318, rcaId: "RCA-2026-0318", dag: "daily_revenue_rollup", status: "open", severity: "high", summary: "Spark executor OOM during revenue aggregation", age: "11 min", assignee: "Unassigned" },
    { id: 317, rcaId: "RCA-2026-0317", dag: "partner_feed_ingest", status: "investigating", severity: "medium", summary: "Upstream SFTP connection reset after partial transfer", age: "1 hr", assignee: "Narin S." },
    { id: 315, rcaId: "RCA-2026-0315", dag: "customer_360_refresh", status: "completed", severity: "low", summary: "Warehouse lock contention caused task timeout", age: "6 hrs", assignee: "Maya K." },
  ],
  incidents: [
    { id: 81, signature: "inc_7f9a2", title: "Revenue Spark memory pressure", runs: 3, status: "open", opened: "11 min ago" },
    { id: 80, signature: "inc_2c4d8", title: "Partner network instability", runs: 2, status: "monitoring", opened: "1 hr ago" },
  ],
  dlq: [
    { id: 106, topic: "pipeline.ingested", key: "scheduled__2026-07-23T03:30", attempts: 3, error: "Airflow log endpoint returned 404 after polling", received: "24 min ago" },
    { id: 105, topic: "pipeline.logs_ready", key: "manual__2026-07-22T22:10", attempts: 3, error: "Embedding provider circuit open", received: "5 hrs ago" },
  ],
  workers: ["ingest", "collect", "rca", "dlq"].map((role, i) => ({ role, age: 4 + i, status: "healthy" })),
  team: [
    { id: 1, name: "Maya K.", email: "maya@data.team", position: 1, active: true },
    { id: 2, name: "Narin S.", email: "narin@data.team", position: 2, active: true },
    { id: 3, name: "Theo R.", email: "theo@data.team", position: 3, active: true },
  ],
  sla: [
    { id: 1, dag: "daily_revenue_rollup", outcome: "late", deadline: "Today, 11:00", lateness: "42m" },
    { id: 2, dag: "inventory_snapshot", outcome: "on_time", deadline: "Today, 10:30", lateness: "—" },
    { id: 3, dag: "customer_360_refresh", outcome: "pending", deadline: "Today, 13:00", lateness: "—" },
  ],
};

const obj = (v: unknown): Row => v && typeof v === "object" && !Array.isArray(v) ? v as Row : {};
const arr = (v: unknown, keys: string[]): Row[] => { if (Array.isArray(v)) return v.map(obj); const o = obj(v); for (const k of keys) if (Array.isArray(o[k])) return (o[k] as unknown[]).map(obj); return []; };
const str = (v: unknown, fallback = "") => typeof v === "string" && v ? v : fallback;
const num = (v: unknown, fallback = 0) => typeof v === "number" && Number.isFinite(v) ? v : fallback;
const ago = (v: unknown) => { if (typeof v !== "string") return "recently"; const ms = new Date(v).getTime(); if (!Number.isFinite(ms)) return v; const m = Math.max(1, Math.round((Date.now() - ms) / 60000)); return m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} hrs ago` : `${Math.round(m / 1440)} days ago`; };
const dur = (v: unknown) => { const s = num(v, -1); return s < 0 ? "—" : s >= 60 ? `${Math.floor(s / 60)}m ${String(Math.round(s % 60)).padStart(2, "0")}s` : `${Math.round(s)}s`; };

async function api(path: string, init?: RequestInit) { const res = await fetch(`/api/vayurix${path}`, { ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) }, cache: "no-store" }); if (!res.ok) throw new Error(String(res.status)); const type = res.headers.get("content-type") ?? ""; return type.includes("json") ? res.json() : res.text(); }
const normalizeRuns = (v: unknown): Run[] => arr(v, ["runs", "items", "results", "data"]).map((r, i) => ({ id: num(r.id, i + 1), dag: str(r.dag_id, "unknown_dag"), runId: str(r.dag_run_id, `run-${i + 1}`), status: str(r.status, "received").toLowerCase(), duration: dur(r.duration_sec), started: ago(r.start_time ?? r.first_seen_at), owner: str(r.owner, "unassigned") }));
const normalizeCases = (v: unknown): Case[] => arr(v, ["cases", "items", "results", "data"]).map((r, i) => ({ id: num(r.id, i + 1), rcaId: str(r.rca_id, `RCA-${num(r.id, i + 1)}`), dag: str(r.dag_id, "unknown_dag"), status: str(r.status, "open").toLowerCase(), severity: str(r.severity, "medium").toLowerCase(), summary: str(r.root_cause_summary, str(r.summary, "Awaiting analysis")), age: ago(r.opened_at), assignee: str(r.assigned_to, str(r.assignee_name, "Unassigned")), domain: str(r.domain) }));
const normalizeIncidents = (v: unknown): Incident[] => arr(v, ["incidents", "items", "results", "data"]).map((r, i) => ({ id: num(r.id, i + 1), signature: str(r.signature, `incident-${i + 1}`), title: str(r.affected_dags, str(r.title, str(r.signature, "Related failures"))), runs: num(r.run_count, 1), status: r.resolved_at ? "resolved" : str(r.status, "open"), opened: ago(r.opened_at), domain: str(r.domain) }));
const normalizeDomains = (v: unknown): Domain[] => arr(v, ["domains", "items", "data"]).map(r => ({ code: str(r.code, "unknown"), name: str(r.name, str(r.code, "unknown")), active: r.active !== false, color: typeof r.color === "string" ? r.color : undefined }));
const normalizeByDomain = (v: unknown): DomainStat[] => arr(obj(v).by_domain, ["by_domain"]).map(r => ({ code: str(r.domain, "unknown"), name: str(r.name, str(r.domain, "unknown")), openCases: num(r.open_cases), unassigned: num(r.unassigned_cases), openIncidents: num(r.open_incidents) }));
const normalizeDlq = (v: unknown): Dlq[] => arr(v, ["messages", "items", "results", "data"]).map((r, i) => ({ id: num(r.id, i + 1), topic: str(r.source_topic, "unknown"), key: str(r.msg_key, "—"), attempts: num(r.attempts), error: str(r.error, "Unknown processing error"), received: ago(r.received_at) }));
const normalizeWorkers = (v: unknown): Worker[] => arr(v, ["workers", "heartbeats", "items", "data"]).map(r => { const age = num(r.age_sec, 999); return { role: str(r.role, "worker"), age, status: age <= 60 ? "healthy" : age <= 120 ? "degraded" : "offline" }; });
const normalizeTeam = (v: unknown): Team[] => arr(v, ["team", "members", "items", "data"]).map((r, i) => ({ id: num(r.id, i + 1), name: str(r.name, "Unnamed"), email: str(r.email, "—"), position: num(r.position, i + 1), active: r.active !== false }));
const normalizeSla = (v: unknown): Sla[] => arr(v, ["results", "items", "data"]).map((r, i) => ({ id: num(r.id, i + 1), dag: str(r.dag_id, "unknown_dag"), outcome: str(r.outcome, "pending"), deadline: str(r.deadline_at_local, str(r.deadline_at, "—")), lateness: num(r.lateness_sec, -1) >= 0 ? dur(r.lateness_sec) : "—" }));

function Status({ value }: { value: string }) { const key = value.toLowerCase().replaceAll(" ", "_"); return <span className={`status status-${key}`}><i />{value.replaceAll("_", " ")}</span>; }
function Empty({ children }: { children: React.ReactNode }) { return <div className="empty"><Check size={18} />{children}</div>; }
function Logo() { return <span className="logo"><i /><i /><i /></span>; }

export function VayurixDashboard() {
  const [view, setView] = useState<View>("overview");
  const [data, setData] = useState<Data>(demo);
  const [mode, setMode] = useState<"loading" | "live" | "demo">("loading");
  const [dark, setDark] = useState(true);
  const [query, setQuery] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [updated, setUpdated] = useState("just now");
  const [notice, setNotice] = useState<string | null>(null);
  const [selected, setSelected] = useState<Run | null>(null);
  const [mobile, setMobile] = useState(false);
  const [trail, setTrail] = useState<View[]>([]);
  // ADR-005: "" = every domain; otherwise scope the case/incident lists to one domain.
  const [domain, setDomain] = useState("");
  const [domains, setDomains] = useState<Domain[]>([]);
  const [byDomain, setByDomain] = useState<DomainStat[]>([]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    const scope = domain ? `&domain=${encodeURIComponent(domain)}` : "";
    const result = await Promise.allSettled([api("/healthz"), api("/runs?limit=50"), api(`/cases?limit=50${scope}`), api(`/incidents?limit=50${scope}`), api("/dlq?status=parked&limit=50"), api("/health/workers"), api("/team"), api("/sla/results?days=7&limit=100"), api("/domains?active=true"), api("/overview")]);
    if (result[8].status === "fulfilled") setDomains(normalizeDomains(result[8].value));
    if (result[9].status === "fulfilled") setByDomain(normalizeByDomain(result[9].value));
    if (result[0].status === "fulfilled") {
      setMode("live");
      setData(current => ({
        runs: result[1].status === "fulfilled" ? normalizeRuns(result[1].value) : current.runs,
        cases: result[2].status === "fulfilled" ? normalizeCases(result[2].value) : current.cases,
        incidents: result[3].status === "fulfilled" ? normalizeIncidents(result[3].value) : current.incidents,
        dlq: result[4].status === "fulfilled" ? normalizeDlq(result[4].value) : current.dlq,
        workers: result[5].status === "fulfilled" ? normalizeWorkers(result[5].value) : current.workers,
        team: result[6].status === "fulfilled" ? normalizeTeam(result[6].value) : current.team,
        sla: result[7].status === "fulfilled" ? normalizeSla(result[7].value) : current.sla,
      }));
    } else { setMode("demo"); setData(demo); }
    setUpdated(new Intl.DateTimeFormat("en", { hour: "2-digit", minute: "2-digit" }).format(new Date())); setRefreshing(false);
  }, [domain]);

  usePoll(refresh, 30000);
  useEffect(() => { document.documentElement.dataset.theme = dark ? "dark" : "light"; }, [dark]);

  const runs = useMemo(() => { const q = query.toLowerCase().trim(); return q ? data.runs.filter(r => [r.dag, r.runId, r.status, r.owner].some(x => x.toLowerCase().includes(q))) : data.runs; }, [data.runs, query]);
  const openCases = data.cases.filter(c => !["closed", "completed", "dismissed"].includes(c.status));
  const openIncidents = data.incidents.filter(i => i.status !== "resolved");
  const successRate = data.runs.length ? Math.round(data.runs.filter(r => r.status === "success").length / data.runs.length * 100) : 100;
  const [eyebrow, title, description] = copy[view];
  // Back navigation: every screen change pushes the screen we came from, so a detail view (or a
  // cross-link like "Inspect this domain") can return the operator to where they were.
  const go = (next: View) => { if (next !== view) { setTrail(t => [...t, view]); setView(next); } };
  const back = () => { setSelected(null); setTrail(t => { const prev = t[t.length - 1]; if (prev) setView(prev); return t.slice(0, -1); }); };
  // A pushed domain has no DAG runs, so the pipeline-only screens are hidden while it is
  // selected — and the event stream takes their place.
  const pipelineScope = !domain || domain === DOMAIN_PIPELINE;
  const visibleNav = nav.filter(n => (pipelineScope || !PIPELINE_ONLY.includes(n.id)) && (n.id !== "events" || !domain || domain !== DOMAIN_PIPELINE));
  const action = async (label: string, path: string) => { try { await api(path, { method: "POST", body: "{}" }); setNotice(`${label} completed`); await refresh(); } catch { setNotice(mode === "demo" ? `${label} is available when connected` : `${label} failed`); } window.setTimeout(() => setNotice(null), 3200); };

  return <div className="shell">
    <aside className={`sidebar ${mobile ? "open" : ""}`}>
      <div className="brand"><Logo /><div><b>VAYURIX</b><span>CONTROL</span></div><button className="icon mobile-close" onClick={() => setMobile(false)}><X size={17} /></button></div>
      <nav>{["Operate", "Manage"].map(group => <div key={group}><p>{group}</p>{visibleNav.filter(n => n.group === group).map(n => { const Icon = n.icon; const count = n.id === "cases" ? openCases.length : n.id === "incidents" ? openIncidents.length : n.id === "dlq" ? data.dlq.length : 0; return <button key={n.id} className={view === n.id ? "active" : ""} onClick={() => { go(n.id); setMobile(false); }}><Icon size={17} /><span>{n.label}</span>{count > 0 && <em>{count}</em>}</button>; })}</div>)}</nav>
      <div className="side-footer"><div className="connection"><i className={mode} /><div><b>{mode === "live" ? "Backend connected" : mode === "demo" ? "Demo snapshot" : "Connecting…"}</b><span>{mode === "live" ? "Auto-refresh · 30s" : "Set VAYURIX_API_URL"}</span></div></div><div className="operator"><span>OP</span><div><b>Operator</b><small>Platform engineer</small></div><MoreHorizontal size={16} /></div></div>
    </aside>
    {mobile && <button className="scrim nav-scrim" onClick={() => setMobile(false)} />}
    <main>
      <header className="topbar"><button className="icon mobile-menu" onClick={() => setMobile(true)}><Menu size={18} /></button><div className="environment"><i />Development</div><label className="search"><Search size={16} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search DAGs, runs, cases…" /><kbd>⌘ K</kbd></label>{domains.length > 1 && <label className="domain-picker" title="Scope cases + incidents to one domain"><GitBranch size={15} /><select value={domain} onChange={e => { const next = e.target.value; setDomain(next); const nextIsPipeline = !next || next === DOMAIN_PIPELINE; if (!nextIsPipeline && PIPELINE_ONLY.includes(view)) setView("events"); if (nextIsPipeline && view === "events") setView("runs"); }}><option value="">All domains</option>{domains.map(d => <option key={d.code} value={d.code}>{d.name}</option>)}</select></label>}<div className="actions"><button className="icon" onClick={() => setDark(!dark)}>{dark ? <Sun size={17} /> : <Moon size={17} />}</button><button className="icon notify"><Bell size={17} /><i /></button><button className="refresh" onClick={() => void refresh()}><RefreshCw className={refreshing ? "spin" : ""} size={15} />Refresh</button></div></header>
      <div className="content"><section className="heading"><div>{(trail.length > 0 || selected) && <button className="back" onClick={back}><ArrowLeft size={14} />Back</button>}<p>{eyebrow}</p><h1>{title}</h1><span>{description}</span></div><div><Status value={mode === "live" ? "live" : mode === "demo" ? "demo data" : "connecting"} /><small>Updated {updated}</small></div></section>        {view === "overview" && <>
          <section className="metrics">
            <Metric icon={ShieldCheck} tone="mint" label="Platform status" value={data.workers.every(w => w.status === "healthy") ? "Operational" : "Degraded"} detail={`${data.workers.filter(w => w.status === "healthy").length}/${data.workers.length} workers healthy`} />
            <Metric icon={CircleGauge} tone="blue" label="Run success rate" value={`${successRate}%`} detail={`${data.runs.filter(r => ["failed", "retry"].includes(r.status)).length} need attention`} />
            <Metric icon={Sparkles} tone="amber" label="Open RCA cases" value={String(openCases.length)} detail={`${openCases.filter(c => c.severity === "high").length} high severity`} />
            <Metric icon={Inbox} tone="red" label="Dead-letter queue" value={String(data.dlq.length)} detail="Messages parked" />
          </section>
          <section className="overview-grid">
            <article className="panel health-panel"><PanelHead kicker="Reliability signal" title="Pipeline health" action={() => go("runs")} /><div className="score-row"><div className="score" style={{ "--score": `${successRate * 3.6}deg` } as React.CSSProperties}><span><b>{successRate}</b><small>score</small></span></div><div><em><ArrowUpRight size={13} /> 4.8% this week</em><h3>Reliability is trending up</h3><p>Most failures are concentrated in two pipeline families. RCA evidence is ready for the highest-impact run.</p></div></div><div className="bars">{[71,84,66,92,88,96,successRate].map((h,i) => <div key={i}><i style={{height:`${h}%`}} className={h < 75 ? "warning" : ""}/><span>{["Thu","Fri","Sat","Sun","Mon","Tue","Wed"][i]}</span></div>)}</div></article>
            <article className="panel attention"><PanelHead kicker="Triage queue" title="Needs attention" /><div>{openCases.slice(0,3).map(c => <button key={c.id} onClick={() => go("cases")}><i className={`severity ${c.severity}`} /><span><b>{c.dag}</b><small>{c.summary}</small><em>{c.age} · {c.assignee}</em></span><ChevronRight size={16}/></button>)}{!openCases.length && <Empty>No open cases. Everything looks calm.</Empty>}</div></article>
          </section>
          {byDomain.length > 1 && <section className="domain-grid">{byDomain.map(d => <article className={`panel domain-card ${d.unassigned > 0 ? "attention" : ""}`} key={d.code}><header><span className="dot" style={{ background: domains.find(x => x.code === d.code)?.color ?? "var(--mint)" }} /><div><b>{d.name}</b><small>{d.code}</small></div></header><div className="domain-stats"><div><b>{d.openCases}</b><small>open cases</small></div><div><b>{d.unassigned}</b><small>unowned</small></div><div><b>{d.openIncidents}</b><small>incidents</small></div></div><footer><button onClick={() => { setDomain(d.code); go("cases"); }}>Inspect <ChevronRight size={13} /></button></footer></article>)}</section>}
          <article className="panel runs-panel"><PanelHead kicker="Event stream" title="Recent pipeline runs" action={() => go("runs")} /><RunTable runs={runs.slice(0,5)} select={setSelected} /></article>
          <section className="bottom-grid"><article className="panel"><PanelHead kicker="Processing plane" title="Worker fleet" /><div className="workers">{data.workers.map(w => <div key={w.role}><span className={`worker-icon ${w.status}`}><Zap size={14}/></span><p><b>{w.role}</b><small>{w.age}s heartbeat</small></p><Status value={w.status}/></div>)}</div></article><article className="panel incidents"><PanelHead kicker="Pattern detection" title="Active incidents" action={() => go("incidents")} />{openIncidents.slice(0,2).map(i => <div className="incident" key={i.id}><span><AlertTriangle size={16}/></span><p><b>{i.title}</b><small>{i.runs} related runs · {i.opened}</small></p><Status value={i.status}/></div>)}{!openIncidents.length && <Empty>No active incident clusters.</Empty>}</article></section>
        </>}

        {view === "runs" && <article className="panel full"><PanelHead kicker="Last 50 events" title="Pipeline activity" /><RunTable runs={runs} select={setSelected} /></article>}

        {view === "cases" && <section className="case-grid">{data.cases.map(c => <article className="panel case" key={c.id}><div><Status value={c.severity}/><code>{c.rcaId}</code>{c.domain && <em className="domain-tag">{c.domain}</em>}</div><h2>{c.dag}</h2><p>{c.summary}</p><span><Clock3 size={13}/>{c.age}<Users size={13}/>{c.assignee}</span><footer><Status value={c.status}/><button className="primary" onClick={() => void action("Case closed", `/cases/${c.id}/close`)}>Resolve <ArrowUpRight size={13}/></button></footer></article>)}</section>}

        {view === "incidents" && <article className="panel full"><PanelHead kicker="Grouped by signature" title="Incident clusters" />{data.incidents.map(i => <div className="stack" key={i.id}><span className="incident-icon"><AlertTriangle size={17}/></span><p><b>{i.title}</b><code>{i.signature}</code></p><div><b>{i.runs}</b><small>related runs</small></div><div><b>{i.opened}</b><small>opened</small></div><Status value={i.status}/><button className="icon"><ChevronRight size={16}/></button></div>)}</article>}

        {view === "dlq" && <article className="panel full"><PanelHead kicker="Manual recovery" title="Parked messages" />{data.dlq.map(d => <div className="stack dlq" key={d.id}><span className="dlq-icon"><Inbox size={17}/></span><p><b>{d.topic}</b><code>{d.key}</code><em>{d.error}</em></p><div><b>{d.attempts}</b><small>attempts</small></div><span className="stack-actions"><button className="secondary" onClick={() => void action("Message discarded", `/dlq/${d.id}/discard`)}><X size={13}/>Discard</button><button className="primary" onClick={() => void action("Message replayed", `/dlq/${d.id}/replay`)}><Play size={13}/>Replay</button></span></div>)}{!data.dlq.length && <Empty>The dead-letter queue is empty.</Empty>}</article>}

        {view === "sla" && <section className="split"><article className="panel full"><PanelHead kicker="Seven-day window" title="Deadline outcomes" /><button className="evaluate" onClick={() => void action("SLA evaluation", "/sla/evaluate")}><RefreshCw size={14}/>Evaluate now</button>{data.sla.map(s => <div className="stack" key={s.id}><span className={`outcome ${s.outcome}`}>{s.outcome === "on_time" ? <Check size={16}/> : s.outcome === "late" ? <AlertTriangle size={16}/> : <Clock3 size={16}/>}</span><p><b>{s.dag}</b><small>Deadline {s.deadline}</small></p><div><b>{s.lateness}</b><small>lateness</small></div><Status value={s.outcome}/></div>)}</article><article className="panel insight"><Sparkles size={22}/><p>Tuning insight</p><h2>One schedule needs a closer look</h2><span><b>daily_revenue_rollup</b> missed its target twice this week. The current cluster points to executor memory pressure.</span><button>Review recommendation <ArrowUpRight size={14}/></button></article></section>}

        {view === "team" && <article className="panel full"><PanelHead kicker="Escalation order" title="RCA response roster" />{data.team.sort((a,b) => a.position - b.position).map(m => <div className="team" key={m.id}><em>{m.position}</em><span>{m.name.split(" ").map(x => x[0]).join("").slice(0,2)}</span><p><b>{m.name}</b><small>{m.email}</small></p><Status value={m.active ? "active" : "inactive"}/><small>{m.position === 1 ? "Primary responder" : `Escalates after step ${m.position - 1}`}</small><MoreHorizontal size={16}/></div>)}</article>}

        {/* Control-plane views talk to the API directly (see panels.tsx) — config is stored in
            the database, so these are the real management surface, not a mirror of a file. */}
        {view === "events" && <EventsPanel domain={domain} openCase={() => go("cases")} />}
        {view === "metrics" && <MetricsPanel />}
        {view === "domains" && <DomainsPanel />}
        {view === "services" && <ServicesPanel />}
        {view === "settings" && <SettingsPanel />}
      </div>
    </main>

    {selected && <><button className="scrim" onClick={() => setSelected(null)}/><aside className="drawer"><header><div><p>Run #{selected.id}</p><h2>{selected.dag}</h2></div><button className="icon" onClick={() => setSelected(null)}><X size={17}/></button></header><Status value={selected.status}/><section><span>Run ID</span><code>{selected.runId}</code></section><div className="drawer-grid"><p><span>Duration</span><b>{selected.duration}</b></p><p><span>Started</span><b>{selected.started}</b></p><p><span>Owner</span><b>{selected.owner}</b></p><p><span>Environment</span><b>Development</b></p></div><div className="timeline">{["Event received","Logs collected","RCA analysis"].map((x,i) => <div key={x}><span>{i < 2 ? <Check size={12}/> : <Sparkles size={12}/>}</span><p><b>{x}</b><small>{i === 0 ? "Payload written to the event store." : i === 1 ? "Airflow and Spark evidence attached." : "Analysis ready for operator review."}</small></p></div>)}</div><button className="drawer-action" onClick={() => {setSelected(null);go("cases")}}>Open related RCA <ArrowUpRight size={14}/></button></aside></>}
    {notice && <div className="toast"><Check size={15}/>{notice}</div>}
  </div>;
}

function Metric({ icon: Icon, tone, label, value, detail }: { icon: LucideIcon; tone: string; label: string; value: string; detail: string }) { return <article className={`metric ${tone}`}><span><Icon size={17}/></span><p>{label}</p><b>{value}</b><small>{detail}</small></article>; }
function PanelHead({ kicker, title, action }: { kicker: string; title: string; action?: () => void }) { return <header className="panel-head"><div><p>{kicker}</p><h2>{title}</h2></div>{action && <button onClick={action}>View all <ArrowUpRight size={14}/></button>}</header>; }
function RunTable({ runs, select }: { runs: Run[]; select: (r: Run) => void }) { return <div className="table-wrap"><table><thead><tr><th>Pipeline</th><th>Status</th><th>Duration</th><th>Started</th><th>Owner</th><th/></tr></thead><tbody>{runs.map(r => <tr key={`${r.id}-${r.runId}`} onClick={() => select(r)}><td><span className={`run-icon ${r.status}`}><GitBranch size={14}/></span><p><b>{r.dag}</b><code>{r.runId}</code></p></td><td><Status value={r.status}/></td><td><code>{r.duration}</code></td><td>{r.started}</td><td><em className="owner">{r.owner}</em></td><td><ChevronRight size={15}/></td></tr>)}</tbody></table>{!runs.length && <Empty>No runs match your search.</Empty>}</div>; }