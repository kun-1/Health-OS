"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, ReceiptText, Repeat, Wallet } from "lucide-react";

import "./expenses.css";

type SubNavItem = {
  id: string;
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
};

const ITEMS: SubNavItem[] = [
  { id: "analytics", label: "分析", href: "/expenses/analytics", icon: BarChart3 },
  { id: "transactions", label: "流水", href: "/expenses/transactions", icon: Wallet },
  { id: "receipts", label: "票据", href: "/expenses/receipts", icon: ReceiptText },
  { id: "recurring", label: "定期", href: "/expenses/recurring", icon: Repeat }
];

export function ExpensesSubNav() {
  const pathname = usePathname() ?? "";

  return (
    <nav aria-label="支出子导航" className="exp-tasknav">
      {ITEMS.map((item) => {
        const Icon = item.icon;
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.id}
            href={item.href}
            className="exp-tasknav__item"
            data-active={active ? "true" : "false"}
          >
            <Icon aria-hidden />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
