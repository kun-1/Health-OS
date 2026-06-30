"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, BarChart3, LayoutDashboard, ReceiptText, Settings as SettingsIcon, Wallet } from "lucide-react";

import "./life-os.css";

type NavItem = {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  /** Treat as active when pathname starts with this prefix. */
  matchPrefix?: string;
};

const PRIMARY: NavItem[] = [
  { label: "总览", href: "/", icon: LayoutDashboard },
  { label: "营养", href: "/nutrition", icon: Activity, matchPrefix: "/nutrition" },
  { label: "支出", href: "/expenses", icon: Wallet, matchPrefix: "/expenses" },
  { label: "票据", href: "/expenses?task=receipts", icon: ReceiptText, matchPrefix: "/expenses" }
];

const INSIGHTS: NavItem[] = [
  { label: "趋势", href: "/", icon: BarChart3 }
];

const FOOTER: NavItem[] = [
  // /settings route doesn't exist yet — link still appears so the IA matches
  // the reference, but it leads home for now. Will be wired in Phase B/C.
  { label: "设置", href: "/", icon: SettingsIcon }
];

function isActive(item: NavItem, pathname: string): boolean {
  if (item.matchPrefix) return pathname.startsWith(item.matchPrefix);
  if (item.href === "/") return pathname === "/";
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export function LifeSidebar() {
  const pathname = usePathname() ?? "/";

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
          const active = isActive(item, pathname);
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

      <nav className="life-sidebar__group" aria-label="洞察">
        <span className="life-sidebar__group-label">洞察</span>
        {INSIGHTS.map((item) => {
          const Icon = item.icon;
          const active = isActive(item, pathname);
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
          const active = isActive(item, pathname);
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