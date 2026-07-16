"use client";

export type AnalysisViewTab = {
  id: string;
  label: string;
};

type Props = {
  tabs: readonly AnalysisViewTab[];
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
};

export function AnalysisViewTabs({ tabs, value, onChange, ariaLabel }: Props) {
  return (
    <div className="life-analysis-tabs" role="tablist" aria-label={ariaLabel}>
      {tabs.map((tab) => (
        <button
          aria-selected={value === tab.id}
          className={value === tab.id ? "is-active" : ""}
          key={tab.id}
          onClick={() => onChange(tab.id)}
          role="tab"
          type="button"
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
