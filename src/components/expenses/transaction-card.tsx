"use client";

import { useEffect, useState } from "react";

import { formatMoney } from "@/lib/expenses/money";
import type { ExpenseDuplicateHint, ExpenseTransaction, ExtractedExpenseItem, ExtractedExpenseReceipt } from "@/lib/expenses/types";

import { ReceiptForm } from "./receipt-form";
import { categoryEmoji } from "./category-colors";
import { receiptImageUrl } from "./receipt-image-url";
// Wave 3 bulk: optional bulk-selection context. When wrapped in
// <BulkSelectionProvider>, the card auto-wires a top-left checkbox + shift
// range select. Outside the provider it behaves exactly as before.
import { useBulkSelectionOptional } from "./bulk-selection";

type Props = {
  // Wave 1 (Feature #6): allow the analytics-enriched transaction shape
  // (which carries receipt_image_path for the thumbnail).
  // Wave 2 feature: image compression — also carries receipt_thumbnail_path.
  transaction: ExpenseTransaction & {
    receipt_image_path?: string | null;
    receipt_thumbnail_path?: string | null;
    duplicate_hint?: ExpenseDuplicateHint | null;
  };
  draft: ExtractedExpenseReceipt;
  onDraftChange: (next: ExtractedExpenseReceipt) => void;
  onSave: () => void;
  onDelete: () => void;
};

function transactionToExtracted(transaction: ExpenseTransaction): ExtractedExpenseReceipt {
  return {
    merchant_name: transaction.merchant_name,
    purchased_at: transaction.purchased_at,
    currency: transaction.currency,
    subtotal_amount: transaction.subtotal_amount,
    total_amount: transaction.total_amount,
    tax_amount: transaction.tax_amount,
    processing_fee: transaction.processing_fee,
    delivery_fee: transaction.delivery_fee,
    delivery_discount: transaction.delivery_discount,
    discount_amount: transaction.discount_amount,
    confidence: 1,
    model_suggested_auto_post: true,
    needs_review_reasons: [],
    recognition_note: null,
    user_note: transaction.notes,
    items: transaction.items.map((item): ExtractedExpenseItem => ({
      name_raw: item.name_raw,
      name_zh: item.name_zh,
      category_zh: item.category_zh,
      quantity: item.quantity,
      spec_text: item.spec_text,
      food_amount_value: item.food_amount_value,
      food_amount_unit: item.food_amount_unit,
      unit_price: item.unit_price,
      discounted_unit_price: item.discounted_unit_price,
      amount: item.amount,
      confidence: item.confidence,
      notes: item.notes
    }))
  };
}

function ReceiptImage({ imagePath, alt }: { imagePath: string | null | undefined; alt: string }) {
  const src = receiptImageUrl(imagePath);
  if (!src) return null;
  return <img alt={alt} className="exp-receipt-thumb" decoding="async" loading="lazy" src={src} />;
}

