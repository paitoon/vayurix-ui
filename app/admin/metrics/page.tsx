"use client";

// /metrics is Prometheus text, not JSON. Rather than pretend otherwise, this page parses the
// families it knows into tables and keeps the raw exposition underneath — the per-DAG and per-task
// gauges are the point of that endpoint, and reading them shouldn't require a Grafana first.

import { useState } from "react";
import { api, duration } from "../../lib/api";
import { Card, Empty, Resource, useResource } from "../../lib/ui";
import { Page } from "../../shell";

type Sample = { labels: Record<string, string>; value: number };

/** Minimal Prometheus text parser: enough for the gauges vayurix exports. */
function parse(text: string): Record<string, Sample[]> {
  const out: Record<string, Sample[]> = {};
  for (const line of text.split("\n")) {
    if (!line || line.startsWith("#")) continue;
    const match = /^([a-zA-Z_:][a-zA-Z0-9_:]*)(\{([^}]*)\})?\s+(.+)$/.exec(line.trim());
    if (!match) continue;
    const [, name, , labelText, rawValue] = match;
    const value = Number(rawValue);
    if (!Number.isFinite(value)) continue;
    const labels: Record<string, string> = {};
    if (labelText) {
      for (const pair of labelText.split(/",\s*/)) {
        const [k, v] = pair.split("=");
        if (k && v !== undefined) labels[k.trim()] = v.replace(/^"|"$/g, "");
      }
    }
    (out[name] ??= []).push({ labels, value });
  }
  return out;
}

const num = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(2));

function Family({
  title,
  samples,
  label,
  format = num,
}: {
  title: string;
  samples: Sample[] | undefined;
  label: string[];
  format?: (v: number) => string;
}) {
  return (
    <Card title={title} meta={samples ? `${samples.length}` : "0"} tight>
      {!samples || samples.length === 0 ? (
        <Empty>No samples — nothing has been recorded for this window yet.</Empty>
      ) : (
        <table>
          <thead>
            <tr>
              {label.map(l => (
                <th key={l}>{l}</th>
              ))}
              <th className="num">value</th>
            </tr>
          </thead>
          <tbody>
            {[...samples]
              .sort((a, b) => b.value - a.value)
              .map((s, i) => (
                <tr key={i}>
                  {label.map(l => (
                    <td key={l} className="mono trunc">
                      {s.labels[l] ?? "—"}
                    </td>
                  ))}
                  <td className="num">{format(s.value)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}

export default function MetricsPage() {
  const state = useResource(() => api.get<string>("/metrics"), [], 20_000);
  const [raw, setRaw] = useState(false);

  return (
    <Page
      crumbs={[{ label: "Admin", href: "/admin/domains" }, { label: "Metrics" }]}
      title="Metrics"
      intro="The Prometheus endpoint, read directly. Per-DAG and per-task numbers cover the last 7 days and are computed on each scrape."
      tools={
        <button className="btn" onClick={() => setRaw(!raw)}>
          {raw ? "Show tables" : "Show raw exposition"}
        </button>
      }
    >
      <Resource state={state} label="Scraping /metrics…">
        {text => {
          const m = parse(typeof text === "string" ? text : String(text));
          if (raw) {
            return (
              <Card title="/metrics" meta="raw">
                <pre className="evidence">{String(text)}</pre>
              </Card>
            );
          }
          const gauge = (name: string) => m[name]?.[0]?.value ?? 0;
          return (
            <>
              <div className="grid stats">
                <div className="stat">
                  <p>open cases</p>
                  <b>{num(gauge("vayurix_open_rca_cases"))}</b>
                </div>
                <div className="stat">
                  <p>open incidents</p>
                  <b>{num(gauge("vayurix_open_incidents"))}</b>
                </div>
                <div className="stat" data-tone={gauge("vayurix_dlq_parked") > 0 ? "amber" : undefined}>
                  <p>dlq parked</p>
                  <b>{num(gauge("vayurix_dlq_parked"))}</b>
                </div>
              </div>

              <Family
                title="Worker heartbeat age"
                samples={m["vayurix_worker_heartbeat_age_seconds"]}
                label={["role"]}
                format={duration}
              />
              <Family
                title="Flaky tasks — failures (7d)"
                samples={m["vayurix_task_failures_total"]}
                label={["dag_id", "task_id"]}
              />
              <Family
                title="Retried tasks (7d)"
                samples={m["vayurix_task_retries_total"]}
                label={["dag_id", "task_id"]}
              />
              <Family
                title="Slowest tasks — max duration (7d)"
                samples={m["vayurix_task_duration_max_seconds"]}
                label={["dag_id", "task_id"]}
                format={duration}
              />
              <Family
                title="Task mean duration (7d)"
                samples={m["vayurix_task_duration_avg_seconds"]}
                label={["dag_id", "task_id"]}
                format={duration}
              />
              <Family title="DAG runs by status (7d)" samples={m["vayurix_dag_runs_total"]} label={["dag_id", "status"]} />
              <Family
                title="DAG mean duration (7d)"
                samples={m["vayurix_dag_duration_avg_seconds"]}
                label={["dag_id"]}
                format={duration}
              />
              <Family title="SLA outcomes (7d)" samples={m["vayurix_dag_sla_total"]} label={["dag_id", "outcome"]} />
              <Family
                title="Worst SLA lateness (7d)"
                samples={m["vayurix_dag_sla_lateness_max_seconds"]}
                label={["dag_id"]}
                format={duration}
              />
              <Family
                title="Recurrences of open incidents, by DAG"
                samples={m["vayurix_open_incident_recurrences"]}
                label={["dag_id"]}
              />
              <Family title="Open cases per domain" samples={m["vayurix_domain_open_cases"]} label={["domain"]} />
              <Family
                title="Unassigned cases per domain"
                samples={m["vayurix_domain_unassigned_cases"]}
                label={["domain"]}
              />
            </>
          );
        }}
      </Resource>
    </Page>
  );
}
