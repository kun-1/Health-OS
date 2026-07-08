import type { ReactNode } from "react";

import "./od-home.css";

type TagTone = "nutrition" | "spending" | "health" | "sleep" | "muted";

type Props = {
  label: string;
  value: ReactNode;
  /** Secondary line, e.g. "↑ 4 vs 上周". */
  delta?: ReactNode;
  /** Inline tag with tone applied. */
  tag?: { tone: TagTone; text: string };
  /** Optional right-side link button (e.g. "查看营养"). */
  link?: { label: string } & ({ href: string; onClick?: never } | { onClick: () => void; href?: never });
};

/** Compact KPI card per the OD reference. Sits in a 4-column grid; the
 *  value is large + tabular, the meta line holds an inline tag and a
 *  link affordance. */
export function ODKpiCard({ label, value, delta, tag, link }: Props) {
  return (
    <div className="od-kpi-card">
      <div className="od-kpi-label">{label}</div>
      <div className="od-kpi-value">{value}</div>
      {delta ? <div style={{ fontSize: 11, color: "var(--od-muted)" }}>{delta}</div> : null}
      <div className="od-kpi-meta">
        {tag ? <span className={`od-kpi-tag ${tag.tone}`}>{tag.text}</span> : <span />}
        {link ? (
          link.href ? (
            <a className="od-kpi-link" href={link.href}>
              {link.label}
            </a>
          ) : (
            <button className="od-kpi-link" onClick={link.onClick} type="button">
              {link.label}
            </button>
          )
        ) : null}
      </div>
    </div>
  );
}
