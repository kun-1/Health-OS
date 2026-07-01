import type { ReactNode } from "react";

import { RefreshingProvider } from "@/components/shared/refreshing-context";

import { LifeSidebar } from "./life-sidebar";
import { LifeTopbar } from "./life-topbar";
import "./life-os.css";

type Props = {
  children: ReactNode;
};

/**
 * Top-level layout for Life OS pages. Renders the global sidebar and
 * topbar and slots page content into the right pane. The RefreshingProvider
 * makes the page-level "data is refetching" signal available to the topbar
 * so the "更新中…" pill can appear without prop drilling.
 */
export function LifeShell({ children }: Props) {
  return (
    <RefreshingProvider>
      <div className="life-shell">
        <LifeSidebar />
        <div className="life-main">
          <LifeTopbar />
          <div className="life-content">{children}</div>
        </div>
      </div>
    </RefreshingProvider>
  );
}