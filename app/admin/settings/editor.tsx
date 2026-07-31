"use client";

// The settings table, reusable.
//
// Configuration owns the whole list; a screen about one subject (RCA policy, SLA) owns the handful of
// keys that belong to it. Same editor either way, so a knob behaves identically wherever it is shown
// and there is only one place where "save" can be got wrong.

import { RotateCcw, Save } from "lucide-react";
import { useState } from "react";
import { api, listOf, without, type Setting } from "../../lib/api";
import { Card, Pill, Resource, useFlash, useResource } from "../../lib/ui";
import { HELP } from "./help";

const show = (v: unknown) => (typeof v === "string" ? v : JSON.stringify(v));

/** Settings whose values are a fixed set. Typing these by hand is how you learn they are validated. */
export const CHOICES: Record<string, string[]> = {
  "agent.llm": ["azure_openai", "ollama"],
  "embedding.provider": ["ollama", "azure_openai"],
  "spark_history.env": ["standalone", "yarn", "k8s", "other"],
  "notification.channel": ["line", "email"],
  "auth.require_2fa_for": ["none", "admin_manager", "all"],
  "auth.otp_fallback": ["deny", "password_only"],
};

/** One row per setting: name + what it does, its editor, save/reset. */
export function SettingRows({
  rows,
  strip,
  onChanged,
}: {
  rows: Setting[];
  /** Prefix to hide from the displayed name (the section, when the section is the heading). */
  strip?: string;
  onChanged: () => Promise<unknown>;
}) {
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
      await onChanged();
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
      await onChanged();
    } catch (e) {
      toast("bad", (e as Error).message);
    }
    setBusy(null);
  };

  return (
    <>
      {flash}
      <table>
        <thead>
          <tr>
            <th>setting</th>
            <th>value</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map(s => {
            const value = draft[s.key] ?? show(s.value);
            const dirty = draft[s.key] !== undefined && draft[s.key] !== show(s.value);
            const choices = CHOICES[s.key];
            const name = strip && s.key.startsWith(`${strip}.`) ? s.key.slice(strip.length + 1) : s.key;
            return (
              <tr key={s.key}>
                <td>
                  <b className="mono setting-key">{name}</b>
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
                      {/* keep an unexpected stored value visible instead of silently rewriting it */}
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
    </>
  );
}

/** A card of settings selected by key prefix — for screens that own one subject. */
export function SettingsCard({
  title,
  meta,
  prefix,
  only,
}: {
  title: string;
  meta?: string;
  /** e.g. "rca_policy" — every key under it, minus anything `only` excludes. */
  prefix: string;
  /** Optional whitelist of full keys, when a prefix holds knobs belonging to two screens. */
  only?: string[];
}) {
  const state = useResource(async () => listOf<Setting>(await api.get("/settings"), "settings"), []);
  return (
    <Card title={title} meta={meta} tight>
      <Resource state={state} label="Loading settings…">
        {rows => {
          const mine = rows.filter(
            r => r.key.startsWith(`${prefix}.`) && (!only || only.includes(r.key)),
          );
          return <SettingRows rows={mine} strip={prefix} onChanged={state.reload} />;
        }}
      </Resource>
    </Card>
  );
}
