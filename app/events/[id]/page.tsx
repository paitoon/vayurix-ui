"use client";

// Exactly what the monitor sent, including the raw payload. When an alert produces a surprising
// case, this is the page that settles whether the surprise came from us or from the sender.

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api, relTime, severityTone, statusTone, type Json } from "../../lib/api";
import { Card, Pill, Resource, useResource } from "../../lib/ui";
import { Page } from "../../shell";

const str = (v: unknown) => (v == null || v === "" ? "—" : String(v));

export default function EventPage() {
  const id = String(useParams().id ?? "");
  const state = useResource(() => api.get<Json>(`/events/${id}`), [id]);

  return (
    <Page
      crumbs={[{ label: "Home", href: "/" }, { label: "Event stream", href: "/events" }, { label: `#${id}` }]}
      title={`Event #${id}`}
      tools={
        <Link className="btn" href="/events">
          <ArrowLeft size={15} />
          Back to stream
        </Link>
      }
    >
      <Resource state={state} label="Loading event…">
        {e => (
          <>
            <div className="grid two">
              <Card title={str(e.title)} meta={`${str(e.source)} · ${relTime(String(e.received_at ?? ""))}`}>
                <dl className="kv">
                  <dt>domain</dt>
                  <dd className="mono">{str(e.domain)}</dd>
                  <dt>entity</dt>
                  <dd className="mono">{str(e.entity_key)}</dd>
                  <dt>event key</dt>
                  <dd className="mono">{str(e.event_key)}</dd>
                  <dt>status</dt>
                  <dd>
                    <Pill tone={statusTone(String(e.status ?? ""))}>{str(e.status)}</Pill>
                  </dd>
                  <dt>severity</dt>
                  <dd>
                    <Pill tone={severityTone(e.severity as string | null)}>{str(e.severity)}</Pill>
                  </dd>
                  <dt>occurred</dt>
                  <dd>{str(e.occurred_at)}</dd>
                  <dt>received</dt>
                  <dd>{str(e.received_at)}</dd>
                  <dt>case</dt>
                  <dd>
                    {e.case_id ? (
                      <Link className="mono" href={`/cases/${e.case_id}`} style={{ color: "var(--blue)" }}>
                        #{String(e.case_id)}
                      </Link>
                    ) : (
                      "— (no case: recovery, duplicate, or an inactive domain)"
                    )}
                  </dd>
                </dl>
              </Card>

              <Card title="Evidence" meta="what the RCA model was given">
                <pre className="evidence">{str(e.evidence)}</pre>
              </Card>
            </div>

            <Card title="Raw payload" meta="as posted to /ingest">
              <pre className="evidence">{JSON.stringify(e.payload ?? e, null, 2)}</pre>
            </Card>
          </>
        )}
      </Resource>
    </Page>
  );
}
