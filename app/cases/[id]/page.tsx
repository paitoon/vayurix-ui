"use client";

// Case detail — the screen an operator actually works in during an incident:
// what broke, what the LLM concluded, the evidence behind it, who was paged, and the four
// actions that move the case forward (assign / close with a fix / dismiss / reopen).

import { Check, Loader2, RotateCcw, UserCheck, XCircle } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { api, listOf, relTime, severityTone, statusTone, type TeamMember } from "../../lib/api";
import { Card, Empty, Pill, Resource, useFlash, useResource } from "../../lib/ui";
import { Page } from "../../shell";

type Detail = {
  case: {
    id: number; rca_id: string; domain: string; entity_key: string | null;
    dag_id: string; dag_run_id: string; run_status: string | null;
    status: string | null; severity: string | null; confidence: string | null;
    failed_task_id: string | null; assigned_to: string | null; assigned_at: string | null;
    opened_at: string; notified_at: string | null; closed_at: string | null; close_reason: string | null;
    root_cause_summary: string | null; recommendation: string | null; resolution: string | null;
    incident_id: number | null; pushed_title: string | null; pushed_evidence: string | null; source: string | null;
  };
  tasks: { task_id: string; state: string | null; try_number: number; duration_sec: number | null }[];
  notifications: { de_email: string; kind: string; position: number; sent_at: string | null; responded_at: string | null; response: string | null }[];
};

