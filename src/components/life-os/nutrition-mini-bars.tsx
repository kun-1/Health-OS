import { clampScore, dimensionPct } from "@/lib/life-os/selectors";
import type { NutritionReport } from "@/lib/nutrition/types";

import "./life-os.css";

type Row = {
  key: "pdi" | "ahei" | "plate" | "upf";
  label: string;
  value: number;
  color: string;
};

export function NutritionMiniBars({ report }: { report: NutritionReport }) {
  const rows: Row[] = [
    {
      key: "pdi",
      label: "PDI 植物性",
      value: dimensionPct(report.pdi.total, report.pdi.max),
      color: "var(--life-green-strong)"
    },
    {
      key: "ahei",
      label: "AHEI 质量",
      value: dimensionPct(report.ahei.total, report.ahei.max),
      color: "var(--life-blue)"
    },
    {
      key: "plate",
      label: "餐盘结构",
      value: clampScore((1 - report.plate.deviation) * 100),
      color: "var(--life-orange)"
    },
    {
      key: "upf",
      label: "UPF 控制",
      value: clampScore((1 - report.upf.upfShare) * 100),
      color: "var(--life-danger)"
    }
  ];

  return (
    <div className="life-mini-bars">
      {rows.map((row) => (
        <div className="life-mini-bars__row" key={row.key}>
          <div className="life-mini-bars__track" aria-hidden>
            <span
              className="life-mini-bars__fill"
              style={{ width: `${row.value}%`, background: row.color }}
            />
          </div>
          <span className="life-mini-bars__label">{row.label}</span>
          <span className="life-mini-bars__value">{row.value}</span>
        </div>
      ))}
    </div>
  );
}
