"use client";

// Case list. Filters live in the URL (?domain=&status=) so a filtered view is shareable and
// survives a refresh — the old single-page console lost both.

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { api, listOf, qs, relTime, severityTone, statusTone, type Case, type Domain } from "../lib/api";
import { Card, Empty, Pill, Resource, useResource } from "../lib/ui";
import { Page } from "../shell";

const STATUSES = ["open", "collecting", "analyzing", "completed", "error", "closed"];

export default function CasesPage() {
  const params = useSearchParams();
  const router = useRouter();
  const domain = params.get("domain") ?? "";
  const status = params.get("status") ?? "";

  const state = useResource(
    async () => {
      const [cases, domains] = await Promise.all([
        api.get<Case[]>(`/cases${qs({ domain, status, limit: 200 })}`),
        api.get<Domain[]>("/domains").catch(() => [] as Domain[]),
      ]);
      return { cases: listOf<Case>(cases), domains: listOf<Domain>(domains) };
    },
    [domain, status],
    30_000,
  );

  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.replace(`/cases${next.toString() ? `?${next}` : ""}`);
  };

  return (
    <Page
      crumbs={[{ label: "Operate", href: "/" }, { label: "Cases" }]}
      title="Cases"
      intro="One case per failing entity. The analysis, the evidence and the escalation history all hang off it."
      tools={
        <>
          <label className="field">
            <span>domain</span>
            <select value={domain} onChange={e => setFilter("domain", e.target.value)}>
              <option value="">all domains</option>
              {(state.data?.domains ?? []).map(d => (
                <option key={d.code} value={d.code}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>status</span>
            <select value={status} onChange={e => setFilter("status", e.target.value)}>
              <option value="">any status</option>
              {STATUSES.map(s => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
        </>
      }
    >
      <Resource state={state} label="Loading cases…">
        {({ cases, domains }) => {
          const colour = (code: string) => domains.find(d => d.code === code)?.color ?? "var(--mint)";
          return (
            <Card meta={`${cases.length} case${cases.length === 1 ? "" : "s"}`} tight>
              {cases.length === 0 ? (
                <Empty>No cases match this filter.</Empty>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>severity</th>
                      <th>domain</th>
                      <th>entity</th>
                      <th>rca id</th>
                      <th>status</th>
                      <th>owner</th>
                      <th>incident</th>
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
                        <td>
                          <span className="domain-chip">
                            <i style={{ background: colour(c.domain) }} />
                            {c.domain}
                          </span>
                        </td>
                        <td className="trunc">{c.dag_id}</td>
                        <td className="mono">{c.rca_id}</td>
                        <td>
                          <Pill tone={statusTone(c.status)}>{c.status ?? "—"}</Pill>
                        </td>
                        <td className="trunc">{c.assigned_to ?? <span style={{ color: "var(--amber)" }}>unowned</span>}</td>
                        <td>
                          {c.incident_id ? (
                            <Link className="mono" href={`/incidents/${c.incident_id}`} style={{ color: "var(--blue)" }}>
                              #{c.incident_id}
                            </Link>
                          ) : (
                            "—"
                          )}
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
          );
        }}
      </Resource>
    </Page>
  );
}
