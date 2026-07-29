"use client";

// On-call chains, one per domain. `position` is the escalation order: 1 is paged first, and if they
// do not respond within the domain's timeout the next position is paged. That is the whole model,
// so the table is sorted by it and nothing else.

import { Plus, Save, UserMinus } from "lucide-react";
import { useState } from "react";
import { api, listOf, without, type Domain, type TeamMember } from "../../lib/api";
import { Banner, Card, Empty, Pill, Resource, useFlash, useResource } from "../../lib/ui";
import { Page } from "../../shell";

type Draft = Partial<TeamMember>;

export default function TeamPage() {
  const state = useResource(async () => {
    const [team, domains] = await Promise.all([
      api.get("/team"),
      api.get("/domains?active=true").catch(() => []),
    ]);
    return { team: listOf<TeamMember>(team), domains: listOf<Domain>(domains) };
  }, []);
  const { flash, show } = useFlash();
  const [edit, setEdit] = useState<Record<number, Draft>>({});
  const [neu, setNeu] = useState<Draft>({});
  const [busy, setBusy] = useState<number | string | null>(null);

  const patch = (id: number, part: Draft) => setEdit({ ...edit, [id]: { ...edit[id], ...part } });

  const save = async (m: TeamMember) => {
    setBusy(m.id);
    try {
      await api.put(`/team/${m.id}`, edit[m.id]);
      show("ok", `${m.email} saved.`);
      setEdit(e => without(e, m.id));
      await state.reload();
    } catch (e) {
      show("bad", (e as Error).message);
    }
    setBusy(null);
  };

  const add = async () => {
    setBusy("__new");
    try {
      await api.post("/team", neu);
      show("ok", `${neu.email} added to ${neu.domain}.`);
      setNeu({ domain: neu.domain });
      await state.reload();
    } catch (e) {
      show("bad", (e as Error).message);
    }
    setBusy(null);
  };

  const deactivate = async (m: TeamMember) => {
    if (!confirm(`Take ${m.email} off the ${m.domain} chain?`)) return;
    setBusy(m.id);
    try {
      await api.del(`/team/${m.id}`);
      show("ok", `${m.email} deactivated.`);
      await state.reload();
    } catch (e) {
      show("bad", (e as Error).message);
    }
    setBusy(null);
  };

  return (
    <Page
      crumbs={[{ label: "Admin", href: "/admin/team" }, { label: "On-call" }]}
      title="On-call"
      intro="Who gets paged, in what order, per domain. Membership here is also what grants a data engineer access to that domain's work."
    >
      {flash}
      <Resource state={state} label="Loading roster…">
        {({ team, domains }) => {
          const byDomain = [...new Set([...domains.map(d => d.code), ...team.map(m => m.domain)])].sort();
          return (
            <>
              <Card title="Add somebody">
                <div className="row-form">
                  <label className="field">
                    <span>domain</span>
                    <select value={neu.domain ?? ""} onChange={e => setNeu({ ...neu, domain: e.target.value })}>
                      <option value="">choose…</option>
                      {domains.map(d => (
                        <option key={d.code} value={d.code}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>name</span>
                    <input value={neu.name ?? ""} onChange={e => setNeu({ ...neu, name: e.target.value })} />
                  </label>
                  <label className="field">
                    <span>email</span>
                    <input type="email" value={neu.email ?? ""} onChange={e => setNeu({ ...neu, email: e.target.value })} />
                  </label>
                  <label className="field">
                    <span>LINE user id (optional)</span>
                    <input
                      value={neu.line_user_id ?? ""}
                      onChange={e => setNeu({ ...neu, line_user_id: e.target.value || null })}
                    />
                  </label>
                  <label className="field">
                    <span>position (blank = last)</span>
                    <input
                      inputMode="numeric"
                      value={neu.position ?? ""}
                      onChange={e => setNeu({ ...neu, position: Number(e.target.value) || undefined })}
                    />
                  </label>
                  <button
                    className="btn"
                    data-tone="primary"
                    disabled={!neu.domain || !neu.name || !neu.email || busy === "__new"}
                    onClick={() => void add()}
                  >
                    <Plus size={14} />
                    Add
                  </button>
                </div>
              </Card>

              {byDomain.map(code => {
                const members = team.filter(m => m.domain === code);
                return (
                  <Card
                    key={code}
                    title={domains.find(d => d.code === code)?.name ?? code}
                    meta={`${members.filter(m => m.active).length} on call`}
                    tight
                  >
                    {members.length === 0 ? (
                      <Empty>Nobody is on call for this domain — its cases will have no owner to page.</Empty>
                    ) : (
                      <table>
                        <thead>
                          <tr>
                            <th className="num">order</th>
                            <th>name</th>
                            <th>email</th>
                            <th>LINE id</th>
                            <th>state</th>
                            <th />
                          </tr>
                        </thead>
                        <tbody>
                          {members.map(m => {
                            const v = { ...m, ...edit[m.id] };
                            const dirty = !!edit[m.id];
                            return (
                              <tr key={m.id}>
                                <td className="num" style={{ width: 90 }}>
                                  <input
                                    inputMode="numeric"
                                    value={v.position ?? 0}
                                    onChange={e => patch(m.id, { position: Number(e.target.value) || 0 })}
                                  />
                                </td>
                                <td>
                                  <input value={v.name ?? ""} onChange={e => patch(m.id, { name: e.target.value })} />
                                </td>
                                <td className="mono">{m.email}</td>
                                <td>
                                  <input
                                    value={v.line_user_id ?? ""}
                                    onChange={e => patch(m.id, { line_user_id: e.target.value || null })}
                                  />
                                </td>
                                <td>
                                  {m.active ? <Pill tone="mint" dot>active</Pill> : <Pill tone="muted">inactive</Pill>}
                                </td>
                                <td className="actions">
                                  <button
                                    className="btn btn-sm"
                                    data-tone={dirty ? "primary" : undefined}
                                    disabled={!dirty || busy === m.id}
                                    onClick={() => void save(m)}
                                  >
                                    <Save size={12} />
                                    Save
                                  </button>
                                  <button
                                    className="btn btn-sm"
                                    data-tone="danger"
                                    disabled={!m.active || busy === m.id}
                                    onClick={() => void deactivate(m)}
                                  >
                                    <UserMinus size={12} />
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </Card>
                );
              })}

              <Banner tone="info">
                Being on a chain is how a data engineer gets read/act access to that domain. Console
                accounts and their roles live under <b>Users</b>; this list is about paging.
              </Banner>
            </>
          );
        }}
      </Resource>
    </Page>
  );
}
