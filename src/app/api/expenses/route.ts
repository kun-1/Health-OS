import { NextRequest, NextResponse } from "next/server";

import { getExpenseAnalytics } from "@/lib/expenses/store";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const month = request.nextUrl.searchParams.get("month") ?? undefined;
  return NextResponse.json(getExpenseAnalytics(month));
}
