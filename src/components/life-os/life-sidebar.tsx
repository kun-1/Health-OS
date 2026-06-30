"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Activity, LayoutDashboard, ReceiptText, Settings as SettingsIcon, Wallet } from "lucide-react";

import "./life-os.css";

type NavItem = {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  /** Receives pathname + current `task` query param (or null). */
  isActive: (pathname: string, task: string | null) => boolean;
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
    isActive: (pathname, task) =>
      (pathname === "/expenses" || pathname.startsWith("/expenses/")) && task !== "receipts"
  },
  {
    label: "票据",
    href: "/expenses?task=receipts",
    icon: ReceiptText,
    isActive: (pathname, task) =>
      (pathname === "/expenses" || pathname.startsWith("/expenses/")) && task === "receipts"
  }
];

// Trends lives on the home page (per ui_redesign_plan.md §4.1) so it has
// no sidebar entry yet — promoting it later would clash with the Overview
// active state since both target "/".

const FOOTER: NavItem[] = [
  // /settings route doesn't exist yet — link still appears so the IA matches
  // the reference, but it leads home for now. Will be wired in Phase B/C.
  {
    label: "设置",
    href: "/",
    icon: SettingsIcon,
    isActive: () => false
  }
];

export function LifeSidebar() {
  const pathname = usePathname() ?? "/";
  const searchParams = useSearchParams();
  const task = searchParams?.get("task") ?? null;

  return (
    <aside className="life-sidebar" aria-label="主导航">
      <Link href="/" className="life-sidebar__brand" style={{ textDecoration: "none" }}>
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
          const active = item.isActive(pathname, task);
          return (
            <Link
              key={`${item.href}-${item.label}`}
              href={item.href}
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

      <nav className="life-sidebar__footer" aria-label="系统">
        {FOOTER.map((item) => {
          const Icon = item.icon;
          const active = item.isActive(pathname, task);
          return (
            <Link
              key={`${item.href}-${item.label}`}
              href={item.href}
              className="life-sidebar__link"
              data-active={active ? "true" : "false"}
            >
              <Icon />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}