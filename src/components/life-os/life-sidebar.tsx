"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Activity, ClipboardList, LayoutDashboard, Wallet } from "lucide-react";

import { MONTH_PATTERN } from "@/components/shared/use-selected-month";

import "./life-os.css";

type NavItem = {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  /** Receives the current pathname and query so sibling workspaces can differ. */
  isActive: (pathname: string, searchParams: URLSearchParams) => boolean;
};

const PRIMARY: NavItem[] = [
  {
    label: "总览",
    href: "/",
    icon: LayoutDashboard,
    isActive: (pathname) => pathname === "/"
  },
  {
    label: "营养",
    href: "/nutrition",
    icon: Activity,
    isActive: (pathname) => pathname === "/nutrition" || pathname.startsWith("/nutrition/")
  },
  {
    label: "支出",
    href: "/expenses/analytics",
    icon: Wallet,
    isActive: (pathname) => pathname === "/expenses" || pathname === "/expenses/analytics"
  },
  {
    label: "账单",
    href: "/expenses/transactions",
    icon: ClipboardList,
    isActive: (pathname, searchParams) => pathname === "/expenses/transactions" && searchParams.get("view") !== "recurring"
  }
];

// Phase 2 data-entry modules — all currently tagged 待开发 since the
// underlying health data sources (weight, BP, heart rate, steps, glucose)
// aren't yet wired. We render them so the navigation is honest about
// what's coming next, and the user gets a toast on click.
const COMING_SOON: { label: string; title: string }[] = [
  { label: "体重 · 周期", title: "周期性记录体重" },
  { label: "血压", title: "血压记录" },
  { label: "心率", title: "心率记录" },
  { label: "步数", title: "每日步数" },
  { label: "血糖 · 周期", title: "血糖周期记录" }
];

// Trends lives on the home page (per ui_redesign_plan.md §4.1) so it has
// no sidebar entry yet — promoting it later would clash with the Overview
// active state since both target "/".

// Footer settings link removed: /settings route is empty (no page.tsx)
// and a link going home with isActive=false would never highlight.
// Re-add when /settings has a real page.

function hrefWithMonth(href: string, month: string | null): string {
  if (!month || !MONTH_PATTERN.test(month)) return href;
  const separator = href.includes("?") ? "&" : "?";
  return `${href}${separator}month=${encodeURIComponent(month)}`;
}

function ComingSoonItem({ label, title }: { label: string; title: string }) {
  return (
    <div
      className="life-sidebar__link life-sidebar__coming-soon"
      onClick={(event) => {
        event.preventDefault();
        // Lightweight inline feedback (no toast provider here); the
        // status chip in the topbar will reflect any state changes.
        if (typeof window !== "undefined") {
          window.alert(`${label} — 即将上线（${title}）`);
        }
      }}
      role="link"
      tabIndex={0}
      title={title}
    >
      <span className="dot" style={{ width: 6, height: 6, borderRadius: 999, background: "var(--life-subtle)", display: "inline-block" }} />
      <span>{label}</span>
      <span className="life-sidebar__coming-soon-tag">待开发</span>
    </div>
  );
}

export function LifeSidebar() {
  const pathname = usePathname() ?? "/";
  const searchParams = useSearchParams();
  const month = searchParams?.get("month") ?? null;

  return (
    <aside className="life-sidebar" aria-label="主导航">
      <Link href={hrefWithMonth("/", month)} className="life-sidebar__brand" style={{ textDecoration: "none" }}>
        <span className="life-sidebar__logo" aria-hidden>
          <Activity strokeWidth={2.5} style={{ width: 20, height: 20 }} />
        </span>
        <span className="life-sidebar__brand-text">
          <span className="life-sidebar__name">Life OS</span>
          <span className="life-sidebar__tagline">Personal command center</span>
        </span>
      </Link>

      <nav className="life-sidebar__section" aria-label="Workspace">
        <span className="life-sidebar__section-label">Workspace</span>
        {PRIMARY.map((item) => {
          const Icon = item.icon;
          const active = item.isActive(pathname, searchParams);
          return (
            <div className="life-sidebar__item" key={`${item.href}-${item.label}`}>
              <Link
                href={hrefWithMonth(item.href, month)}
                className="life-sidebar__link"
                data-active={active ? "true" : "false"}
              >
                <Icon />
                <span>{item.label}</span>
              </Link>
            </div>
          );
        })}
      </nav>

      <nav className="life-sidebar__section" aria-label="数据录入">
        <span className="life-sidebar__section-label">
          数据录入
          <span className="od-nav-section-tag">待开发</span>
        </span>
        {COMING_SOON.map((item) => (
          <ComingSoonItem key={item.label} label={item.label} title={item.title} />
        ))}
      </nav>

      <div className="life-sidebar__spacer" />
    </aside>
  );
}
