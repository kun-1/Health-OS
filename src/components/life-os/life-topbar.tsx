"use client";

import { Loader2, RefreshCw } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";

import "./life-os.css";

import { MonthSwitcher } from "@/components/shared/month-switcher";
import { useRefreshing } from "@/components/shared/refreshing-context";
import { useSelectedMonth } from "@/components/shared/use-selected-month";

type Props = {
  /** Override the welcome line. Default uses a fixed copy for Phase A. */
  greeting?: string;
  /** Override the date subtitle. Defaults to today in zh-CN. */
  dateLabel?: string;
};

function todayLabel(): string {
  // We render on the server so the value is stable per request. Phase A
  // intentionally avoids client-side time — it would shift on hydration.
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const d = now.getDate();
  const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  return `${y} 年 ${m} 月 ${d} 日 · ${weekdays[now.getDay()]}`;
}

/** Topbar mini launch buttons for the Health OS control affordances.
 *  Each button either opens the matching home-page control or navigates
 *  to the real workflow while preserving the active month. */
type OpTarget = {
  op: string;
  label: string;
  action: "new-receipt" | "open-budget" | "batch-confirm" | "run-rules" | "export-csv";
};

function OpQuickButtons({ month }: { month: string }) {
  const router = useRouter();
  const pathname = usePathname();

  const targets: OpTarget[] = [
    { op: "receipt", label: "新增票据", action: "new-receipt" },
    { op: "budget", label: "预算", action: "open-budget" },
    { op: "confirm", label: "批量入账", action: "batch-confirm" },
    { op: "run", label: "跑规则", action: "run-rules" },
    { op: "csv", label: "导出 CSV", action: "export-csv" }
  ];

  function dispatchAction(action: OpTarget["action"]) {
    if (pathname === "/") {
      if (action === "new-receipt") {
        router.push(`/expenses/transactions?month=${encodeURIComponent(month)}`);
        return;
      }
      if (action === "run-rules") {
        router.push(`/expenses/recurring?month=${encodeURIComponent(month)}`);
        return;
      }
      window.dispatchEvent(new CustomEvent(`od:${action}`));
      return;
    }

    if (action === "new-receipt") {
      router.push(`/expenses/transactions?month=${encodeURIComponent(month)}`);
      return;
    }
    if (action === "run-rules") {
      router.push(`/expenses/recurring?month=${encodeURIComponent(month)}`);
      return;
    }

    const search = new URLSearchParams();
    search.set("month", month);
    search.set("od", action);
    router.push(`/?${search.toString()}`);
  }

  return (
    <div className="od-topbar-op" role="group" aria-label="Health OS 快捷操作">
      {targets.map((t) => (
        <button
          data-op={t.op}
          key={t.op}
          onClick={() => dispatchAction(t.action)}
          type="button"
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function LifeTopbar({ greeting, dateLabel }: Props) {
  const subtitle = dateLabel ?? todayLabel();
  const selectedMonth = useSelectedMonth();
  const { refreshing } = useRefreshing();
  return (
    <header className="life-topbar" role="banner">
      <div className="life-topbar__greeting">
        <span className="life-topbar__title">{greeting ?? "Life OS"}</span>
        <span className="life-topbar__subtitle">{subtitle}</span>
      </div>

      <div className="od-topbar-status" role="status" aria-live="polite">
        <span
          aria-hidden
          className={`od-status-dot${refreshing ? "" : " synced"}`}
        />
        <span>{refreshing ? "updating" : "synced"}</span>
      </div>

      <div className="life-topbar__spacer" />

      <div className="life-topbar__actions">
        <OpQuickButtons month={selectedMonth} />
        <span className="od-topbar-status-chip" aria-label="Health OS controls mapped">
          <span className="dot" aria-hidden />
          Health OS controls mapped
        </span>
        <button
          aria-label="刷新"
          className="od-topbar-refresh"
          disabled={refreshing}
          onClick={() => window.location.reload()}
          type="button"
        >
          {refreshing ? <Loader2 className="od-topbar-refresh__spinner" /> : <RefreshCw />}
          刷新
        </button>
        <MonthSwitcher month={selectedMonth} />
      </div>
    </header>
  );
}
