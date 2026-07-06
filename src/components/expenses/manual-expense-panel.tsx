"use client";

import { useEffect, useMemo, useState } from "react";

import type { ExpenseCategory } from "@/lib/expenses/types";

import { categoryEmoji, categoryLabel, categoryNames } from "./category-colors";
import type { ManualExpenseInput } from "./shared/task-helpers";

type ManualExpenseItemInput = ManualExpenseInput["items"][number] & { id: string };

type ManualExpenseDraft = Omit<ManualExpenseInput, "items"> & {
  items: ManualExpenseItemInput[];
};

type Preset = {
  id: string;
  label: string;
  merchant: string;
  item: string;
  category: ExpenseCategory;
};

type Props = {
  open: boolean;
  busy: boolean;
  onClose: () => void;
  onSave: (input: ManualExpenseInput) => Promise<void> | void;
};

const presets: Preset[] = [
  { id: "taobao", label: "淘宝", merchant: "淘宝", item: "淘宝商品", category: "日用品" },
  { id: "subway", label: "地铁", merchant: "地铁", item: "地铁出行", category: "交通" },
  { id: "takeout", label: "外卖", merchant: "外卖", item: "外卖", category: "外食" },
  { id: "coffee", label: "咖啡", merchant: "咖啡店", item: "咖啡", category: "饮料/咖啡" },
  { id: "custom", label: "自定义", merchant: "手动支出", item: "支出", category: "其他" }
];

let manualItemId = 0;

function nextManualItemId() {
  manualItemId += 1;
  return `manual-item-${manualItemId}`;
}

function localDatetimeValue(date = new Date()) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function withLocalTimezoneOffset(value: string) {
  if (/[zZ]$|[+-]\d{2}:\d{2}$/.test(value)) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absOffset = Math.abs(offsetMinutes);
  const pad = (n: number) => String(n).padStart(2, "0");
  const timeWithSeconds = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) ? `${value}:00` : value;
  return `${timeWithSeconds}${sign}${pad(Math.floor(absOffset / 60))}:${pad(absOffset % 60)}`;
}

