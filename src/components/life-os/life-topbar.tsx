"use client";

import { Loader2 } from "lucide-react";

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

export function LifeTopbar({ greeting, dateLabel }: Props) {
  const subtitle = dateLabel ?? todayLabel();
  const selectedMonth = useSelectedMonth();
  const { refreshing } = useRefreshing();
  return (
    <header className="life-topbar" role="banner">
      <div className="life-topbar__greeting">
        <span className="life-topbar__title">{greeting ?? "欢迎回来，今天的生活数据一览"}</span>
        <span className="life-topbar__subtitle">{subtitle}</span>
      </div>

      <div className="life-topbar__spacer" />

      <div className="life-topbar__actions">
        {refreshing ? (
          <span className="life-topbar__refresh" role="status" aria-live="polite">
            <Loader2 strokeWidth={2} className="life-topbar__refresh-icon" aria-hidden />
            更新中…
          </span>
        ) : null}
        <MonthSwitcher month={selectedMonth} />
      </div>
    </header>
  );
}