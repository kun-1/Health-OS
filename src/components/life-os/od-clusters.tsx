"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { useODToast } from "./od-toast";
import "./od-home.css";

/** Health OS control affordances from the OD reference, grouped into
 *  five clusters. Each button either routes to a real page, calls a
 *  real API, or shows a toast for "feature not yet wired" — we never
 *  fake destructive behavior. */

type ClusterAction = {
  label: string;
  /** One of: navigation, mock (toast only), api (real fetch). */
  kind: "nav" | "mock" | "api";
  href?: string;
  onClick?: () => void;
  tone?: "default" | "primary" | "danger";
};

type Cluster = {
  title: string;
  count: string;
  /** DOM id so the topbar op-quick buttons can scroll to it. */
  id: string;
  actions: ClusterAction[];
};

function buildClusters(opts: {
  pendingCount: number;
  onRunRules: () => void;
  onExportCsv: () => void;
  onBatchConfirm: () => void;
  onBatchDelete: () => void;
  onExcludeSelected: () => void;
  onClearSelection: () => void;
  onNewReceipt: () => void;
  onAddEntry: () => void;
  onEditSelected: () => void;
  onDeleteSelected: () => void;
  onShowPending: () => void;
}): Cluster[] {
  return [
    {
      id: "cluster-data-capture",
      title: "数据采集",
      count: "5 actions",
      actions: [
        { label: "新增票据", kind: "nav", onClick: opts.onNewReceipt },
        { label: "选图", kind: "mock", onClick: () => opts.onNewReceipt() },
        { label: "拍照", kind: "mock", onClick: () => opts.onNewReceipt() },
        { label: "识别票据", kind: "mock", onClick: () => opts.onNewReceipt() },
        { label: "记一笔", kind: "api", onClick: opts.onAddEntry }
      ]
    },
    {
      id: "cluster-budget",
      title: "预算",
      count: "configured",
      actions: [
        { label: "预算", kind: "api", tone: "primary" } // handled inline by cluster header
      ]
    },
    {
      id: "cluster-review",
      title: "审核队列",
      count: `${opts.pendingCount} pending`,
      actions: [
        { label: "确认入账", kind: "api", onClick: opts.onBatchConfirm },
        { label: "批量确认入账", kind: "api", onClick: opts.onBatchConfirm, tone: "primary" },
        { label: "批量删除", kind: "api", onClick: opts.onBatchDelete, tone: "danger" }
      ]
    },
    {
      id: "cluster-rules",
      title: "定期规则",
      count: "4 rules",
      actions: [
        { label: "新增规则", kind: "nav", href: "/expenses/recurring" },
        { label: "立即跑一次", kind: "api", onClick: opts.onRunRules },
        { label: "暂停", kind: "mock", onClick: opts.onShowPending },
        { label: "启用", kind: "mock", onClick: opts.onShowPending }
      ]
    },
    {
      id: "cluster-row-actions",
      title: "交易操作",
      count: "row-level",
      actions: [
        { label: "不计入预算", kind: "api", onClick: opts.onExcludeSelected },
        { label: "编辑", kind: "api", onClick: opts.onEditSelected },
        { label: "删除", kind: "api", onClick: opts.onDeleteSelected, tone: "danger" },
        { label: "关闭", kind: "api", onClick: opts.onClearSelection },
        { label: "导出 CSV", kind: "api", onClick: opts.onExportCsv }
      ]
    }
  ];
}

type Props = {
  pendingCount: number;
  month: string;
  /** Current budget summary, drives the popover pre-fill. */
  budgetCents: number;
  currency: string;
  onBudgetSaved: (next: { baseBudgetCents: number; primaryCurrency: string }) => void;
  /** Hooks for cluster actions that need to drive real mutations. */
  onRunRules: () => void;
  onExportCsv: () => void;
  onBatchConfirm: () => void;
  onBatchDelete: () => void;
  onExcludeSelected: () => void;
  onClearSelection: () => void;
  onNewReceipt: () => void;
  onAddEntry: () => void;
  onEditSelected: () => void;
  onDeleteSelected: () => void;
  /** Toast-only handler for actions that have no real backend yet. */
  onShowPending: () => void;
};

function centsToYuan(cents: number): string {
  return (cents / 100).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function yuanToCents(value: string): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
}

const CURRENCIES = ["CNY", "USD", "EUR", "JPY"] as const;

