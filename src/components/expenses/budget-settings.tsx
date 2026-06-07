"use client";

import { useEffect, useRef, useState } from "react";

import {
  DEFAULT_BUDGET_CENTS,
  DEFAULT_PRIMARY_CURRENCY,
  SUPPORTED_CURRENCIES,
  getStoredBudgetCents,
  getStoredPrimaryCurrency,
  setStoredBudgetCents,
  setStoredPrimaryCurrency,
  type SupportedCurrency
} from "@/lib/expenses/settings";

type Props = {
  // Wave 2 feature: budget settings — fired after Save so the parent can
  // re-fetch analytics with the new overrides.
  onSaved: () => void;
};

function yuanToCents(yuan: number): number {
  return Math.round(yuan * 100);
}

function centsToYuanString(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function BudgetSettings({ onSaved }: Props) {
  const [open, setOpen] = useState(false);
  const [budgetYuan, setBudgetYuan] = useState("");
  const [currency, setCurrency] = useState<SupportedCurrency>(DEFAULT_PRIMARY_CURRENCY);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  // Wave 2 feature: budget settings — read the current localStorage values
  // when the popover opens, so the user sees the active budget not a blank
  // form.
  useEffect(() => {
    if (!open) return;
    setBudgetYuan(centsToYuanString(getStoredBudgetCents()));
    setCurrency(getStoredPrimaryCurrency());
  }, [open]);

  // Click-outside to close.
  useEffect(() => {
    if (!open) return;
    function onClick(event: MouseEvent) {
      if (!popoverRef.current) return;
      if (!popoverRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  function save() {
    const parsed = Number(budgetYuan);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      // Fall back to default if the input is invalid.
      setStoredBudgetCents(DEFAULT_BUDGET_CENTS);
    } else {
      setStoredBudgetCents(yuanToCents(parsed));
    }
    setStoredPrimaryCurrency(currency);
    setOpen(false);
    onSaved();
  }

  return (
    <div style={{ position: "relative" }}>
      <button
        className="exp-btn exp-btn--secondary exp-btn--sm"
        onClick={() => setOpen((v) => !v)}
        type="button"
      >
        <span aria-hidden>⚙</span>
        预算
      </button>
      {open ? (
        <div
          ref={popoverRef}
          className="exp-budget-pop"
          role="dialog"
          aria-label="预算设置"
        >
          <div className="exp-budget-pop__title">预算设置</div>
          <label className="exp-form__field">
            <span className="exp-form__label">月度预算</span>
            <input
              autoFocus
              className="exp-form__input"
              inputMode="decimal"
              onChange={(event) => setBudgetYuan(event.target.value)}
              placeholder="2000.00"
              step="0.01"
              type="number"
              value={budgetYuan}
            />
          </label>
          <label className="exp-form__field">
            <span className="exp-form__label">主币种</span>
            <select
              className="exp-form__select"
              onChange={(event) => setCurrency(event.target.value as SupportedCurrency)}
              value={currency}
            >
              {SUPPORTED_CURRENCIES.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </label>
          <div className="exp-budget-pop__actions">
            <button className="exp-btn exp-btn--ghost exp-btn--sm" onClick={() => setOpen(false)} type="button">
              取消
            </button>
            <button className="exp-btn exp-btn--primary exp-btn--sm" onClick={save} type="button">
              保存
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
