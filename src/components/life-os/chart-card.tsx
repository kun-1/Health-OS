import type { ReactNode } from "react";

import "./life-os.css";

type Props = {
  title: string;
  subtitle?: ReactNode;
  /** Right-aligned controls (e.g. period selector). */
  toolbar?: ReactNode;
  /** Chart body or placeholder. */
  children: ReactNode;
  /** Optional footer insight line. */
  footer?: ReactNode;
};

export function ChartCard({ title, subtitle, toolbar, children, footer }: Props) {
  return (
    <section className="life-card">
      <header className="life-card__header">
        <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
          <span className="life-card__title">{title}</span>
          {subtitle ? (
            <span style={{ fontSize: "0.78rem", color: "var(--life-muted)" }}>{subtitle}</span>
          ) : null}
        </div>
        {toolbar ? <div>{toolbar}</div> : null}
      </header>
      <div style={{ flex: 1, minHeight: 0 }}>{children}</div>
      {footer ? <div className="life-card__footnote">{footer}</div> : null}
    </section>
  );
}