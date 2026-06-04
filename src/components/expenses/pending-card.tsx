"use client";

import { useMemo, useState } from "react";

import { formatMoney } from "@/lib/expenses/money";
import { evaluateReceiptForPosting } from "@/lib/expenses/rules";
import type { ExpenseReceiptSummary, ExtractedExpenseReceipt } from "@/lib/expenses/types";

import { ReceiptForm } from "./receipt-form";

type Props = {
  receipt: ExpenseReceiptSummary;
  draft: ExtractedExpenseReceipt;
  onDraftChange: (next: ExtractedExpenseReceipt) => void;
  onSave: () => void;
  onDelete: () => void;
};

function statusLabel(status: ExpenseReceiptSummary["status"]) {
  if (status === "auto_posted") return { text: "已自动入账", kind: "success" as const };
  if (status === "confirmed") return { text: "已确认入账", kind: "success" as const };
  return { text: "待确认", kind: "warn" as const };
}

function dateOf(value: string | null) {
  if (!value) return "日期待补";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "日期待补";
  return d.toLocaleDateString("zh-CN");
}

function manualBlockers(value: ExtractedExpenseReceipt): string[] {
  const blockers: string[] = [];
  if (!value.merchant_name?.trim()) blockers.push("商家名称");
  if (!value.purchased_at || Number.isNaN(Date.parse(value.purchased_at))) blockers.push("购买时间");
  if (value.total_amount === null) blockers.push("实际支付金额");
  if (value.items.length === 0) blockers.push("商品明细");
  if (value.items.some((item) => !item.name_zh.trim())) blockers.push("商品名称");
  if (value.items.some((item) => item.amount === null)) blockers.push("商品小计");
  return Array.from(new Set(blockers));
}

export function PendingReceiptCard({ receipt, draft, onDraftChange, onSave, onDelete }: Props) {
  const [expanded, setExpanded] = useState(false);
  const status = statusLabel(receipt.status);
  const merchant = draft.merchant_name ?? "未知商家";
  const total = draft.total_amount === null ? "金额未识别" : formatMoney(draft.total_amount, draft.currency);
  const itemCount = draft.items.length;

  // Re-evaluate against the live draft so confidence and "X 项待核对" update as
  // the user fills in fields. draft.confidence acts as a floor; clearing review
  // reasons drives the displayed confidence up to 100%.
  const { liveConfidence, reasons } = useMemo(() => {
    const { reviewReasons } = evaluateReceiptForPosting(draft);
    const completion = Math.max(0, Math.min(1, 1 - reviewReasons.length * 0.1));
    return { liveConfidence: Math.max(draft.confidence, completion), reasons: reviewReasons };
  }, [draft]);

  const ready = receipt.status === "pending_review";
  const blockers = useMemo(() => manualBlockers(draft), [draft]);
  const amountBlockers = useMemo(
    () => reasons.filter((reason) => reason.includes("金额合计") || reason.includes("金额公式")),
    [reasons]
  );
  const confirmBlockers = useMemo(
    () => [...blockers, ...amountBlockers.map(() => "金额关系")],
    [amountBlockers, blockers]
  );

  return (
    <article className={`exp-card ${expanded ? "exp-card--expanded" : ""} ${expanded ? "" : "exp-card--clickable"}`}>
      <div
        className="exp-card__row"
        onClick={() => {
          if (!expanded) setExpanded(true);
        }}
        role={expanded ? undefined : "button"}
      >
        <div className="exp-card__title">
          <span className={`exp-tag exp-tag--${status.kind}`}>
            <span aria-hidden>🧾</span>
            {status.text}
          </span>
          <div style={{ minWidth: 0 }}>
            <div className="exp-card__merchant">{merchant}</div>
            <div className="exp-card__meta">
              票据 #{receipt.id} · {dateOf(draft.purchased_at)} · {itemCount} 个商品 · 置信度 {Math.round(liveConfidence * 100)}%
              {reasons.length > 0 ? (
                <>
                  {" · "}
                  <span className="exp-card__meta-warn">
                    <span aria-hidden>⚠️</span>
                    {reasons.length} 项待核对
                  </span>
                </>
              ) : (
                <>
                  {" · "}
                  <span className="exp-card__meta-ok">
                    <span aria-hidden>✓</span>
                    可入账
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="exp-card__actions" onClick={(e) => e.stopPropagation()}>
          <span className="exp-card__amount">{total}</span>
          {ready ? (
            <button
              className="exp-btn exp-btn--primary exp-btn--sm"
              disabled={confirmBlockers.length > 0}
              onClick={onSave}
              title={confirmBlockers.length > 0 ? `请先核对：${Array.from(new Set(confirmBlockers)).join("、")}` : undefined}
              type="button"
            >
              确认入账
            </button>
          ) : null}
          <button
            aria-label={expanded ? "收起" : "展开编辑"}
            className="exp-card__expand"
            onClick={() => setExpanded((v) => !v)}
            type="button"
          >
            <svg fill="none" height="14" viewBox="0 0 24 24" width="14" xmlns="http://www.w3.org/2000/svg">
              <path d="M6 9l6 6 6-6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
            </svg>
          </button>
        </div>
      </div>

      {expanded ? (
        <div className="exp-card__details">
          <div className="exp-card__details-body">
            {reasons.length > 0 || blockers.length > 0 ? (
              <div className="exp-reasons" style={{ padding: "0 0 12px" }}>
                {confirmBlockers.length > 0 ? (
                  <span className="exp-tag exp-tag--warn">
                    需核对：{Array.from(new Set(confirmBlockers)).join("、")}
                  </span>
                ) : null}
                {reasons.map((reason) => (
                  <span className="exp-tag exp-tag--warn" key={reason}>
                    {reason}
                  </span>
                ))}
              </div>
            ) : null}
            <ReceiptForm onChange={onDraftChange} value={draft} />
          </div>
          <div className="exp-form__actions">
            <button className="exp-btn exp-btn--danger" onClick={onDelete} type="button">
              删除
            </button>
            <button
              className="exp-btn exp-btn--secondary"
              onClick={() => {
                onDraftChange(receipt.extracted);
                setExpanded(false);
              }}
              type="button"
            >
              取消
            </button>
            <button
              className="exp-btn exp-btn--primary"
              disabled={confirmBlockers.length > 0}
              onClick={() => {
                onSave();
                setExpanded(false);
              }}
              title={confirmBlockers.length > 0 ? `请先核对：${Array.from(new Set(confirmBlockers)).join("、")}` : undefined}
              type="button"
            >
              确认入账
            </button>
          </div>
        </div>
      ) : null}
    </article>
  );
}
