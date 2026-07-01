import Link from "next/link";
import type { ReactNode } from "react";

import "./life-os.css";

type Variant = "neutral" | "highlight" | "warning";

type State = "ok" | "loading" | "error";

type Props = {
  title: string;
  value?: ReactNode;
  /** Small inline element under the value (delta, sub-metric, etc). */
  delta?: ReactNode;
  /** Tiny grey footer line for caveats / "数据加载中" hints. */
  footnote?: ReactNode;
  /** Optional icon shown next to the title. */
  icon?: ReactNode;
  /** Visual emphasis. `highlight` paints a green icon + green value to
   *  keep the card visually primary without breaking the all-white card
   *  surface. */
  variant?: Variant;
  /** If provided, the whole card becomes a link. */
  href?: string;
  /** Force a smaller value font, useful for long numbers. */
  compactValue?: boolean;
  /** Loading / error override. Defaults to "ok". */
  state?: State;
  /** Error message shown when state="error". */
  errorMessage?: string;
  /** Extra content rendered between the delta and the footnote. */
  children?: ReactNode;
};

function ValueSkeleton() {
  return <span className="life-skeleton life-skeleton--value" aria-hidden />;
}

function ValueError({ message }: { message?: string }) {
  return (
    <span className="life-card__value-error" title={message} role="status">
      —
      <span className="life-card__value-error-hint">数据加载失败</span>
    </span>
  );
}

export function MetricCard({
  title,
  value,
  delta,
  footnote,
  icon,
  variant = "neutral",
  href,
  compactValue,
  state = "ok",
  errorMessage,
  children
}: Props) {
  const body = (
    <article className={`life-card${href ? " life-card--clickable" : ""}`} data-variant={variant}>
      <header className="life-card__header">
        <span className="life-card__title">{title}</span>
        {icon ? <span className="life-card__icon">{icon}</span> : null}
      </header>
      {state === "loading" ? (
        <ValueSkeleton />
      ) : state === "error" ? (
        <ValueError message={errorMessage} />
      ) : (
        <div className={compactValue ? "life-card__value life-card__value--sm" : "life-card__value"}>
          {value ?? "—"}
        </div>
      )}
      {delta && state !== "loading" ? <div className="life-card__delta">{delta}</div> : null}
      {children}
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