"use client";

// The background services: four watchers and four Kafka workers. Start/stop is deliberately
// all-or-nothing and persisted — a half-stopped pipeline looks healthy from the outside while
// quietly dropping work, which is worse than being clearly off.

import { Play, RefreshCw, Square } from "lucide-react";
import { useState } from "react";
import { api, listOf, type Service } from "../../lib/api";
import { Banner, Card, Empty, Pill, Resource, useFlash, useResource } from "../../lib/ui";
import { Page } from "../../shell";

const WHAT: Record<string, string> = {
  escalation: "pages the next on-call person when nobody responds in time",
  sla: "evaluates deadline policies and records outcomes",
  retention: "drops log partitions and graph nodes past the retention window",
  lineage: "re-syncs Airflow asset lineage into the graph",
  ingest: "consumes pipeline.events → normalises runs",
  collect: "fetches Airflow/Spark logs for a failing run",
  rca: "asks the model for a root cause, then notifies",
  dlq: "records messages the pipeline gave up on",
};

export default function ServicesPage() {
  const state = useResource(async () => listOf<Service>(await api.get("/services"), "services"), [], 10_000);
  const { flash, show } = useFlash();
  const [busy, setBusy] = useState<string | null>(null);

  const act = async (what: "start" | "stop" | "restart") => {
    if (what === "stop" && !confirm("Stop every background service? Ingestion and RCA stop until you start them again.")) {
      return;
    }
    setBusy(what);
    try {
      await api.post(`/services/${what}`);
      show("ok", `services ${what === "stop" ? "stopped" : what === "start" ? "started" : "restarted"}.`);
      await state.reload();
    } catch (e) {
      show("bad", (e as Error).message);
    }
    setBusy(null);
  };

  return (
    <Page
      crumbs={[{ label: "Admin", href: "/admin/domains" }, { label: "Services" }]}
      title="Services"
      intro="Watchers and Kafka workers, controlled at runtime. The desired state is stored, so a restart of the server keeps whatever you chose here."
      tools={
        <>
          <button className="btn" data-tone="primary" disabled={busy !== null} onClick={() => void act("start")}>
            <Play size={15} />
            Start all
          </button>
          <button className="btn" disabled={busy !== null} onClick={() => void act("restart")}>
            <RefreshCw size={15} />
            Restart
          </button>
          <button className="btn" data-tone="danger" disabled={busy !== null} onClick={() => void act("stop")}>
            <Square size={15} />
            Stop all
          </button>
        </>
      }
    >
      {flash}
      <Resource state={state} label="Loading services…">
        {services => {
          const down = services.filter(s => s.start && !s.running);
          return (
            <>
              {down.length > 0 && (
                <Banner tone="bad">
                  {down.map(s => s.name).join(", ")} should be running but {down.length === 1 ? "is" : "are"} not —
                  check the server log for a crash loop.
                </Banner>
              )}
              <Card meta={`${services.filter(s => s.running).length} of ${services.length} running`} tight>
                {services.length === 0 ? (
                  <Empty>No services registered.</Empty>
                ) : (
                  <table>
                    <thead>
                      <tr>
                        <th>service</th>
                        <th>state</th>
                        <th>desired</th>
                        <th>what it does</th>
                      </tr>
                    </thead>
                    <tbody>
                      {services.map(s => (
                        <tr key={s.name}>
                          <td className="mono">{s.name}</td>
                          <td>
                            {s.running ? (
                              <Pill tone="mint" dot>
                                running
                              </Pill>
                            ) : (
                              <Pill tone={s.start ? "red" : "muted"} dot>
                                stopped
                              </Pill>
                            )}
                          </td>
                          <td>{s.start ? "start on boot" : "stay off"}</td>
                          <td style={{ color: "var(--text-soft)" }}>{WHAT[s.name] ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </Card>
              <Banner tone="info">
                Trigger endpoints answer 503 while their service is stopped, rather than pretending to
                queue work: <code>/sla/evaluate</code>, <code>/collect/*</code>, <code>/rca/analyze</code>.
              </Banner>
            </>
          );
        }}
      </Resource>
    </Page>
  );
}
