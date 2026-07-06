"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

import { formatMoney, fromCents } from "@/lib/expenses/money";
import type { ExpenseAnalytics } from "@/lib/expenses/types";

import { categoryColor, categoryEmoji, categoryLabel } from "./category-colors";
import { formatMoneyCompact } from "./shared/task-helpers";

export function StructureTask({ analytics }: { analytics: ExpenseAnalytics }) {
  const categoryData = analytics.category_breakdown
    .map((item) => ({
      amount: item.amount,
      category: item.category_zh,
      color: categoryColor(item.category_zh),
      percent: Math.round((item.amount / Math.max(1, analytics.budget_progress.spent)) * 100)
    }))
    .sort((a, b) => b.amount - a.amount);

  return (
    <div className="exp-screen exp-screen--structure">
      <section className="exp-panel exp-panel--allocation">
        <div className="exp-section-head">
          <div>
            <p className="exp-eyebrow">分类结构</p>
            <h1>钱主要流向哪里</h1>
          </div>
        </div>
        <div className="exp-chart-wrap exp-chart-wrap--donut">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie cx="50%" cy="50%" data={categoryData} dataKey="percent" innerRadius={64} outerRadius={100} paddingAngle={1.5} stroke="#ffffff" strokeWidth={2}>
                {categoryData.map((entry) => (
                  <Cell fill={entry.color} key={entry.category} />
                ))}
              </Pie>
              <Tooltip formatter={(value, name, item) => [`${value}% · ${formatMoney(fromCents(item.payload.amount), analytics.primary_currency)}`, name]} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="exp-legend">
          {categoryData.slice(0, 4).map((item) => (
            <span key={item.category}><i style={{ background: item.color }} />{categoryLabel(item.category)} {item.percent}%</span>
          ))}
        </div>
      </section>

      <section className="exp-panel exp-panel--side">
        <div className="exp-section-head exp-section-head--compact">
          <div>
            <p className="exp-eyebrow">类别占比</p>
            <h2>支出类别分布</h2>
          </div>
        </div>
        <div className="exp-bars">
          {categoryData.slice(0, 4).map((item) => (
            <div className="exp-bar-row" key={item.category}>
              <div className="exp-bar-row__meta">
                <span><i style={{ background: item.color }} />{categoryEmoji(item.category)} {categoryLabel(item.category)}</span>
                <strong>{formatMoneyCompact(fromCents(item.amount), analytics.primary_currency)}</strong>
              </div>
              <div className="exp-range"><span style={{ width: `${Math.min(100, item.percent * 1.8)}%`, background: item.color }} /></div>
              <div className="exp-bar-row__foot">
                <small>{item.percent}% of monthly spend</small>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="exp-panel exp-panel--wide">
        <div className="exp-section-head exp-section-head--compact">
          <div>
            <p className="exp-eyebrow">类别对比</p>
            <h2>按金额排序</h2>
          </div>
        </div>
        <div className="exp-chart-wrap exp-chart-wrap--bar">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={categoryData} margin={{ bottom: 0, left: 0, right: 12, top: 12 }}>
            <CartesianGrid stroke="rgba(15, 23, 42, 0.08)" strokeDasharray="3 6" vertical={false} />
            <XAxis axisLine={false} dataKey="category" tick={{ fill: "var(--life-muted)", fontSize: 12 }} tickLine={false} tickFormatter={(value) => categoryLabel(String(value))} />
            <YAxis axisLine={false} tick={{ fill: "var(--life-muted)", fontSize: 12 }} tickFormatter={(value) => `¥${fromCents(Number(value)).toFixed(0)}`} tickLine={false} />
            <Tooltip contentStyle={{ background: "#ffffff", border: "1px solid rgba(15, 23, 42, 0.12)", borderRadius: 8, color: "#101512" }} formatter={(value) => formatMoney(fromCents(Number(value)), analytics.primary_currency)} />
            <Bar dataKey="amount" radius={[8, 8, 0, 0]}>
              {categoryData.map((entry) => (
                <Cell fill={entry.color} key={entry.category} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        </div>
      </section>
    </div>
  );
}