export function TransactionCard({ transaction, draft, onDraftChange, onSave, onDelete }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [excludeBusy, setExcludeBusy] = useState(false);
  // Wave 3 bulk: auto-detect selection support from the context. We never
  // toggle selection while editing — the edit form owns the card.
  const bulk = useBulkSelectionOptional();
  const selectable = bulk !== null && !editing;
  const selected = bulk ? bulk.isSelected(transaction.id) : false;

  const date = new Date(transaction.purchased_at).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });

  const items = transaction.items;
  const itemsTotal = items.reduce((sum, item) => sum + (item.amount ?? 0), 0);

  async function toggleExclude() {
    if (excludeBusy) return;
    setExcludeBusy(true);
    try {
      const response = await fetch(`/api/expenses/transactions/${transaction.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ excludedFromBudget: !transaction.excluded_from_budget })
      });
      if (response.ok) onSave();
    } finally {
      setExcludeBusy(false);
    }
  }

  useEffect(() => {
    if (!expanded && !editing) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (editing) {
        onDraftChange(transactionToExtracted(transaction));
        setEditing(false);
        setExpanded(true);
        return;
      }
      setExpanded(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [editing, expanded, onDraftChange, transaction]);

  if (editing) {
    return (
      <article className={`exp-card exp-card--expanded ${transaction.duplicate_hint ? "exp-card--duplicate" : ""}`}>
        <div className="exp-card__row">
          <div className="exp-card__title">
            <span className="exp-tag exp-tag--neutral">编辑中</span>
            <div>
              <div className="exp-card__merchant">{transaction.merchant_name}</div>
              <div className="exp-card__meta">已入账 #{transaction.id} · {date}</div>
            </div>
          </div>
          <div className="exp-card__actions">
            <span className="exp-card__amount">{formatMoney(transaction.total_amount, transaction.currency)}</span>
          </div>
        </div>
        <button
          aria-label="关闭票据编辑"
          className="exp-card__backdrop"
          onClick={() => {
            onDraftChange(transactionToExtracted(transaction));
            setEditing(false);
            setExpanded(true);
          }}
          type="button"
        />
        <div className="exp-card__details">
          <div className="exp-card__details-body">
            {/* Wave 1 (Feature #6): receipt thumbnail in edit mode. */}
            <ReceiptImage
              alt={`票据 #${transaction.id} 缩略图`}
              // Wave 2 feature: image compression — prefer thumb, fall back
              // to the original so pre-existing rows still render.
              imagePath={transaction.receipt_thumbnail_path ?? transaction.receipt_image_path ?? null}
            />
            <ReceiptForm onChange={onDraftChange} value={draft} />
          </div>
          <div className="exp-form__actions">
            <button className="exp-btn exp-btn--danger" onClick={onDelete} type="button">
              删除
            </button>
            <button
              className="exp-btn exp-btn--secondary"
              onClick={() => {
                onDraftChange(transactionToExtracted(transaction));
                setEditing(false);
                setExpanded(true);
              }}
              type="button"
            >
              取消
            </button>
            <button
              className="exp-btn exp-btn--primary"
              onClick={() => {
                onSave();
                setEditing(false);
                setExpanded(true);
              }}
              type="button"
            >
              保存修改
            </button>
          </div>
        </div>
      </article>
    );
  }

  return (
    <article
      className={`exp-card ${transaction.duplicate_hint ? "exp-card--duplicate" : ""} ${expanded ? "exp-card--expanded" : ""} ${expanded ? "" : "exp-card--clickable"} ${selected ? "exp-card--selected" : ""}`}
    >
      <div
        className="exp-card__row"
        onClick={(e) => {
          // Wave 3 bulk: shift-click selects a range; plain click still expands.
          if (selectable && e.shiftKey && bulk) {
            e.preventDefault();
            bulk.handleClick(transaction.id, true);
            return;
          }
          if (!expanded) setExpanded(true);
        }}
        role={expanded ? undefined : "button"}
      >
        {selectable ? (
          <input
            aria-label="多选此笔交易"
            checked={selected}
            className="exp-card__select-checkbox"
            onChange={() => undefined}
            onClick={(e) => {
              e.stopPropagation();
              if (!bulk) return;
              bulk.handleClick(transaction.id, e.shiftKey);
            }}
            type="checkbox"
          />
        ) : null}
        <div className="exp-card__title">
          <span className="exp-tag exp-tag--success">
            <span aria-hidden>✅</span>
            已入账
          </span>
          <div style={{ minWidth: 0 }}>
            <div className="exp-card__merchant">{transaction.merchant_name}</div>
            <div className="exp-card__meta">
              #{transaction.id} · {date} · {items.length} 个商品
              {transaction.duplicate_hint ? (
                <>
                  {" · "}
                  <span className="exp-card__meta-duplicate" title={transaction.duplicate_hint.reason}>
                    疑似重复 #{transaction.duplicate_hint.matched_id}
                  </span>
                </>
              ) : null}
            </div>
          </div>
        </div>
        <div className="exp-card__actions" onClick={(e) => e.stopPropagation()}>
          <div className="exp-card__amount-wrap">
            {transaction.subtotal_amount !== null ? (
              <span className="exp-card__amount-sub">
                小计 {formatMoney(transaction.subtotal_amount, transaction.currency)}
              </span>
            ) : null}
            <span className="exp-card__amount">{formatMoney(transaction.total_amount, transaction.currency)}</span>
          </div>
          <button
            aria-label={expanded ? "收起" : "展开"}
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
            aria-label="关闭票据详情"
            className="exp-card__backdrop"
            onClick={() => setExpanded(false)}
            type="button"
          />
          <div className="exp-card__details">
            <div className="exp-card__details-body">
              {/* Wave 1 (Feature #6): receipt image preview. The receipt row
                  is fetched via the analytics response; we only need its
                  image_path. The pending-card reads it directly from the
                  receipt prop. */}
              {items.length > 0 ? (
                <>
                  <div className="exp-items">
                    {items.map((item) => (
                      <div
                        className={`exp-items__row ${item.amount === null ? "exp-items__row--unknown" : ""}`}
                        key={item.id}
                        title={item.amount === null ? "未识别金额" : undefined}
                      >
                        <span className="exp-items__name">
                          <span aria-hidden className="exp-items__emoji">
                            {categoryEmoji(item.category_zh)}
                          </span>
                          <span className="exp-items__name-text">
                            {item.name_zh}
                            {item.food_amount_value !== null && item.food_amount_unit ? (
                              <span className="exp-items__spec">
                                · {item.food_amount_value}
                                {item.food_amount_unit}
                              </span>
                            ) : item.spec_text ? (
                              <span className="exp-items__spec">· {item.spec_text}</span>
                            ) : null}
                          </span>
                        </span>
                        <span className="exp-items__amount">
                          {item.discounted_unit_price !== null && item.unit_price !== null ? (
                            <span className="exp-items__spec">
                              {formatMoney(item.unit_price, transaction.currency)} →{" "}
                            </span>
                          ) : null}
                          {item.discounted_unit_price !== null
                            ? `${formatMoney(item.discounted_unit_price, transaction.currency)} · `
                            : null}
                          {item.amount !== null ? formatMoney(item.amount, transaction.currency) : "—"}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="exp-items__footer">
                    <span>商品合计</span>
                    <span>{formatMoney(itemsTotal, transaction.currency)}</span>
                  </div>
                </>
              ) : null}
            </div>
            <div className="exp-form__actions">
              {/* Wave 1 (Feature #3): toggle "不计入预算" from the card. */}
              <button
                className={
                  transaction.excluded_from_budget
                    ? "exp-btn exp-btn--ghost exp-btn--sm"
                    : "exp-btn exp-btn--secondary exp-btn--sm"
                }
                disabled={excludeBusy}
                onClick={toggleExclude}
                type="button"
              >
                <span aria-hidden>{transaction.excluded_from_budget ? "🚫" : "🪧"}</span>
                {transaction.excluded_from_budget ? "已剔除预算" : "不计入预算"}
              </button>
              <button className="exp-btn exp-btn--secondary" onClick={() => setEditing(true)} type="button">
                <svg fill="none" height="13" viewBox="0 0 24 24" width="13" xmlns="http://www.w3.org/2000/svg">
                  <path
                    d="M12 20h9M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4L16.5 3.5z"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                  />
                </svg>
                编辑
              </button>
              <button className="exp-btn exp-btn--danger" onClick={onDelete} type="button">
                删除
              </button>
              <button className="exp-btn exp-btn--ghost" onClick={() => setExpanded(false)} type="button">
                关闭
              </button>
            </div>
          </div>
        </>
      ) : null}
    </article>
  );
}
