"use client";

// The console frame: one navigation list, grouped by what the screens are for.
//
// There is no workspace switcher. Hiding half the console behind a tab only made sense while every
// visitor could reach everything; now that each item declares the capability it needs, an admin sees
// the whole list and a DE simply has a shorter one. Nav is also domain-aware: pipeline-only screens
// hide themselves when no Airflow domain is active.

import {
  Activity, AlertTriangle, Boxes, Database, GitBranch, Inbox, KeyRound, LayoutDashboard, LogOut,
  Moon, Radio, ScrollText, ShieldCheck, Sliders, Sun, Timer, UserCog, Users, Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { api, listOf, ROLE_LABEL, type Capability, type Domain, type Overview } from "./lib/api";
import { useAuth } from "./lib/auth";
import { useResource } from "./lib/ui";

const DOMAIN_PIPELINE = "airflow_pipeline";

type Item = {
  href: string;
  label: string;
  icon: LucideIcon;
  group: string;
  badge?: "cases" | "dlq";
  pipelineOnly?: boolean;
  /** Hidden unless the signed-in role has this capability (the API refuses it regardless). */
  needs?: Capability;
};

const NAV: Item[] = [
  { href: "/", label: "Triage", icon: LayoutDashboard, group: "Respond" },
  { href: "/cases", label: "Cases", icon: AlertTriangle, group: "Respond", badge: "cases" },
  { href: "/incidents", label: "Incidents", icon: Boxes, group: "Respond" },
  { href: "/events", label: "Event stream", icon: Radio, group: "Signals" },
  { href: "/runs", label: "Pipeline runs", icon: GitBranch, group: "Signals", pipelineOnly: true },
  { href: "/dlq", label: "Dead letters", icon: Inbox, group: "Signals", badge: "dlq", needs: "manage_platform" },
  { href: "/admin/team", label: "On-call", icon: Users, group: "Model", needs: "manage_team" },
  { href: "/admin/sla", label: "SLA policies", icon: Timer, group: "Model", needs: "manage_team" },
  { href: "/admin/domains", label: "Domains", icon: Database, group: "Model", needs: "manage_platform" },
  { href: "/admin/settings", label: "Configuration", icon: Sliders, group: "Runtime", needs: "manage_platform" },
  { href: "/admin/services", label: "Services", icon: ShieldCheck, group: "Runtime", needs: "manage_platform" },
  { href: "/admin/metrics", label: "Metrics", icon: Activity, group: "Runtime" },
  { href: "/admin/users", label: "Users", icon: UserCog, group: "Access", needs: "manage_platform" },
  { href: "/admin/audit", label: "Audit trail", icon: ScrollText, group: "Access", needs: "manage_platform" },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "/";
  const { me, can, signOut } = useAuth();
  const items = NAV.filter(i => !i.needs || can(i.needs));

  const [dark, setDark] = useState(true);
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  }, [dark]);

  // Badges + pipeline visibility come from live data: the nav should reflect the deployment,
  // not a hard-coded assumption that Airflow exists.
  const summary = useResource(
    async () => {
      const [overview, domains] = await Promise.all([
        api.get<Overview>("/overview").catch(() => null),
        api.get<Domain[]>("/domains?active=true").catch(() => [] as Domain[]),
      ]);
      return { overview, domains: listOf<Domain>(domains) };
    },
    [],
    30_000,
  );

  const hasPipeline = (summary.data?.domains ?? []).some(d => d.code === DOMAIN_PIPELINE);
  const badge = (kind?: "cases" | "dlq") => {
    const o = summary.data?.overview;
    if (!o || !kind) return 0;
    return kind === "cases" ? o.unassigned_cases : o.dlq_parked;
  };

  const groups = [...new Set(items.map(i => i.group))];

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">
            <Zap size={16} />
          </span>
          <div>
            <b>vayurix.ai</b>
            <span>console</span>
          </div>
        </div>

        <div className="nav">
          {groups.map(group => (
            <div key={group}>
              <p className="nav-group">{group}</p>
              {items
                .filter(i => i.group === group)
                .filter(i => !i.pipelineOnly || hasPipeline || summary.data === null)
                .map(i => {
                  const Icon = i.icon;
                  const active = i.href === "/" ? pathname === "/" : pathname.startsWith(i.href);
                  const count = badge(i.badge);
                  return (
                    <Link key={i.href} href={i.href} data-active={String(active)}>
                      <Icon size={16} />
                      <span>{i.label}</span>
                      {count > 0 && <em>{count}</em>}
                    </Link>
                  );
                })}
            </div>
          ))}
        </div>

        <div className="side-foot">
          {/* An explicit row: "click your own name" is not a discoverable way to reach the one
              screen where you change your password or turn on 2FA. */}
          <Link className="link-out" href="/account" data-active={String(pathname === "/account")}>
            <KeyRound size={15} />
            Your account
          </Link>
          <button className="link-out" onClick={() => setDark(!dark)}>
            {dark ? <Sun size={15} /> : <Moon size={15} />}
            {dark ? "Light theme" : "Dark theme"}
          </button>
          {me && (
            <div className="who">
              <Link href="/account" title="Your account, password and 2FA">
                <b>{me.name === me.email ? me.email.split("@")[0] : me.name}</b>
                <span>
                  {ROLE_LABEL[me.role]}
                  {me.role !== "admin" && me.domains.length > 0 && ` · ${me.domains.join(", ")}`}
                </span>
              </Link>
              <button className="icon-btn btn" title="Sign out" onClick={() => void signOut()}>
                <LogOut size={14} />
              </button>
            </div>
          )}
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}

/** Page frame: breadcrumbs in the sticky bar, then title + tools. Used by every route so
 *  deep-linked pages always say where they are and how to get back. */
export function Page({
  crumbs,
  title,
  intro,
  tools,
  children,
}: {
  crumbs: { label: string; href?: string }[];
  title: string;
  intro?: string;
  tools?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <>
      <header className="topbar">
        <div className="crumbs">
          {crumbs.map((c, i) => (
            <span key={`${c.label}-${i}`}>
              {i > 0 && <span style={{ margin: "0 8px" }}>/</span>}
              {c.href ? <Link href={c.href}>{c.label}</Link> : <b>{c.label}</b>}
            </span>
          ))}
        </div>
      </header>
      <div className="page">
        <div className="page-head">
          <div>
            <h1>{title}</h1>
            {intro && <p>{intro}</p>}
          </div>
          {tools && <div className="head-tools">{tools}</div>}
        </div>
        {children}
      </div>
    </>
  );
}
