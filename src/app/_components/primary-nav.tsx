"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navLabelMap = new Map([
  ["Today", "今日"],
  ["Timeline", "时间线"],
  ["Expenses", "支出"],
  ["Insights", "洞察"],
  ["Trends", "趋势"],
  ["Decisions", "决策"],
  ["Settings", "设置"]
]);

export function PrimaryNav({ items }: { items: ReadonlyArray<readonly [string, string]> }) {
  const pathname = usePathname() ?? "/";

  return (
    <>
      {items.map(([label, href]) => {
        const isActive =
          href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);

        return (
          <Link
            key={href}
            href={href}
            data-active={isActive ? "true" : undefined}
            className="nav-link rounded-md px-3 py-2 text-slate-400 transition hover:bg-white/10 hover:text-white"
          >
            {navLabelMap.get(label) ?? label}
          </Link>
        );
      })}
    </>
  );
}
