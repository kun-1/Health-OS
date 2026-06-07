import { NextResponse } from "next/server";

import { isAuthEnabled } from "@/lib/expenses/auth";

export const runtime = "nodejs";

// Wave 3 auth: tells the client whether to show the logout button. Never
// reveals the password itself or the cookie value.
export async function GET() {
  return NextResponse.json({ enabled: isAuthEnabled() });
}
