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

import { Loader2, PlugZap } from "lucide-react";
import { useState } from "react";
import { api, listOf, type Json, type Setting } from "../../lib/api";
import { Banner, Card, Resource, useResource } from "../../lib/ui";
import { Page } from "../../shell";
import { SettingRows } from "./editor";

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
  "k8s",
  "kafka",
  "spark_history",
  "auth",
  "notification",
  "email",
  "line",
  "retention",
];

/** Sections that have a screen of their own — showing them twice invites editing the stale copy.
 *  `rca_policy` is split between RCA policy and SLA policies, both under Model. */
const ELSEWHERE = ["rca_policy"];

/** Sections whose settings point at something outside this process, so "does it answer?" is a
 *  question worth asking before saving and hoping. */
const CHECKABLE = ["airflow", "k8s", "kafka", "spark_history"];

const rank = (section: string) => {
  const i = SECTION_ORDER.indexOf(section.toLowerCase());
  return i === -1 ? SECTION_ORDER.length : i;
};

export default function SettingsPage() {
  const state = useResource(async () => listOf<Setting>(await api.get("/settings"), "settings"), []);
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

  return (
    <Page
      crumbs={[{ label: "Home", href: "/" }, { label: "Admin" }, { label: "Configuration" }]}
      title="Configuration"
      intro="Runtime settings, stored in the database. Most apply immediately; start-time ones (Kafka, bind address, LLM endpoints) take effect on the next restart."
    >
      <Resource state={state} label="Loading settings…">
        {all => {
          const rows = all.filter(r => !ELSEWHERE.includes(r.key.split(".")[0]));
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
                <SettingRows rows={mine} strip={current} onChanged={state.reload} />
              </Card>
            </div>
          );
        }}
      </Resource>
    </Page>
  );
}
