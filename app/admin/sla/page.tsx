"use client";

// Deadline policies and the outcomes they produced. A policy is a cron expression in a timezone —
// "this must have finished by then" — so both are shown on every row: a deadline without its
// timezone is ambiguous twice a year.

import { PlayCircle, Plus, Save, Trash2 } from "lucide-react";
import { useState } from "react";
import {
  api, duration, listOf, relTime, statusTone, without, type Domain, type SlaPolicy, type SlaResult,
} from "../../lib/api";
import { Card, Empty, Pill, Resource, useFlash, useResource } from "../../lib/ui";
import { Page } from "../../shell";

type Draft = Partial<SlaPolicy>;

export default function SlaPage() {
  const state = useResource(async () => {
    const [policies, results, domains] = await Promise.all([
      api.get("/sla/policies"),
      api.get("/sla/results?days=7&limit=100").catch(() => []),
      api.get("/domains?active=true").catch(() => []),
    ]);
    return {
      policies: listOf<SlaPolicy>(policies),
      results: listOf<SlaResult>(results),
      domains: listOf<Domain>(domains),
    };
  }, [], 60_000);
  const { flash, show } = useFlash();
  const [edit, setEdit] = useState<Record<number, Draft>>({});
  const [neu, setNeu] = useState<Draft>({ timezone: "Asia/Bangkok", kind: "deadline" });
  const [busy, setBusy] = useState<number | string | null>(null);

  const patch = (id: number, part: Draft) => setEdit({ ...edit, [id]: { ...edit[id], ...part } });

  const save = async (p: SlaPolicy) => {
    setBusy(p.id);
    try {
      await api.put(`/sla/policies/${p.id}`, edit[p.id]);
      show("ok", `policy ${p.id} saved.`);
      setEdit(e => without(e, p.id));
      await state.reload();
    } catch (e) {
      show("bad", (e as Error).message);
    }
    setBusy(null);
  };

  const add = async () => {
    setBusy("__new");
    try {
      await api.post("/sla/policies", neu);
      show("ok", "policy created.");
      setNeu({ timezone: neu.timezone, kind: "deadline", domain: neu.domain });
      await state.reload();
    } catch (e) {
      show("bad", (e as Error).message);
    }
    setBusy(null);
  };

  const remove = async (p: SlaPolicy) => {
    if (!confirm(`Delete the SLA policy for ${p.target_key}?`)) return;
    setBusy(p.id);
    try {
      await api.del(`/sla/policies/${p.id}`);
      show("ok", "policy deleted.");
      await state.reload();
    } catch (e) {
      show("bad", (e as Error).message);
    }
    setBusy(null);
  };

  const evaluateNow = async () => {
    setBusy("__eval");
    try {
      const res = await api.post<{ evaluated: number }>("/sla/evaluate");
      show("ok", `evaluated ${res.evaluated} deadline(s).`);
      await state.reload();
    } catch (e) {
      show("bad", (e as Error).message);
    }
    setBusy(null);
  };

  return (
    <Page
      crumbs={[{ label: "Admin", href: "/admin/team" }, { label: "SLA policies" }]}
      title="SLA policies"
      intro="Deadlines as cron expressions. The watcher evaluates them on its own schedule; you can also force a pass."
      tools={
        <button className="btn" disabled={busy === "__eval"} onClick={() => void evaluateNow()}>
          <PlayCircle size={15} />
          Evaluate now
        </button>
      }
    >
      {flash}
      <Resource state={state} label="Loading SLA…">
        {({ policies, results, domains }) => (
          <>
            <Card title="New policy">
              <div className="row-form">
                <label className="field">
                  <span>domain</span>
                  <select value={neu.domain ?? ""} onChange={e => setNeu({ ...neu, domain: e.target.value })}>
                    <option value="">pipeline (default)</option>
                    {domains.map(d => (
                      <option key={d.code} value={d.code}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>dag / entity</span>
                  <input value={neu.dag_id ?? ""} onChange={e => setNeu({ ...neu, dag_id: e.target.value })} />
                </label>
                <label className="field">
                  <span>kind</span>
                  <select value={neu.kind ?? "deadline"} onChange={e => setNeu({ ...neu, kind: e.target.value })}>
                    <option value="deadline">deadline</option>
                    <option value="mttr">mttr</option>
                  </select>
                </label>
                <label className="field">
                  <span>cron (must finish by)</span>
                  <input placeholder="0 18 * * *" value={neu.deadline_cron ?? ""} onChange={e => setNeu({ ...neu, deadline_cron: e.target.value })} />
                </label>
                <label className="field">
                  <span>timezone</span>
                  <input value={neu.timezone ?? ""} onChange={e => setNeu({ ...neu, timezone: e.target.value })} />
                </label>
                <label className="field">
                  <span>description</span>
                  <input value={neu.description ?? ""} onChange={e => setNeu({ ...neu, description: e.target.value })} />
                </label>
                <button
                  className="btn"
                  data-tone="primary"
                  disabled={!neu.dag_id || !neu.deadline_cron || busy === "__new"}
                  onClick={() => void add()}
                >
                  <Plus size={14} />
                  Create
                </button>
              </div>
            </Card>

            <Card title="Policies" meta={`${policies.length}`} tight>
              {policies.length === 0 ? (
                <Empty>No deadlines defined yet.</Empty>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>domain</th>
                      <th>target</th>
                      <th>kind</th>
                      <th>cron</th>
                      <th>timezone</th>
                      <th>description</th>
                      <th>active</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {policies.map(p => {
                      const v = { ...p, ...edit[p.id] };
                      const dirty = !!edit[p.id];
                      return (
                        <tr key={p.id}>
                          <td className="mono">{p.domain}</td>
                          <td className="mono">{p.target_key}</td>
                          <td>{p.kind}</td>
                          <td style={{ width: 150 }}>
                            <input
                              className="mono"
                              value={v.deadline_cron ?? ""}
                              onChange={e => patch(p.id, { deadline_cron: e.target.value })}
                            />
                          </td>
                          <td style={{ width: 150 }}>
                            <input value={v.timezone ?? ""} onChange={e => patch(p.id, { timezone: e.target.value })} />
                          </td>
                          <td>
                            <input
                              value={v.description ?? ""}
                              onChange={e => patch(p.id, { description: e.target.value })}
                            />
                          </td>
                          <td>
                            <select value={String(v.active)} onChange={e => patch(p.id, { active: e.target.value === "true" })}>
                              <option value="true">on</option>
                              <option value="false">off</option>
                            </select>
                          </td>
                          <td className="actions">
                            <button
                              className="btn btn-sm"
                              data-tone={dirty ? "primary" : undefined}
                              disabled={!dirty || busy === p.id}
                              onClick={() => void save(p)}
                            >
                              <Save size={12} />
                              Save
                            </button>
                            <button className="btn btn-sm" data-tone="danger" disabled={busy === p.id} onClick={() => void remove(p)}>
                              <Trash2 size={12} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </Card>

            <Card title="Outcomes, last 7 days" meta={`${results.length}`} tight>
              {results.length === 0 ? (
                <Empty>No deadlines have been evaluated in this window.</Empty>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>outcome</th>
                      <th>domain</th>
                      <th>target</th>
                      <th>deadline</th>
                      <th className="num">lateness</th>
                      <th>run status</th>
                      <th>evaluated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map(r => (
                      <tr key={r.id}>
                        <td>
                          <Pill tone={statusTone(r.outcome)}>{r.outcome}</Pill>
                        </td>
                        <td className="mono">{r.domain}</td>
                        <td className="mono trunc">{r.target_key}</td>
                        <td>{r.deadline_at}</td>
                        <td className="num">{r.lateness_sec == null ? "—" : duration(r.lateness_sec)}</td>
                        <td>
                          <Pill tone={statusTone(r.run_status)}>{r.run_status ?? "—"}</Pill>
                        </td>
                        <td>{relTime(r.evaluated_at)}</td>
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
