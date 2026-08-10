// Single door to the Rust API.
//
// Browser code never talks to vayurix directly: it calls /api/vayurix/*, and that route (a server
// route handler) forwards the session cookie. Authorization is the API's job — every helper here
// can come back 401 (no session) or 403 (role/scope), and the UI reacts rather than pre-judges.

export type Json = Record<string, unknown>;

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function request(path: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(`/api/vayurix${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  const type = res.headers.get("content-type") ?? "";
  const body = type.includes("json") ? await res.json().catch(() => null) : await res.text();
  if (!res.ok) {
    const detail =
      typeof body === "string" && body
        ? body
        : ((body as Json | null)?.error as string) ?? `HTTP ${res.status}`;
    throw new ApiError(String(detail), res.status);
  }
  return body;
}

export const api = {
  get: <T = unknown,>(path: string) => request(path) as Promise<T>,
  post: <T = unknown,>(path: string, body?: unknown) =>
    request(path, { method: "POST", body: JSON.stringify(body ?? {}) }) as Promise<T>,
  put: <T = unknown,>(path: string, body: unknown) =>
    request(path, { method: "PUT", body: JSON.stringify(body) }) as Promise<T>,
  del: <T = unknown,>(path: string) => request(path, { method: "DELETE" }) as Promise<T>,
};

/** Some list endpoints return a bare array, others wrap it ({settings: []}, {services: []}). */
export function listOf<T = Json>(value: unknown, key?: string): T[] {
  if (Array.isArray(value)) return value as T[];
  if (key && Array.isArray((value as Json | null)?.[key])) return (value as Json)[key] as T[];
  return [];
}

/** Drop one key from a draft map (the admin screens keep unsaved edits keyed by id/setting name). */
export function without<K extends string | number, V>(map: Record<K, V>, key: K): Record<K, V> {
  const next: Partial<Record<K, V>> = { ...map };
  delete next[key];
  return next as Record<K, V>;
}

export const qs = (params: Record<string, string | number | boolean | undefined>) => {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "" && v !== false) search.set(k, String(v));
  }
  const s = search.toString();
  return s ? `?${s}` : "";
};

// ---------------------------------------------------------------- who is signed in (ADR-006)

export type Role = "de" | "de_manager" | "admin";

export type Me = {
  id: number;
  email: string;
  name: string;
  role: Role;
  /** Domains this person may act in. Admins are unrestricted and this can be empty. */
  domains: string[];
  must_change_password: boolean;
};

/** Mirrors `Capability` in src/auth.rs. The UI hides what it would be refused anyway — the API is
 *  still the thing that decides, so a stale copy here is a cosmetic bug, never a security one. */
export type Capability =
  | "read_work"
  | "act_on_case"
  | "reassign_case"
  | "manage_team"
  | "manage_platform";

const CAPABILITIES: Record<Role, Capability[]> = {
  de: ["read_work", "act_on_case"],
  de_manager: ["read_work", "act_on_case", "reassign_case", "manage_team"],
  admin: ["read_work", "act_on_case", "reassign_case", "manage_team", "manage_platform"],
};

export const can = (me: Me | null, cap: Capability) =>
  !!me && CAPABILITIES[me.role].includes(cap);

/** True when this person can act in `domain` (admins always can). */
export const inScope = (me: Me | null, domain: string | null | undefined) =>
  !!me && (me.role === "admin" || !domain || me.domains.includes(domain));

export const ROLE_LABEL: Record<Role, string> = {
  de: "Data engineer",
  de_manager: "DE manager",
  admin: "Administrator",
};

/** Step 1's answer. `sent_to` is the masked address the one-time code went to. */
export type LoginResult = {
  ok: boolean;
  mfa_required: boolean;
  sent_to?: string | null;
  user?: Me;
};

export const auth = {
  me: () => api.get<{ user: Me }>("/auth/me").then(r => r.user),
  login: (email: string, password: string) =>
    api.post<LoginResult>("/auth/login", { email, password }),
  verify: (code: string) => api.post<{ ok: boolean; user: Me }>("/auth/login/verify", { code }),
  resend: () => api.post<{ ok: boolean; sent_to: string }>("/auth/login/resend"),
  logout: () => api.post("/auth/logout"),
  changePassword: (current: string, next: string) =>
    api.post<{ ok: boolean }>("/auth/password", { current, new: next }),
};

export type User = {
  id: number;
  email: string;
  name: string;
  role: Role;
  active: boolean;
  must_change_password: boolean;
  granted_domains: string[];
  oncall_domains: string[];
  effective_scope: string[] | "*";
  last_login_at: string | null;
  locked_until: string | null;
  created_at: string;
};

export type Session = {
  id: number;
  mfa_pending: boolean;
  issued_at: string;
  last_seen_at: string;
  expires_at: string;
  ip: string | null;
  user_agent: string | null;
};

export type AuditEntry = {
  id: number;
  actor: string;
  action: string;
  target: string | null;
  detail: Json | null;
  ip: string | null;
  created_at: string;
};

// ---------------------------------------------------------------- domain model (what the API returns)

export type Domain = {
  code: string;
  name: string;
  path: string;
  description: string | null;
  active: boolean;
  position: number;
  color: string | null;
  builtin: boolean;
  notify_channel: string | null;
  escalation_timeout_min: number | null;
  retention_months: number | null;
};

export type Case = {
  id: number;
  rca_id: string;
  domain: string;
  dag_id: string;
  dag_run_id: string;
  status: string | null;
  severity: string | null;
  confidence: string | null;
  failed_task_id: string | null;
  assigned_to: string | null;
  incident_id: number | null;
  opened_at: string;
  closed_at: string | null;
};

export type Incident = {
  id: number;
  domain: string;
  signature: string;
  run_count: number;
  opened_at: string;
  resolved_at: string | null;
  affected_dags: string | null;
};

export type PipelineRun = {
  id: number;
  dag_id: string;
  dag_run_id: string;
  status: string | null;
  start_time: string | null;
  end_time: string | null;
  duration_sec: number | null;
  failed_task_id: string | null;
  try_number: number | null;
  case_id: number | null;
  last_seen_at: string;
};

export type IncidentEvent = {
  id: number;
  domain: string;
  source: string;
  event_key: string;
  entity_key: string;
  status: string;
  severity: string | null;
  title: string | null;
  occurred_at: string | null;
  received_at: string;
  case_id: number | null;
};

export type DeadLetter = {
  id: number;
  source_topic: string;
  msg_key: string | null;
  error: string | null;
  attempts: number;
  received_at: string;
  status: string;
};

export type Overview = {
  /** Deployment label + running binary version, for the console header. */
  app: { name: string; version: string };
  open_cases: number;
  unassigned_cases: number;
  open_incidents: number;
  dlq_parked: number;
  failed_runs_24h: number;
  cases_by_severity: { severity: string; count: number }[];
  by_domain: { domain: string; name: string; open_cases: number; unassigned_cases: number; open_incidents: number }[];
  services: { running: number; total: number };
};

export type TeamMember = {
  id: number;
  domain: string;
  name: string;
  email: string;
  line_user_id: string | null;
  position: number;
  active: boolean;
  created_at: string;
};

export type SlaPolicy = {
  id: number;
  domain: string;
  dag_id: string;
  target_key: string;
  kind: string;
  description: string | null;
  // deadline_cron required for kind="deadline", null for kind="mttr".
  deadline_cron: string | null;
  timezone: string;
  // mttr_threshold_min required for kind="mttr", null for kind="deadline".
  mttr_threshold_min: number | null;
  active: boolean;
};

export type SlaResult = {
  id: number;
  domain: string;
  dag_id: string;
  target_key: string;
  kind: string;
  // deadline_at: the cron deadline (kind="deadline") or the recovery due-by time (kind="mttr").
  deadline_at: string;
  outcome: string;
  lateness_sec: number | null;
  run_status: string | null;
  pipeline_run_id: number | null;
  // trigger_run_id: kind="mttr" only — the failed run that started this recovery clock.
  trigger_run_id: number | null;
  deadline_cron: string | null;
  timezone: string;
  mttr_threshold_min: number | null;
  evaluated_at: string;
};

/** One editable knob: the value in force, the built-in default, and whether they differ. */
export type Setting = {
  key: string;
  value: unknown;
  default: unknown;
  overridden: boolean;
  /** The allowed values, when the backend says this key has a fixed set. Null otherwise. */
  options: string[] | null;
};

export type Service = { name: string; running: boolean; start: boolean };

export type DagRow = {
  dag_id: string;
  total_runs: number;
  failed_runs: number;
  open_cases: number;
  last_status: string | null;
  last_run_at: string | null;
};

// ---------------------------------------------------------------- formatting

export const relTime = (iso: string | null | undefined) => {
  if (!iso) return "—";
  const ms = new Date(iso).getTime();
  if (!Number.isFinite(ms)) return String(iso);
  const mins = Math.round((Date.now() - ms) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.round(mins / 60)}h ago`;
  return `${Math.round(mins / 1440)}d ago`;
};

export const duration = (seconds: number | null | undefined) => {
  if (seconds == null || seconds < 0) return "—";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const m = Math.floor(seconds / 60);
  return m < 60 ? `${m}m ${String(Math.round(seconds % 60)).padStart(2, "0")}s` : `${Math.round(m / 60)}h ${m % 60}m`;
};

/** Case/run/event status → pill tone. Kept in one place so colours mean the same thing everywhere. */
export function statusTone(value: string | null | undefined): "mint" | "amber" | "red" | "blue" | "muted" {
  const v = (value ?? "").toLowerCase();
  if (["success", "on_time", "healthy", "completed", "resolved", "recovered", "ok", "running"].includes(v)) return "mint";
  if (["retry", "late", "degraded", "analyzing", "collecting", "open", "firing", "parked"].includes(v)) return "amber";
  if (["failed", "error", "missed_no_run", "offline", "critical"].includes(v)) return "red";
  if (["closed", "dismissed", "replayed"].includes(v)) return "blue";
  return "muted";
}

export const severityTone = (value: string | null | undefined) =>
  ({ critical: "red", high: "red", medium: "amber", low: "blue" }[(value ?? "").toLowerCase()] ?? "muted") as
    | "red"
    | "amber"
    | "blue"
    | "muted";
