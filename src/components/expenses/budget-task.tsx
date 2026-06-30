"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

import { formatMoney, fromCents } from "@/lib/expenses/money";
import type { ExpenseAnalytics } from "@/lib/expenses/types";

import { categoryEmoji, categoryLabel } from "./category-colors";
import { formatMoneyCompact } from "./shared/task-helpers";

export function BudgetTask({ analytics, days }: { analytics: ExpenseAnalytics; days: number }) {
  const line = analytics.daily_totals.map((item) => ({
    ...item,
    label: item.day.slice(5),
    budget: fromCents(analytics.budget_progress.budget)
  }));
  return (
    <div className="exp-screen exp-screen--budget">
      <section className="exp-panel exp-panel--chart">
        <div className="exp-section-head">
          <div>
            <p className="exp-eyebrow">预算趋势</p>
            <h1>本月累计消费曲线</h1>
            <div className="exp-chart-metric">
              <strong>{formatMoneyCompact(fromCents(analytics.budget_progress.spent), analytics.primary_currency)}</strong>
              <span>
                {analytics.budget_progress.over_budget
                  ? `已超出 ${formatMoneyCompact(Math.abs(fromCents(analytics.budget_progress.remaining)), analytics.budget_currency)}`
                  : `剩余 ${formatMoneyCompact(fromCents(analytics.budget_progress.remaining), analytics.budget_currency)}`}
              </span>
            </div>
          </div>
          <div className="exp-segment" aria-label="当前展示范围">
            <span>7天</span>
            <span data-active="true">30天</span>
            <span>90天</span>
          </div>
        </div>
        <ResponsiveContainer height={430} width="100%">
          <AreaChart data={line} margin={{ bottom: 10, left: 0, right: 20, top: 20 }}>
            <defs>
              <linearGradient id="expense-spend-fill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="5%" stopColor="#9bea3d" stopOpacity={0.34} />
                <stop offset="95%" stopColor="#9bea3d" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="rgba(15, 23, 42, 0.08)" strokeDasharray="3 6" vertical={false} />
            <XAxis axisLine={false} dataKey="label" tick={{ fill: "var(--life-muted)", fontSize: 12 }} tickLine={false} />
            <YAxis axisLine={false} tick={{ fill: "var(--life-muted)", fontSize: 12 }} tickFormatter={(value) => `¥${Number(value).toFixed(0)}`} tickLine={false} />
            <Tooltip contentStyle={{ background: "#ffffff", border: "1px solid rgba(15, 23, 42, 0.12)", borderRadius: 8, color: "#101512" }} formatter={(value) => formatMoney(Number(value), analytics.primary_currency)} />
            <Area dataKey="amount" fill="url(#expense-spend-fill)" name="累计消费" stroke="#9bea3d" strokeWidth={2.5} type="monotone" />
            <Area dataKey="budget" fill="transparent" name="预算线" stroke="#f5b833" strokeDasharray="5 5" strokeWidth={1.5} type="monotone" />
          </AreaChart>
        </ResponsiveContainer>
      </section>

      <section className="exp-panel exp-panel--side">
        <div className="exp-section-head exp-section-head--compact">
          <div>
            <p className="exp-eyebrow">预算状态</p>
            <h2>剩余天数和额度</h2>
          </div>
        </div>
        <div className="exp-budget-meter">
          <strong>{Math.round((analytics.budget_progress.spent / Math.max(1, analytics.budget_progress.budget)) * 100)}%</strong>
          <span>预算使用率</span>
          <i><b style={{ width: `${Math.min(100, Math.round((analytics.budget_progress.spent / Math.max(1, analytics.budget_progress.budget)) * 100))}%` }} /></i>
        </div>
        <div className="exp-side-stats">
          <div><span>月度预算</span><strong>{formatMoneyCompact(fromCents(analytics.budget_progress.budget), analytics.budget_currency)}</strong></div>
          <div><span>剩余预算</span><strong>{formatMoneyCompact(fromCents(analytics.budget_progress.remaining), analytics.budget_currency)}</strong></div>
          <div><span>每日可用</span><strong>{formatMoneyCompact(fromCents(analytics.budget_progress.remaining) / Math.max(1, days), analytics.budget_currency)}</strong></div>
        </div>
      </section>

      <TransactionBand transactions={analytics.recent_transactions.slice(0, 5)} title="最近影响预算的交易" />
    </div>
  );
}

function TransactionBand({ title, transactions }: { title: string; transactions: ExpenseAnalytics["recent_transactions"] }) {
  return (
    <section className="exp-panel exp-panel--wide">
      <div className="exp-section-head exp-section-head--compact">
        <div>
          <p className="exp-eyebrow">流水</p>
          <h2>{title}</h2>
        </div>
        <a className="exp-filter" href="/expenses/all">查看全部</a>
      </div>
      <div className="exp-transaction-list">
        {transactions.length === 0 ? (
          <div className="exp-empty exp-card">还没有入账消费</div>
        ) : (
          transactions.map((transaction) => (
            <div className="exp-transaction-row" key={transaction.id}>
              <span>{categoryEmoji(transaction.items[0]?.category_zh ?? "其他")}</span>
              <div>
                <strong>{transaction.merchant_name}</strong>
                <span>{new Date(transaction.purchased_at).toLocaleDateString("zh-CN")} · {categoryLabel(transaction.items[0]?.category_zh ?? "其他")}</span>
              </div>
              {transaction.duplicate_hint ? <span className="exp-status" data-status="queued">疑似重复</span> : null}
              <strong>{formatMoney(transaction.total_amount, transaction.currency)}</strong>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
