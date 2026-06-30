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
};

const MAX_ITEMS = 6;

/** Transaction itself doesn't carry category_zh; the category lives on the
 *  first item (per the Expenses client pattern). Fall back to "未分类" if
 *  the item list is empty. */
function categoryOf(tx: Props["transactions"][number]): string {
  return tx.items[0]?.category_zh ?? "未分类";
}

function timeAgo(purchasedAt: string): string {
  const ms = Date.now() - new Date(purchasedAt).getTime();
  const day = Math.floor(ms / (24 * 60 * 60 * 1000));
  if (day <= 0) return "今天";
  if (day === 1) return "昨天";
  if (day < 7) return `${day} 天前`;
  if (day < 30) return `${Math.floor(day / 7)} 周前`;
  return `${Math.floor(day / 30)} 个月前`;
}

export function RecentTransactions({ transactions, currency }: Props) {
  const items = transactions.slice(0, MAX_ITEMS);
  return (
    <section className="life-card">
      <header className="life-card__header">
        <span className="life-card__title">最近交易</span>
        <span style={{ fontSize: "0.74rem", color: "#50585E", fontWeight: 600 }}>
          {currency} · 取最近 {items.length} 条
        </span>
      </header>
      {items.length === 0 ? (
        <div
          style={{
            padding: "16px 8px",
            textAlign: "center",
            color: "#a0aaa3",
            fontSize: "0.84rem",
            fontWeight: 600
          }}
        >
          本月还没有交易记录
        </div>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
          {items.map((tx) => (
            <li key={tx.id} className="life-recent__row">
              <div className="life-recent__col life-recent__col--main">
                <span className="life-recent__merchant">{tx.merchant_name}</span>
                <span className="life-recent__meta">
                  {categoryOf(tx)} · {timeAgo(tx.purchased_at)}
                </span>
              </div>
              <span className="life-recent__amount">{tx.formatted_total}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}