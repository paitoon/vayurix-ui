"use client";

// One incident and its member cases. The signature is the thing that grouped them, so it is shown
// verbatim rather than prettified — it is what you paste into a search when it happens again.

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api, relTime, severityTone, statusTone, type Case, type Incident } from "../../lib/api";
import { Card, Empty, Pill, Resource, useResource } from "../../lib/ui";
import { Page } from "../../shell";

type Detail = { incident: Incident; cases: Case[] };

export default function IncidentPage() {
  const id = String(useParams().id ?? "");
  const state = useResource(() => api.get<Detail>(`/incidents/${id}`), [id], 30_000);

  return (
    <Page
      crumbs={[{ label: "Home", href: "/" }, { label: "Incidents", href: "/incidents" }, { label: `#${id}` }]}
      title={`Incident #${id}`}
      intro={state.data ? state.data.incident.signature : undefined}
      tools={
        <Link className="btn" href="/incidents">
          <ArrowLeft size={15} />
          Back to incidents
        </Link>
      }
    >
      <Resource state={state} label="Loading incident…">
        {({ incident, cases }) => (
          <>
            <div className="grid stats">
              <div className="stat">
                <p>state</p>
                <b style={{ fontSize: 20 }}>{incident.resolved_at ? "resolved" : "open"}</b>
                <small>{incident.resolved_at ? relTime(incident.resolved_at) : relTime(incident.opened_at)}</small>
              </div>
              <div className="stat">
                <p>cases</p>
                <b>{incident.run_count}</b>
                <small>grouped by the same cause</small>
              </div>
              <div className="stat">
                <p>domain</p>
                <b style={{ fontSize: 20 }}>{incident.domain}</b>
                <small>{incident.affected_dags ?? "—"}</small>
              </div>
            </div>

            <Card title="Signature">
              <pre className="evidence" style={{ maxHeight: 180 }}>
                {incident.signature}
              </pre>
            </Card>

            <Card title="Member cases" meta={`${cases.length}`} tight>
              {cases.length === 0 ? (
                <Empty>No cases are attached to this incident.</Empty>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>severity</th>
                      <th>entity</th>
                      <th>rca id</th>
                      <th>status</th>
                      <th>owner</th>
                      <th>opened</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {cases.map(c => (
                      <tr key={c.id}>
                        <td>
                          <Pill tone={severityTone(c.severity)}>{c.severity ?? "—"}</Pill>
                        </td>
                        <td className="trunc">{c.dag_id}</td>
                        <td className="mono">{c.rca_id}</td>
                        <td>
                          <Pill tone={statusTone(c.status)}>{c.status ?? "—"}</Pill>
                        </td>
                        <td className="trunc">
                          {c.assigned_to ?? <span style={{ color: "var(--amber)" }}>unowned</span>}
                        </td>
                        <td>{relTime(c.opened_at)}</td>
                        <td className="actions">
                          <Link className="btn btn-sm" href={`/cases/${c.id}`}>
                            Open
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
          </>
        )}
      </Resource>
    </Page>
  );
}
