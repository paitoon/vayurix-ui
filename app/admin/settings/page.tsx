"use client";

// Every runtime knob, one section at a time.
//
// Vertical tabs rather than one long scroll: there are ~70 settings across 15 sections, and the
// question is always "what is set for X", never "show me everything at once".
//
// Editors are typed from the *default* value, not the current one: a number stays a number even
// after somebody stores a string in it, so the API's validation is not fighting the UI. Keys with a
// known, closed set of values get a dropdown — guessing "admin_manager" from memory is not a test
// anyone should have to pass.

import { Loader2, PlugZap, RotateCcw, Save } from "lucide-react";
import { useState } from "react";
import { api, listOf, without, type Json, type Setting } from "../../lib/api";
import { Banner, Card, Pill, Resource, useFlash, useResource } from "../../lib/ui";
import { Page } from "../../shell";
import { HELP } from "./help";

const show = (v: unknown) => (typeof v === "string" ? v : JSON.stringify(v));

// Reading order, not alphabetical: what the deployment *is*, then the machinery it talks to, then
// the policies layered on top. Anything unlisted sorts to the end so a new section is visible
// rather than silently hidden.
const SECTION_ORDER = [
  "app",
  "services",
  "worker",
  "agent",
  "embedding",
  "azure_openai",
  "ollama",
  "airflow",
  "kafka",
  "spark_history",
  "auth",
  "rca_policy",
  "notification",
  "email",
  "line",
  "retention",
];

/** Sections whose settings point at something outside this process, so "does it answer?" is a
 *  question worth asking before saving and hoping. */
const CHECKABLE = ["airflow", "kafka", "spark_history"];

const rank = (section: string) => {
  const i = SECTION_ORDER.indexOf(section.toLowerCase());
  return i === -1 ? SECTION_ORDER.length : i;
};

/** Settings whose values are a fixed set. Typing these by hand is how you learn they are validated. */
const CHOICES: Record<string, string[]> = {
  "agent.llm": ["azure_openai", "ollama"],
  "embedding.provider": ["ollama", "azure_openai"],
  "spark_history.env": ["standalone", "yarn", "k8s", "other"],
  "notification.channel": ["line", "email"],
  "auth.require_2fa_for": ["none", "admin_manager", "all"],
  "auth.otp_fallback": ["deny", "password_only"],
};

