"use client";

import { useEffect, useState } from "react";

import { formatMoney, fromCents } from "@/lib/expenses/money";

import { categoryColor, categoryEmoji, categoryLabel } from "./category-colors";

type BreakdownEntry = { category_zh: string; amount: number; currency: string };

type Props = {
  categoryBreakdown: BreakdownEntry[];
  spentThisMonth: number; // yuan
  currency: string;
};

const VISIBLE_LIMIT = 5;

export function CategoryProgress({ categoryBreakdown, spentThisMonth, currency }: Props) {
  const [showAll, setShowAll] = useState(false);
  // Safari ≤15 doesn't interpolate CSS custom properties inside @keyframes,
  // so we drive the bar width with a real % value + a transition. The bar
  // starts at 0% (via CSS) and animates to the real % once the component has
  // mounted on the client. Keeping the initial render at 0% also avoids any
  // chance of a flash-of-full-bar before hydration.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  // Total of breakdown entries — this is the sum of category_zh amounts in
  // the primary currency (already filtered to budget-included). Used for
  // percentage bars so the longest bar reaches 100% within the breakdown.
  const rowsInUnits = categoryBreakdown.map((entry) => ({
    ...entry,
    amount: fromCents(entry.amount)
  }));
  const breakdownTotal = rowsInUnits.reduce((sum, entry) => sum + entry.amount, 0);

  const sortedBreakdown = [...rowsInUnits].sort((a, b) => b.amount - a.amount);
  const visible = sortedBreakdown.slice(0, VISIBLE_LIMIT);
  const hidden = sortedBreakdown.slice(VISIBLE_LIMIT);
  const rows = showAll ? sortedBreakdown : visible;

  if (rows.length === 0) {
    return (
      <div className="exp-cat-progress">
        <div className="exp-cat-progress__head">
          <h3 className="exp-cat-progress__title">分类消费</h3>
          <span className="exp-cat-progress__total">{formatMoney(0, currency)}</span>
        </div>
        <div style={{ fontSize: 13, color: "var(--exp-text-muted)" }}>本月暂无分类消费</div>
      </div>
    );
  }

  return (
    <div className="exp-cat-progress">
      <div className="exp-cat-progress__head">
        <h3 className="exp-cat-progress__title">分类消费</h3>
        <span className="exp-cat-progress__total">{formatMoney(spentThisMonth, currency)}</span>
      </div>
      {rows.map((entry, i) => {
        const color = categoryColor(entry.category_zh);
        const emoji = categoryEmoji(entry.category_zh);
        const label = categoryLabel(entry.category_zh);
        const pct = breakdownTotal > 0 ? Math.round((entry.amount / breakdownTotal) * 100) : 0;
        return (
          <div className="exp-cat-progress__row" key={entry.category_zh}>
            <span className="exp-cat-progress__emoji" aria-hidden>
              {emoji}
            </span>
            <span className="exp-cat-progress__name" title={label}>
              {label}
            </span>
            <div className="exp-cat-progress__track">
              <div
                className="exp-cat-progress__fill"
                style={{
                  background: color,
                  width: mounted ? `${pct}%` : "0%",
                  transitionDelay: `${i * 60}ms`
                }}
              />
            </div>
            <span className="exp-cat-progress__amount">{formatMoney(entry.amount, currency)}</span>
            <span className="exp-cat-progress__pct">{pct}%</span>
          </div>
        );
      })}
      {hidden.length > 0 ? (
        <button
          className="exp-cat-progress__other"
          onClick={() => setShowAll((v) => !v)}
          type="button"
        >
          {showAll ? "收起" : `其他 ${hidden.length} 类`}
        </button>
      ) : null}
    </div>
  );
}
