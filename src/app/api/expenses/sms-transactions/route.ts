import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { extractBearerToken, isSmsAuthEnabled, verifySmsToken } from "@/lib/expenses/sms-auth";
import { processSmsTransaction } from "@/lib/expenses/sms-store";
import { parseTransitSms } from "@/lib/expenses/sms-parser";

export const runtime = "nodejs";

const smsPayloadSchema = z.object({
  message: z.string().trim().min(1).max(4000)
});

export async function POST(request: NextRequest) {
  if (!isSmsAuthEnabled()) {
    return NextResponse.json(
      { error: "SMS auto-entry is not configured" },
      { status: 503 }
    );
  }

  const authHeader = request.headers.get("authorization");
  const token = extractBearerToken(authHeader);
  if (!verifySmsToken(token)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = smsPayloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { message } = parsed.data;
  const parseResult = parseTransitSms(message);
  const result = processSmsTransaction(message, parseResult);

  switch (result.status) {
    case "created":
      return NextResponse.json(
        {
          ok: true,
          matched: true,
          transactionId: result.transactionId,
          recordId: result.recordId
        },
        { status: 201 }
      );
    case "duplicate":
      return NextResponse.json(
        {
          ok: true,
          matched: false,
          reason: result.reason,
          recordId: result.recordId
        },
        { status: 200 }
      );
    case "skipped":
      return NextResponse.json(
        {
          ok: true,
          matched: false,
          reason: result.reason,
          recordId: result.recordId
        },
        { status: 200 }
      );
    case "error":
      return NextResponse.json(
        {
          ok: false,
          matched: false,
          reason: result.reason,
          recordId: result.recordId
        },
        { status: 422 }
      );
    default:
      return NextResponse.json({ error: "Unknown status" }, { status: 500 });
  }
}
