import Link from "next/link";
import type { ReactNode } from "react";

import "./life-os.css";

type Variant = "neutral" | "highlight" | "warning";

type Props = {
  title: string;
  value: ReactNode;
  /** Small inline element under the value (delta, sub-metric, etc). */
  delta?: ReactNode;
  /** Tiny grey footer line for caveats / "数据加载中" hints. */
  footnote?: ReactNode;
  /** Optional icon shown next to the title. */
  icon?: ReactNode;
  /** Visual emphasis. `highlight` paints the green gradient per reference. */
  variant?: Variant;
  /** If provided, the whole card becomes a link. */
  href?: string;
  /** Force a smaller value font, useful for long numbers. */
  compactValue?: boolean;
};

export function MetricCard({
  title,
  value,
  delta,
  footnote,
  icon,
  variant = "neutral",
  href,
  compactValue
}: Props) {
  const body = (
    <article className={`life-card life-card--clickable${href ? "" : ""}`} data-variant={variant}>
      <header className="life-card__header">
        <span className="life-card__title">{title}</span>
        {icon ? <span className="life-card__icon">{icon}</span> : null}
      </header>
      <div className={compactValue ? "life-card__value life-card__value--sm" : "life-card__value"}>{value}</div>
      {delta ? <div className="life-card__delta">{delta}</div> : null}
      {footnote ? <div className="life-card__footnote">{footnote}</div> : null}
    </article>
  );

  if (!href) return body;
  return (
    <Link href={href} style={{ textDecoration: "none", color: "inherit", display: "block" }}>
      {body}
    </Link>
  );
}