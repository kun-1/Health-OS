import { NextResponse } from "next/server";

import { SESSION_COOKIE_NAME } from "@/lib/expenses/auth";

export const runtime = "nodejs";

// Wave 3 auth: clears the session cookie. Always 200 even when auth is
// disabled, so the logout button can be safe to call regardless of state.
export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.headers.append(
    "Set-Cookie",
    [
      `${SESSION_COOKIE_NAME}=`,
      "Path=/",
      "Max-Age=0",
      "HttpOnly",
      "SameSite=Lax"
    ].join("; ")
  );
  return response;
}
