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
  "worker",
  "agent",
  "embedding",
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

/** Tab names that differ from the section key. Display only — the stored keys keep their prefix. */
const SECTION_LABEL: Record<string, string> = {
  embedding: "text-embedding",
};
const label = (section: string) => SECTION_LABEL[section] ?? section;

/** One provider's settings, keyed by the value of `agent.llm` that selects it. */
const PROVIDER_SECTION: Record<string, string> = {
  azure_openai: "azure_openai",
  anthropic: "anthropic",
  openai_compat: "openai_compat",
  ollama: "ollama",
};

/** Sections that have a screen of their own — showing them twice invites editing the stale copy.
 *  `rca_policy` is split between RCA policy and SLA policies, both under Model.
 *
 *  The provider sections are here because they are shown inside `agent` instead: only one of them
 *  is in use at a time, and four tabs of which three are inert is four decisions where there is
 *  one. Editing `anthropic` while `agent.llm` says `ollama` is work with no effect, and a tab that
 *  invites it is the interface's fault. */
const ELSEWHERE = ["rca_policy", ...Object.values(PROVIDER_SECTION)];

/** The provider sections hold two kinds of key: what the chat model needs, and what embeddings
 *  need. They are selected independently — `agent.llm` and `embedding.provider` — so each key has
 *  to be shown under the selector that actually reads it. Showing `text_embedding_*` under `agent`
 *  hid them whenever the LLM was a different provider from the embedder, which is exactly when
 *  they matter. */
const isEmbeddingKey = (key: string) => key.split(".")[1]?.startsWith("text_embedding_") ?? false;

/** What each selector shows of the provider it picks. */
const SELECTORS: Record<string, { key: string; wanted: (key: string) => boolean }> = {
  agent: {
    key: "agent.llm",
    wanted: k => !isEmbeddingKey(k),
  },
  embedding: {
    key: "embedding.provider",
    wanted: isEmbeddingKey,
  },
};

/** Sections whose settings point at something outside this process, so "does it answer?" is a
 *  question worth asking before saving and hoping.
 *
 *  `agent` maps to the `llm` target rather than to itself: the thing worth testing is whichever
 *  provider `agent.llm` selects, and putting the button on `anthropic` or `openai_compat` would
 *  offer to test a section that may not be the one in use. */
const CHECKABLE: Record<string, string> = {
  airflow: "airflow",
  k8s: "k8s",
  kafka: "kafka",
  spark_history: "spark_history",
  agent: "llm",
  embedding: "embedding",
};

const rank = (section: string) => {
  const i = SECTION_ORDER.indexOf(section.toLowerCase());
  return i === -1 ? SECTION_ORDER.length : i;
};

export default function SettingsPage() {
  const state = useResource(async () => listOf<Setting>(await api.get("/settings"), "settings"), []);
  const [section, setSection] = useState<string | null>(null);
  const [probe, setProbe] = useState<{ target: string; result: Json } | null>(null);
  const [probing, setProbing] = useState(false);
  /** A provider picked in a combo but not yet saved, keyed by the selector setting, so its
   *  settings can appear immediately. */
  const [pending, setPending] = useState<Record<string, string>>({});

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
                      <span>{label(s)}</span>
                      {n > 0 && <em title={`${n} changed from the default`}>{n}</em>}
                    </button>
                  );
                })}
              </nav>

              <Card
                title={label(current)}
                meta={`${mine.length} setting${mine.length === 1 ? "" : "s"}`}
                actions={
                  CHECKABLE[current] && (
                    <button
                      className="btn btn-sm"
                      disabled={probing}
                      onClick={() => void check(CHECKABLE[current])}
                    >
                      {probing ? <Loader2 className="spin" size={12} /> : <PlugZap size={12} />}
                      Test connection
                    </button>
                  )
                }
                tight
              >
                {/* `probe &&` first, deliberately. `probe?.target === CHECKABLE[current]` compares
                    undefined to undefined on any section without a test button and passes, which
                    rendered this block with no probe to read. */}
                {probe && probe.target === CHECKABLE[current] && (
                  <div style={{ padding: "12px 16px 0" }}>
                    <Banner tone={probe.result.ok ? "ok" : "bad"}>
                      {probe.result.ok
                        ? `Reachable in ${String(probe.result.took_ms)} ms — ${JSON.stringify(probe.result.detail)}`
                        : `Unreachable: ${String(probe.result.error)}`}
                    </Banner>
                  </div>
                )}
                <SettingRows
                  rows={mine}
                  strip={current}
                  onChanged={state.reload}
                  onDraft={(key, value) =>
                    Object.values(SELECTORS).some(s => s.key === key) &&
                    setPending(p => ({ ...p, [key]: value }))
                  }
                />

                {/* The selected provider's own settings, in the same card. Only one provider is ever
                    in use per selector, so this is the only set worth showing — and it follows the
                    combo before you save, because otherwise the way to find out what a provider
                    needs is to commit to it first. */}
                {SELECTORS[current] &&
                  (() => {
                    const { key, wanted } = SELECTORS[current];
                    const saved = String(all.find(r => r.key === key)?.value ?? "");
                    const provider = pending[key] ?? saved;
                    const section = PROVIDER_SECTION[provider];
                    const providerRows = section
                      ? all.filter(r => r.key.startsWith(`${section}.`) && wanted(r.key))
                      : [];
                    if (!providerRows.length) return null;
                    return (
                      <>
                        <div className="setting-subhead">
                          <b className="mono">{provider}</b>
                          {provider !== saved && (
                            <>
                              {" "}
                              <em>— save {key} to switch to it</em>
                            </>
                          )}
                        </div>
                        <SettingRows
                          rows={providerRows}
                          strip={section}
                          onChanged={state.reload}
                        />
                      </>
                    );
                  })()}
              </Card>
            </div>
          );
        }}
      </Resource>
    </Page>
  );
}
