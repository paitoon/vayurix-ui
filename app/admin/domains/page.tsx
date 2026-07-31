"use client";

// The domain registry: what this deployment monitors. Everything else keys off it — cases, on-call
// chains, SLA policies, the navigation itself — so it is the first screen an admin needs.

import { Plus, Save, Trash2 } from "lucide-react";
import { useState } from "react";
import { api, listOf, without, type Domain } from "../../lib/api";
import { Banner, Card, Empty, Pill, Resource, useFlash, useResource } from "../../lib/ui";
import { Page } from "../../shell";

type Draft = Partial<Domain>;

export default function DomainsPage() {
  const state = useResource(async () => listOf<Domain>(await api.get("/domains")), []);
  const { flash, show } = useFlash();
  const [edit, setEdit] = useState<Record<string, Draft>>({});
  const [adding, setAdding] = useState(false);
  const [neu, setNeu] = useState<Draft>({ active: true });
  const [busy, setBusy] = useState<string | null>(null);

  const patch = (code: string, part: Draft) => setEdit({ ...edit, [code]: { ...edit[code], ...part } });

  const save = async (d: Domain) => {
    const body = edit[d.code];
    if (!body) return;
    setBusy(d.code);
    try {
      await api.put(`/domains/${d.code}`, body);
      show("ok", `${d.code} saved.`);
      setEdit(e => without(e, d.code));
      await state.reload();
    } catch (e) {
      show("bad", (e as Error).message);
    }
    setBusy(null);
  };

  const create = async () => {
    setBusy("__new");
    try {
      await api.post("/domains", neu);
      show("ok", `${neu.code} registered.`);
      setNeu({ active: true });
      setAdding(false);
      await state.reload();
    } catch (e) {
      show("bad", (e as Error).message);
    }
    setBusy(null);
  };

  const remove = async (d: Domain) => {
    if (!confirm(`Delete domain '${d.code}'? This only works while nothing references it.`)) return;
    setBusy(d.code);
    try {
      await api.del(`/domains/${d.code}`);
      show("ok", `${d.code} deleted.`);
      await state.reload();
    } catch (e) {
      show("bad", (e as Error).message);
    }
    setBusy(null);
  };

  return (
    <Page
      crumbs={[{ label: "Home", href: "/" }, { label: "Admin" }, { label: "Domains" }]}
      title="Domains"
      intro="Each domain is a world with its own cases, on-call chain and SLA. Codes are used in URLs, Kafka keys and log lines, so they stay lowercase and boring."
      tools={
        <button className="btn" data-tone={adding ? undefined : "primary"} onClick={() => setAdding(!adding)}>
          <Plus size={15} />
          {adding ? "Cancel" : "New domain"}
        </button>
      }
    >
      {flash}

      {adding && (
        <Card title="New domain">
          <div className="row-form">
            <label className="field">
              <span>code (a-z, 0-9, _)</span>
              <input value={neu.code ?? ""} onChange={e => setNeu({ ...neu, code: e.target.value })} />
            </label>
            <label className="field">
              <span>name</span>
              <input value={neu.name ?? ""} onChange={e => setNeu({ ...neu, name: e.target.value })} />
            </label>
            <label className="field">
              <span>position</span>
              <input
                inputMode="numeric"
                value={neu.position ?? ""}
                onChange={e => setNeu({ ...neu, position: Number(e.target.value) || undefined })}
              />
            </label>
            <label className="field">
              <span>colour</span>
              <input placeholder="#f59e0b" value={neu.color ?? ""} onChange={e => setNeu({ ...neu, color: e.target.value })} />
            </label>
            <label className="field">
              <span>escalation timeout (min)</span>
              <input
                inputMode="numeric"
                placeholder="inherit"
                value={neu.escalation_timeout_min ?? ""}
                onChange={e => setNeu({ ...neu, escalation_timeout_min: Number(e.target.value) || undefined })}
              />
            </label>
            <button className="btn" data-tone="primary" disabled={!neu.code || !neu.name || busy === "__new"} onClick={() => void create()}>
              <Plus size={14} />
              Register
            </button>
          </div>
        </Card>
      )}

      <Resource state={state} label="Loading domains…">
        {domains => (
          <Card meta={`${domains.length} registered`} tight>
            {domains.length === 0 ? (
              <Empty>No domains — that should be impossible, the pipeline domain is builtin.</Empty>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>code</th>
                    <th>name</th>
                    <th>path</th>
                    <th className="num">position</th>
                    <th>colour</th>
                    <th>escalation</th>
                    <th>retention</th>
                    <th>active</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {domains.map(d => {
                    const v = { ...d, ...edit[d.code] };
                    const dirty = !!edit[d.code];
                    return (
                      <tr key={d.code}>
                        <td className="mono">
                          {d.code}
                          {d.builtin && (
                            <>
                              {" "}
                              <Pill tone="blue">builtin</Pill>
                            </>
                          )}
                        </td>
                        <td>
                          <input value={v.name ?? ""} onChange={e => patch(d.code, { name: e.target.value })} />
                        </td>
                        <td className="mono">{d.path}</td>
                        <td className="num" style={{ width: 90 }}>
                          <input
                            inputMode="numeric"
                            value={v.position ?? 0}
                            onChange={e => patch(d.code, { position: Number(e.target.value) || 0 })}
                          />
                        </td>
                        <td style={{ width: 130 }}>
                          <span className="domain-chip">
                            <i style={{ background: v.color ?? "var(--mint)" }} />
                            <input value={v.color ?? ""} onChange={e => patch(d.code, { color: e.target.value })} />
                          </span>
                        </td>
                        <td style={{ width: 110 }}>
                          <input
                            inputMode="numeric"
                            placeholder="inherit"
                            value={v.escalation_timeout_min ?? ""}
                            onChange={e =>
                              patch(d.code, { escalation_timeout_min: e.target.value === "" ? null : Number(e.target.value) })
                            }
                          />
                        </td>
                        <td style={{ width: 110 }}>
                          <input
                            inputMode="numeric"
                            placeholder="inherit"
                            value={v.retention_months ?? ""}
                            onChange={e =>
                              patch(d.code, { retention_months: e.target.value === "" ? null : Number(e.target.value) })
                            }
                          />
                        </td>
                        <td>
                          <select
                            value={String(v.active)}
                            onChange={e => patch(d.code, { active: e.target.value === "true" })}
                          >
                            <option value="true">accepting</option>
                            <option value="false">paused</option>
                          </select>
                        </td>
                        <td className="actions">
                          <button
                            className="btn btn-sm"
                            data-tone={dirty ? "primary" : undefined}
                            disabled={!dirty || busy === d.code}
                            onClick={() => void save(d)}
                          >
                            <Save size={12} />
                            Save
                          </button>
                          <button
                            className="btn btn-sm"
                            data-tone="danger"
                            disabled={d.builtin || busy === d.code}
                            title={d.builtin ? "The pipeline domain cannot be removed" : "Delete"}
                            onClick={() => void remove(d)}
                          >
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
        )}
      </Resource>

      <Banner tone="info">
        Pausing a domain (active = paused) makes <code>/ingest</code> reject its events instead of
        opening cases nobody is on call for. Deleting is refused while cases, events or policies
        still reference it. <b>Escalation</b> is how long one person on call has before the case moves
        to the next — blank inherits <code>notification.escalation_timeout_min</code>; once the whole
        chain is exhausted the case goes to that domain&apos;s DE managers to assign.
      </Banner>
    </Page>
  );
}
