import { deriveDataQuality, deriveDailyMetrics, deriveMealReactions, deriveTrendSummaries } from "@/lib/analysis/derive";
import { addDays, localDateKey } from "@/lib/analysis/date";
import type { AnalysisPayload, DataQuality, InsightCard, MealReactionMetric, TrendSummary } from "@/lib/analysis/types";
import type { TimelineRecord } from "@/lib/records/types";

function percent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function formatNumber(value: number | null, digits = 1) {
  if (value === null || !Number.isFinite(value)) {
    return "无数据";
  }
  return Number.isInteger(value) ? String(value) : value.toFixed(digits);
}

function trendLabel(trend: TrendSummary) {
  if (trend.delta === null) {
    return "暂无足够数据比较最近 7 天和前 7 天。";
  }

  const absolute = Math.abs(trend.delta);
  if (absolute < 0.25) {
    return `最近 7 天 ${trend.label} 与前 7 天基本持平。`;
  }

  const direction = trend.delta > 0 ? "上升" : "下降";
  return `最近 7 天 ${trend.label} 比前 7 天${direction} ${formatNumber(absolute)}${trend.unit}。`;
}

function dataQualityInsight(dataQuality: DataQuality, start: string, end: string): InsightCard {
  const supportLevel = dataQuality.recording_days < 7 ? "insufficient" : "weak";
  const trendStatus = dataQuality.enough_for_trends ? "可以观察基础趋势" : "暂时只适合检查记录连续性";

  return {
    id: "data-quality",
    insight_type: "data_quality",
    title: "数据质量",
    summary: `过去 ${dataQuality.range_days} 天有 ${dataQuality.recording_days} 天存在记录，睡前总结覆盖 ${percent(
      dataQuality.daily_summary_coverage
    )}，睡眠覆盖 ${percent(dataQuality.sleep_coverage)}，${trendStatus}。`,
    severity: dataQuality.recording_days < 7 ? "watch" : "info",
    support_level: supportLevel,
    date_range_start: start,
    date_range_end: end,
    sample_size: dataQuality.recording_days,
    evidence: dataQuality as unknown as Record<string, unknown>
  };
}

function trendInsights(trends: TrendSummary[], dataQuality: DataQuality, start: string, end: string): InsightCard[] {
  if (!dataQuality.enough_for_trends) {
    return [];
  }

  return trends
    .filter((trend) => trend.delta !== null && trend.coverage >= 0.35 && Math.abs(trend.delta) >= trendThreshold(trend))
    .map((trend) => ({
      id: `trend-${String(trend.metric_key)}`,
      insight_type: "trend" as const,
      title: `${trend.label}趋势`,
      summary: trendLabel(trend),
      severity: trend.metric_key === "skin_core_score" && (trend.delta ?? 0) > 0 ? "watch" : "info",
      support_level: "weak" as const,
      date_range_start: start,
      date_range_end: end,
      sample_size: trend.points.filter((point) => point.value !== null).length,
      metric_key: String(trend.metric_key),
      evidence: {
        current_avg: trend.current_avg,
        previous_avg: trend.previous_avg,
        delta: trend.delta,
        coverage: trend.coverage
      }
    }));
}

function trendThreshold(trend: TrendSummary) {
  if (trend.metric_key === "water_total_ml") {
    return 250;
  }
  return 0.75;
}

function mealReactionInsights(reactions: MealReactionMetric[], dataQuality: DataQuality, start: string, end: string): InsightCard[] {
  if (!dataQuality.enough_for_meal_reactions) {
    return [];
  }

  return reactions
    .filter((reaction) => reaction.exposed_count >= 3 && reaction.unexposed_count >= 3 && reaction.delta !== null && reaction.delta >= 1)
    .map((reaction) => ({
      id: `meal-reaction-${reaction.key}`,
      insight_type: "meal_reaction" as const,
      title: `${reaction.label}后的腹胀观察`,
      summary: `有记录的餐后反应中，${reaction.label}后的腹胀均值比其他餐高 ${formatNumber(
        reaction.delta
      )} 分。样本 ${reaction.exposed_count} 餐，暂作为候选观察。`,
      severity: "watch" as const,
      support_level: "weak" as const,
      date_range_start: start,
      date_range_end: end,
      sample_size: reaction.exposed_count,
      metric_key: "post_meal_2h_bloating",
      possible_confounders: ["餐前压力", "份量", "睡眠", "同日其他暴露"],
      evidence: reaction as unknown as Record<string, unknown>
    }));
}

function safetyInsights(records: TimelineRecord[], start: string, end: string): InsightCard[] {
  const bloodRecords = records.filter((record) => record.type === "bowel" && record.payload.blood_or_black_stool === true);
  if (bloodRecords.length === 0) {
    return [];
  }

  return [
    {
      id: "safety-blood-or-black-stool",
      insight_type: "safety_note",
      title: "异常排便记录提示",
      summary: "近期存在血便或黑便标记。系统不做诊断，这类记录只作为需要额外注意的安全提示。",
      severity: "attention",
      support_level: "weak",
      date_range_start: start,
      date_range_end: end,
      sample_size: bloodRecords.length,
      metric_key: "blood_or_black_stool",
      evidence: {
        record_ids: bloodRecords.map((record) => record.id)
      }
    }
  ];
}

export function buildAnalysisPayload(records: TimelineRecord[], rangeDays: number): AnalysisPayload {
  const end = new Date();
  const endDate = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}-${String(end.getDate()).padStart(2, "0")}`;
  const dailyMetrics = deriveDailyMetrics(records, rangeDays, endDate);
  const startDate = dailyMetrics[0]?.date ?? endDate;
  const dataQuality = deriveDataQuality(dailyMetrics, rangeDays);
  const trendSummaries = deriveTrendSummaries(dailyMetrics);
  const rangeStartDate = addDays(endDate, -(rangeDays - 1));
  const rangeRecords = records.filter((r) => localDateKey(r.occurred_at) >= rangeStartDate);
  const mealReactions = deriveMealReactions(rangeRecords);
  const insights = [
    dataQualityInsight(dataQuality, startDate, endDate),
    ...safetyInsights(records, startDate, endDate),
    ...trendInsights(trendSummaries, dataQuality, startDate, endDate),
    ...mealReactionInsights(mealReactions, dataQuality, startDate, endDate)
  ];

  return {
    generated_at: new Date().toISOString(),
    date_range: {
      start: startDate,
      end: endDate,
      range_days: rangeDays
    },
    data_quality: dataQuality,
    daily_metrics: dailyMetrics,
    trend_summaries: trendSummaries,
    meal_reactions: mealReactions,
    insights,
    recent_records: records.slice(0, 10)
  };
}