export function ODClusters(props: Props) {
  const router = useRouter();
  const toast = useODToast();
  const [budgetOpen, setBudgetOpen] = useState(false);
  const [budgetBase, setBudgetBase] = useState(centsToYuan(props.budgetCents));
  const [currency, setCurrency] = useState(props.currency);
  const [topUp, setTopUp] = useState("");
  const [savingBudget, setSavingBudget] = useState(false);

  // Keep local form in sync if props change (e.g. after a refetch).
  useEffect(() => {
    setBudgetBase(centsToYuan(props.budgetCents));
    setCurrency(props.currency);
  }, [props.budgetCents, props.currency]);

  useEffect(() => {
    function onOpenBudget() {
      setBudgetOpen(true);
    }
    window.addEventListener("od:open-budget", onOpenBudget);
    return () => window.removeEventListener("od:open-budget", onOpenBudget);
  }, []);

  const clusters = buildClusters({
    pendingCount: props.pendingCount,
    onRunRules: props.onRunRules,
    onExportCsv: props.onExportCsv,
    onBatchConfirm: props.onBatchConfirm,
    onBatchDelete: props.onBatchDelete,
    onExcludeSelected: props.onExcludeSelected,
    onClearSelection: props.onClearSelection,
    onNewReceipt: props.onNewReceipt,
    onAddEntry: props.onAddEntry,
    onEditSelected: props.onEditSelected,
    onDeleteSelected: props.onDeleteSelected,
    onShowPending: props.onShowPending
  });

  function dispatchAction(action: ClusterAction) {
    if (action.kind === "nav" && action.href) {
      router.push(action.href);
      return;
    }
    if (action.onClick) action.onClick();
  }

  async function saveBudget() {
    const cents = yuanToCents(budgetBase);
    if (cents <= 0) {
      toast.show("请输入有效金额");
      return;
    }
    try {
      setSavingBudget(true);
      const res = await fetch("/api/expenses/budget", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseBudgetCents: cents,
          primaryCurrency: currency,
          month: props.month
        })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      // Optional top-up: only fire when the user typed something.
      if (topUp.trim().length > 0) {
        const topUpCents = yuanToCents(topUp);
        if (topUpCents > 0) {
          await fetch("/api/expenses/budget", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              month: props.month,
              amountCents: topUpCents
            })
          });
        }
      }
      toast.show("预算已保存");
      props.onBudgetSaved({ baseBudgetCents: cents, primaryCurrency: currency });
      setBudgetOpen(false);
      setTopUp("");
    } catch (err) {
      toast.show(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSavingBudget(false);
    }
  }

  return (
    <div className="od-clusters">
      {clusters.map((cluster, idx) => {
        const isBudget = cluster.title === "预算";
        return (
          <div className="od-cluster" id={cluster.id} key={cluster.title}>
            <div className="od-cluster-head">
              <div className="od-cluster-title">{cluster.title}</div>
              <span className="od-cluster-count">{cluster.count}</span>
            </div>
            {isBudget ? (
              <>
                <div className="od-cluster-buttons">
                  <button
                    aria-pressed={budgetOpen}
                    className="primary"
                    onClick={() => setBudgetOpen((v) => !v)}
                    type="button"
                  >
                    预算
                  </button>
                </div>
                {budgetOpen ? (
                  <div className="od-popover" role="dialog" aria-label="预算设置">
                    <div>
                      <label className="od-popover-label" htmlFor="od-budget-base">
                        基础月预算
                      </label>
                      <input
                        id="od-budget-base"
                        onChange={(e) => setBudgetBase(e.target.value)}
                        type="number"
                        value={budgetBase}
                      />
                    </div>
                    <div>
                      <label className="od-popover-label" htmlFor="od-budget-cur">
                        主币种
                      </label>
                      <select
                        id="od-budget-cur"
                        onChange={(e) => setCurrency(e.target.value)}
                        value={currency}
                      >
                        {CURRENCIES.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="od-popover-label" htmlFor="od-budget-top">
                        加钱（额外补给）
                      </label>
                      <input
                        id="od-budget-top"
                        onChange={(e) => setTopUp(e.target.value)}
                        placeholder="例如 500"
                        type="number"
                        value={topUp}
                      />
                    </div>
                    <div className="od-popover-actions">
                      <button
                        className="primary"
                        disabled={savingBudget}
                        onClick={saveBudget}
                        type="button"
                      >
                        保存
                      </button>
                      <button
                        className="ghost"
                        onClick={() => setBudgetOpen(false)}
                        type="button"
                      >
                        关闭
                      </button>
                    </div>
                  </div>
                ) : null}
              </>
            ) : (
              <div className="od-cluster-buttons">
                {cluster.actions.map((action) => {
                  const className = action.tone === "primary" ? "primary" : action.tone === "danger" ? "danger" : "";
                  return (
                    <button
                      className={className}
                      key={`${cluster.title}-${action.label}-${idx}`}
                      onClick={() => dispatchAction(action)}
                      type="button"
                    >
                      {action.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