export default function SettingsPage() {
  const state = useResource(async () => listOf<Setting>(await api.get("/settings"), "settings"), []);
  const { flash, show: toast } = useFlash();
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [section, setSection] = useState<string | null>(null);
  const [probe, setProbe] = useState<{ target: string; result: Json } | null>(null);
  const [probing, setProbing] = useState(false);

  const check = async (target: string) => {
    setProbing(true);
    setProbe(null);
    try {
      // The check reads the *saved* settings, so an unsaved edit is not what gets tested.
      setProbe({ target, result: await api.get<Json>(`/health/check/${target}`) });
    } catch (e) {
      setProbe({ target, result: { ok: false, error: (e as Error).message } });
    }
    setProbing(false);
  };

  const save = async (s: Setting) => {
    const raw = draft[s.key] ?? show(s.value);
    // Match the shape of the default: a knob that was 12 must not silently become "12".
    let value: unknown = raw;
    if (typeof s.default === "number") {
      const n = Number(raw);
      if (Number.isNaN(n)) return toast("bad", `${s.key} expects a number`);
      value = n;
    } else if (typeof s.default === "boolean") {
      value = raw === "true";
    } else if (s.default !== null && typeof s.default === "object") {
      try {
        value = JSON.parse(raw);
      } catch {
        return toast("bad", `${s.key} expects JSON`);
      }
    }
    setBusy(s.key);
    try {
      await api.put("/settings", { key: s.key, value });
      toast("ok", `${s.key} saved.`);
      setDraft(d => without(d, s.key));
      await state.reload();
    } catch (e) {
      toast("bad", (e as Error).message);
    }
    setBusy(null);
  };

  const reset = async (s: Setting) => {
    setBusy(s.key);
    try {
      await api.del(`/settings/${s.key}`);
      toast("ok", `${s.key} reverted to its default.`);
      setDraft(d => without(d, s.key));
      await state.reload();
    } catch (e) {
      toast("bad", (e as Error).message);
    }
    setBusy(null);
  };

  return (
    <Page
      crumbs={[{ label: "Admin", href: "/admin/domains" }, { label: "Configuration" }]}
      title="Configuration"
      intro="Runtime settings, stored in the database. Most apply immediately; start-time ones (Kafka, bind address, LLM endpoints) take effect on the next restart."
    >
      {flash}

      <Resource state={state} label="Loading settings…">
        {rows => {
          const sections = [...new Set(rows.map(r => r.key.split(".")[0]))].sort(
            (a, b) => rank(a) - rank(b) || a.localeCompare(b),
          );
          const current = section && sections.includes(section) ? section : sections[0];
          const mine = rows.filter(r => r.key.split(".")[0] === current);
          const changedIn = (s: string) =>
            rows.filter(r => r.key.split(".")[0] === s && r.overridden).length;

          return (
            <div className="vtabs">
              <nav>
                {sections.map(s => {
                  const n = changedIn(s);
                  return (
                    <button key={s} data-active={String(s === current)} onClick={() => setSection(s)}>
                      <span>{s}</span>
                      {n > 0 && <em title={`${n} changed from the default`}>{n}</em>}
                    </button>
                  );
                })}
              </nav>

              <Card
                title={current}
                meta={`${mine.length} setting${mine.length === 1 ? "" : "s"}`}
                actions={
                  CHECKABLE.includes(current) && (
                    <button className="btn btn-sm" disabled={probing} onClick={() => void check(current)}>
                      {probing ? <Loader2 className="spin" size={12} /> : <PlugZap size={12} />}
                      Test connection
                    </button>
                  )
                }
                tight
              >
                {probe?.target === current && (
                  <div style={{ padding: "12px 16px 0" }}>
                    <Banner tone={probe.result.ok ? "ok" : "bad"}>
                      {probe.result.ok
                        ? `Reachable in ${String(probe.result.took_ms)} ms — ${JSON.stringify(probe.result.detail)}`
                        : `Unreachable: ${String(probe.result.error)}`}
                    </Banner>
                  </div>
                )}
                <table>
                  <thead>
                    <tr>
                      <th>setting</th>
                      <th>value</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {mine.map(s => {
                      const value = draft[s.key] ?? show(s.value);
                      const dirty = draft[s.key] !== undefined && draft[s.key] !== show(s.value);
                      const choices = CHOICES[s.key];
                      return (
                        <tr key={s.key}>
                          <td>
                            <b className="mono setting-key">{s.key.slice(current.length + 1)}</b>
                            {s.overridden && (
                              <>
                                {" "}
                                <Pill tone="amber">changed</Pill>
                              </>
                            )}
                            {HELP[s.key] && <p className="setting-help">{HELP[s.key]}</p>}
                          </td>
                          <td>
                            {typeof s.default === "boolean" ? (
                              <select value={value} onChange={e => setDraft({ ...draft, [s.key]: e.target.value })}>
                                <option value="true">true</option>
                                <option value="false">false</option>
                              </select>
                            ) : choices ? (
                              <select value={value} onChange={e => setDraft({ ...draft, [s.key]: e.target.value })}>
                                {/* keep an unexpected stored value visible instead of silently
                                    rewriting it to the first option */}
                                {!choices.includes(value) && <option value={value}>{value}</option>}
                                {choices.map(c => (
                                  <option key={c} value={c}>
                                    {c}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <input
                                value={value}
                                inputMode={typeof s.default === "number" ? "decimal" : undefined}
                                onChange={e => setDraft({ ...draft, [s.key]: e.target.value })}
                              />
                            )}
                          </td>
                          <td className="actions">
                            <button
                              className="btn btn-sm"
                              data-tone={dirty ? "primary" : undefined}
                              disabled={busy === s.key || !dirty}
                              onClick={() => void save(s)}
                            >
                              <Save size={12} />
                              Save
                            </button>
                            <button
                              className="btn btn-sm"
                              disabled={busy === s.key || !s.overridden}
                              title="Revert to the default value"
                              onClick={() => void reset(s)}
                            >
                              <RotateCcw size={12} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </Card>
            </div>
          );
        }}
      </Resource>
    </Page>
  );
}
