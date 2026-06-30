import { clampScore, dimensionPct } from "@/lib/life-os/selectors";
import type { NutritionReport } from "@/lib/nutrition/types";

import "./life-os.css";

type Props = {
  report: NutritionReport;
};

type Row = {
  key: "pdi" | "ahei" | "plate" | "upf";
  label: string;
  /** 0–100 score (UPF inverted: lower UPF share → higher score). */
  value: number;
  /** Right-side footnote explaining the raw metric for context. */
  meta: string;
  /** Color tint for the bar. */
  color: string;
};

export function NutritionBreakdown({ report }: Props) {
  const rows: Row[] = [
    {
      key: "pdi",
      label: "PDI 植物性指数",
      value: dimensionPct(report.pdi.total, report.pdi.max),
      meta: `${report.pdi.total} / ${report.pdi.max} 分`,
      color: "#9bea3d"
    },
    {
      key: "ahei",
      label: "AHEI 综合饮食质量",
      value: dimensionPct(report.ahei.total, report.ahei.max),
      meta: `${report.ahei.total} / ${report.ahei.max} 分`,
      color: "#83b7ff"
    },
    {
      key: "plate",
      label: "餐盘结构",
      value: clampScore((1 - report.plate.deviation) * 100),
      meta: `偏离理想 ${(report.plate.deviation * 100).toFixed(0)}%`,
      color: "#ff9f45"
    },
    {
      key: "upf",
      label: "UPF 超加工占比",
      value: clampScore((1 - report.upf.upfShare) * 100),
      meta: `占比 ${(report.upf.upfShare * 100).toFixed(0)}%`,
      color: "#ff6b6b"
    }
  ];

  return (
    <section className="life-card">
      <header className="life-card__header">
        <span className="life-card__title">营养结构 · 四维</span>
        <span style={{ fontSize: "0.74rem", color: "#50585E", fontWeight: 600 }}>
          覆盖 {report.coveragePct.toFixed(0)}% · {report.itemsWithWeight} 项有重量
        </span>
      </header>
      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 14 }}>
        {rows.map((row) => (
          <li key={row.key} className="life-breakdown__row">
            <div className="life-breakdown__row-head">
              <span className="life-breakdown__row-label">{row.label}</span>
              <span className="life-breakdown__row-value">{row.value}</span>
            </div>
            <div className="life-breakdown__track" aria-hidden>
              <span
                className="life-breakdown__fill"
                style={{ width: `${row.value}%`, background: row.color }}
              />
            </div>
            <div className="life-breakdown__row-meta">{row.meta}</div>
          </li>
        ))}
      </ul>
      <div className="life-card__footnote">
        数据基于本月购买票据的重量和分类，结构得分仅作参考；详细覆盖项见 /nutrition
      </div>
    </section>
  );
}