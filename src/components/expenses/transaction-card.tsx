"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

import { formatMoney } from "@/lib/expenses/money";
import { formatDateTime } from "@/lib/expenses/format";
import type { ExpenseDuplicateHint, ExpenseTransaction, ExtractedExpenseReceipt } from "@/lib/expenses/types";

import { ReceiptForm } from "./receipt-form";
import { categoryColor, categoryEmoji, categoryLabel } from "./category-colors";
import { receiptImageUrl } from "./receipt-image-url";
import { shortChineseDate, transactionToExtracted } from "./shared/task-helpers";
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
  // Optional loading flags driven by ExpensesClient's busyIds set. Default
  // false so callers that don't pass them keep the prior behavior.
  saving?: boolean;
  deleting?: boolean;
};

function ReceiptImage({ imagePath, alt }: { imagePath: string | null | undefined; alt: string }) {
  const src = receiptImageUrl(imagePath);
  if (!src) return null;
  return (
    <div className="exp-thumb-wrap">
      <Image alt={alt} className="exp-receipt-thumb" height={220} loading="lazy" src={src} unoptimized width={220} />
      <div className="exp-thumb-preview" aria-hidden="true">
        <Image alt="" height={200} src={src} unoptimized width={160} />
      </div>
    </div>
  );
}

export function TransactionCard({ transaction, draft, onDraftChange, onSave, onDelete, saving = false, deleting = false }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [excludeBusy, setExcludeBusy] = useState(false);
  // Wave 3 bulk: auto-detect selection support from the context. We never
  // toggle selection while editing — the edit form owns the card.
  const bulk = useBulkSelectionOptional();
  const selectable = bulk !== null && !editing;
  const selected = bulk ? bulk.isSelected(transaction.id) : false;

  const date = formatDateTime(transaction.purchased_at);

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
            <button
              className="exp-btn exp-btn--danger"
              disabled={deleting}
              onClick={onDelete}
              type="button"
            >
              {deleting ? (
                <>
                  <span className="exp-spinner" aria-hidden /> 删除中...
                </>
              ) : (
                "删除"
              )}
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
              disabled={saving}
              onClick={() => {
                onSave();
                setEditing(false);
                setExpanded(true);
              }}
              type="button"
            >
              {saving ? (
                <>
                  <span className="exp-spinner" aria-hidden /> 保存中...
                </>
              ) : (
                "保存修改"
              )}
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
      {!expanded ? (
        <div
          className="exp-card__compact-row"
          onClick={(e) => {
            // Wave 3 bulk: shift-click selects a range; plain click still expands.
            if (selectable && e.shiftKey && bulk) {
              e.preventDefault();
              bulk.handleClick(transaction.id, true);
              return;
            }
            setExpanded(true);
          }}
          role="button"
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
          {(() => {
            const firstItem = items[0];
            const accentColor = firstItem?.category_zh ? categoryColor(firstItem.category_zh) : "var(--exp-text-subtle)";
            const primaryEmoji = firstItem?.category_zh ? categoryEmoji(firstItem.category_zh) : "📦";
            const primaryCategoryLabel = firstItem?.category_zh ? categoryLabel(firstItem.category_zh) : "未分类";
            const compactSubText = `${shortChineseDate(transaction.purchased_at)}${
              transaction.duplicate_hint ? " · 疑似重复" : ""
            }`;
            return (
              <>
                <div className="exp-card__accent-bar" style={{ background: accentColor }} />
                <span aria-hidden className="exp-card__compact-emoji" style={{ background: `${accentColor}20`, color: accentColor }}>
                  {primaryEmoji}
                </span>
                <div className="exp-card__compact-main">
                  <div className="exp-card__compact-name">{transaction.merchant_name}</div>
                  <div className="exp-card__compact-sub" title={compactSubText}>
                    {compactSubText}
                  </div>
                </div>
                <span className="exp-card__compact-badge" style={{ borderColor: `${accentColor}40`, background: `${accentColor}12`, color: accentColor }}>
                  {primaryCategoryLabel}
                </span>
              </>
            );
          })()}
          <div className="exp-card__compact-right">
            {transaction.subtotal_amount !== null && transaction.subtotal_amount !== transaction.total_amount ? (
              <span className="exp-card__amount-sub">
                小计 {formatMoney(transaction.subtotal_amount, transaction.currency)}
              </span>
            ) : null}
            <span className="exp-card__compact-amount">
              {formatMoney(transaction.total_amount, transaction.currency)}
            </span>
            <button
              aria-label="展开"
              className="exp-card__expand"
              onClick={(e) => {
                e.stopPropagation();
                setExpanded(true);
              }}
              type="button"
            >
              <svg fill="none" height="14" viewBox="0 0 24 24" width="14" xmlns="http://www.w3.org/2000/svg">
                <path d="M6 9l6 6 6-6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
              </svg>
            </button>
          </div>
        </div>
      ) : null}

      {expanded ? (
        <div className="exp-card__drawer-scope" style={{ ["--exp-drawer-width"]: "min(820px, calc(100vw - 36px))" } as Record<string, string>}>
          <button
            aria-label="关闭票据详情"
            className="exp-card__backdrop"
            onClick={() => setExpanded(false)}
            type="button"
          />
          <div className="exp-card__details">
            <button
              aria-label="关闭"
              className="exp-card__details-close"
              onClick={() => setExpanded(false)}
              type="button"
            >
              <svg fill="none" height="18" viewBox="0 0 24 24" width="18" xmlns="http://www.w3.org/2000/svg">
                <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
              </svg>
            </button>
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
              <button
                className="exp-btn exp-btn--danger"
                disabled={deleting}
                onClick={onDelete}
                type="button"
              >
                {deleting ? (
                  <>
                    <span className="exp-spinner" aria-hidden /> 删除中...
                  </>
                ) : (
                  "删除"
                )}
              </button>
              <button className="exp-btn exp-btn--ghost" onClick={() => setExpanded(false)} type="button">
                关闭
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </article>
  );
}
