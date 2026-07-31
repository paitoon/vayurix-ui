"use client";

// The push feed: everything external monitors sent us (ADR-005). This is the equivalent of
// "pipeline runs" for domains that have no DAGs — for it_ops or security, this *is* the raw signal.

import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { api, listOf, qs, relTime, severityTone, statusTone, type Domain, type IncidentEvent } from "../lib/api";
import { Card, Empty, Pill, Resource, useResource } from "../lib/ui";
import { Page } from "../shell";

export default function EventsPage() {
  const params = useSearchParams();
  const router = useRouter();
  const domain = params.get("domain") ?? "";
  const entity = params.get("entity_key") ?? "";

  const state = useResource(
    async () => {
      const [events, domains] = await Promise.all([
        api.get<IncidentEvent[]>(`/events${qs({ domain, entity_key: entity, limit: 200 })}`),
        api.get<Domain[]>("/domains").catch(() => [] as Domain[]),
      ]);
      return { events: listOf<IncidentEvent>(events), domains: listOf<Domain>(domains) };
    },
    [domain, entity],
    20_000,
  );

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.replace(`/events${next.toString() ? `?${next}` : ""}`);
  };

  return (
    <Page
      crumbs={[{ label: "Home", href: "/" }, { label: "Event stream" }]}
      title="Event stream"
      intro="Alerts pushed in by external monitors. A failing one opens a case; a recovery closes it."
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
            <span>entity</span>
            <input
              placeholder="e.g. pgbouncer-prod-1"
              defaultValue={entity}
              onKeyDown={e => {
                if (e.key === "Enter") setParam("entity_key", (e.target as HTMLInputElement).value.trim());
              }}
            />
          </label>
        </>
      }
    >
      <Resource state={state} label="Loading events…">
        {({ events, domains }) => {
          const colour = (code: string) => domains.find(d => d.code === code)?.color ?? "var(--mint)";
          return (
            <Card meta={`${events.length} event${events.length === 1 ? "" : "s"}`} tight>
              {events.length === 0 ? (
                <Empty>
                  Nothing pushed yet. Monitors post to <code className="mono">POST /ingest</code>.
                </Empty>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>severity</th>
                      <th>status</th>
                      <th>domain</th>
                      <th>entity</th>
                      <th>title</th>
                      <th>source</th>
                      <th>received</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {events.map(e => (
                      <tr key={e.id}>
                        <td>
                          <Pill tone={severityTone(e.severity)}>{e.severity ?? "—"}</Pill>
                        </td>
                        <td>
                          <Pill tone={statusTone(e.status)}>{e.status}</Pill>
                        </td>
                        <td>
                          <span className="domain-chip">
                            <i style={{ background: colour(e.domain) }} />
                            {e.domain}
                          </span>
                        </td>
                        <td className="trunc mono">
                          <button className="link-inline" onClick={() => setParam("entity_key", e.entity_key)}>
                            {e.entity_key}
                          </button>
                        </td>
                        <td className="trunc">{e.title ?? "—"}</td>
                        <td className="mono">{e.source}</td>
                        <td>{relTime(e.received_at)}</td>
                        <td className="actions">
                          {e.case_id && (
                            <Link className="btn btn-sm" href={`/cases/${e.case_id}`}>
                              Case
                              <ExternalLink size={12} />
                            </Link>
                          )}
                          <Link className="btn btn-sm" href={`/events/${e.id}`}>
                            Payload
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