export default function CaseDetailPage() {
  const { id } = useParams<{ id: string }>();
  // The roster comes along for the ride: a manager assigning a case should pick a colleague from a
  // list, not retype an address from memory (and a typo here means the notification goes nowhere).
  const state = useResource(
    async () => {
      const [detail, team] = await Promise.all([
        api.get<Detail>(`/cases/${id}`),
        api.get("/team").catch(() => []),
      ]);
      return { detail, team: listOf<TeamMember>(team) };
    },
    [id],
    30_000,
  );
  const { show, flash } = useFlash();
  const [busy, setBusy] = useState<string | null>(null);
  const [owner, setOwner] = useState("");
  const [resolution, setResolution] = useState("");

  const act = async (key: string, run: () => Promise<unknown>, ok: string) => {
    setBusy(key);
    try {
      await run();
      show("ok", ok);
      await state.reload();
    } catch (e) {
      show("bad", (e as Error).message);
    }
    setBusy(null);
  };

  return (
    <Page
      crumbs={[{ label: "Home", href: "/" }, { label: "Cases", href: "/cases" }, { label: `#${id}` }]}
      title={state.data ? state.data.detail.case.rca_id : `Case ${id}`}
      intro={state.data?.detail.case.dag_id}
    >
      {flash}
      <Resource state={state} label="Loading case…">
        {({ detail: { case: c, tasks, notifications }, team }) => {
          const closed = (c.status ?? "").toLowerCase() === "closed";
          const roster = team.filter(m => m.domain === c.domain && m.active);
          return (
            <>
              <div className="grid stats">
                <Pill tone={severityTone(c.severity)}>{c.severity ?? "no severity"}</Pill>
                <Pill tone={statusTone(c.status)} dot>
                  {c.status ?? "unknown"}
                </Pill>
                <Pill tone={c.confidence === "high" ? "mint" : c.confidence === "low" ? "amber" : "muted"}>
                  confidence {c.confidence ?? "—"}
                </Pill>
                <Pill tone={c.assigned_to ? "blue" : "amber"}>{c.assigned_to ?? "unowned"}</Pill>
              </div>

              <div className="grid two">
                <Card title="Analysis" meta="written by the RCA agent">
                  {c.root_cause_summary ? (
                    <div className="rca">
                      <div>
                        <h3>Root cause</h3>
                        <p>{c.root_cause_summary}</p>
                      </div>
                      {c.recommendation && (
                        <div>
                          <h3>Recommendation</h3>
                          <p>{c.recommendation}</p>
                        </div>
                      )}
                      {c.resolution && (
                        <div>
                          <h3>Resolution (from the owner)</h3>
                          <p>{c.resolution}</p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <Empty>No analysis yet — the rca worker writes it once evidence is collected.</Empty>
                  )}
                </Card>

                <Card title="Context">
                  <dl className="kv">
                    <dt>domain</dt>
                    <dd className="mono">{c.domain}</dd>
                    <dt>entity</dt>
                    <dd className="mono">{c.entity_key ?? c.dag_id}</dd>
                    <dt>{c.source ? "source" : "run"}</dt>
                    <dd className="mono">{c.source ?? c.dag_run_id}</dd>
                    <dt>failing part</dt>
                    <dd className="mono">{c.failed_task_id ?? "—"}</dd>
                    <dt>run status</dt>
                    <dd>{c.run_status ?? "—"}</dd>
                    <dt>opened</dt>
                    <dd>{relTime(c.opened_at)}</dd>
                    <dt>notified</dt>
                    <dd>{relTime(c.notified_at)}</dd>
                    <dt>incident</dt>
                    <dd>
                      {c.incident_id ? (
                        <Link href={`/incidents/${c.incident_id}`} style={{ color: "var(--blue)" }}>
                          #{c.incident_id} — grouped
                        </Link>
                      ) : (
                        "not grouped"
                      )}
                    </dd>
                    {closed && (
                      <>
                        <dt>closed</dt>
                        <dd>
                          {relTime(c.closed_at)} · {c.close_reason ?? "—"}
                        </dd>
                      </>
                    )}
                  </dl>
                </Card>
              </div>

              <Card title="Actions" meta="the same decisions the LINE/email buttons offer">
                {closed ? (
                  <button
                    className="btn"
                    disabled={busy === "reopen"}
                    onClick={() => void act("reopen", () => api.post(`/cases/${c.id}/reopen`), "Case reopened")}
                  >
                    {busy === "reopen" ? <Loader2 className="spin" size={13} /> : <RotateCcw size={13} />} Reopen
                  </button>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                    <div className="filters">
                      <label className="field" style={{ flex: "1 1 220px" }}>
                        <span>take / assign to</span>
                        <input
                          list="case-roster"
                          placeholder="owner@example.com"
                          value={owner}
                          onChange={e => setOwner(e.target.value)}
                        />
                        <datalist id="case-roster">
                          {roster.map(m => (
                            <option key={m.id} value={m.email}>
                              {`${m.name} · on call #${m.position}`}
                            </option>
                          ))}
                        </datalist>
                      </label>
                      <button
                        className="btn"
                        data-tone="primary"
                        disabled={!owner.trim() || busy === "assign"}
                        onClick={() => void act("assign", () => api.post(`/cases/${c.id}/assign`, { email: owner.trim() }), `Assigned to ${owner}`)}
                      >
                        {busy === "assign" ? <Loader2 className="spin" size={13} /> : <UserCheck size={13} />} Assign
                      </button>
                    </div>
                    <div className="filters">
                      <label className="field" style={{ flex: "1 1 320px" }}>
                        <span>resolution (what actually fixed it — reused for similar cases)</span>
                        <input placeholder="raised pgbouncer max_client_conn to 400" value={resolution} onChange={e => setResolution(e.target.value)} />
                      </label>
                      <button
                        className="btn"
                        data-tone="primary"
                        disabled={!resolution.trim() || busy === "close"}
                        onClick={() => void act("close", () => api.post(`/cases/${c.id}/close`, { resolution: resolution.trim() }), "Case closed")}
                      >
                        {busy === "close" ? <Loader2 className="spin" size={13} /> : <Check size={13} />} Close as resolved
                      </button>
                      <button
                        className="btn"
                        data-tone="danger"
                        disabled={busy === "dismiss"}
                        onClick={() => void act("dismiss", () => api.post(`/cases/${c.id}/dismiss`), "Case dismissed")}
                      >
                        <XCircle size={13} /> Dismiss
                      </button>
                    </div>
                  </div>
                )}
              </Card>

              {(c.pushed_title || c.pushed_evidence) && (
                <Card title="Pushed evidence" meta={c.source ? `from ${c.source}` : undefined}>
                  {c.pushed_title && <p style={{ marginTop: 0 }}>{c.pushed_title}</p>}
                  {c.pushed_evidence && <pre className="evidence">{c.pushed_evidence}</pre>}
                </Card>
              )}

              <div className="grid two">
                {tasks.length > 0 && (
                  <Card title="Task states" meta="from the pipeline run" tight>
                    <table>
                      <thead>
                        <tr>
                          <th>task</th>
                          <th>state</th>
                          <th className="num">try</th>
                          <th className="num">duration</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tasks.map(t => (
                          <tr key={`${t.task_id}-${t.try_number}`}>
                            <td className="mono trunc">{t.task_id}</td>
                            <td>
                              <Pill tone={statusTone(t.state)}>{t.state ?? "—"}</Pill>
                            </td>
                            <td className="num">{t.try_number}</td>
                            <td className="num">{t.duration_sec != null ? `${Math.round(t.duration_sec)}s` : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </Card>
                )}

                <Card title="Escalation history" meta={`${notifications.length} notification(s)`} tight>
                  {notifications.length === 0 ? (
                    <Empty>Nobody has been paged for this case yet.</Empty>
                  ) : (
                    <table>
                      <thead>
                        <tr>
                          <th className="num">#</th>
                          <th>recipient</th>
                          <th>kind</th>
                          <th>sent</th>
                          <th>response</th>
                        </tr>
                      </thead>
                      <tbody>
                        {notifications.map((n, i) => (
                          <tr key={`${n.de_email}-${n.kind}-${i}`}>
                            <td className="num">{n.position}</td>
                            <td className="trunc">{n.de_email}</td>
                            <td>{n.kind}</td>
                            <td>{relTime(n.sent_at)}</td>
                            <td>{n.response ? <Pill tone={n.response === "accepted" ? "mint" : "amber"}>{n.response}</Pill> : "waiting"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </Card>
              </div>
            </>
          );
        }}
      </Resource>
    </Page>
  );
}
