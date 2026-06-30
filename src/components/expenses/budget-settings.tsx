"use client";

import { useEffect, useRef, useState } from "react";

import {
  addStoredBudgetTopUp,
  DEFAULT_PRIMARY_CURRENCY,
  SUPPORTED_CURRENCIES,
  deleteStoredBudgetTopUp,
  getStoredBudgetCents,
  getStoredPrimaryCurrency,
  getStoredBudgetTopUps,
  setStoredBudgetCents,
  setStoredPrimaryCurrency,
  type BudgetTopUp,
  type SupportedCurrency
} from "@/lib/expenses/settings";

type Props = {
  month: string;
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

export function BudgetSettings({ month, onSaved }: Props) {
  const [open, setOpen] = useState(false);
  const [budgetYuan, setBudgetYuan] = useState("");
  const [topUpYuan, setTopUpYuan] = useState("");
  const [topUpNote, setTopUpNote] = useState("");
  const [topUps, setTopUps] = useState<BudgetTopUp[]>([]);
  const [currency, setCurrency] = useState<SupportedCurrency>(DEFAULT_PRIMARY_CURRENCY);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  // Wave 2 feature: budget settings — read the current localStorage values
  // when the popover opens, so the user sees the active budget not a blank
  // form.
  useEffect(() => {
    if (!open) return;
    setBudgetYuan(centsToYuanString(getStoredBudgetCents()));
    setCurrency(getStoredPrimaryCurrency());
    setTopUps(month ? getStoredBudgetTopUps(month) : []);
  }, [month, open]);

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
    // Reject negative / zero / NaN inputs instead of silently falling back to
    // the default. The min="0" on the input is a soft hint that the browser
    // only enforces when step + form validation runs — JS still needs to
    // validate, otherwise typing -50 then clicking Save writes a negative
    // budget and breaks every KPI.
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setBudgetYuan(centsToYuanString(getStoredBudgetCents()));
      return;
    }
    setStoredBudgetCents(yuanToCents(parsed));
    setStoredPrimaryCurrency(currency);
    setOpen(false);
    onSaved();
  }

  function addTopUp() {
    if (!month) return;
    const parsed = Number(topUpYuan);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setTopUpYuan("");
      return;
    }
    addStoredBudgetTopUp({
      month,
      amountCents: yuanToCents(parsed),
      note: topUpNote
    });
    setTopUpYuan("");
    setTopUpNote("");
    setTopUps(getStoredBudgetTopUps(month));
    onSaved();
  }

  function deleteTopUp(id: string) {
    deleteStoredBudgetTopUp(id);
    setTopUps(month ? getStoredBudgetTopUps(month) : []);
    onSaved();
  }

  const topUpTotal = topUps.reduce((sum, entry) => sum + entry.amountCents, 0);

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
            <span className="exp-form__label">基础月预算</span>
            <input
              autoFocus
              className="exp-form__input"
              inputMode="decimal"
              min="0"
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
          <div className="exp-budget-pop__section">
            <div className="exp-budget-pop__subtitle">
              <span>本月补给</span>
              <strong>{centsToYuanString(topUpTotal)}</strong>
            </div>
            <div className="exp-budget-pop__row">
              <input
                className="exp-form__input"
                disabled={!month}
                inputMode="decimal"
                min="0"
                onChange={(event) => setTopUpYuan(event.target.value)}
                placeholder="加多少钱"
                step="0.01"
                type="number"
                value={topUpYuan}
              />
              <button className="exp-btn exp-btn--secondary exp-btn--sm" disabled={!month} onClick={addTopUp} type="button">
                加钱
              </button>
            </div>
            <input
              className="exp-form__input"
              disabled={!month}
              onChange={(event) => setTopUpNote(event.target.value)}
              placeholder="备注，可选"
              type="text"
              value={topUpNote}
            />
            {topUps.length > 0 ? (
              <div className="exp-budget-pop__topups">
                {topUps.map((entry) => (
                  <div className="exp-budget-pop__topup" key={entry.id}>
                    <div>
                      <strong>+{centsToYuanString(entry.amountCents)}</strong>
                      {entry.note ? <span>{entry.note}</span> : null}
                    </div>
                    <button
                      aria-label="删除补给"
                      className="exp-budget-pop__delete"
                      onClick={() => deleteTopUp(entry.id)}
                      type="button"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="exp-budget-pop__empty">本月还没有补给记录</div>
            )}
          </div>
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
