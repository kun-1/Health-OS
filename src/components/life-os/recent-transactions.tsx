import { categoryColor, categoryLabel } from "@/components/expenses/category-colors";
import type { ExpenseTransaction } from "@/lib/expenses/types";

import "./life-os.css";

type Props = {
  transactions: ReadonlyArray<
    ExpenseTransaction & {
      formatted_total: string;
      formatted_subtotal: string | null;
    }
  >;
  currency: string;
  maxItems?: number;
};

/** Compact recent-transactions list for the home sidebar.
 *
 * Shows merchant name + amount on one line, category as a small colored
 * dot + label. Defaults to the latest 3 items. */
export function RecentTransactions({ transactions, currency, maxItems = 3 }: Props) {
  const items = transactions.slice(0, maxItems);
  return (
    <section className="life-card life-recent">
      <header className="life-card__header">
        <span className="life-card__title">最近交易</span>
        <span className="life-recent__meta">
          {currency} · 最新 {items.length} 条
        </span>
      </header>
      {items.length === 0 ? (
        <div className="life-recent__empty">本月还没有交易记录</div>
      ) : (
        <ul className="life-recent__list">
          {items.map((tx) => {
            const category = tx.items[0]?.category_zh ?? "其他";
            const color = categoryColor(category);
            return (
              <li className="life-recent__item" key={tx.id}>
                <div className="life-recent__left">
                  <span className="life-recent__merchant" title={tx.merchant_name}>
                    {tx.merchant_name}
                  </span>
                  <span className="life-recent__category">
                    <i style={{ background: color }} aria-hidden />
                    {categoryLabel(category)}
                  </span>
                </div>
                <span className="life-recent__amount">{tx.formatted_total}</span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
