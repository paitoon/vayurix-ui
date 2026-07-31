"use client";

// The audit trail: every mutation that succeeded, plus every request that was refused. Refusals are
// the half worth reading — `authz.denied` with the capability that was missing usually explains a
// support ticket faster than any log line.

import { useRouter, useSearchParams } from "next/navigation";
import { api, listOf, qs, relTime, type AuditEntry } from "../../lib/api";
import { Card, Empty, Pill, Resource, useResource } from "../../lib/ui";
import { Page } from "../../shell";

const SHORTCUTS = [
  { label: "everything", value: "" },
  { label: "sign-ins", value: "auth." },
  { label: "refusals", value: "authz.denied" },
  { label: "configuration", value: "PUT /settings" },
  { label: "people", value: "POST /users" },
  { label: "case actions", value: "POST /cases" },
];

const tone = (action: string) =>
  action.startsWith("authz.denied") || action.includes("failed") || action.includes("rate_limited")
    ? "red"
    : action.startsWith("auth.")
      ? "blue"
      : action.startsWith("DELETE")
        ? "amber"
        : "mint";

export default function AuditPage() {
  const params = useSearchParams();
  const router = useRouter();
  const actor = params.get("actor") ?? "";
  const action = params.get("action") ?? "";

  const state = useResource(
    async () => listOf<AuditEntry>(await api.get(`/audit${qs({ actor, action, limit: 300 })}`)),
    [actor, action],
    30_000,
  );

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.replace(`/admin/audit${next.toString() ? `?${next}` : ""}`);
  };

  return (
    <Page
      crumbs={[{ label: "Home", href: "/" }, { label: "Admin" }, { label: "Audit trail" }]}
      title="Audit trail"
      intro="Who changed what, and who was told no. Reads are not recorded — they are noise with no consequence."
      tools={
        <>
          <label className="field">
            <span>actor</span>
            <input
              placeholder="email or 'service'"
              defaultValue={actor}
              onKeyDown={e => {
                if (e.key === "Enter") setParam("actor", (e.target as HTMLInputElement).value.trim());
              }}
            />
          </label>
          <label className="field">
            <span>action (prefix)</span>
            <select value={action} onChange={e => setParam("action", e.target.value)}>
              {SHORTCUTS.map(s => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
              {action && !SHORTCUTS.some(s => s.value === action) && <option value={action}>{action}</option>}
            </select>
          </label>
        </>
      }
    >
      <Resource state={state} label="Loading audit trail…">
        {rows => (
          <Card meta={`${rows.length} entr${rows.length === 1 ? "y" : "ies"}`} tight>
            {rows.length === 0 ? (
              <Empty>Nothing matches this filter.</Empty>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>when</th>
                    <th>actor</th>
                    <th>action</th>
                    <th>target</th>
                    <th>detail</th>
                    <th>address</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.id}>
                      <td title={r.created_at}>{relTime(r.created_at)}</td>
                      <td className="mono">
                        <button className="link-inline" onClick={() => setParam("actor", r.actor)}>
                          {r.actor}
                        </button>
                      </td>
                      <td>
                        <Pill tone={tone(r.action)}>{r.action}</Pill>
                      </td>
                      <td className="trunc mono">{r.target ?? "—"}</td>
                      <td className="trunc mono" style={{ color: "var(--text-muted)" }}>
                        {r.detail ? JSON.stringify(r.detail) : "—"}
                      </td>
                      <td className="mono">{r.ip ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        )}
      </Resource>
    </Page>
  );
}
