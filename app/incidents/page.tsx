"use client";

// Incidents = cases that share a cause. The list defaults to open ones, because a resolved
// incident is history and history belongs behind a filter.

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { api, listOf, qs, relTime, statusTone, type Domain, type Incident } from "../lib/api";
import { Card, Empty, Pill, Resource, useResource } from "../lib/ui";
import { Page } from "../shell";

export default function IncidentsPage() {
  const params = useSearchParams();
  const router = useRouter();
  const domain = params.get("domain") ?? "";
  const open = params.get("open") !== "false";

  const state = useResource(
    async () => {
      const [incidents, domains] = await Promise.all([
        api.get<Incident[]>(`/incidents${qs({ domain, open, limit: 200 })}`),
        api.get<Domain[]>("/domains").catch(() => [] as Domain[]),
      ]);
      return { incidents: listOf<Incident>(incidents), domains: listOf<Domain>(domains) };
    },
    [domain, open],
    30_000,
  );

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.replace(`/incidents${next.toString() ? `?${next}` : ""}`);
  };

  return (
    <Page
      crumbs={[{ label: "Home", href: "/" }, { label: "Incidents" }]}
      title="Incidents"
      intro="Cases grouped by cause — one incident can span many runs, entities, even domains."
      tools={
        <>
          <label className="field">
            <span>domain</span>
            <select value={domain} onChange={e => setParam("domain", e.target.value)}>
              <option value="">all domains</option>
              {(state.data?.domains ?? []).map(d => (
                <option key={d.code} value={d.code}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>state</span>
            <select value={open ? "open" : "all"} onChange={e => setParam("open", e.target.value === "open" ? "" : "false")}>
              <option value="open">open only</option>
              <option value="all">open + resolved</option>
            </select>
          </label>
        </>
      }
    >
      <Resource state={state} label="Loading incidents…">
        {({ incidents, domains }) => {
          const colour = (code: string) => domains.find(d => d.code === code)?.color ?? "var(--mint)";
          return (
            <Card meta={`${incidents.length} incident${incidents.length === 1 ? "" : "s"}`} tight>
              {incidents.length === 0 ? (
                <Empty>No incidents match this filter.</Empty>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>state</th>
                      <th>domain</th>
                      <th>signature</th>
                      <th className="num">cases</th>
                      <th>affected</th>
                      <th>opened</th>
                      <th>resolved</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {incidents.map(i => (
                      <tr key={i.id}>
                        <td>
                          <Pill tone={i.resolved_at ? statusTone("resolved") : statusTone("open")} dot>
                            {i.resolved_at ? "resolved" : "open"}
                          </Pill>
                        </td>
                        <td>
                          <span className="domain-chip">
                            <i style={{ background: colour(i.domain) }} />
                            {i.domain}
                          </span>
                        </td>
                        <td className="trunc mono">{i.signature}</td>
                        <td className="num">{i.run_count}</td>
                        <td className="trunc">{i.affected_dags ?? "—"}</td>
                        <td>{relTime(i.opened_at)}</td>
                        <td>{i.resolved_at ? relTime(i.resolved_at) : "—"}</td>
                        <td className="actions">
                          <Link className="btn btn-sm" href={`/incidents/${i.id}`}>
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
