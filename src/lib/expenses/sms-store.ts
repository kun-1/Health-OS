import { and, eq, gte } from "drizzle-orm";

import { expenseTransactions, smsTransactionRecords } from "@/db/schema";
import { db } from "@/lib/db";
import { sha256OfBuffer } from "@/lib/expenses/hashing";
import { createTransactionFromExtracted } from "@/lib/expenses/store";
import type { SmsParseResult } from "@/lib/expenses/sms-parser";

export type SmsProcessingResult =
  | { status: "duplicate"; recordId: number; reason: string }
  | { status: "skipped"; recordId: number; reason: string }
  | { status: "error"; recordId: number; reason: string }
  | { status: "created"; recordId: number; transactionId: number };

function smsHash(text: string): string {
  return sha256OfBuffer(Buffer.from(text, "utf-8"));
}

function findExistingSmsRecord(hash: string) {
  return db
    .select()
    .from(smsTransactionRecords)
    .where(eq(smsTransactionRecords.messageHash, hash))
    .get();
}

function recordSmsStatus(
  hash: string,
  status: SmsProcessingResult["status"],
  rawMessage: string,
  options: { transactionId?: number; reason?: string; source?: string } = {}
) {
  const now = new Date().toISOString();
  const result = db
    .insert(smsTransactionRecords)
    .values({
      messageHash: hash,
      source: options.source ?? "ios-shortcuts",
      status,
      rawMessage,
      transactionId: options.transactionId ?? null,
      reason: options.reason ?? null,
      createdAt: now,
      updatedAt: now
    })
    .run();
  return Number(result.lastInsertRowid);
}

function hasRecentDuplicate(
  parsed: Extract<SmsParseResult, { matched: true }>,
  windowMinutes = 5
): boolean {
  // Defensive: in addition to the message hash, also guard against clock-skew
  // or near-duplicate alerts by checking the same merchant + amount within a
  // short window.
  const cutoff = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString();
  const duplicate = db
    .select({ id: expenseTransactions.id })
    .from(expenseTransactions)
    .where(
      and(
        eq(expenseTransactions.merchantName, parsed.merchantName),
        eq(expenseTransactions.totalAmountCents, Math.round(parsed.amount * 100)),
        gte(expenseTransactions.purchasedAt, cutoff)
      )
    )
    .limit(1)
    .get();
  return Boolean(duplicate);
}

export function processSmsTransaction(
  rawMessage: string,
  parsed: SmsParseResult,
  source = "ios-shortcuts"
): SmsProcessingResult {
  const hash = smsHash(rawMessage);
  const existing = findExistingSmsRecord(hash);
  if (existing) {
    return {
      status: "duplicate",
      recordId: existing.id,
      reason: "same_message_hash"
    };
  }

  if (!parsed.matched) {
    const recordId = recordSmsStatus(hash, "skipped", rawMessage, {
      reason: parsed.reason,
      source
    });
    return { status: "skipped", recordId, reason: parsed.reason };
  }

  if (hasRecentDuplicate(parsed)) {
    const recordId = recordSmsStatus(hash, "duplicate", rawMessage, {
      reason: "recent_duplicate_by_merchant_amount",
      source
    });
    return {
      status: "duplicate",
      recordId,
      reason: "recent_duplicate_by_merchant_amount"
    };
  }

  try {
    const totalAmount = Number(parsed.amount.toFixed(2));
    const transaction = createTransactionFromExtracted(
      null,
      {
        merchant_name: parsed.merchantName,
        purchased_at: parsed.purchasedAt,
        currency: parsed.currency,
        subtotal_amount: totalAmount,
        total_amount: totalAmount,
        tax_amount: 0,
        processing_fee: 0,
        delivery_fee: 0,
        delivery_discount: 0,
        discount_amount: 0,
        confidence: 1,
        model_suggested_auto_post: true,
        needs_review_reasons: [],
        recognition_note: "短信自动录入",
        user_note: parsed.cardTail ? `卡尾号 ${parsed.cardTail}` : null,
        items: [
          {
            name_raw: parsed.itemName,
            name_zh: parsed.itemName,
            category_zh: parsed.category,
            category_raw: null,
            quantity: "1",
            spec_text: null,
            food_amount_value: null,
            food_amount_unit: null,
            unit_price: totalAmount,
            discounted_unit_price: null,
            amount: totalAmount,
            confidence: 1,
            notes: null
          }
        ]
      },
      { excludedFromBudget: false }
    );

    const recordId = recordSmsStatus(hash, "created", rawMessage, {
      transactionId: transaction.id,
      source
    });

    return { status: "created", recordId, transactionId: transaction.id };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    const recordId = recordSmsStatus(hash, "error", rawMessage, {
      reason,
      source
    });
    return { status: "error", recordId, reason };
  }
}
