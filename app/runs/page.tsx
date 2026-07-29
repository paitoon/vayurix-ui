"use client";

// Airflow runs. Pipeline-domain only, which is why the nav hides it when no Airflow domain is
// active — a security-only deployment has no DAGs and an empty table is worse than no table.

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { api, duration, listOf, qs, relTime, statusTone, type DagRow, type PipelineRun } from "../lib/api";
import { Card, Empty, Pill, Resource, useResource } from "../lib/ui";
import { Page } from "../shell";

const STATUSES = ["success", "failed", "running", "retry"];

export default function RunsPage() {
  const params = useSearchParams();
  const router = useRouter();
  const dag = params.get("dag_id") ?? "";
  const status = params.get("status") ?? "";

  const state = useResource(
    async () => {
      const [runs, dags] = await Promise.all([
        api.get<PipelineRun[]>(`/runs${qs({ dag_id: dag, status, limit: 200 })}`),
        api.get<DagRow[]>("/dags?days=7").catch(() => [] as DagRow[]),
      ]);
      return { runs: listOf<PipelineRun>(runs), dags: listOf<DagRow>(dags) };
    },
    [dag, status],
    20_000,
  );

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.replace(`/runs${next.toString() ? `?${next}` : ""}`);
  };

  return (
    <Page
      crumbs={[{ label: "Operate", href: "/" }, { label: "Pipeline runs" }]}
      title="Pipeline runs"
      intro="DAG runs as vayurix saw them, with the case each failure produced."
      tools={
        <>
          <label className="field">
            <span>dag</span>
            <select value={dag} onChange={e => setParam("dag_id", e.target.value)}>
              <option value="">all dags</option>
              {(state.data?.dags ?? []).map(d => (
                <option key={d.dag_id} value={d.dag_id}>
                  {d.dag_id}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>status</span>
            <select value={status} onChange={e => setParam("status", e.target.value)}>
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
      <Resource state={state} label="Loading runs…">
        {({ runs, dags }) => (
          <>
            {dags.length > 0 && (
              <Card title="DAGs, last 7 days" meta={`${dags.length}`} tight>
                <table>
                  <thead>
                    <tr>
                      <th>dag</th>
                      <th className="num">runs</th>
                      <th className="num">failed</th>
                      <th className="num">open cases</th>
                      <th>last status</th>
                      <th>last run</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {dags.map(d => (
                      <tr key={d.dag_id}>
                        <td className="mono">{d.dag_id}</td>
                        <td className="num">{d.total_runs}</td>
                        <td className="num" style={{ color: d.failed_runs > 0 ? "var(--red)" : undefined }}>
                          {d.failed_runs}
                        </td>
                        <td className="num" style={{ color: d.open_cases > 0 ? "var(--amber)" : undefined }}>
                          {d.open_cases}
                        </td>
                        <td>
                          <Pill tone={statusTone(d.last_status)}>{d.last_status ?? "—"}</Pill>
                        </td>
                        <td>{relTime(d.last_run_at)}</td>
                        <td className="actions">
                          <button className="btn btn-sm" onClick={() => setParam("dag_id", d.dag_id)}>
                            Filter
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            )}

            <Card title="Runs" meta={`${runs.length}`} tight>
              {runs.length === 0 ? (
                <Empty>No runs match this filter.</Empty>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>status</th>
                      <th>dag</th>
                      <th>run id</th>
                      <th>failed task</th>
                      <th className="num">try</th>
                      <th className="num">duration</th>
                      <th>seen</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {runs.map(r => (
                      <tr key={r.id}>
                        <td>
                          <Pill tone={statusTone(r.status)}>{r.status ?? "—"}</Pill>
                        </td>
                        <td className="mono">{r.dag_id}</td>
                        <td className="trunc mono">{r.dag_run_id}</td>
                        <td className="trunc">{r.failed_task_id ?? "—"}</td>
                        <td className="num">{r.try_number ?? "—"}</td>
                        <td className="num">{duration(r.duration_sec)}</td>
                        <td>{relTime(r.last_seen_at)}</td>
                        <td className="actions">
                          {r.case_id && (
                            <Link className="btn btn-sm" href={`/cases/${r.case_id}`}>
                              Case
                            </Link>
                          )}
                          <Link className="btn btn-sm" href={`/runs/${r.id}`}>
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
