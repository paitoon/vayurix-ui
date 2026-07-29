"use client";

// /admin has no screen of its own — it lands on the first thing this role may actually open, so a
// bookmarked or hand-typed URL never dead-ends on a 404 or a wall of 403s.

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "../lib/auth";

export default function AdminIndex() {
  const router = useRouter();
  const { can, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    router.replace(can("manage_platform") ? "/admin/domains" : can("manage_team") ? "/admin/team" : "/");
  }, [loading, can, router]);

  return null;
}
