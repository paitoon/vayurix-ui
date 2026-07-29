"use client";

// Every runtime knob, grouped by section. Values live in the DB (app_settings) and override
// config.toml; "overridden" means this deployment deliberately differs from the file default, which
// is exactly the list you want when something behaves oddly.
//
// Editors are typed from the *default* value, not the current one: a number stays a number even
// after somebody stores a string in it, so the API's validation is not fighting the UI.

import { RotateCcw, Save } from "lucide-react";
import { useState } from "react";
import { api, listOf, without, type Setting } from "../../lib/api";
import { Banner, Card, Pill, Resource, useFlash, useResource } from "../../lib/ui";
import { Page } from "../../shell";

const show = (v: unknown) => (typeof v === "string" ? v : JSON.stringify(v));

export default function SettingsPage() {
  const state = useResource(async () => listOf<Setting>(await api.get("/settings"), "settings"), []);
  const { flash, show: toast } = useFlash();
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

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
      toast("ok", `${s.key} reverted to its config.toml value.`);
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
      <Banner tone="info">
        Secrets are not here on purpose — passwords, API keys and tokens stay in <code>.env</code> and
        are never readable through the API.
      </Banner>

      <Resource state={state} label="Loading settings…">
        {rows => {
          const sections = [...new Set(rows.map(r => r.key.split(".")[0]))].sort();
          return (
            <>
              {sections.map(section => (
                <Card
                  key={section}
                  title={section}
                  meta={`${rows.filter(r => r.key.startsWith(`${section}.`) && r.overridden).length} overridden`}
                  tight
                >
                  <table>
                    <thead>
                      <tr>
                        <th>key</th>
                        <th>value</th>
                        <th>default</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {rows
                        .filter(r => r.key.split(".")[0] === section)
                        .map(s => {
                          const value = draft[s.key] ?? show(s.value);
                          const dirty = draft[s.key] !== undefined && draft[s.key] !== show(s.value);
                          return (
                            <tr key={s.key}>
                              <td className="mono">
                                {s.key.slice(section.length + 1)}
                                {s.overridden && (
                                  <>
                                    {" "}
                                    <Pill tone="amber">overridden</Pill>
                                  </>
                                )}
                              </td>
                              <td>
                                {typeof s.default === "boolean" ? (
                                  <select value={value} onChange={e => setDraft({ ...draft, [s.key]: e.target.value })}>
                                    <option value="true">true</option>
                                    <option value="false">false</option>
                                  </select>
                                ) : (
                                  <input
                                    value={value}
                                    inputMode={typeof s.default === "number" ? "decimal" : undefined}
                                    onChange={e => setDraft({ ...draft, [s.key]: e.target.value })}
                                  />
                                )}
                              </td>
                              <td className="mono" style={{ color: "var(--text-muted)" }}>
                                {show(s.default)}
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
                                  title="Revert to the config.toml value"
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
              ))}
            </>
          );
        }}
      </Resource>
    </Page>
  );
}
