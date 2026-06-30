import type { ReactNode } from "react";

import { LifeSidebar } from "./life-sidebar";
import { LifeTopbar } from "./life-topbar";
import "./life-os.css";

type Props = {
  children: ReactNode;
};

/**
 * Top-level layout for Life OS pages. Renders the global sidebar and topbar
 * and slots page content into the right pane.
 *
 * The sidebar reads the current pathname, so the shell itself stays a
 * server component and only the sidebar is "use client".
 */
export function LifeShell({ children }: Props) {
  return (
    <div className="life-shell">
      <LifeSidebar />
      <div className="life-main">
        <LifeTopbar />
        <div className="life-content">{children}</div>
      </div>
    </div>
  );
}