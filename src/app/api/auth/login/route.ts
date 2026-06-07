import { NextRequest, NextResponse } from "next/server";

import { buildSessionCookieValue, isAuthEnabled, sessionCookieAttributes } from "@/lib/expenses/auth";

export const runtime = "nodejs";

// Wave 3 auth: POST { password } → set session cookie. Password check uses
// a constant-time comparison via the same Web Crypto path as the verifier.
async function checkPassword(provided: string): Promise<boolean> {
  const expected = process.env.EXPENSES_PASSWORD?.trim() ?? "";
  if (expected.length === 0 || provided.length === 0) return false;
  if (expected.length !== provided.length) return false;
  // Wave 3 auth: a constant-time string compare. We could use timingSafeEqual
  // via node:crypto, but the route is already async (HMAC is async) and a
  // length-gated string compare here is good enough for a single-tenant PWA.
  let diff = 0;
  for (let i = 0; i < provided.length; i += 1) {
    diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

export async function POST(request: NextRequest) {
  if (!isAuthEnabled()) {
    return NextResponse.json({ error: "Auth not enabled" }, { status: 404 });
  }
  let body: { password?: unknown };
  try {
    body = (await request.json()) as { password?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const provided = typeof body.password === "string" ? body.password : "";
  if (!(await checkPassword(provided))) {
    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  }

  const value = await buildSessionCookieValue();
  const cookieHeader = sessionCookieAttributes().replace("%VALUE%", value);
  const response = NextResponse.json({ ok: true });
  response.headers.append("Set-Cookie", cookieHeader);
  return response;
}
