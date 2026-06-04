"use client";

import { useState } from "react";

import { formatMoney } from "@/lib/expenses/money";
import type { ExpenseTransaction, ExtractedExpenseItem, ExtractedExpenseReceipt } from "@/lib/expenses/types";

import { ReceiptForm } from "./receipt-form";
import { categoryEmoji } from "./category-colors";

type Props = {
  transaction: ExpenseTransaction;
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
      unit_price: item.unit_price,
      amount: item.amount,
      confidence: item.confidence,
      notes: item.notes
    }))
  };
}

export function TransactionCard({ transaction, draft, onDraftChange, onSave, onDelete }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);

  const date = new Date(transaction.purchased_at).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });

  const items = transaction.items;
  const itemsTotal = items.reduce((sum, item) => sum + (item.amount ?? 0), 0);

  if (editing) {
    return (
      <article className="exp-card exp-card--expanded">
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
        <div className="exp-card__details">
          <div className="exp-card__details-body">
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
    <article className={`exp-card ${expanded ? "exp-card--expanded" : ""} ${expanded ? "" : "exp-card--clickable"}`}>
      <div
        className="exp-card__row"
        onClick={() => {
          if (!expanded) setExpanded(true);
        }}
        role={expanded ? undefined : "button"}
      >
        <div className="exp-card__title">
          <span className="exp-tag exp-tag--success">
            <span aria-hidden>✅</span>
            已入账
          </span>
          <div style={{ minWidth: 0 }}>
            <div className="exp-card__merchant">{transaction.merchant_name}</div>
            <div className="exp-card__meta">
              #{transaction.id} · {date} · {items.length} 个商品
            </div>
          </div>
        </div>
        <div className="exp-card__actions" onClick={(e) => e.stopPropagation()}>
          <span className="exp-card__amount">{formatMoney(transaction.total_amount, transaction.currency)}</span>
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
        <div className="exp-card__details">
          <div className="exp-card__details-body">
            {items.length > 0 ? (
              <>
                <div className="exp-items">
                  {items.map((item) => (
                    <div className="exp-items__row" key={item.id}>
                      <span className="exp-items__name">
                        <span aria-hidden className="exp-items__emoji">
                          {categoryEmoji(item.category_zh)}
                        </span>
                        <span className="exp-items__name-text">
                          {item.name_zh}
                          {item.spec_text ? <span className="exp-items__spec">· {item.spec_text}</span> : null}
                        </span>
                      </span>
                      <span className="exp-items__amount">
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
          </div>
        </div>
      ) : null}
    </article>
  );
}
