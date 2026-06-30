"use client";

import { useEffect, useMemo, useState } from "react";

import { formatMoney } from "@/lib/expenses/money";
import { SUPPORTED_CURRENCIES, type SupportedCurrency } from "@/lib/expenses/settings";
import type { ExtractedExpenseItem, ExtractedExpenseReceipt } from "@/lib/expenses/types";

import { categoryNames, categoryEmoji, categoryLabel } from "./category-colors";

type Props = {
  value: ExtractedExpenseReceipt;
  onChange: (next: ExtractedExpenseReceipt) => void;
};

type PreviewData = {
  name_zh: string;
  category: string;
  confidence: number;
  matchedPattern: string | null;
  color: string | null;
  excludedFromPlate: boolean;
  isUserOverridden: boolean;
};

type PreviewState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ok"; data: PreviewData }
  | { kind: "error" };

// Per-item live preview of the nutrition classifier. Debounced 250 ms
// after the user stops typing so we're not pinging the API per keystroke.
// Errors are silent — the chip just disappears; the user shouldn't see a
// "preview failed" toast every time they type a new word.
function NamePreview({ name }: { name: string }) {
  const [state, setState] = useState<PreviewState>({ kind: "idle" });

  useEffect(() => {
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      setState({ kind: "idle" });
      return;
    }
    setState({ kind: "loading" });
    let cancelled = false;
    const timer = setTimeout(() => {
      fetch(`/api/nutrition/preview?name_zh=${encodeURIComponent(trimmed)}`)
        .then(async (res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return (await res.json()) as PreviewData;
        })
        .then((data) => {
          if (cancelled) return;
          setState({ kind: "ok", data });
        })
        .catch(() => {
          if (cancelled) return;
          setState({ kind: "error" });
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [name]);

  if (state.kind === "idle" || state.kind === "error") return null;
  if (state.kind === "loading") {
    return (
      <div className="exp-form__preview exp-form__preview--loading">
        匹配中…
      </div>
    );
  }

  const { data } = state;
  const matched = data.matchedPattern
    ? `匹配: ${data.matchedPattern}`
    : "未匹配";
  return (
    <div className="exp-form__preview">
      <span
        className={
          data.color
            ? `exp-form__preview-dot exp-form__preview-dot--${data.color}`
            : "exp-form__preview-dot exp-form__preview-dot--none"
        }
      />
      <span className="exp-form__preview-cat">{data.category}</span>
      {data.excludedFromPlate ? (
        <span className="exp-form__preview-flag">已滤出餐盘</span>
      ) : null}
      <span className="exp-form__preview-matched">{matched}</span>
    </div>
  );
}

function emptyItem(): ExtractedExpenseItem {
  return {
    name_raw: "",
    name_zh: "",
    category_zh: "其他",
    category_raw: null,
    quantity: null,
    spec_text: null,
    food_amount_value: null,
    food_amount_unit: null,
    unit_price: null,
    discounted_unit_price: null,
    amount: null,
    confidence: 1,
    notes: null
  };
}

function num(value: string): number | null {
  if (value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function roundMoney(value: number): number {
  return Number(value.toFixed(2));
}

function quantityCount(value: string | null): number | null {
  if (!value?.trim()) return null;
  const trimmed = value.trim();
  const explicit = trimmed.match(/^[xX×]\s*(\d+(?:\.\d+)?)/);
  const fallback = trimmed.match(/^(\d+(?:\.\d+)?)/);
  const parsed = Number(explicit?.[1] ?? fallback?.[1]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function lineAmountFromUnitPrices(item: ExtractedExpenseItem, count: number | null): number | null {
  const unitPrice = item.discounted_unit_price ?? item.unit_price;
  return unitPrice !== null && count ? roundMoney(unitPrice * count) : null;
}

export function ReceiptForm({ value, onChange }: Props) {
  // Wave 3 polish (M7): <details> is now uncontrolled — we removed the
  // controlled `open` prop + React state. The previous version had both
  // `open={showAdvanced}` and `onToggle` writing to the same state, which
  // created a render loop on mobile where tapping the summary sometimes
  // toggled twice in a row.

  const itemsTotal = useMemo(() => {
    return roundMoney(value.items.reduce((sum, item) => sum + (item.amount ?? 0), 0));
  }, [value.items]);

  const lineAmountTarget = useMemo(() => {
    if (value.total_amount === null) return null;
    const tax = value.tax_amount ?? 0;
    const discount = value.discount_amount ?? 0;
    const processingFee = value.processing_fee ?? 0;
    const deliveryFee = value.delivery_fee ?? 0;
    const deliveryDiscount = value.delivery_discount ?? 0;
    return roundMoney(value.total_amount - tax - processingFee - deliveryFee + deliveryDiscount + discount);
  }, [
    value.delivery_discount,
    value.delivery_fee,
    value.discount_amount,
    value.processing_fee,
    value.tax_amount,
    value.total_amount
  ]);

  const lineAmountDiff = useMemo(() => {
    if (lineAmountTarget === null || value.items.some((item) => item.amount === null)) return null;
    return roundMoney(lineAmountTarget - itemsTotal);
  }, [itemsTotal, lineAmountTarget, value.items]);

  function update<K extends keyof ExtractedExpenseReceipt>(key: K, next: ExtractedExpenseReceipt[K]) {
    onChange({ ...value, [key]: next });
  }

  function updateItem(index: number, patch: Partial<ExtractedExpenseItem>) {
    const items = value.items.map((item, i) => (i === index ? { ...item, ...patch } : item));
    updateItems(items);
  }

  function updateItems(items: ExtractedExpenseItem[]) {
    onChange({ ...value, items });
  }

  function updateItemQuantity(index: number, quantity: string | null) {
    const item = value.items[index];
    const count = quantityCount(quantity);
    const patch: Partial<ExtractedExpenseItem> = { quantity };
    // 数量 × 单价 = 小计 是核心联动。改数量时按当前 unit_price 重算 amount。
    // amount 为 null 时也按 lineAmountFromUnitPrices 算（OCR/手动填单价后会立即拿到小计）。
    const amount = lineAmountFromUnitPrices(item, count);
    if (amount !== null) {
      patch.amount = amount;
    }
    updateItem(index, patch);
  }

  function updateItemUnitPrice(index: number, unitPrice: number | null) {
    const item = value.items[index];
    const count = quantityCount(item.quantity);
    const nextItem = { ...item, unit_price: unitPrice };
    // 改原价/单价总是按 unit_price × count 重算 amount。
    // 如果 amount 算不出（count null），保留原 amount。
    updateItem(index, {
      unit_price: unitPrice,
      amount: lineAmountFromUnitPrices(nextItem, count) ?? item.amount
    });
  }

  function updateItemDiscountedUnitPrice(index: number, discountedUnitPrice: number | null) {
    // 改优惠价不重算 amount。
    // 理由：discounted_unit_price 是"替代价"，跟 unit_price 互斥；
    // 如果 OCR 已经给了一个跟 unit_price 不同的 amount，再被重算会覆盖 user 的输入。
    updateItem(index, { discounted_unit_price: discountedUnitPrice });
  }

  function updateItemAmount(index: number, amount: number | null) {
    // 改小计不反推 unit_price 或 discounted_unit_price。
    // user 主动调整小计时，单价/优惠价应保持不变，避免覆盖之前填的字段。
    updateItem(index, { amount });
  }

  function updateItemName(index: number, name: string) {
    const item = value.items[index];
    updateItem(index, {
      name_zh: name,
      name_raw: item.name_raw.trim() ? item.name_raw : name
    });
  }

  function addItem() {
    onChange({ ...value, items: [...value.items, emptyItem()] });
  }

  function removeItem(index: number) {
    updateItems(value.items.filter((_, i) => i !== index));
  }

  function applyLineAmountDiff() {
    if (lineAmountDiff === null || Math.abs(lineAmountDiff) < 0.005) return;
    const lastIndex = value.items.findLastIndex((item) => item.amount !== null);
    if (lastIndex < 0) return;
    const item = value.items[lastIndex];
    const nextAmount = roundMoney((item.amount ?? 0) + lineAmountDiff);
    const count = quantityCount(item.quantity);
    const unitPatch =
      count && item.discounted_unit_price !== null
        ? { discounted_unit_price: roundMoney(Math.max(0, nextAmount) / count) }
        : count
          ? { unit_price: roundMoney(Math.max(0, nextAmount) / count) }
          : {};
    updateItem(lastIndex, {
      amount: Math.max(0, nextAmount),
      ...unitPatch
    });
  }

  const dateValue = useMemo(() => {
    if (!value.purchased_at) return "";
    const d = new Date(value.purchased_at);
    if (Number.isNaN(d.getTime())) return "";
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }, [value.purchased_at]);

  return (
    <div className="exp-form">
      <div className="exp-form__row">
        <label className="exp-form__field">
          <span className="exp-form__label">商家</span>
          <input
            className="exp-form__input"
            onChange={(event) => update("merchant_name", event.target.value || null)}
            placeholder="例如：星巴克"
            type="text"
            value={value.merchant_name ?? ""}
          />
        </label>
        {/* Wave 2 feature: receipt form currency field — same row as merchant. */}
        <label className="exp-form__field">
          <span className="exp-form__label">币种</span>
          <select
            className="exp-form__select"
            onChange={(event) => update("currency", event.target.value)}
            value={SUPPORTED_CURRENCIES.includes(value.currency as SupportedCurrency) ? value.currency : "CNY"}
          >
            {SUPPORTED_CURRENCIES.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        </label>
        <label className="exp-form__field">
          <span className="exp-form__label">日期</span>
          <input
            className="exp-form__input"
            onChange={(event) => {
              const v = event.target.value;
              update("purchased_at", v ? new Date(v).toISOString() : null);
            }}
            type="datetime-local"
            value={dateValue}
          />
        </label>
      </div>

      <div className="exp-form__items">
        <div className="exp-form__items-head">
          <span>数量</span>
          <span>食物量</span>
          <span>单价</span>
          <span>优惠价</span>
          <span>小计</span>
        </div>
        <div className="exp-form__items-scroll">
          {value.items.length === 0 ? (
            <div className="exp-cats__empty" style={{ padding: "12px 0" }}>
              还没有商品，点下方按钮添加
            </div>
          ) : null}
          {value.items.map((item, index) => (
          <div className="exp-form__item" key={index}>
            <div className="exp-form__item-top">
              <input
                className="exp-form__input"
                onChange={(event) => updateItemName(index, event.target.value)}
                placeholder="商品名"
                type="text"
                value={item.name_zh}
              />
              <select
                className="exp-form__select"
                onChange={(event) =>
                  updateItem(index, {
                    category_zh: event.target.value,
                    category_raw: null
                  })
                }
                value={item.category_zh}
              >
                {/*
                 * When the model's value is non-canonical, the selected option
                 * isn't in the 12 canonical entries, so the <select> would
                 * render blank. Render the raw value as a disabled placeholder
                 * option so the user sees "模型识别：'咖啡'" until they pick a
                 * canonical one. Once they pick, the raw-vs-resolved gap is
                 * closed and the placeholder disappears.
                 */}
                {item.category_raw && !categoryNames.includes(item.category_zh as never) ? (
                  <option disabled value={item.category_zh}>
                    模型识别: &lsquo;{item.category_zh}&rsquo;
                  </option>
                ) : null}
                {categoryNames.map((name) => (
                  <option key={name} value={name}>
                    {categoryEmoji(name)} {categoryLabel(name)}
                  </option>
                ))}
              </select>
              <button
                aria-label="删除商品"
                className="exp-form__remove"
                onClick={() => removeItem(index)}
                type="button"
              >
                <svg fill="none" height="16" viewBox="0 0 24 24" width="16" xmlns="http://www.w3.org/2000/svg">
                  <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m1 0v14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
                </svg>
              </button>
            </div>
            <NamePreview name={item.name_zh} />
            <div className="exp-form__item-bottom">
              <input
                className="exp-form__input"
                onChange={(event) => updateItemQuantity(index, event.target.value || null)}
                placeholder="1"
                type="text"
                value={item.quantity ?? ""}
              />
              <div className="exp-form__amount-pair">
                <input
                  className="exp-form__input"
                  onChange={(event) => updateItem(index, { food_amount_value: num(event.target.value) })}
                  placeholder="250"
                  step="0.01"
                  type="number"
                  value={item.food_amount_value ?? ""}
                />
                <input
                  className="exp-form__input"
                  onChange={(event) => updateItem(index, { food_amount_unit: event.target.value || null })}
                  placeholder="g"
                  type="text"
                  value={item.food_amount_unit ?? ""}
                />
              </div>
              <input
                className="exp-form__input"
                onChange={(event) => updateItemUnitPrice(index, num(event.target.value))}
                placeholder="原价"
                step="0.01"
                type="number"
                value={item.unit_price ?? ""}
              />
              <input
                className="exp-form__input"
                onChange={(event) => updateItemDiscountedUnitPrice(index, num(event.target.value))}
                placeholder="优惠后"
                step="0.01"
                type="number"
                value={item.discounted_unit_price ?? ""}
              />
              <input
                className="exp-form__input"
                onChange={(event) => updateItemAmount(index, num(event.target.value))}
                placeholder="0.00"
                step="0.01"
                type="number"
                value={item.amount ?? ""}
              />
            </div>
          </div>
          ))}
        </div>
        <button className="exp-form__add" onClick={addItem} type="button">
          <svg fill="none" height="14" viewBox="0 0 24 24" width="14" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 5v14M5 12h14" stroke="currentColor" strokeLinecap="round" strokeWidth="2.5" />
          </svg>
          添加商品
        </button>
      </div>

      <div className="exp-form__totals">
        <div className="exp-form__total exp-form__total--final">
          <span className="exp-form__total-label">合计</span>
          <input
            className="exp-form__input"
            onChange={(event) => update("total_amount", num(event.target.value))}
            placeholder="0.00"
            type="number"
            value={value.total_amount ?? ""}
          />
        </div>
        <div className="exp-form__total">
          <span className="exp-form__total-label">行小计合计</span>
          <span className="exp-form__total-value">{formatMoney(itemsTotal, value.currency)}</span>
        </div>
        {lineAmountTarget !== null ? (
          <div className="exp-form__total">
            <span className="exp-form__total-label">目标行合计</span>
            <span className="exp-form__total-value">{formatMoney(lineAmountTarget, value.currency)}</span>
          </div>
        ) : null}
        <div className="exp-form__total">
          <span className="exp-form__total-label">已识别置信度</span>
          <span className="exp-form__total-value">
            {value.confidence > 0 ? `${Math.round(value.confidence * 100)}%` : "—"}
          </span>
        </div>
      </div>

      {lineAmountDiff !== null && Math.abs(lineAmountDiff) >= 0.005 ? (
        <div className="exp-form__actions" style={{ justifyContent: "space-between", paddingTop: 0 }}>
          <span className="exp-card__meta">
            行小计与目标差 {formatMoney(Math.abs(lineAmountDiff), value.currency)}
          </span>
          <button className="exp-btn exp-btn--secondary exp-btn--sm" onClick={applyLineAmountDiff} type="button">
            调整到最后一项
          </button>
        </div>
      ) : null}

      <label className="exp-form__field">
        <span className="exp-form__label">备注</span>
        <textarea
          className="exp-form__textarea"
          onChange={(event) => update("user_note", event.target.value || null)}
          placeholder="选填：场景、口味、是否外卖..."
          value={value.user_note ?? ""}
        />
      </label>

      <details className="exp-form__details">
        <summary>
          <svg fill="none" height="14" viewBox="0 0 24 24" width="14" xmlns="http://www.w3.org/2000/svg">
            <path d="M6 9l6 6 6-6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
          </svg>
          金额明细（可选）
        </summary>
        <div className="exp-form__row">
          <label className="exp-form__field">
            <span className="exp-form__label">小计</span>
            <input
              className="exp-form__input"
              onChange={(event) => update("subtotal_amount", num(event.target.value))}
              type="number"
              value={value.subtotal_amount ?? ""}
            />
          </label>
          <label className="exp-form__field">
            <span className="exp-form__label">税</span>
            <input
              className="exp-form__input"
              onChange={(event) => update("tax_amount", num(event.target.value))}
              type="number"
              value={value.tax_amount ?? ""}
            />
          </label>
          <label className="exp-form__field">
            <span className="exp-form__label">服务费</span>
            <input
              className="exp-form__input"
              onChange={(event) => update("processing_fee", num(event.target.value))}
              type="number"
              value={value.processing_fee ?? ""}
            />
          </label>
          <label className="exp-form__field">
            <span className="exp-form__label">配送费</span>
            <input
              className="exp-form__input"
              onChange={(event) => update("delivery_fee", num(event.target.value))}
              type="number"
              value={value.delivery_fee ?? ""}
            />
          </label>
          <label className="exp-form__field">
            <span className="exp-form__label">配送优惠</span>
            <input
              className="exp-form__input"
              onChange={(event) => update("delivery_discount", num(event.target.value))}
              type="number"
              value={value.delivery_discount ?? ""}
            />
          </label>
          <label className="exp-form__field">
            <span className="exp-form__label">折扣</span>
            <input
              className="exp-form__input"
              onChange={(event) => update("discount_amount", num(event.target.value))}
              type="number"
              value={value.discount_amount ?? ""}
            />
          </label>
        </div>
      </details>
    </div>
  );
}
