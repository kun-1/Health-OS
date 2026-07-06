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

function BudgetKpiRow({ analytics, days }: { analytics: ExpenseAnalytics; days: number }) {
  const spent = fromCents(analytics.budget_progress.spent);
  const budget = fromCents(analytics.budget_progress.budget);
  const remaining = fromCents(analytics.budget_progress.remaining);
  const usage = Math.round((analytics.budget_progress.spent / Math.max(1, analytics.budget_progress.budget)) * 100);
  const daily = remaining / Math.max(1, days);

  return (
    <div className="exp-kpis exp-kpis--4 exp-kpis--wide">
      <div className="exp-kpi">
        <span className="exp-kpi__label">本月累计支出</span>
        <span className="exp-kpi__value">{formatMoneyCompact(spent, analytics.primary_currency)}</span>
        <span className="exp-kpi__meta">预算 {formatMoneyCompact(budget, analytics.budget_currency)}</span>
      </div>
      <div className="exp-kpi">
        <span className="exp-kpi__label">{remaining >= 0 ? "剩余预算" : "已超出"}</span>
        <span className={`exp-kpi__value${remaining < 0 ? " exp-kpi__value--danger" : ""}`}>
          {formatMoneyCompact(Math.abs(remaining), analytics.budget_currency)}
        </span>
        <span className="exp-kpi__meta">{remaining >= 0 ? "本月仍可花" : "需控制后续支出"}</span>
      </div>
      <div className="exp-kpi">
        <span className="exp-kpi__label">预算使用率</span>
        <span className={`exp-kpi__value${usage > 100 ? " exp-kpi__value--danger" : ""}`}>{usage}%</span>
        <span className="exp-kpi__meta">{usage > 100 ? "已超月度预算" : "尚在预算范围内"}</span>
      </div>
      <div className="exp-kpi">
        <span className="exp-kpi__label">每日可用</span>
        <span className={`exp-kpi__value${daily < 0 ? " exp-kpi__value--danger" : ""}`}>
          {formatMoneyCompact(daily, analytics.budget_currency)}
        </span>
        <span className="exp-kpi__meta">剩余 {days} 天</span>
      </div>
    </div>
  );
}

export function BudgetTask({ analytics, days }: { analytics: ExpenseAnalytics; days: number }) {
  const line = analytics.daily_totals.map((item) => ({
    ...item,
    label: item.day.slice(5)
  }));

  const maxDaily = Math.max(...line.map((d) => d.amount), 1);
  const yMax = Math.ceil((maxDaily * 1.1) / 100) * 100;

  return (
    <div className="exp-screen exp-screen--budget">
      <BudgetKpiRow analytics={analytics} days={days} />

      <section className="exp-panel exp-panel--chart">
        <div className="exp-section-head">
          <div>
            <p className="exp-eyebrow">预算趋势</p>
            <h1>本月每日支出</h1>
          </div>
          <div className="exp-segment" aria-label="当前展示范围">
            <span>7天</span>
            <span data-active="true">30天</span>
            <span>90天</span>
          </div>
        </div>
        <div className="exp-chart-wrap">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={line} margin={{ bottom: 10, left: 0, right: 20, top: 10 }}>
              <defs>
                <linearGradient id="expense-spend-fill" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="5%" stopColor="#9bea3d" stopOpacity={0.34} />
                  <stop offset="95%" stopColor="#9bea3d" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="rgba(15, 23, 42, 0.08)" strokeDasharray="3 6" vertical={false} />
              <XAxis axisLine={false} dataKey="label" tick={{ fill: "var(--life-muted)", fontSize: 12 }} tickLine={false} />
              <YAxis axisLine={false} domain={[0, yMax]} tick={{ fill: "var(--life-muted)", fontSize: 12 }} tickFormatter={(value) => `¥${Number(value).toFixed(0)}`} tickLine={false} />
              <Tooltip contentStyle={{ background: "#ffffff", border: "1px solid rgba(15, 23, 42, 0.12)", borderRadius: 8, color: "#101512" }} formatter={(value) => formatMoney(Number(value), analytics.primary_currency)} />
              <Area dataKey="amount" fill="url(#expense-spend-fill)" name="支出" stroke="#9bea3d" strokeWidth={2.5} type="monotone" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="exp-panel exp-panel--side">
        <div className="exp-section-head exp-section-head--compact">
          <div>
            <p className="exp-eyebrow">预算状态</p>
            <h2>预算使用情况</h2>
          </div>
        </div>
        <div className="exp-budget-meter">
          <span>预算使用率</span>
          <i><b style={{ width: `${Math.min(100, Math.round((analytics.budget_progress.spent / Math.max(1, analytics.budget_progress.budget)) * 100))}%` }} /></i>
        </div>
        <div className="exp-side-stats">
          <div><span>月度预算</span><strong>{formatMoneyCompact(fromCents(analytics.budget_progress.budget), analytics.budget_currency)}</strong></div>
          <div><span>剩余预算</span><strong>{formatMoneyCompact(fromCents(analytics.budget_progress.remaining), analytics.budget_currency)}</strong></div>
          <div><span>每日可用</span><strong>{formatMoneyCompact(fromCents(analytics.budget_progress.remaining) / Math.max(1, days), analytics.budget_currency)}</strong></div>
        </div>
      </section>

      <TransactionBand month={analytics.month} transactions={analytics.recent_transactions.slice(0, 5)} title="最近影响预算的交易" />
    </div>
  );
}

function TransactionBand({ title, transactions, month }: { title: string; transactions: ExpenseAnalytics["recent_transactions"]; month: string }) {
  return (
    <section className="exp-panel exp-panel--wide">
      <div className="exp-section-head exp-section-head--compact">
        <div>
          <p className="exp-eyebrow">流水</p>
          <h2>{title}</h2>
        </div>
        <a className="exp-filter" href={`/expenses/transactions?month=${encodeURIComponent(month)}`}>查看全部</a>
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
