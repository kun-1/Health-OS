import type { TimelineRecord } from "@/lib/records/types";

export type SupportLevel = "insufficient" | "weak" | "moderate";

export type TrendDirection = "up" | "down" | "flat" | "unknown";

export type DailyMetric = {
  date: string;
  record_count: number;
  meal_count: number;
  supplement_count: number;
  post_meal_symptom_count: number;
  bowel_count: number;
  water_total_ml: number | null;
  coffee_count: number;
  processed_food_count: number;
  additive_high_count: number;
  fried_food_count: number;
  skin_core_score: number | null;
  skin_area_change: number | null;
  nasal_core_score: number | null;
  day_stress_peak: number | null;
  meal_context_stress_avg: number | null;
  meal_context_stress_max: number | null;
  sleep_duration_hours: number | null;
  sleep_quality: number | null;
  bristol_median: number | null;
  bristol_abnormal_count: number;
  strain_max: number | null;
  bloating_avg: number | null;
  bloating_max: number | null;
  pain_avg: number | null;
  fiber_diversity_score: number | null;
  blood_or_black_stool_count: number;
};

export type DataQuality = {
  range_days: number;
  recording_days: number;
  daily_summary_coverage: number;
  sleep_coverage: number;
  meal_coverage: number;
  bowel_coverage: number;
  post_meal_symptom_coverage: number;
  water_coverage: number;
  enough_for_trends: boolean;
  enough_for_meal_reactions: boolean;
};

export type TrendPoint = {
  date: string;
  value: number | null;
};

export type TrendSummary = {
  metric_key: keyof DailyMetric;
  label: string;
  unit: string;
  direction: TrendDirection;
  current_avg: number | null;
  previous_avg: number | null;
  delta: number | null;
  coverage: number;
  points: TrendPoint[];
};

export type MealReactionMetric = {
  key: string;
  label: string;
  exposed_count: number;
  unexposed_count: number;
  exposed_bloating_avg: number | null;
  unexposed_bloating_avg: number | null;
  delta: number | null;
};

export type InsightCard = {
  id: string;
  insight_type: "data_quality" | "trend" | "meal_reaction" | "safety_note";
  title: string;
  summary: string;
  severity: "info" | "watch" | "attention";
  support_level: SupportLevel;
  date_range_start: string;
  date_range_end: string;
  sample_size: number;
  metric_key?: string;
  possible_confounders?: string[];
  evidence: Record<string, unknown>;
};

export type AnalysisPayload = {
  generated_at: string;
  date_range: {
    start: string;
    end: string;
    range_days: number;
  };
  data_quality: DataQuality;
  daily_metrics: DailyMetric[];
  trend_summaries: TrendSummary[];
  meal_reactions: MealReactionMetric[];
  insights: InsightCard[];
  recent_records: TimelineRecord[];
};
