"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { formatMoney, fromCents } from "@/lib/expenses/money";
import type { RecurringExpense, RecurringFrequency } from "@/lib/expenses/types";

import { categoryEmoji, categoryLabel, categoryNames } from "./category-colors";
import { ThemeToggle, getInitialTheme, type Theme } from "./theme-toggle";
import "./expenses.css";

type Rule = RecurringExpense;

type Draft = {
  merchantName: string;
  amount: string; // dollars (string for input control)
  currency: string;
  categoryZh: string;
  frequency: RecurringFrequency;
  dayOfMonth: string; // empty string == not set
  dayOfWeek: string;
  monthOfYear: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD, empty == none
  excludedFromBudget: boolean;
  notes: string;
};

const CURRENCY_OPTIONS = ["CNY", "USD", "JPY", "EUR"] as const;

const DAY_OF_WEEK_LABELS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

type LoadError = { kind: "network" | "server" | "client"; message: string };

function frequencyLabel(rule: Rule): string {
  switch (rule.frequency) {
    case "daily":
      return "每天";
    case "weekly": {
      const dow = rule.day_of_week ?? 0;
      return `每周 ${DAY_OF_WEEK_LABELS[dow] ?? "?"}`;
    }
    case "monthly": {
      const dom = rule.day_of_month ?? 1;
      return `每月 ${dom} 号`;
    }
    case "yearly": {
      const moy = rule.month_of_year ?? 1;
      const dom = rule.day_of_month ?? 1;
      return `每年 ${moy} 月 ${dom} 号`;
    }
  }
}

function formatLocalDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function todayIso(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function emptyDraft(): Draft {
  return {
    merchantName: "",
    amount: "",
    currency: "CNY",
    categoryZh: "其他",
    frequency: "monthly",
    dayOfMonth: "5",
    dayOfWeek: "3",
    monthOfYear: "1",
    startDate: todayIso(),
    endDate: "",
    excludedFromBudget: false,
    notes: ""
  };
}

function ruleToDraft(rule: Rule): Draft {
  return {
    merchantName: rule.merchant_name,
    amount: String(fromCents(rule.amount_cents)),
    currency: rule.currency,
    categoryZh: rule.category_zh,
    frequency: rule.frequency,
    dayOfMonth: rule.day_of_month !== null ? String(rule.day_of_month) : "",
    dayOfWeek: rule.day_of_week !== null ? String(rule.day_of_week) : "",
    monthOfYear: rule.month_of_year !== null ? String(rule.month_of_year) : "",
    startDate: rule.start_date,
    endDate: rule.end_date ?? "",
    excludedFromBudget: rule.excluded_from_budget,
    notes: rule.notes ?? ""
  };
}

function buildPayload(draft: Draft): Record<string, unknown> {
  // Compute amountCents in whole cents. `parseFloat("")` is NaN, which the
  // server's Zod will reject — the UI keeps the value as a string so the
  // user sees a non-empty field for round-tripping.
  const amount = Number.parseFloat(draft.amount);
  const amountCents = Number.isFinite(amount) && amount >= 0 ? Math.round(amount * 100) : NaN;
  const payload: Record<string, unknown> = {
    merchantName: draft.merchantName.trim(),
    amountCents,
    currency: draft.currency,
    categoryZh: draft.categoryZh,
    frequency: draft.frequency,
    startDate: draft.startDate,
    excludedFromBudget: draft.excludedFromBudget
  };
  if (draft.endDate) payload.endDate = draft.endDate;
  if (draft.notes.trim()) payload.notes = draft.notes.trim();
  if (draft.frequency === "monthly" || draft.frequency === "yearly") {
    if (draft.dayOfMonth) payload.dayOfMonth = Number(draft.dayOfMonth);
  }
  if (draft.frequency === "weekly") {
    if (draft.dayOfWeek) payload.dayOfWeek = Number(draft.dayOfWeek);
  }
  if (draft.frequency === "yearly") {
    if (draft.monthOfYear) payload.monthOfYear = Number(draft.monthOfYear);
  }
  return payload;
}

function describeDayFieldError(draft: Draft): string | null {
  if (draft.frequency === "monthly" && !draft.dayOfMonth) return "月付规则需要 dayOfMonth";
  if (draft.frequency === "weekly" && !draft.dayOfWeek) return "周付规则需要 dayOfWeek";
  if (draft.frequency === "yearly" && (!draft.monthOfYear || !draft.dayOfMonth)) {
    return "年付规则需要 monthOfYear + dayOfMonth";
  }
  return null;
}

export function RecurringManagerClient() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [showForm, setShowForm] = useState(false);
  const [loadError, setLoadError] = useState<LoadError | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [runningId, setRunningId] = useState<number | null>(null);
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    setTheme(getInitialTheme());
  }, []);

  const load = useCallback(async () => {
    setLoadError(null);
    let response: Response;
    try {
      response = await fetch("/api/expenses/recurring");
    } catch (err) {
      setLoadError({ kind: "network", message: err instanceof Error ? err.message : "网络请求失败" });
      return;
    }
    if (!response.ok) {
      setLoadError({ kind: response.status >= 500 ? "server" : "client", message: `服务器返回 ${response.status}` });
      return;
    }
    let data: { rules: Rule[] };
    try {
      data = (await response.json()) as { rules: Rule[] };
    } catch (err) {
      setLoadError({ kind: "client", message: err instanceof Error ? err.message : "解析响应失败" });
      return;
    }
    setRules(data.rules);
  }, []);

  useEffect(() => {
    load().catch((err) =>
      setLoadError({ kind: "network", message: err instanceof Error ? err.message : "加载失败" })
    );
  }, [load]);

  const canSave = useMemo(() => {
    if (!draft.merchantName.trim()) return false;
    const amount = Number.parseFloat(draft.amount);
    if (!Number.isFinite(amount) || amount < 0) return false;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.startDate)) return false;
    if (draft.endDate && !/^\d{4}-\d{2}-\d{2}$/.test(draft.endDate)) return false;
    if (describeDayFieldError(draft)) return false;
    return true;
  }, [draft]);

  function startCreate() {
    setEditingId(null);
    setDraft(emptyDraft());
    setShowForm(true);
    setError("");
    setMessage("");
  }

  function startEdit(rule: Rule) {
    setEditingId(rule.id);
    setDraft(ruleToDraft(rule));
    setShowForm(true);
    setError("");
    setMessage("");
  }

  function cancelForm() {
    setShowForm(false);
    setEditingId(null);
    setDraft(emptyDraft());
  }

  async function save() {
    if (!canSave) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const payload = buildPayload(draft);
      const isUpdate = editingId !== null;
      const response = await fetch("/api/expenses/recurring", {
        method: isUpdate ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isUpdate ? { id: editingId, ...payload } : payload)
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string; rule?: Rule };
      if (!response.ok) {
        setError(data.error ?? (isUpdate ? "更新失败" : "创建失败"));
        return;
      }
      setMessage(isUpdate ? `已更新规则 #${editingId}` : `已创建规则 #${data.rule?.id ?? "?"}`);
      setShowForm(false);
      setEditingId(null);
      setDraft(emptyDraft());
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function removeRule(rule: Rule) {
    if (!window.confirm(`确认删除规则 #${rule.id}（${rule.merchant_name}）？历史入账的交易不会自动回滚。`)) {
      return;
    }
    setError("");
    setMessage("");
    const response = await fetch("/api/expenses/recurring", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: rule.id })
    });
    if (!response.ok) {
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      setError(data.error ?? "删除失败");
      return;
    }
    setMessage(`已删除规则 #${rule.id}`);
    if (editingId === rule.id) cancelForm();
    await load();
  }

  async function toggleActive(rule: Rule) {
    setError("");
    setMessage("");
    const response = await fetch("/api/expenses/recurring", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: rule.id, active: !rule.active })
    });
    if (!response.ok) {
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      setError(data.error ?? "更新失败");
      return;
    }
    setMessage(`规则 #${rule.id} 已${rule.active ? "暂停" : "启用"}`);
    await load();
  }

  async function runNow(rule: Rule) {
    setRunningId(rule.id);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/expenses/recurring/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: rule.id })
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(data.error ?? "立即跑一次失败");
        return;
      }
      setMessage(`已为规则 #${rule.id} 立即入账一次`);
      await load();
    } finally {
      setRunningId(null);
    }
  }

  return (
    <div className="exp" data-expenses-theme={theme}>
      <header className="exp-header">
        <div className="exp-header__brand">
          <span className="exp-header__mark" aria-hidden>
            <svg fill="none" height="20" viewBox="0 0 24 24" width="20" xmlns="http://www.w3.org/2000/svg">
              <path d="M7 3h10a2 2 0 0 1 2 2v16l-3-2-3 2-3-2-3 2-3-2V5a2 2 0 0 1 2-2Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="2" />
              <path d="M8 8h8M8 12h8M8 16h5" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
            </svg>
          </span>
          <div>
            <h1 className="exp-header__title">定期 / 订阅</h1>
            <p className="exp-header__subtitle">每月 / 每周 / 每天自动入账的规则</p>
          </div>
        </div>
        <div className="exp-header__right">
          <a className="exp-btn exp-btn--ghost exp-btn--sm" href="/expenses">
            ← 返回概览
          </a>
          <ThemeToggle onChange={setTheme} theme={theme} />
          <button
            className="exp-btn exp-btn--primary exp-btn--sm"
            onClick={startCreate}
            type="button"
          >
            <span aria-hidden>➕</span>
            新增规则
          </button>
        </div>
      </header>

      {error ? <div className="exp-banner exp-banner--error">{error}</div> : null}
      {loadError ? (
        <div className="exp-banner exp-banner--error" role="alert">
          <span>
            {loadError.kind === "network"
              ? `网络问题：${loadError.message}，点击重试`
              : loadError.kind === "server"
                ? `服务器错误：${loadError.message}，稍后重试`
                : `客户端错误：${loadError.message}`}
          </span>
          <button className="exp-btn exp-btn--secondary exp-btn--sm" onClick={() => void load()} type="button">
            重试
          </button>
        </div>
      ) : null}
      {message ? <div className="exp-banner exp-banner--ok">{message}</div> : null}

      {showForm ? (
        <section className="exp-recurring-form exp-card">
          <div className="exp-col__head">
            <h2 className="exp-section-title">
              <span aria-hidden>{editingId ? "✏️" : "➕"}</span>
              {editingId ? `编辑规则 #${editingId}` : "新增规则"}
            </h2>
          </div>
          <div className="exp-form__row">
            <label className="exp-form__field">
              <span className="exp-form__label">商家</span>
              <input
                className="exp-form__input"
                onChange={(event) => setDraft((current) => ({ ...current, merchantName: event.target.value }))}
                placeholder="例如：Netflix"
                type="text"
                value={draft.merchantName}
              />
            </label>
            <label className="exp-form__field">
              <span className="exp-form__label">金额</span>
              <input
                className="exp-form__input"
                inputMode="decimal"
                onChange={(event) => setDraft((current) => ({ ...current, amount: event.target.value }))}
                placeholder="0.00"
                step="0.01"
                type="number"
                value={draft.amount}
              />
            </label>
            <label className="exp-form__field">
              <span className="exp-form__label">币种</span>
              <select
                className="exp-form__select"
                onChange={(event) => setDraft((current) => ({ ...current, currency: event.target.value }))}
                value={draft.currency}
              >
                {CURRENCY_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <label className="exp-form__field">
              <span className="exp-form__label">分类</span>
              <select
                className="exp-form__select"
                onChange={(event) => setDraft((current) => ({ ...current, categoryZh: event.target.value }))}
                value={draft.categoryZh}
              >
                {categoryNames.map((name) => (
                  <option key={name} value={name}>
                    {categoryEmoji(name)} {categoryLabel(name)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="exp-form__field">
            <span className="exp-form__label">频率</span>
            <div className="exp-recurring-radios">
              {(["daily", "weekly", "monthly", "yearly"] as RecurringFrequency[]).map((option) => (
                <label className="exp-chip" key={option}>
                  <input
                    checked={draft.frequency === option}
                    name="frequency"
                    onChange={() => setDraft((current) => ({ ...current, frequency: option }))}
                    type="radio"
                  />
                  <span style={{ marginLeft: 6 }}>
                    {option === "daily" ? "每天" : option === "weekly" ? "每周" : option === "monthly" ? "每月" : "每年"}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {(draft.frequency === "monthly" || draft.frequency === "yearly") ? (
            <div className="exp-form__row">
              <label className="exp-form__field">
                <span className="exp-form__label">每月几号 (1-28)</span>
                <input
                  className="exp-form__input"
                  inputMode="numeric"
                  max={28}
                  min={1}
                  onChange={(event) => setDraft((current) => ({ ...current, dayOfMonth: event.target.value }))}
                  placeholder="5"
                  type="number"
                  value={draft.dayOfMonth}
                />
              </label>
              {draft.frequency === "yearly" ? (
                <label className="exp-form__field">
                  <span className="exp-form__label">每年几月 (1-12)</span>
                  <input
                    className="exp-form__input"
                    inputMode="numeric"
                    max={12}
                    min={1}
                    onChange={(event) => setDraft((current) => ({ ...current, monthOfYear: event.target.value }))}
                    placeholder="1"
                    type="number"
                    value={draft.monthOfYear}
                  />
                </label>
              ) : null}
            </div>
          ) : null}

          {draft.frequency === "weekly" ? (
            <div className="exp-form__row">
              <label className="exp-form__field">
                <span className="exp-form__label">星期几</span>
                <select
                  className="exp-form__select"
                  onChange={(event) => setDraft((current) => ({ ...current, dayOfWeek: event.target.value }))}
                  value={draft.dayOfWeek}
                >
                  {DAY_OF_WEEK_LABELS.map((label, index) => (
                    <option key={index} value={String(index)}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : null}

          <div className="exp-form__row">
            <label className="exp-form__field">
              <span className="exp-form__label">开始日期</span>
              <input
                className="exp-form__input"
                onChange={(event) => setDraft((current) => ({ ...current, startDate: event.target.value }))}
                type="date"
                value={draft.startDate}
              />
            </label>
            <label className="exp-form__field">
              <span className="exp-form__label">结束日期 (可选)</span>
              <input
                className="exp-form__input"
                onChange={(event) => setDraft((current) => ({ ...current, endDate: event.target.value }))}
                type="date"
                value={draft.endDate}
              />
            </label>
          </div>

          <label className="exp-form__field exp-manual__exclude">
            <input
              checked={draft.excludedFromBudget}
              onChange={(event) =>
                setDraft((current) => ({ ...current, excludedFromBudget: event.target.checked }))
              }
              type="checkbox"
            />
            <span className="exp-form__label">不计入预算</span>
          </label>

          <label className="exp-form__field">
            <span className="exp-form__label">备注</span>
            <textarea
              className="exp-form__textarea"
              onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))}
              placeholder="选填：订单用途、提醒..."
              value={draft.notes}
            />
          </label>

          {describeDayFieldError(draft) ? (
            <div className="exp-banner exp-banner--error">{describeDayFieldError(draft)}</div>
          ) : null}

          <div className="exp-form__actions">
            <button className="exp-btn exp-btn--secondary" onClick={cancelForm} type="button">
              取消
            </button>
            <button
              className="exp-btn exp-btn--primary"
              disabled={!canSave || saving}
              onClick={() => void save()}
              type="button"
            >
              {saving ? "保存中..." : editingId ? "保存修改" : "保存规则"}
            </button>
          </div>
        </section>
      ) : null}

      <section className="exp-col">
        <div className="exp-col__head">
          <h2 className="exp-section-title">
            <span aria-hidden>📅</span>
            当前规则
            <span className="exp-section-title__count">{rules.length}</span>
          </h2>
        </div>
        {rules.length === 0 ? (
          <div className="exp-empty exp-card">
            <div className="exp-empty__icon" aria-hidden>📅</div>
            <div>暂无规则，点右上角「新增规则」开始</div>
          </div>
        ) : (
          <div className="exp-recurring-list">
            {rules.map((rule) => (
              <div className={`exp-recurring-row exp-job ${rule.active ? "" : "exp-recurring-row--inactive"}`} key={rule.id}>
                <div className="exp-job__main">
                  <div className="exp-job__name">
                    {rule.merchant_name} · {formatMoney(fromCents(rule.amount_cents), rule.currency)}
                  </div>
                  <div className="exp-card__meta">
                    {frequencyLabel(rule)} · 分类 {rule.category_zh}
                    {rule.excluded_from_budget ? " · 不计入预算" : ""}
                    {!rule.active ? " · 已暂停" : ""}
                  </div>
                  <div className="exp-card__meta">
                    下次运行：{formatLocalDateTime(rule.next_run_at)}
                    {rule.last_run_at ? ` · 上次：${formatLocalDateTime(rule.last_run_at)}` : ""}
                  </div>
                  {rule.end_date ? (
                    <div className="exp-card__meta">截止：{rule.end_date}</div>
                  ) : null}
                </div>
                <div className="exp-job__actions">
                  <button
                    className="exp-btn exp-btn--secondary exp-btn--sm"
                    disabled={runningId === rule.id}
                    onClick={() => void runNow(rule)}
                    type="button"
                  >
                    {runningId === rule.id ? "跑中..." : "立即跑一次"}
                  </button>
                  <button
                    className="exp-btn exp-btn--secondary exp-btn--sm"
                    onClick={() => startEdit(rule)}
                    type="button"
                  >
                    编辑
                  </button>
                  <button
                    className="exp-btn exp-btn--secondary exp-btn--sm"
                    onClick={() => void toggleActive(rule)}
                    type="button"
                  >
                    {rule.active ? "暂停" : "启用"}
                  </button>
                  <button
                    className="exp-btn exp-btn--ghost exp-btn--sm"
                    onClick={() => void removeRule(rule)}
                    type="button"
                  >
                    删除
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
