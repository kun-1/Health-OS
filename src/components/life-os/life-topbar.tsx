"use client";

import { Loader2, RefreshCw } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";

import "./life-os.css";

import { MonthSwitcher } from "@/components/shared/month-switcher";
import { useRefreshing } from "@/components/shared/refreshing-context";
import { useSelectedMonth } from "@/components/shared/use-selected-month";

type OpAction = "new-receipt" | "open-budget" | "batch-confirm" | "run-rules" | "export-csv";

type OpTarget = {
  op: string;
  label: string;
  action: OpAction;
};

// Actions that don't produce their own toast in the downstream handler
// (the others call toast.show / navigate-with-feedback on their own).
const SILENT_ACTIONS = new Set<OpAction>(["new-receipt", "open-budget"]);

function OpQuickButtons({ month }: { month: string }) {
  const router = useRouter();
  const pathname = usePathname();

  // The ledger workspace owns receipt upload, manual entry, export, and
  // selection actions. Keeping the global command rail visible here created
  // duplicate controls, and several of those commands only navigated back to
  // the same page instead of performing an action.
  if (pathname.startsWith("/expenses/transactions")) return null;

  const targets: OpTarget[] = [
    { op: "receipt", label: "新增票据", action: "new-receipt" },
    { op: "budget", label: "预算", action: "open-budget" },
    { op: "confirm", label: "批量入账", action: "batch-confirm" },
    { op: "run", label: "跑规则", action: "run-rules" },
    { op: "csv", label: "导出 CSV", action: "export-csv" }
  ];

  function navigateWithMonth(href: string) {
    const search = new URLSearchParams();
    search.set("month", month);
    router.push(`${href}?${search.toString()}`);
  }

  function dispatchAction(action: OpAction, label: string) {
    const onHome = pathname === "/";
    if (action === "new-receipt") {
      navigateWithMonth("/expenses/transactions");
    } else if (action === "run-rules") {
      const search = new URLSearchParams({ month, view: "recurring" });
      router.push(`/expenses/transactions?${search.toString()}`);
    } else if (onHome && action !== "batch-confirm" && action !== "open-budget") {
      window.dispatchEvent(new CustomEvent(`od:${action}`));
    } else {
      navigateWithMonth(action === "open-budget" ? "/expenses/analytics" : "/expenses/transactions");
    }
    if (SILENT_ACTIONS.has(action)) {
      window.dispatchEvent(new CustomEvent("od:op-quick-fired", { detail: { label } }));
    }
  }

  return (
    <div className="od-topbar-op" role="group" aria-label="Health OS 快捷操作">
      {targets.map((t) => (
        <button data-op={t.op} key={t.op} onClick={() => dispatchAction(t.action, t.label)} type="button">
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function LifeTopbar() {
  const selectedMonth = useSelectedMonth();
  const { refreshing } = useRefreshing();
  return (
    <header className="life-topbar" role="banner">
      <div className="od-topbar-status" role="status" aria-live="polite">
        <span
          aria-hidden
          className={`od-status-dot${refreshing ? "" : " synced"}`}
        />
        <span>{refreshing ? "updating" : "synced"}</span>
      </div>

      <MonthSwitcher month={selectedMonth} />

      <div className="life-topbar__spacer" />

      <div className="life-topbar__actions">
        <span className="od-topbar-status-chip" aria-label="Health OS controls mapped">
          <span className="dot" aria-hidden />
          Health OS controls mapped
        </span>
        <OpQuickButtons month={selectedMonth} />
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
      </div>
    </header>
  );
}
