"use client";

import { useEffect, useRef, useState } from "react";

import {
  DEFAULT_PRIMARY_CURRENCY,
  SUPPORTED_CURRENCIES,
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

type BudgetResponse = {
  baseBudgetCents: number;
  primaryCurrency: SupportedCurrency;
  topUps: BudgetTopUp[];
};

export function BudgetSettings({ month, onSaved }: Props) {
  const [open, setOpen] = useState(false);
  const [budgetYuan, setBudgetYuan] = useState("");
  const [topUpYuan, setTopUpYuan] = useState("");
  const [topUpNote, setTopUpNote] = useState("");
  const [topUps, setTopUps] = useState<BudgetTopUp[]>([]);
  const [currency, setCurrency] = useState<SupportedCurrency>(DEFAULT_PRIMARY_CURRENCY);
  const [busy, setBusy] = useState(false);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setBusy(true);
    fetch(`/api/expenses/budget?month=${encodeURIComponent(month)}`)
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return (await response.json()) as BudgetResponse;
      })
      .then((data) => {
        if (cancelled) return;
        setBudgetYuan(centsToYuanString(data.baseBudgetCents));
        setCurrency(data.primaryCurrency);
        setTopUps(data.topUps);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
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

  async function save() {
    const parsed = Number(budgetYuan);
    // Reject negative / zero / NaN inputs instead of silently falling back to
    // the default. The min="0" on the input is a soft hint that the browser
    // only enforces when step + form validation runs — JS still needs to
    // validate, otherwise typing -50 then clicking Save writes a negative
    // budget and breaks every KPI.
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/expenses/budget", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          month,
          baseBudgetCents: yuanToCents(parsed),
          primaryCurrency: currency
        })
      });
      if (!response.ok) return;
      const data = (await response.json()) as BudgetResponse;
      setBudgetYuan(centsToYuanString(data.baseBudgetCents));
      setCurrency(data.primaryCurrency);
      setTopUps(data.topUps);
      setOpen(false);
      onSaved();
    } finally {
      setBusy(false);
    }
  }

  async function addTopUp() {
    if (!month) return;
    const parsed = Number(topUpYuan);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setTopUpYuan("");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/expenses/budget", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          month,
          amountCents: yuanToCents(parsed),
          note: topUpNote
        })
      });
      if (!response.ok) return;
      const data = (await response.json()) as BudgetResponse;
      setTopUps(data.topUps);
      setTopUpYuan("");
      setTopUpNote("");
      onSaved();
    } finally {
      setBusy(false);
    }
  }

  async function deleteTopUp(id: string) {
    setBusy(true);
    try {
      const response = await fetch(
        `/api/expenses/budget?id=${encodeURIComponent(id)}&month=${encodeURIComponent(month)}`,
        { method: "DELETE" }
      );
      if (!response.ok) return;
      const data = (await response.json()) as BudgetResponse;
      setTopUps(data.topUps);
      onSaved();
    } finally {
      setBusy(false);
    }
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
              <button className="exp-btn exp-btn--secondary exp-btn--sm" disabled={!month || busy} onClick={() => void addTopUp()} type="button">
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
                      disabled={busy}
                      onClick={() => void deleteTopUp(entry.id)}
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
            <button className="exp-btn exp-btn--primary exp-btn--sm" disabled={busy} onClick={() => void save()} type="button">
              {busy ? "保存中..." : "保存"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
