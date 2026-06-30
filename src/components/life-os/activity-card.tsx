import { AlertCircle, ReceiptText, TrendingUp } from "lucide-react";

import "./life-os.css";

export type ActivityEntry = {
  icon: "alert" | "receipt" | "trend";
  title: string;
  meta: string;
};

const ICONS = {
  alert: AlertCircle,
  receipt: ReceiptText,
  trend: TrendingUp
};

type Props = {
  entries: ReadonlyArray<ActivityEntry>;
};

export function ActivityCard({ entries }: Props) {
  return (
    <section className="life-card">
      <header className="life-card__header">
        <span className="life-card__title">最近动态</span>
      </header>
      {entries.length === 0 ? (
        <div
          style={{
            padding: "20px 12px",
            textAlign: "center",
            color: "var(--life-muted)",
            fontSize: "0.84rem",
            fontWeight: 600
          }}
        >
          还没有可观察的动态
          <div style={{ marginTop: 4, color: "var(--life-subtle)", fontWeight: 500 }}>
            数据加载完成后会显示三条洞察
          </div>
        </div>
      ) : (
        <ul className="life-activity__list" style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {entries.map((entry, idx) => {
            const Icon = ICONS[entry.icon];
            return (
              <li key={`${entry.title}-${idx}`} className="life-activity__item">
                <span className="life-activity__icon">
                  <Icon />
                </span>
                <div className="life-activity__body">
                  <span className="life-activity__title">{entry.title}</span>
                  <span className="life-activity__meta">{entry.meta}</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}