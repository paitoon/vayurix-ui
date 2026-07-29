"use client";

// Sign-in, in the three steps the API actually has:
//   password  → either a session, or a one-time code mailed to the account's own address
//   code      → that code
//   password* → forced replacement of a temporary password, before anything else is allowed
//
// Every failure message comes from the API verbatim: it deliberately says the same thing for a
// wrong password, an unknown address and a disabled account, and paraphrasing it here would risk
// leaking the difference back.

import { KeyRound, Loader2, Mail, ShieldCheck, Zap } from "lucide-react";
import { useEffect, useState } from "react";
import { ApiError, auth } from "./lib/api";
import { useAuth } from "./lib/auth";
import { Banner } from "./lib/ui";

type Step = "password" | "code" | "change";

export function LoginFlow() {
  const { me, refresh } = useAuth();
  // A temporary password gets us here already signed in — jump straight to the change form.
  const [step, setStep] = useState<Step>(me?.must_change_password ? "change" : "password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  // Countdown for "send it again" — the API refuses a resend inside its cooldown, so the button
  // says how long rather than failing when pressed.
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = window.setTimeout(() => setCooldown(c => c - 1), 1000);
    return () => window.clearTimeout(t);
  }, [cooldown]);

  const fail = (e: unknown) => {
    const msg = e instanceof ApiError ? e.message : (e as Error).message;
    setError(msg.replace(/^(unauthorized|forbidden|too many requests|bad request|service unavailable): /, ""));
  };

  const submitPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await auth.login(email.trim(), password);
      if (res.mfa_required) {
        setStep("code");
        setCooldown(45);
        setNote(
          `We sent a 6-digit code to ${res.sent_to ?? "your email address"}. It expires in a few minutes.`,
        );
      } else {
        const user = await refresh();
        if (user?.must_change_password) {
          setStep("change");
          setNote("This password was issued to you by an administrator — choose your own.");
        }
      }
    } catch (err) {
      fail(err);
    }
    setBusy(false);
  };

  const submitCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await auth.verify(code.trim());
      const user = await refresh();
      if (user?.must_change_password) {
        setStep("change");
        setNote("This password was issued to you by an administrator — choose your own.");
      }
    } catch (err) {
      fail(err);
      setCode("");
    }
    setBusy(false);
  };

  const resend = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await auth.resend();
      setNote(`A new code is on its way to ${res.sent_to}.`);
      setCooldown(45);
    } catch (err) {
      fail(err);
    }
    setBusy(false);
  };

  const submitChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (next !== confirm) {
      setError("the two new passwords do not match");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // `password` still holds the temporary one when we came straight from the login step; if the
      // page was reloaded in between, the field is empty and the user retypes it.
      await auth.changePassword(password, next);
      await refresh();
    } catch (err) {
      fail(err);
    }
    setBusy(false);
  };

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="brand" style={{ justifyContent: "center" }}>
          <span className="brand-mark">
            <Zap size={16} />
          </span>
          <div>
            <b>vayurix.ai</b>
            <span>console</span>
          </div>
        </div>

        {step === "password" && (
          <form onSubmit={submitPassword} className="auth-form">
            <h1>Sign in</h1>
            <p>Root-cause analysis, incidents and SLA across every domain.</p>
            <label className="field">
              <span>email</span>
              <input
                type="email"
                autoComplete="username"
                autoFocus
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
              />
            </label>
            <label className="field">
              <span>password</span>
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
              />
            </label>
            {error && <Banner tone="bad">{error}</Banner>}
            <button className="btn" data-tone="primary" disabled={busy || !email || !password}>
              {busy ? <Loader2 className="spin" size={15} /> : <KeyRound size={15} />}
              Continue
            </button>
          </form>
        )}

        {step === "code" && (
          <form onSubmit={submitCode} className="auth-form">
            <h1>Check your email</h1>
            {note && <p>{note}</p>}
            <label className="field">
              <span>code</span>
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                value={code}
                onChange={e => setCode(e.target.value)}
                required
              />
            </label>
            {error && <Banner tone="bad">{error}</Banner>}
            <button className="btn" data-tone="primary" disabled={busy || code.length < 6}>
              {busy ? <Loader2 className="spin" size={15} /> : <ShieldCheck size={15} />}
              Verify
            </button>
            <button type="button" className="btn" disabled={busy || cooldown > 0} onClick={() => void resend()}>
              <Mail size={15} />
              {cooldown > 0 ? `Send it again in ${cooldown}s` : "Send it again"}
            </button>
            <button type="button" className="btn" data-tone="ghost" onClick={() => setStep("password")}>
              Start over
            </button>
          </form>
        )}

        {step === "change" && (
          <form onSubmit={submitChange} className="auth-form">
            <h1>Choose a new password</h1>
            {note && <p>{note}</p>}
            {!password && (
              <label className="field">
                <span>current password</span>
                <input
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                />
              </label>
            )}
            <label className="field">
              <span>new password (10 characters or more)</span>
              <input
                type="password"
                autoComplete="new-password"
                autoFocus
                minLength={10}
                value={next}
                onChange={e => setNext(e.target.value)}
                required
              />
            </label>
            <label className="field">
              <span>repeat it</span>
              <input
                type="password"
                autoComplete="new-password"
                minLength={10}
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                required
              />
            </label>
            {error && <Banner tone="bad">{error}</Banner>}
            <p className="auth-fine">
              Signing in elsewhere will be revoked — this session stays.
            </p>
            <button className="btn" data-tone="primary" disabled={busy || next.length < 10}>
              {busy ? <Loader2 className="spin" size={15} /> : <KeyRound size={15} />}
              Set password
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
