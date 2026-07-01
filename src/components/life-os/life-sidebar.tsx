"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Activity, LayoutDashboard, Wallet } from "lucide-react";

import { MONTH_PATTERN } from "@/components/shared/use-selected-month";

import "./life-os.css";

type NavItem = {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  /** Receives the current pathname. */
  isActive: (pathname: string) => boolean;
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
    href: "/expenses",
    icon: Wallet,
    // Highlight the whole expenses section, including sub-routes like
    // /expenses/analytics, /expenses/transactions, /expenses/receipts and
    // /expenses/recurring.
    isActive: (pathname) => pathname === "/expenses" || pathname.startsWith("/expenses/")
  }
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

      <nav className="life-sidebar__group" aria-label="主模块">
        <span className="life-sidebar__group-label">主模块</span>
        {PRIMARY.map((item) => {
          const Icon = item.icon;
          const active = item.isActive(pathname);
          return (
            <Link
              key={`${item.href}-${item.label}`}
              href={hrefWithMonth(item.href, month)}
              className="life-sidebar__link"
              data-active={active ? "true" : "false"}
            >
              <Icon />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="life-sidebar__spacer" />
    </aside>
  );
}