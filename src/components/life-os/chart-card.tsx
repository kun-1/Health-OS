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
    <section className="life-card life-chart-card">
      <header className="life-card__header">
        <div className="life-chart-card__heading">
          <span className="life-card__title">{title}</span>
          {subtitle ? (
            <span className="life-chart-card__subtitle">{subtitle}</span>
          ) : null}
        </div>
        {toolbar ? <div className="life-chart-card__toolbar">{toolbar}</div> : null}
      </header>
      <div className="life-chart-card__body">{children}</div>
      {footer ? <div className="life-card__footnote">{footer}</div> : null}
    </section>
  );
}
