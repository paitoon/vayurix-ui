"use client";

// Home — the screen the console opens on. It answers one question: what needs a human right now?
// ("Triage" was the old name; it described the activity, not the place, and nobody looked for it.)
// Unowned cases first (nobody is on it), then per-domain load, then the failure classes an
// operator must not miss: parked dead letters and stopped services.

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { api, listOf, relTime, severityTone, statusTone, type Case, type Domain, type Overview } from "./lib/api";
import { Card, Empty, Pill, Resource, Stat, useResource } from "./lib/ui";
import { Page } from "./shell";

const rank = (severity: string | null) =>
  ({ critical: 4, high: 3, medium: 2, low: 1 })[(severity ?? "").toLowerCase()] ?? 0;

export default function HomePage() {
  const state = useResource(
    async () => {
      const [overview, cases, domains] = await Promise.all([
        api.get<Overview>("/overview"),
        api.get<Case[]>("/cases?limit=200"),
        api.get<Domain[]>("/domains?active=true").catch(() => [] as Domain[]),
      ]);
      return { overview, cases: listOf<Case>(cases), domains: listOf<Domain>(domains) };
    },
    [],
    20_000,
  );

  return (
    <Page
      crumbs={[{ label: "Home" }]}
      title="Home"
      intro="Open work across every domain, worst first. Cases with no owner are the ones still escalating."
    >
      <Resource state={state} label="Reading open work…">
        {({ overview, cases, domains }) => {
          const colour = (code: string) => domains.find(d => d.code === code)?.color ?? "var(--mint)";
          const open = cases.filter(c => (c.status ?? "").toLowerCase() !== "closed");
          const unowned = open
            .filter(c => !c.assigned_to)
            .sort((a, b) => rank(b.severity) - rank(a.severity) || +new Date(a.opened_at) - +new Date(b.opened_at));

          return (
            <>
              <div className="grid stats">
                <Stat
                  label="Unowned cases"
                  value={overview.unassigned_cases}
                  detail="nobody accepted yet"
                  tone={overview.unassigned_cases ? "amber" : "mint"}
                />
                <Stat label="Open cases" value={overview.open_cases} detail="not closed" />
                <Stat label="Open incidents" value={overview.open_incidents} detail="grouped failures" />
                <Stat
                  label="Dead letters"
                  value={overview.dlq_parked}
                  detail="parked messages"
                  tone={overview.dlq_parked ? "red" : "mint"}
                />
                <Stat
                  label="Services"
                  value={`${overview.services.running}/${overview.services.total}`}
                  detail="background workers"
                  tone={overview.services.running < overview.services.total ? "amber" : "mint"}
                />
              </div>

              <Card
                title="Needs an owner"
                meta={`${unowned.length} case${unowned.length === 1 ? "" : "s"}`}
                actions={
                  <Link className="btn btn-sm" href="/cases">
                    All cases <ArrowRight size={13} />
                  </Link>
                }
                tight
              >
                {unowned.length === 0 ? (
                  <Empty>Every open case has an owner. Nothing is escalating.</Empty>
                ) : (
                  <table>
                    <thead>
                      <tr>
                        <th>severity</th>
                        <th>domain</th>
                        <th>entity</th>
                        <th>rca id</th>
                        <th>status</th>
                        <th>opened</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {unowned.slice(0, 12).map(c => (
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

              <div className="grid two">
                <Card title="Load by domain" meta="open · unowned · incidents" tight>
                  {overview.by_domain.length === 0 ? (
                    <Empty>No domains registered yet.</Empty>
                  ) : (
                    <table>
                      <tbody>
                        {overview.by_domain.map(d => (
                          <tr key={d.domain}>
                            <td>
                              <span className="domain-chip">
                                <i style={{ background: colour(d.domain) }} />
                                {d.name}
                              </span>
                            </td>
                            <td className="num">{d.open_cases}</td>
                            <td className="num" style={{ color: d.unassigned_cases ? "var(--amber)" : undefined }}>
                              {d.unassigned_cases}
                            </td>
                            <td className="num">{d.open_incidents}</td>
                            <td className="actions">
                              <Link className="btn btn-sm" href={`/cases?domain=${encodeURIComponent(d.domain)}`}>
                                Cases
                              </Link>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </Card>

                <Card title="Severity mix" meta="open cases">
                  {overview.cases_by_severity.length === 0 ? (
                    <Empty>Nothing open.</Empty>
                  ) : (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                      {overview.cases_by_severity.map(s => (
                        <Pill key={s.severity} tone={severityTone(s.severity)}>
                          {s.severity} · {s.count}
                        </Pill>
                      ))}
                    </div>
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