function num(value: string): number | null {
  if (value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function createManualItem(input?: Partial<ManualExpenseItemInput>): ManualExpenseItemInput {
  return {
    id: nextManualItemId(),
    item_name: input?.item_name ?? "支出",
    category_zh: input?.category_zh ?? "其他",
    quantity: input?.quantity ?? "1",
    amount: input?.amount ?? null,
    notes: input?.notes ?? null
  };
}

function initialDraft(): ManualExpenseDraft {
  return {
    merchant_name: "手动支出",
    purchased_at: localDatetimeValue(),
    items: [createManualItem()],
    notes: null,
    currency: "CNY",
    excludedFromBudget: false
  };
}

export function ManualExpensePanel({ open, busy, onClose, onSave }: Props) {
  const [draft, setDraft] = useState<ManualExpenseDraft>(() => initialDraft());
  const [presetId, setPresetId] = useState("custom");

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);

  useEffect(() => {
    if (open) setDraft((current) => ({ ...current, purchased_at: current.purchased_at || localDatetimeValue() }));
    // Wave 3 polish (M3): by design this only sets purchased_at when the
    // stored value is empty. Closing the panel does NOT reset the field, so
    // the user's last-entered time survives across sessions. Resetting would
    // surprise users who batch-enter back-dated expenses.
  }, [open]);

  const canSave = useMemo(() => {
    return Boolean(
      draft.merchant_name.trim() &&
        draft.purchased_at &&
        draft.items.length > 0 &&
        draft.items.every((item) => item.item_name.trim() && item.amount !== null)
    );
  }, [draft]);

  const totalAmount = useMemo(() => {
    return draft.items.reduce((sum, item) => sum + (item.amount ?? 0), 0);
  }, [draft.items]);

  function applyPreset(preset: Preset) {
    setPresetId(preset.id);
    setDraft((current) => ({
      ...current,
      merchant_name: preset.merchant,
      items: [
        {
          ...(current.items[0] ?? createManualItem()),
          item_name: preset.item,
          category_zh: preset.category
        }
      ]
    }));
  }

  function updateItem(id: string, patch: Partial<ManualExpenseItemInput>) {
    setDraft((current) => ({
      ...current,
      items: current.items.map((item) => (item.id === id ? { ...item, ...patch } : item))
    }));
  }

  function addItem() {
    setPresetId("custom");
    setDraft((current) => ({
      ...current,
      items: [...current.items, createManualItem({ item_name: "", category_zh: current.items.at(-1)?.category_zh ?? "其他" })]
    }));
  }

  function removeItem(id: string) {
    setPresetId("custom");
    setDraft((current) => {
      if (current.items.length <= 1) return current;
      return { ...current, items: current.items.filter((item) => item.id !== id) };
    });
  }

  async function save() {
    if (!canSave) return;
    await onSave({
      ...draft,
      merchant_name: draft.merchant_name.trim(),
      items: draft.items.map((item) => ({
        item_name: item.item_name.trim(),
        category_zh: item.category_zh,
        quantity: item.quantity?.trim() ? item.quantity.trim() : "1",
        amount: item.amount,
        notes: item.notes?.trim() ? item.notes.trim() : null
      })),
      purchased_at: withLocalTimezoneOffset(draft.purchased_at),
      currency: draft.currency ?? "CNY"
    });
    setDraft(initialDraft());
    setPresetId("custom");
  }

  if (!open) return null;

  // Set --exp-drawer-width so the .exp-card__backdrop (a sibling fixed element)
  // can size itself to the manual drawer width (560px) instead of the default
  // 820px used by receipt/transaction edit drawers. This prevents a 260px gap
  // in the backdrop that would otherwise let clicks fall through to the page.
  const drawerScopeStyle = { "--exp-drawer-width": "min(560px, calc(100vw - 36px))" } as Record<string, string>;

  return (
    <div className="exp-card__drawer-scope" style={drawerScopeStyle}>
      <button aria-label="关闭手动支出" className="exp-card__backdrop" onClick={onClose} type="button" />
      <aside className="exp-manual" aria-label="手动记一笔">
        <div className="exp-manual__head">
          <div>
            <div className="exp-section-title" style={{ marginBottom: 6 }}>
              <span aria-hidden>✍️</span>
              手动记一笔
            </div>
            <p className="exp-manual__hint">适合淘宝、地铁、外卖和其他没有票据的支出。</p>
          </div>
          <button aria-label="关闭" className="exp-card__expand" onClick={onClose} type="button">
            <svg fill="none" height="15" viewBox="0 0 24 24" width="15" xmlns="http://www.w3.org/2000/svg">
              <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
            </svg>
          </button>
        </div>

        <div className="exp-manual__body">
          <div className="exp-manual__presets">
            {presets.map((preset) => (
              <button
                className={preset.id === presetId ? "exp-chip exp-chip--active" : "exp-chip"}
                key={preset.id}
                onClick={() => applyPreset(preset)}
                type="button"
              >
                {preset.label}
              </button>
            ))}
          </div>

          <div className="exp-manual__total">
            <span className="exp-form__label">总金额</span>
            <strong>
              {new Intl.NumberFormat("zh-CN", {
                currency: draft.currency,
                style: "currency"
              }).format(totalAmount)}
            </strong>
          </div>

          <label className="exp-form__field exp-manual__exclude">
            <input
              checked={Boolean(draft.excludedFromBudget)}
              onChange={(event) =>
                setDraft((current) => ({ ...current, excludedFromBudget: event.target.checked }))
              }
              type="checkbox"
            />
            <span className="exp-form__label">不计入预算</span>
          </label>

          <div className="exp-manual__items">
            <div className="exp-manual__items-head">
              <span>商品明细</span>
              <button className="exp-form__add" onClick={addItem} type="button">
                <svg fill="none" height="14" viewBox="0 0 24 24" width="14" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 5v14M5 12h14" stroke="currentColor" strokeLinecap="round" strokeWidth="2.5" />
                </svg>
                添加商品
              </button>
            </div>
            {draft.items.map((item, index) => (
              <div className="exp-manual__item" key={item.id}>
                <div className="exp-manual__item-title">
                  <span>#{index + 1}</span>
                  <button
                    aria-label="删除商品"
                    className="exp-form__remove"
                    disabled={draft.items.length <= 1}
                    onClick={() => removeItem(item.id)}
                    type="button"
                  >
                    <svg fill="none" height="16" viewBox="0 0 24 24" width="16" xmlns="http://www.w3.org/2000/svg">
                      <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m1 0v14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
                    </svg>
                  </button>
                </div>
                <label className="exp-form__field">
                  <span className="exp-form__label">名称</span>
                  <input
                    autoFocus={index === 0}
                    className="exp-form__input"
                    onChange={(event) => updateItem(item.id, { item_name: event.target.value })}
                    placeholder="例如：手机壳、地铁、午餐"
                    type="text"
                    value={item.item_name}
                  />
                </label>
                <div className="exp-manual__item-row">
                  <label className="exp-form__field">
                    <span className="exp-form__label">分类</span>
                    <select
                      className="exp-form__select"
                      onChange={(event) => updateItem(item.id, { category_zh: event.target.value as ExpenseCategory })}
                      value={item.category_zh}
                    >
                      {categoryNames.map((name) => (
                        <option key={name} value={name}>
                          {categoryEmoji(name)} {categoryLabel(name)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="exp-form__field">
                    <span className="exp-form__label">数量</span>
                    <input
                      className="exp-form__input"
                      onChange={(event) => updateItem(item.id, { quantity: event.target.value })}
                      placeholder="1"
                      type="text"
                      value={item.quantity ?? ""}
                    />
                  </label>
                  <label className="exp-form__field">
                    <span className="exp-form__label">小计</span>
                    <input
                      className="exp-form__input"
                      inputMode="decimal"
                      onChange={(event) => updateItem(item.id, { amount: num(event.target.value) })}
                      placeholder="0.00"
                      step="0.01"
                      type="number"
                      value={item.amount ?? ""}
                    />
                  </label>
                </div>
              </div>
            ))}
          </div>

          <div className="exp-form__row">
            <label className="exp-form__field">
              <span className="exp-form__label">商家 / 渠道</span>
              <input
                className="exp-form__input"
                onChange={(event) => setDraft((current) => ({ ...current, merchant_name: event.target.value }))}
                placeholder="例如：淘宝、上海地铁、美团外卖"
                type="text"
                value={draft.merchant_name}
              />
            </label>
            <label className="exp-form__field">
              <span className="exp-form__label">时间</span>
              <input
                className="exp-form__input"
                onChange={(event) => setDraft((current) => ({ ...current, purchased_at: event.target.value }))}
                type="datetime-local"
                value={draft.purchased_at}
              />
            </label>
          </div>

          <label className="exp-form__field">
            <span className="exp-form__label">备注</span>
            <textarea
              className="exp-form__textarea"
              onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value || null }))}
              placeholder="选填：订单号、用途、和谁一起..."
              value={draft.notes ?? ""}
            />
          </label>
        </div>

        <div className="exp-form__actions">
          <button className="exp-btn exp-btn--secondary" onClick={onClose} type="button">
            取消
          </button>
          <button className="exp-btn exp-btn--primary" disabled={!canSave || busy} onClick={() => void save()} type="button">
            {busy ? "保存中..." : "保存入账"}
          </button>
        </div>
      </aside>
    </div>
  );
}
