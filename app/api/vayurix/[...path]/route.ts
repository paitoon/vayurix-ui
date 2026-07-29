// The one place the browser and the Rust API meet.
//
// ADR-006 D5: the console authenticates as a *person* now. This handler forwards the session
// cookie in both directions and, by default, sends no API key at all — otherwise every visitor
// would silently inherit the shared machine credential and the roles would be decoration.
//
// VAYURIX_API_KEY is only attached when a request arrives with no session and
// VAYURIX_API_KEY_FALLBACK is set, which is for kiosk/demo hosts, never production.

import type { NextRequest } from "next/server";

type RouteContext = { params: Promise<{ path: string[] }> };

const SESSION_COOKIE = "vayurix_session";

async function proxy(request: NextRequest, context: RouteContext) {
  const { path } = await context.params;
  const baseUrl = (process.env.VAYURIX_API_URL ?? "http://127.0.0.1:8001").replace(/\/+$/, "");
  const target = new URL(`${baseUrl}/${path.map(encodeURIComponent).join("/")}`);
  target.search = request.nextUrl.search;

  const headers = new Headers({ accept: request.headers.get("accept") ?? "application/json" });
  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);

  // Pass the browser's cookies through untouched: the API reads vayurix_session from them.
  const cookie = request.headers.get("cookie");
  if (cookie) headers.set("cookie", cookie);

  const hasSession = request.cookies.has(SESSION_COOKIE);
  const apiKey = process.env.VAYURIX_API_KEY;
  if (!hasSession && apiKey && process.env.VAYURIX_API_KEY_FALLBACK) {
    headers.set("authorization", `Bearer ${apiKey}`);
  }

  // The real client address, so the API's login rate limiter counts per visitor and audit rows
  // do not all read "the Next.js server".
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) headers.set("x-forwarded-for", forwarded);
  const agent = request.headers.get("user-agent");
  if (agent) headers.set("user-agent", agent);

  try {
    const response = await fetch(target, {
      method: request.method,
      headers,
      body: ["GET", "HEAD"].includes(request.method) ? undefined : await request.arrayBuffer(),
      cache: "no-store",
      redirect: "manual",
    });

    const responseHeaders = new Headers();
    const responseType = response.headers.get("content-type");
    if (responseType) responseHeaders.set("content-type", responseType);
    // Set-Cookie can legitimately appear more than once — getSetCookie keeps them separate.
    for (const value of response.headers.getSetCookie()) {
      responseHeaders.append("set-cookie", value);
    }
    return new Response(response.body, { status: response.status, headers: responseHeaders });
  } catch (error) {
    return Response.json(
      {
        error: "Vayurix backend is unreachable",
        detail: error instanceof Error ? error.message : "Unknown connection error",
      },
      { status: 503 },
    );
  }
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const DELETE = proxy;
