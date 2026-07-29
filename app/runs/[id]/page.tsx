"use client";

// One run: its tasks, the Spark applications it launched, and the logs collected for it. Log text
// is fetched on demand — a single source can be megabytes, and most visits only need the summary.

import { ArrowLeft, FileText } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { api, duration, relTime, statusTone, type Json } from "../../lib/api";
import { Card, Empty, Pill, Resource, useResource } from "../../lib/ui";
import { Page } from "../../shell";

type Task = {
  task_id: string;
  operator: string | null;
  state: string | null;
  try_number: number | null;
  max_tries: number | null;
  duration_sec: number | null;
  start_time: string | null;
};
type Resource_ = {
  id: number;
  resource_type: string;
  resource_id: string;
  resource_name: string | null;
  application_id: string | null;
  duration_sec: number | null;
};
type LogSource = {
  id: number;
  source_type: string;
  content_type: string;
  task_id: string | null;
  try_number: number | null;
  source_uri: string | null;
  content_size_bytes: number | null;
  line_count: number | null;
  collected_at: string;
};
type Detail = { run: Json; tasks: Task[]; resources: Resource_[]; log_sources: LogSource[] };

const str = (v: unknown) => (v == null || v === "" ? "—" : String(v));

export default function RunPage() {
  const id = String(useParams().id ?? "");
  const state = useResource(() => api.get<Detail>(`/runs/${id}`), [id], 30_000);
  const [log, setLog] = useState<{ id: number; text: string } | null>(null);
  const [loadingLog, setLoadingLog] = useState<number | null>(null);

  const openLog = async (sourceId: number) => {
    setLoadingLog(sourceId);
    try {
      const src = await api.get<Json>(`/log-sources/${sourceId}`);
      const text =
        (src.raw_content as string | null) ??
        (src.raw_json ? JSON.stringify(src.raw_json, null, 2) : "(empty)");
      setLog({ id: sourceId, text });
    } catch (e) {
      setLog({ id: sourceId, text: `Could not load this source: ${(e as Error).message}` });
    }
    setLoadingLog(null);
  };

  return (
    <Page
      crumbs={[{ label: "Operate", href: "/" }, { label: "Pipeline runs", href: "/runs" }, { label: `#${id}` }]}
      title={state.data ? `${str(state.data.run.dag_id)}` : `Run #${id}`}
      intro={state.data ? str(state.data.run.dag_run_id) : undefined}
      tools={
        <Link className="btn" href="/runs">
          <ArrowLeft size={15} />
          Back to runs
        </Link>
      }
    >
      <Resource state={state} label="Loading run…">
        {({ run, tasks, resources, log_sources }) => (
          <>
            <div className="grid stats">
              <div className="stat">
                <p>status</p>
                <b style={{ fontSize: 20 }}>{str(run.status)}</b>
                <small>{relTime(run.last_seen_at as string)}</small>
              </div>
              <div className="stat">
                <p>duration</p>
                <b style={{ fontSize: 20 }}>{duration(run.duration_sec as number | null)}</b>
                <small>{str(run.start_time)}</small>
              </div>
              <div className="stat" data-tone={run.failed_task_id ? "red" : undefined}>
                <p>failed task</p>
                <b style={{ fontSize: 20 }}>{str(run.failed_task_id)}</b>
                <small>
                  try {str(run.try_number)} of {str(run.max_tries)}
                </small>
              </div>
            </div>

            <Card title="Tasks" meta={`${tasks.length}`} tight>
              {tasks.length === 0 ? (
                <Empty>No task states were collected for this run.</Empty>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>task</th>
                      <th>operator</th>
                      <th>state</th>
                      <th className="num">try</th>
                      <th className="num">duration</th>
                      <th>started</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tasks.map(t => (
                      <tr key={`${t.task_id}-${t.try_number}`}>
                        <td className="mono">{t.task_id}</td>
                        <td className="trunc">{t.operator ?? "—"}</td>
                        <td>
                          <Pill tone={statusTone(t.state)}>{t.state ?? "—"}</Pill>
                        </td>
                        <td className="num">
                          {t.try_number ?? "—"}/{t.max_tries ?? "—"}
                        </td>
                        <td className="num">{duration(t.duration_sec)}</td>
                        <td>{relTime(t.start_time)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>

            <div className="grid two">
              <Card title="Discovered resources" meta={`${resources.length}`} tight>
                {resources.length === 0 ? (
                  <Empty>Nothing linked — no Spark application ids were found in the logs.</Empty>
                ) : (
                  <table>
                    <thead>
                      <tr>
                        <th>type</th>
                        <th>id</th>
                        <th className="num">duration</th>
                      </tr>
                    </thead>
                    <tbody>
                      {resources.map(r => (
                        <tr key={r.id}>
                          <td>{r.resource_type}</td>
                          <td className="trunc mono">{r.application_id ?? r.resource_id}</td>
                          <td className="num">{duration(r.duration_sec)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </Card>

              <Card title="Collected logs" meta={`${log_sources.length} source(s)`} tight>
                {log_sources.length === 0 ? (
                  <Empty>No logs were collected for this run.</Empty>
                ) : (
                  <table>
                    <thead>
                      <tr>
                        <th>source</th>
                        <th>task</th>
                        <th className="num">lines</th>
                        <th>collected</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {log_sources.map(s => (
                        <tr key={s.id}>
                          <td>
                            {s.source_type} <span style={{ color: "var(--text-muted)" }}>{s.content_type}</span>
                          </td>
                          <td className="trunc mono">{s.task_id ?? "—"}</td>
                          <td className="num">{s.line_count ?? "—"}</td>
                          <td>{relTime(s.collected_at)}</td>
                          <td className="actions">
                            <button className="btn btn-sm" disabled={loadingLog === s.id} onClick={() => void openLog(s.id)}>
                              <FileText size={12} />
                              View
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </Card>
            </div>

            {log && (
              <Card
                title={`Log source #${log.id}`}
                actions={
                  <button className="btn btn-sm" data-tone="ghost" onClick={() => setLog(null)}>
                    Close
                  </button>
                }
              >
                <pre className="evidence">{log.text}</pre>
              </Card>
            )}
          </>
        )}
      </Resource>
    </Page>
  );
}
