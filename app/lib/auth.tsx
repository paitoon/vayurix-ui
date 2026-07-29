"use client";

// Who is signed in, for the whole console (ADR-006 B4).
//
// One /auth/me call decides three things: whether to show the login screen at all, which
// navigation exists, and which buttons are worth rendering. The API enforces all of it again on
// every request — this only spares people from clicking things that would answer 403.

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { ApiError, auth, can as roleCan, type Capability, type Me } from "./api";

type AuthState = {
  me: Me | null;
  /** Still deciding — render nothing rather than flashing the login screen at a signed-in user. */
  loading: boolean;
  /** Backend unreachable (not "signed out"), worth saying out loud on the login screen. */
  error: string | null;
  refresh: () => Promise<Me | null>;
  signOut: () => Promise<void>;
  can: (cap: Capability) => boolean;
};

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const user = await auth.me();
      setMe(user);
      setError(null);
      return user;
    } catch (e) {
      setMe(null);
      // 401 is the normal "not signed in" answer, not a fault worth reporting.
      setError(e instanceof ApiError && e.status === 401 ? null : (e as Error).message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    await auth.logout().catch(() => undefined);
    setMe(null);
  }, []);

  useEffect(() => {
    // Deferred one macrotask: React 19 rejects setState called straight from an effect body.
    const kick = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(kick);
  }, [refresh]);

  return (
    <Ctx.Provider
      value={{ me, loading, error, refresh, signOut, can: cap => roleCan(me, cap) }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth outside AuthProvider");
  return ctx;
}
