import { Bell, CalendarDays, Download, HelpCircle } from "lucide-react";

import "./life-os.css";

type Props = {
  /** Override the welcome line. Default uses a fixed copy for Phase A. */
  greeting?: string;
  /** Override the date subtitle. Defaults to today in zh-CN. */
  dateLabel?: string;
  /** Override the month chip label. Defaults to current YYYY 年 M 月. */
  monthLabel?: string;
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

function defaultMonthLabel(): string {
  const now = new Date();
  return `${now.getFullYear()} 年 ${now.getMonth() + 1} 月`;
}

export function LifeTopbar({ greeting, dateLabel, monthLabel }: Props) {
  const subtitle = dateLabel ?? todayLabel();
  const month = monthLabel ?? defaultMonthLabel();
  return (
    <header className="life-topbar" role="banner">
      <div className="life-topbar__greeting">
        <span className="life-topbar__title">{greeting ?? "欢迎回来，今天的生活数据一览"}</span>
        <span className="life-topbar__subtitle">{subtitle}</span>
      </div>

      <div className="life-topbar__spacer" />

      <div className="life-topbar__actions">
        <span className="life-topbar__chip" aria-label={`当前月份：${month}`}>
          <CalendarDays strokeWidth={2} style={{ width: 14, height: 14 }} />
          {month}
        </span>
        <button type="button" className="life-topbar__icon-btn" aria-label="导出" title="导出（Phase A 占位）">
          <Download />
        </button>
        <button type="button" className="life-topbar__icon-btn" aria-label="通知" title="通知（Phase A 占位）">
          <Bell />
        </button>
        <button type="button" className="life-topbar__icon-btn" aria-label="帮助" title="帮助（Phase A 占位）">
          <HelpCircle />
        </button>
      </div>
    </header>
  );
}