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
 *  These dispatch to the matching cluster button on the home page. When
 *  the user is already on the home page, we scroll to the cluster; from
 *  other pages, we navigate to home with the active month in the URL. */
function OpQuickButtons({ month }: { month: string }) {
  const router = useRouter();
  const pathname = usePathname();

  const targets: Array<{ op: string; label: string; clusterId: string }> = [
    { op: "receipt", label: "新增票据", clusterId: "cluster-data-capture" },
    { op: "budget", label: "预算", clusterId: "cluster-budget" },
    { op: "confirm", label: "批量入账", clusterId: "cluster-review" },
    { op: "run", label: "跑规则", clusterId: "cluster-rules" },
    { op: "csv", label: "导出 CSV", clusterId: "cluster-row-actions" }
  ];

  function dispatch(op: string) {
    if (pathname === "/") {
      // Already on home — scroll the matching cluster into view.
      if (op === "csv") {
        // 导出 CSV has no in-page anchor; trigger the global custom event
        // the home page listens for.
        window.dispatchEvent(new CustomEvent("od:export-csv"));
        return;
      }
      if (op === "run") {
        window.dispatchEvent(new CustomEvent("od:run-rules"));
        return;
      }
      const id = targets.find((t) => t.op === op)?.clusterId;
      if (id) {
        const el = document.getElementById(id);
        el?.scrollIntoView({ behavior: "smooth", block: "center" });
        // Briefly highlight by triggering a flash class.
        el?.classList.add("od-flash");
        setTimeout(() => el?.classList.remove("od-flash"), 900);
      }
      return;
    }
    // From other pages, navigate home with the month and tell the home
    // page which action to dispatch.
    const search = new URLSearchParams();
    search.set("month", month);
    if (op !== "csv" && op !== "run") {
      const id = targets.find((t) => t.op === op)?.clusterId;
      if (id) search.set("od", id);
    } else {
      search.set("od", op);
    }
    router.push(`/?${search.toString()}`);
  }

  return (
    <div className="od-topbar-op" role="group" aria-label="Health OS 快捷操作">
      {targets.map((t) => (
        <button
          data-op={t.op}
          key={t.op}
          onClick={() => dispatch(t.op)}
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
