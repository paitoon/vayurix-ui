"use client";

// Decides what a visitor sees before any page renders: the sign-in flow, the forced password
// change, or the console. Keeping this in one component means no individual page has to remember
// that an unauthenticated user might be looking at it.

import { Loader2 } from "lucide-react";
import { LoginFlow } from "./login-flow";
import { useAuth } from "./lib/auth";
import { Shell } from "./shell";

export function Gate({ children }: { children: React.ReactNode }) {
  const { me, loading } = useAuth();

  if (loading) {
    return (
      <div className="auth-screen">
        <p className="banner" data-tone="info">
          <Loader2 className="spin" size={14} /> Checking your session…
        </p>
      </div>
    );
  }

  // Not signed in, or holding a temporary password (the API refuses everything else until it is
  // replaced, so showing the console would be a wall of 403s).
  if (!me || me.must_change_password) return <LoginFlow />;

  return <Shell>{children}</Shell>;
}
