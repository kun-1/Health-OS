"use client";

import { formatMoney, fromCents } from "@/lib/expenses/money";

type Props = {
  spent: number;
  budget: number;
  currency: string;
  daysRemaining: number;
  dailyBudget: number;
  projectedOverBudget: boolean;
  projectedMonthEnd: number;
  // Wave 1 cleanup: non-primary currencies present in the month, so we can
  // show a muted "另有 $X USD 未计入预算" line under the ring.
  otherCurrencies: { currency: string; cents: number }[];
};

export function HeroRing({
  spent,
  budget,
  currency,
  projectedOverBudget,
  projectedMonthEnd,
  otherCurrencies
}: Props) {
  const ratio = budget > 0 ? Math.min(1.4, spent / budget) : 0;
  const visibleRatio = Math.min(1, ratio);
  const size = 200;
  const stroke = 10;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const dash = circumference * visibleRatio;

  const isOver = ratio > 1;
  const isWarn = ratio >= 0.8 && ratio <= 1;
  const ringColor = isOver ? "var(--exp-danger)" : isWarn ? "var(--exp-warn)" : "var(--exp-accent)";

  const percentLabel = budget > 0 ? Math.round((spent / budget) * 100) : 0;

  return (
    <div className="exp-hero">
      <div className="exp-ring" style={{ width: size, height: size }}>
        <svg className="exp-ring__svg" height={size} viewBox={`0 0 ${size} ${size}`} width={size}>
          <circle
            cx={size / 2}
            cy={size / 2}
            fill="none"
            r={radius}
            stroke="var(--exp-ring-track)"
            strokeLinecap="round"
            strokeWidth={stroke}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            fill="none"
            r={radius}
            stroke={ringColor}
            strokeDasharray={`${dash} ${circumference}`}
            strokeLinecap="round"
            strokeWidth={stroke}
            style={{ transition: "stroke-dasharray 600ms cubic-bezier(.2,.8,.2,1), stroke 200ms ease" }}
          />
        </svg>
        <div className="exp-ring__center">
          <span className="exp-ring__label">本月已花</span>
          <span className="exp-ring__value">{formatMoney(spent, currency)}</span>
          <span className="exp-ring__sub">{percentLabel}%</span>
        </div>
      </div>

      {otherCurrencies.length > 0 ? (
        <div className="exp-card__meta">
          另有
          {" "}
          {otherCurrencies.map((entry) => formatMoney(fromCents(entry.cents), entry.currency)).join(" / ")}
          {" "}未计入预算
        </div>
      ) : null}

      {projectedOverBudget ? (
        <div className="exp-hero__warn" role="status">
          预算 {formatMoney(budget, currency)}，按当前节奏月底预计 {formatMoney(projectedMonthEnd, currency)}
        </div>
      ) : null}
    </div>
  );
}
