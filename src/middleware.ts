import { NextRequest, NextResponse } from "next/server";

import { isAuthEnabled, isValidSessionCookie, readSessionCookie } from "@/lib/expenses/auth";

// Wave 3 auth: simple middleware gate. When EXPENSES_PASSWORD is unset the
// matcher still runs but the guard short-circuits, so dev installs keep
// working without any config. When set, every /api/expenses/* and /expenses/*
// request needs a valid signed cookie; API paths return 401 JSON, page paths
// redirect to /login?redirect=<original>.

const PAGE_PROTECTED = /^\/expenses(\/|$)/;
const API_PROTECTED = /^\/api\/expenses(\/|$)/;

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const isPage = PAGE_PROTECTED.test(pathname);
  const isApi = API_PROTECTED.test(pathname);
  if (!isPage && !isApi) return NextResponse.next();
  if (!isAuthEnabled()) return NextResponse.next();

  const cookie = readSessionCookie(request.headers.get("cookie"));
  if (await isValidSessionCookie(cookie)) return NextResponse.next();

  if (isApi) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.search = `?redirect=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // Match both /expenses/* page tree and /api/expenses/* APIs. Other
  // /api/* and the rest of the app remain public so the dashboard, timeline,
  // and records APIs work without a password.
  matcher: ["/expenses/:path*", "/api/expenses/:path*"]
};
