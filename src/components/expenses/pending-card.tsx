"use client";

import { useEffect, useMemo, useState } from "react";

import { formatMoney } from "@/lib/expenses/money";
import { evaluateReceiptForPosting } from "@/lib/expenses/rules";
import type { ExpenseReceiptSummary, ExtractedExpenseReceipt } from "@/lib/expenses/types";
import { getBlockingFields } from "@/lib/expenses/validation";

import { ReceiptForm } from "./receipt-form";
import { receiptImageUrl } from "./receipt-image-url";
// Wave 3 bulk: optional context lets the home page bulk-confirm receipts.
import { useBulkSelectionOptional } from "./bulk-selection";

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

function ReceiptThumb({ imagePath, alt }: { imagePath: string; alt: string }) {
  const src = receiptImageUrl(imagePath);
  if (!src) return null;
  return <img alt={alt} className="exp-receipt-thumb" decoding="async" loading="lazy" src={src} />;
}

function manualBlockers(value: ExtractedExpenseReceipt): string[] {
  // Wave 3 polish (M4): shared with the store-side guard so the UI and
  // server agree on which fields block posting.
  return getBlockingFields(value);
}

export function PendingReceiptCard({ receipt, draft, onDraftChange, onSave, onDelete }: Props) {
  const [expanded, setExpanded] = useState(false);
  // Wave 3 bulk: only "待确认" receipts participate — auto/confirmed ones are
  // out of the selection set so the bulk-confirm toolbar button stays honest.
  const bulk = useBulkSelectionOptional();
  const selectable = bulk !== null && receipt.status === "pending_review";
  const selected = bulk ? bulk.isSelected(receipt.id) : false;
  const status = statusLabel(receipt.status);
  const merchant = draft.merchant_name ?? "未知商家";
  const total = draft.total_amount === null ? "金额未识别" : formatMoney(draft.total_amount, draft.currency);
  const itemCount = draft.items.length;

  // Re-evaluate against the live draft so confidence and "X 项待核对" update as
  // the user fills in fields. Wave 1 fix (Bug #25): take the min of the OCR
  // confidence and (1 - reasons*0.1) — more reasons should drive confidence
  // down, not up. The OCR value acts as a ceiling, the heuristic as a floor.
  const { liveConfidence, reasons } = useMemo(() => {
    const { reviewReasons } = evaluateReceiptForPosting(draft);
    const heuristic = Math.max(0, Math.min(1, 1 - reviewReasons.length * 0.1));
    return { liveConfidence: Math.min(draft.confidence, heuristic), reasons: reviewReasons };
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

  useEffect(() => {
    if (!expanded) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setExpanded(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [expanded]);

  return (
    <article
      className={`exp-card ${receipt.duplicate_hint ? "exp-card--duplicate" : ""} ${expanded ? "exp-card--expanded" : ""} ${expanded ? "" : "exp-card--clickable"} ${selected ? "exp-card--selected" : ""}`}
    >
      <div
        className="exp-card__row"
        onClick={(e) => {
          // Wave 3 bulk: shift-click ranges across cards, plain click expands.
          if (selectable && e.shiftKey && bulk) {
            e.preventDefault();
            bulk.handleClick(receipt.id, true);
            return;
          }
          if (!expanded) setExpanded(true);
        }}
        role={expanded ? undefined : "button"}
      >
        {selectable ? (
          <input
            aria-label="多选此张票据"
            checked={selected}
            className="exp-card__select-checkbox"
            onChange={() => undefined}
            onClick={(e) => {
              e.stopPropagation();
              if (!bulk) return;
              bulk.handleClick(receipt.id, e.shiftKey);
            }}
            type="checkbox"
          />
        ) : null}
        <div className="exp-card__title">
          <span className={`exp-tag exp-tag--${status.kind}`}>
            <span aria-hidden>🧾</span>
            {status.text}
          </span>
          <div style={{ minWidth: 0 }}>
            <div className="exp-card__merchant">{merchant}</div>
            <div className="exp-card__meta">
              票据 #{receipt.id} · {dateOf(draft.purchased_at)} · {itemCount} 个商品 · 置信度 {Math.round(liveConfidence * 100)}%
              {receipt.duplicate_hint ? (
                <>
                  {" · "}
                  <span className="exp-card__meta-duplicate" title={receipt.duplicate_hint.reason}>
                    疑似重复 #{receipt.duplicate_hint.matched_id}
                  </span>
                </>
              ) : null}
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
        <>
          <button
            aria-label="关闭票据编辑"
            className="exp-card__backdrop"
            onClick={() => setExpanded(false)}
            type="button"
          />
          <div className="exp-card__details">
            <div className="exp-card__details-body">
              {/* Wave 1 (Feature #6): show receipt thumbnail while editing.
                  Wave 2 feature: image compression — prefer thumbnail_path, fall
                  back to image_path so old rows without a thumb still render. */}
              <ReceiptThumb
                alt={`票据 #${receipt.id} 缩略图`}
                imagePath={receipt.thumbnail_path ?? receipt.image_path}
              />
              {reasons.length > 0 || blockers.length > 0 ? (
                <div className="exp-reasons" style={{ padding: "0 0 12px" }}>
                  {receipt.duplicate_hint ? (
                    <span className="exp-tag exp-tag--duplicate">
                      疑似重复：{receipt.duplicate_hint.reason}
                    </span>
                  ) : null}
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
              <button className="exp-btn exp-btn--ghost" onClick={() => setExpanded(false)} type="button">
                关闭
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
        </>
      ) : null}
    </article>
  );
}
