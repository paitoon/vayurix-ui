import type { NextRequest } from "next/server";

type RouteContext = { params: Promise<{ path: string[] }> };

async function proxy(request: NextRequest, context: RouteContext) {
  const { path } = await context.params;
  const baseUrl = (process.env.VAYURIX_API_URL ?? "http://127.0.0.1:8001").replace(/\/+$/, "");
  const target = new URL(`${baseUrl}/${path.map(encodeURIComponent).join("/")}`);
  target.search = request.nextUrl.search;
  const headers = new Headers({ accept: request.headers.get("accept") ?? "application/json" });
  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);
  const apiKey = process.env.VAYURIX_API_KEY;
  if (apiKey) headers.set("authorization", `Bearer ${apiKey}`);
  try {
    const response = await fetch(target, { method: request.method, headers, body: ["GET", "HEAD"].includes(request.method) ? undefined : await request.arrayBuffer(), cache: "no-store" });
    const responseHeaders = new Headers();
    const responseType = response.headers.get("content-type");
    if (responseType) responseHeaders.set("content-type", responseType);
    return new Response(response.body, { status: response.status, headers: responseHeaders });
  } catch (error) {
    return Response.json({ error: "Vayurix backend is unreachable", detail: error instanceof Error ? error.message : "Unknown connection error" }, { status: 503 });
  }
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const DELETE = proxy;