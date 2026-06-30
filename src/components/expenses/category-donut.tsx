import { formatMoney, fromCents } from "@/lib/expenses/money";
import type { ExpenseAnalytics } from "@/lib/expenses/types";

import { categoryColor, categoryLabel } from "./category-colors";

type Props = {
  categoryBreakdown: ExpenseAnalytics["category_breakdown"];
  currency: string;
  otherCurrenciesText: string;
};

type Row = { category_zh: string; amount: number; isAggregate?: boolean };

const MAX_ROWS = 6;
const SVG_WIDTH = 720;
const ROW_HEIGHT = 38;
const TOP_OFFSET = 10;

export function CategoryDonut({ categoryBreakdown, currency, otherCurrenciesText }: Props) {
  const visible = categoryBreakdown
    .map((entry) => ({ category_zh: entry.category_zh, amount: fromCents(entry.amount) }))
    .filter((entry) => entry.amount > 0)
    .sort((a, b) => b.amount - a.amount);

  const total = visible.reduce((sum, c) => sum + c.amount, 0);

  let rows: Row[];
  if (visible.length <= MAX_ROWS) {
    rows = visible;
  } else {
    const top = visible.slice(0, MAX_ROWS - 1);
    const rest = visible.slice(MAX_ROWS - 1);
    const restAmount = rest.reduce((sum, c) => sum + c.amount, 0);
    rows = [...top, { category_zh: "其他", amount: restAmount, isAggregate: true }];
  }

  return (
    <div className="exp-cats">
      <h2 className="exp-section-title">
        分类构成 · {currency}
        <span className="exp-section-title__count">{rows.length}</span>
      </h2>

      {rows.length === 0 ? (
        <div className="exp-cats__empty">这个月还没有{currency}消费分类数据</div>
      ) : (
        <CategoryBarSvg currency={currency} rows={rows} total={total} />
      )}

      {otherCurrenciesText ? (
        <div className="exp-card__meta">{otherCurrenciesText} 未分类展示</div>
      ) : null}
    </div>
  );
}

function CategoryBarSvg({ rows, total, currency }: { rows: Row[]; total: number; currency: string }) {
  const height = TOP_OFFSET * 2 + rows.length * ROW_HEIGHT;

  return (
    <svg
      aria-label="分类支出横向条形图"
      className="exp-category-svg"
      role="img"
      viewBox={`0 0 ${SVG_WIDTH} ${height}`}
    >
      {rows.map((row, index) => {
        const percentage = total > 0 ? (row.amount / total) * 100 : 0;
        const y = TOP_OFFSET + index * ROW_HEIGHT;
        const cy = y + ROW_HEIGHT / 2;
        const color = row.isAggregate ? "var(--exp-text-muted)" : categoryColor(row.category_zh);
        const name = row.isAggregate ? "其他" : categoryLabel(row.category_zh);
        const barWidth = Math.max(4, Math.round((percentage / 100) * 190));

        // Wave 4 fix: when the real "其他" category is in the top 5, the
        // aggregate row (also labelled "其他") would collide on key. Use a
        // sentinel for the aggregate — the display label still shows
        // "其他" via the `name` variable above. Sentinels can't collide
        // with a real OCR category because those are constrained to the
        // expenseCategories whitelist.
        const key = row.isAggregate ? "__aggregate__" : row.category_zh;

        return (
          <g key={key}>
            <rect fill={color} height="12" rx="3" width="12" x="0" y={cy - 6} />
            <text className="exp-category-svg__name" x="24" y={cy}>
              {name}
            </text>
            <rect fill="var(--exp-surface-3)" height="4" rx="2" width="190" x="156" y={cy - 2} />
            <rect fill={color} height="4" rx="2" width={barWidth} x="156" y={cy - 2} />
            <line className="exp-category-svg__rule" x1="362" x2="500" y1={cy} y2={cy} />
            <text className="exp-category-svg__amount" textAnchor="end" x="620" y={cy}>
              {formatMoney(row.amount, currency)}
            </text>
            <text className="exp-category-svg__pct" textAnchor="end" x="720" y={cy}>
              {Math.round(percentage)}%
            </text>
          </g>
        );
      })}
    </svg>
  );
}
