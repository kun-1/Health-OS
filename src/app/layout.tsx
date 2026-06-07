import type { Metadata, Viewport } from "next";
import Link from "next/link";

import "./globals.css";

export const metadata: Metadata = {
  title: "Health Monitor",
  description: "Personal health record layer",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Health Monitor"
  }
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#2f6f68"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const navItems = [
    ["Today", "/"],
    ["Timeline", "/timeline"],
    ["Expenses", "/expenses"],
    ["Insights", "/insights"],
    ["Trends", "/trends"],
    ["Decisions", "/decisions"],
    ["Settings", "/settings"]
  ];

  return (
    <html lang="zh-CN">
      <body>
        <header className="sticky top-0 z-10 border-b border-[rgba(38,55,49,0.10)] bg-white/75 backdrop-blur-xl">
          <nav className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <Link className="text-base font-bold text-[#17201c]" href="/">
              Health Monitor
            </Link>
            <div className="flex max-w-full gap-1 overflow-x-auto whitespace-nowrap text-sm font-semibold">
              {navItems.map(([label, href]) => (
                <Link className="rounded-md px-3 py-2 text-[#5d6963] transition hover:bg-white hover:text-[#17201c]" href={href} key={href}>
                  {label}
                </Link>
              ))}
            </div>
          </nav>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
