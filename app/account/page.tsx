"use client";

// Your own account: password, and what the backend thinks you may touch.
//
// The scope panel is here for a reason — when a page comes back 403 the first question is always
// "what am I actually allowed to see?", and this answers it from /auth/me rather than from guesswork.
// There is nothing to configure for 2FA: the code is mailed to the address you sign in with.

import { KeyRound, Loader2 } from "lucide-react";
import { useState } from "react";
import { ApiError, auth, ROLE_LABEL } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Banner, Card, Pill, useFlash } from "../lib/ui";
import { Page } from "../shell";

export default function AccountPage() {
  const { me, refresh } = useAuth();
  const { flash, show } = useFlash();

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await auth.changePassword(current, next);
      setCurrent("");
      setNext("");
      show("ok", "Password changed. Sessions on other devices were signed out.");
      await refresh();
    } catch (e2) {
      show("bad", (e2 instanceof ApiError ? e2.message : (e2 as Error).message).replace(/^\w+: /, ""));
    }
    setBusy(false);
  };

  if (!me) return null;

  return (
    <Page
      crumbs={[{ label: "Home", href: "/" }, { label: "Account" }]}
      title={me.name === me.email ? me.email : me.name}
      intro="Your credentials and the scope the API grants you."
    >
      {flash}
      <div className="grid two">
        <Card title="Identity">
          <dl className="kv">
            <dt>email</dt>
            <dd className="mono">{me.email}</dd>
            <dt>role</dt>
            <dd>
              <Pill tone={me.role === "admin" ? "blue" : me.role === "de_manager" ? "mint" : "muted"}>
                {ROLE_LABEL[me.role]}
              </Pill>
            </dd>
            <dt>domains</dt>
            <dd>
              {me.role === "admin" ? (
                <span style={{ color: "var(--text-soft)" }}>every domain (administrator)</span>
              ) : me.domains.length ? (
                me.domains.map(d => (
                  <span key={d} className="domain-chip" style={{ marginRight: 10 }}>
                    <i />
                    {d}
                  </span>
                ))
              ) : (
                <span style={{ color: "var(--amber)" }}>
                  none yet — you are not on any on-call roster, so work queues will look empty
                </span>
              )}
            </dd>
            <dt>sign-in</dt>
            <dd>
              {me.role === "de" ? (
                <span style={{ color: "var(--text-soft)" }}>password</span>
              ) : (
                <span style={{ color: "var(--text-soft)" }}>
                  password + a one-time code sent to <b className="mono">{me.email}</b>
                </span>
              )}
            </dd>
          </dl>
        </Card>

        <Card title="Password">
          <form onSubmit={changePassword} className="auth-form">
            <label className="field">
              <span>current password</span>
              <input
                type="password"
                autoComplete="current-password"
                value={current}
                onChange={e => setCurrent(e.target.value)}
                required
              />
            </label>
            <label className="field">
              <span>new password (10 characters or more)</span>
              <input
                type="password"
                autoComplete="new-password"
                minLength={10}
                value={next}
                onChange={e => setNext(e.target.value)}
                required
              />
            </label>
            <p className="auth-fine">Other sessions are signed out; this one stays.</p>
            <button className="btn" disabled={busy || next.length < 10}>
              {busy ? <Loader2 className="spin" size={15} /> : <KeyRound size={15} />}
              Change password
            </button>
          </form>
        </Card>
      </div>

      <Banner tone="info">
        Two-factor authentication needs no setup here — accounts covered by the policy are asked for a
        code emailed to their own address at every sign-in. If that address is ever wrong, an
        administrator can correct it under <b>Users</b>.
      </Banner>
    </Page>
  );
}
