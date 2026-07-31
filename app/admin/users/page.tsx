"use client";

// Console accounts. Three roles, and a scope made of two halves: on-call membership (the usual
// source) plus explicit grants for people who oversee a domain without being paged for it.
//
// The dangerous actions live here — resetting a password or 2FA, signing someone out everywhere —
// so each one says what it does to the person's sessions before you click it.

import { KeyRound, Plus, Save, UserMinus, Users as UsersIcon } from "lucide-react";
import { useState } from "react";
import {
  api, listOf, relTime, ROLE_LABEL, without, type Domain, type Role, type Session, type User,
} from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { Banner, Card, Empty, Pill, Resource, useFlash, useResource } from "../../lib/ui";
import { Page } from "../../shell";

const ROLES: Role[] = ["de", "de_manager", "admin"];

type Draft = { role?: Role; domains?: string[]; active?: boolean; name?: string; email?: string };

export default function UsersPage() {
  const { me } = useAuth();
  const state = useResource(async () => {
    const [users, domains] = await Promise.all([
      api.get("/users?include_inactive=true"),
      api.get("/domains").catch(() => []),
    ]);
    return { users: listOf<User>(users), domains: listOf<Domain>(domains) };
  }, []);
  const { flash, show } = useFlash();
  const [edit, setEdit] = useState<Record<number, Draft>>({});
  const [neu, setNeu] = useState<{ email?: string; name?: string; role?: Role; password?: string; domains?: string[] }>({
    role: "de",
    domains: [],
  });
  const [busy, setBusy] = useState<number | string | null>(null);
  const [sessions, setSessions] = useState<{ user: User; rows: Session[] } | null>(null);

  const patch = (id: number, part: Draft) => setEdit({ ...edit, [id]: { ...edit[id], ...part } });
  const fail = (e: unknown) => show("bad", (e as Error).message.replace(/^\w+: /, ""));

  const save = async (u: User) => {
    setBusy(u.id);
    try {
      await api.put(`/users/${u.id}`, edit[u.id]);
      show("ok", `${u.email} updated.`);
      setEdit(e => without(e, u.id));
      await state.reload();
    } catch (e) {
      fail(e);
    }
    setBusy(null);
  };

  const create = async () => {
    setBusy("__new");
    try {
      await api.post("/users", neu);
      show("ok", `${neu.email} created — they must change the password at first sign-in.`);
      setNeu({ role: "de", domains: [] });
      await state.reload();
    } catch (e) {
      fail(e);
    }
    setBusy(null);
  };

  const resetPassword = async (u: User) => {
    const password = prompt(`New temporary password for ${u.email} (10 characters or more):`);
    if (!password) return;
    setBusy(u.id);
    try {
      await api.post(`/users/${u.id}/password`, { password });
      show("ok", `Password reset. ${u.email} is signed out everywhere and must change it at next sign-in.`);
      await state.reload();
    } catch (e) {
      fail(e);
    }
    setBusy(null);
  };

  const deactivate = async (u: User) => {
    if (!confirm(`Deactivate ${u.email}? Their sessions end immediately; the audit trail keeps their history.`)) return;
    setBusy(u.id);
    try {
      await api.del(`/users/${u.id}`);
      show("ok", `${u.email} deactivated.`);
      await state.reload();
    } catch (e) {
      fail(e);
    }
    setBusy(null);
  };

  const openSessions = async (u: User) => {
    try {
      setSessions({ user: u, rows: listOf<Session>(await api.get(`/users/${u.id}/sessions`)) });
    } catch (e) {
      fail(e);
    }
  };

  const revokeSessions = async (u: User) => {
    setBusy(u.id);
    try {
      const res = await api.del<{ revoked: number }>(`/users/${u.id}/sessions`);
      show("ok", `Signed ${u.email} out of ${res.revoked} session(s).`);
      setSessions(null);
    } catch (e) {
      fail(e);
    }
    setBusy(null);
  };

  return (
    <Page
      crumbs={[{ label: "Home", href: "/" }, { label: "Admin" }, { label: "Users" }]}
      title="Users"
      intro="Console accounts, roles and domain scope. A data engineer sees their own domains; a manager configures on-call and SLA for theirs; an admin sees everything."
    >
      {flash}

      <Card title="New account">
        <div className="row-form">
          <label className="field">
            <span>email</span>
            <input type="email" value={neu.email ?? ""} onChange={e => setNeu({ ...neu, email: e.target.value })} />
          </label>
          <label className="field">
            <span>name</span>
            <input value={neu.name ?? ""} onChange={e => setNeu({ ...neu, name: e.target.value })} />
          </label>
          <label className="field">
            <span>role</span>
            <select value={neu.role} onChange={e => setNeu({ ...neu, role: e.target.value as Role })}>
              {ROLES.map(r => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>temporary password</span>
            <input value={neu.password ?? ""} onChange={e => setNeu({ ...neu, password: e.target.value })} />
          </label>
          <button
            className="btn"
            data-tone="primary"
            disabled={!neu.email || (neu.password ?? "").length < 10 || busy === "__new"}
            onClick={() => void create()}
          >
            <Plus size={14} />
            Create
          </button>
        </div>
      </Card>

      <Resource state={state} label="Loading accounts…">
        {({ users, domains }) => (
          <>
            <Card meta={`${users.filter(u => u.active).length} active of ${users.length}`} tight>
              {users.length === 0 ? (
                <Empty>No accounts.</Empty>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>email</th>
                      <th>name</th>
                      <th>role</th>
                      <th>granted domains</th>
                      <th>on call for</th>
                      <th>last seen</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {users.map(u => {
                      const v = { ...u, ...edit[u.id] };
                      const dirty = !!edit[u.id];
                      const self = me?.id === u.id;
                      return (
                        <tr key={u.id} style={{ opacity: u.active ? 1 : 0.55 }}>
                          <td>
                            {/* Editable: a typo here makes the emailed sign-in code undeliverable,
                                and the account would be unrescuable otherwise. */}
                            <input
                              className="mono"
                              type="email"
                              value={v.email ?? ""}
                              onChange={e => patch(u.id, { email: e.target.value })}
                            />
                            {self && (
                              <>
                                {" "}
                                <Pill tone="blue">you</Pill>
                              </>
                            )}
                            {u.must_change_password && (
                              <>
                                {" "}
                                <Pill tone="amber">temp password</Pill>
                              </>
                            )}
                            {u.locked_until && (
                              <>
                                {" "}
                                <Pill tone="red">locked</Pill>
                              </>
                            )}
                          </td>
                          <td>
                            <input value={v.name ?? ""} onChange={e => patch(u.id, { name: e.target.value })} />
                          </td>
                          <td style={{ width: 150 }}>
                            <select
                              value={v.role}
                              disabled={self}
                              title={self ? "You cannot change your own role" : undefined}
                              onChange={e => patch(u.id, { role: e.target.value as Role })}
                            >
                              {ROLES.map(r => (
                                <option key={r} value={r}>
                                  {ROLE_LABEL[r]}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td style={{ minWidth: 200 }}>
                            <select
                              multiple
                              size={Math.min(4, Math.max(2, domains.length))}
                              // the draft wins while unsaved, so a selection does not snap back
                              value={edit[u.id]?.domains ?? u.granted_domains}
                              onChange={e =>
                                patch(u.id, {
                                  domains: [...e.target.selectedOptions].map(o => o.value),
                                })
                              }
                            >
                              {domains.map(d => (
                                <option key={d.code} value={d.code}>
                                  {d.code}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td>
                            {u.oncall_domains.length === 0 ? (
                              <span style={{ color: "var(--text-muted)" }}>—</span>
                            ) : (
                              u.oncall_domains.map(d => (
                                <span key={d} className="domain-chip" style={{ marginRight: 8 }}>
                                  <i />
                                  {d}
                                </span>
                              ))
                            )}
                          </td>
                          <td>{relTime(u.last_login_at)}</td>
                          <td className="actions">
                            <button
                              className="btn btn-sm"
                              data-tone={dirty ? "primary" : undefined}
                              disabled={!dirty || busy === u.id}
                              onClick={() => void save(u)}
                            >
                              <Save size={12} />
                              Save
                            </button>
                            <button className="btn btn-sm" title="Sessions" onClick={() => void openSessions(u)}>
                              <UsersIcon size={12} />
                            </button>
                            <button
                              className="btn btn-sm"
                              title="Reset password"
                              disabled={busy === u.id}
                              onClick={() => void resetPassword(u)}
                            >
                              <KeyRound size={12} />
                            </button>
                            <button
                              className="btn btn-sm"
                              data-tone="danger"
                              title={self ? "You cannot deactivate your own account" : "Deactivate"}
                              disabled={self || !u.active || busy === u.id}
                              onClick={() => void deactivate(u)}
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

            {sessions && (
              <Card
                title={`Sessions — ${sessions.user.email}`}
                meta={`${sessions.rows.length} live`}
                actions={
                  <>
                    <button
                      className="btn btn-sm"
                      data-tone="danger"
                      disabled={sessions.rows.length === 0}
                      onClick={() => void revokeSessions(sessions.user)}
                    >
                      Sign out everywhere
                    </button>
                    <button className="btn btn-sm" data-tone="ghost" onClick={() => setSessions(null)}>
                      Close
                    </button>
                  </>
                }
                tight
              >
                {sessions.rows.length === 0 ? (
                  <Empty>No live sessions.</Empty>
                ) : (
                  <table>
                    <thead>
                      <tr>
                        <th>state</th>
                        <th>address</th>
                        <th>agent</th>
                        <th>last seen</th>
                        <th>expires</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sessions.rows.map(s => (
                        <tr key={s.id}>
                          <td>
                            {s.mfa_pending ? <Pill tone="amber">awaiting 2FA</Pill> : <Pill tone="mint">signed in</Pill>}
                          </td>
                          <td className="mono">{s.ip ?? "—"}</td>
                          <td className="trunc">{s.user_agent ?? "—"}</td>
                          <td>{relTime(s.last_seen_at)}</td>
                          <td>{relTime(s.expires_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </Card>
            )}

            <Banner tone="info">
              The last active admin cannot be demoted or deactivated, and nobody can do either to
              their own account — those are the two mistakes that cannot be undone from here. An
              address only has to be unique among <b>active</b> accounts, so a deactivated one does
              not keep it hostage.
            </Banner>
          </>
        )}
      </Resource>
    </Page>
  );
}
