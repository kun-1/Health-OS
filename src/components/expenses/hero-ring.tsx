"use client";

import { formatMoney } from "@/lib/expenses/money";

type Props = {
  spent: number;
  budget: number;
  currency: string;
  daysRemaining: number;
  dailyBudget: number;
  projectedOverBudget: boolean;
  projectedMonthEnd: number;
};

export function HeroRing({ spent, budget, currency, daysRemaining, dailyBudget, projectedOverBudget, projectedMonthEnd }: Props) {
  const ratio = budget > 0 ? Math.min(1.4, spent / budget) : 0;
  const visibleRatio = Math.min(1, ratio);
  const size = 220;
  const stroke = 16;
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
          <span className="exp-ring__sub">
            / <strong>{formatMoney(budget, currency)}</strong> 预算 · {percentLabel}%
          </span>
        </div>
      </div>

      <div className="exp-hero__meta">
        <span className="exp-hero__meta-pill">
          <span aria-hidden>📅</span>
          剩 <strong>{daysRemaining}</strong> 天
        </span>
        <span className="exp-hero__meta-pill">
          <span aria-hidden>☕</span>
          每天可花 <strong>{formatMoney(dailyBudget, currency)}</strong>
        </span>
      </div>

      {projectedOverBudget ? (
        <div className="exp-hero__warn" role="status">
          <span aria-hidden>⚠️</span>
          按当前节奏月底预计 {formatMoney(projectedMonthEnd, currency)}，会超预算
        </div>
      ) : null}
    </div>
  );
}
