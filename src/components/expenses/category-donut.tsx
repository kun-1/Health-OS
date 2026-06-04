"use client";

import { formatMoney } from "@/lib/expenses/money";
import type { ExpenseAnalytics } from "@/lib/expenses/types";

import { categoryColor, categoryEmoji, categoryLabel } from "./category-colors";

type Props = {
  categoryTotals: ExpenseAnalytics["category_totals"];
  currency: string;
};

const SIZE = 220;
const R_OUTER = 100;
const R_INNER = 66;
const GAP_DEG = 1.5;

function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function donutPath(startAngle: number, endAngle: number) {
  const cx = SIZE / 2;
  const cy = SIZE / 2;
  const span = endAngle - startAngle;
  if (span >= 359.999) {
    return (
      `M ${cx} ${cy - R_OUTER} ` +
      `A ${R_OUTER} ${R_OUTER} 0 1 1 ${cx - 0.01} ${cy - R_OUTER} ` +
      `M ${cx} ${cy - R_INNER} ` +
      `A ${R_INNER} ${R_INNER} 0 1 0 ${cx - 0.01} ${cy - R_INNER}`
    );
  }
  const outerStart = polar(cx, cy, R_OUTER, startAngle);
  const outerEnd = polar(cx, cy, R_OUTER, endAngle);
  const innerEnd = polar(cx, cy, R_INNER, endAngle);
  const innerStart = polar(cx, cy, R_INNER, startAngle);
  const largeArc = span > 180 ? 1 : 0;
  return (
    `M ${outerStart.x} ${outerStart.y} ` +
    `A ${R_OUTER} ${R_OUTER} 0 ${largeArc} 1 ${outerEnd.x} ${outerEnd.y} ` +
    `L ${innerEnd.x} ${innerEnd.y} ` +
    `A ${R_INNER} ${R_INNER} 0 ${largeArc} 0 ${innerStart.x} ${innerStart.y} Z`
  );
}

export function CategoryDonut({ categoryTotals, currency }: Props) {
  const visible = categoryTotals.filter((c) => c.amount > 0);
  const total = visible.reduce((sum, c) => sum + c.amount, 0);

  const segments: { start: number; end: number; color: string }[] = [];
  if (total > 0 && visible.length > 0) {
    let acc = 0;
    for (const item of visible) {
      const span = (item.amount / total) * 360;
      segments.push({
        start: acc + GAP_DEG / 2,
        end: acc + span - GAP_DEG / 2,
        color: categoryColor(item.category_zh)
      });
      acc += span;
    }
  }

  const top = visible[0];

  return (
    <div className="exp-cats">
      <h2 className="exp-section-title">
        <span aria-hidden>🗂️</span>
        分类构成
        <span className="exp-section-title__count">{visible.length}</span>
      </h2>

      {visible.length === 0 ? (
        <div className="exp-cats__empty">这个月还没有消费分类数据</div>
      ) : (
        <div className="exp-donut-row">
          <div className="exp-donut">
            <svg className="exp-donut__svg" height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} width={SIZE}>
              {segments.map((seg, i) => (
                <path d={donutPath(seg.start, seg.end)} fill={seg.color} key={i} />
              ))}
            </svg>
            <div className="exp-donut__center">
              {top ? (
                <>
                  <span className="exp-donut__label">最大分类</span>
                  <span className="exp-donut__sub" style={{ marginTop: 2 }}>
                    <span aria-hidden style={{ marginRight: 4 }}>
                      {categoryEmoji(top.category_zh)}
                    </span>
                    {categoryLabel(top.category_zh)}
                  </span>
                  <span className="exp-donut__value">
                    {Math.round((top.amount / total) * 100)}
                    <span className="exp-donut__value-unit">%</span>
                  </span>
                </>
              ) : null}
            </div>
          </div>

          <div className="exp-legend">
            {visible.map((item) => {
              const pct = total > 0 ? Math.round((item.amount / total) * 100) : 0;
              return (
                <div className="exp-legend__item" key={item.category_zh}>
                  <div className="exp-legend__name">
                    <span className="exp-legend__dot" style={{ background: categoryColor(item.category_zh) }} />
                    <span aria-hidden>{categoryEmoji(item.category_zh)}</span>
                    <span>{categoryLabel(item.category_zh)}</span>
                  </div>
                  <span className="exp-legend__amount">
                    {formatMoney(item.amount, currency)}
                    <span className="exp-legend__pct">· {pct}%</span>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
