"use client";

// Shared primitives. Every screen is built from these so a new page never re-invents a table
// header, a status pill, or the "loading / failed / empty" trio that live data always needs.

import { AlertTriangle, Check, Loader2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "./api";

export function Pill({ children, tone = "muted", dot = false }: { children: React.ReactNode; tone?: string; dot?: boolean }) {
  return (
    <span className="pill" data-tone={tone}>
      {dot && <i />}
      {children}
    </span>
  );
}

export function Stat({ label, value, detail, tone }: { label: string; value: string | number; detail?: string; tone?: string }) {
  return (
    <div className="stat" data-tone={tone}>
      <p>{label}</p>
      <b>{value}</b>
      {detail && <small>{detail}</small>}
    </div>
  );
}

export function Card({
  title,
  meta,
  actions,
  children,
  tight = false,
}: {
  title?: string;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  tight?: boolean;
}) {
  return (
    <section className="card">
      {(title || actions) && (
        <header className="card-head">
          <div>
            {title && <h2>{title}</h2>}
            {meta && <span>{meta}</span>}
          </div>
          {actions}
        </header>
      )}
      <div className={tight ? "card-body tight" : "card-body"}>{children}</div>
    </section>
  );
}

export function Banner({ tone = "info", children }: { tone?: "info" | "ok" | "warn" | "bad"; children: React.ReactNode }) {
  const Icon = tone === "ok" ? Check : tone === "info" ? undefined : AlertTriangle;
  return (
    <p className="banner" data-tone={tone}>
      {Icon && <Icon size={14} />}
      {children}
    </p>
  );
}

export const Empty = ({ children }: { children: React.ReactNode }) => <p className="empty">{children}</p>;

/** Live data with the three states that always exist, so no screen forgets one.
 *  Poll interval is optional; the first load is deferred one macrotask because React 19's
 *  compiler lint (correctly) rejects setState called synchronously inside an effect. */
export function useResource<T>(load: () => Promise<T>, deps: unknown[], everyMs?: number) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(true);
  // `load` is a fresh closure on every render, but `run` must stay stable or the polling effect
  // would tear down and restart continuously. The ref bridges the two — updated in an effect,
  // never during render (React 19 rejects that, rightly: renders must not have side effects).
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });

  const run = useCallback(async () => {
    try {
      setData(await loadRef.current());
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? `${e.message} (HTTP ${e.status})` : (e as Error).message);
    }
    setPending(false);
  }, []);

  useEffect(() => {
    const kick = window.setTimeout(() => void run(), 0);
    const tick = everyMs ? window.setInterval(() => void run(), everyMs) : undefined;
    return () => {
      window.clearTimeout(kick);
      if (tick) window.clearInterval(tick);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run, everyMs, ...deps]);

  return { data, error, pending, reload: run };
}

/** Renders the loading/error states for a resource, or the children once data exists. */
export function Resource<T>({
  state,
  label,
  children,
}: {
  state: { data: T | null; error: string | null; pending: boolean };
  label: string;
  children: (data: T) => React.ReactNode;
}) {
  if (state.pending && state.data === null) {
    return (
      <p className="banner" data-tone="info">
        <Loader2 className="spin" size={14} />
        {label}
      </p>
    );
  }
  if (state.error && state.data === null) return <Banner tone="bad">{state.error}</Banner>;
  if (state.data === null) return <Empty>Nothing to show.</Empty>;
  return (
    <>
      {state.error && <Banner tone="warn">Showing the last good data — refresh failed: {state.error}</Banner>}
      {children(state.data)}
    </>
  );
}

/** Inline action feedback (save/replay/stop…).
 *
 *  A confirmation can fade — you saw the row change. A failure must not: the message is usually the
 *  only place the reason exists ("'x@y' is already in use", "409 …"), and losing it three seconds
 *  later means retrying blind. So errors stay until dismissed or replaced. */
export function useFlash() {
  const [flash, setFlash] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const show = useCallback((tone: "ok" | "bad", text: string) => {
    setFlash({ tone, text });
    if (tone === "ok") window.setTimeout(() => setFlash(null), 3600);
  }, []);
  return {
    show,
    clear: () => setFlash(null),
    flash: flash ? (
      <Banner tone={flash.tone}>
        <span style={{ flex: 1 }}>{flash.text}</span>
        {flash.tone === "bad" && (
          <button className="banner-x" title="Dismiss" onClick={() => setFlash(null)}>
            <X size={13} />
          </button>
        )}
      </Banner>
    ) : null,
  };
}
