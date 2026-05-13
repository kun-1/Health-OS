import { dateRange, localDateKey } from "@/lib/analysis/date";
import type { DailyMetric, DataQuality, MealReactionMetric, TrendSummary } from "@/lib/analysis/types";
import type { TimelineRecord } from "@/lib/records/types";

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function booleanValue(value: unknown) {
  return typeof value === "boolean" ? value : null;
}

function textValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function average(values: Array<number | null | undefined>) {
  const clean = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (clean.length === 0) {
    return null;
  }
  return clean.reduce((total, value) => total + value, 0) / clean.length;
}

function median(values: number[]) {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function maxNullable(values: Array<number | null | undefined>) {
  const clean = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return clean.length ? Math.max(...clean) : null;
}

function recordDate(record: TimelineRecord) {
  if (record.type === "daily_summary") {
    return textValue(record.payload.summary_date) ?? localDateKey(record.occurred_at);
  }
  if (record.type === "sleep") {
    return textValue(record.payload.sleep_date) ?? localDateKey(record.occurred_at);
  }
  return localDateKey(record.occurred_at);
}

function hasMethod(record: TimelineRecord, method: string) {
  const items = record.payload.food_items;
  return Array.isArray(items) && items.some((item) => item && typeof item === "object" && "method" in item && item.method === method);
}

function fiberScore(payload: Record<string, unknown>) {
  const vegetable = numberValue(payload.vegetable_count);
  const fruit = numberValue(payload.fruit_count);
  const legume = booleanValue(payload.legume);
  const wholeGrain = booleanValue(payload.whole_grain);
  const fermentedFood = booleanValue(payload.fermented_food);

  if (vegetable === null && fruit === null && legume === null && wholeGrain === null && fermentedFood === null) {
    return null;
  }

  return (
    (vegetable ?? 0) +
    (fruit ?? 0) +
    (legume === true ? 1 : 0) +
    (wholeGrain === true ? 1 : 0) +
    (fermentedFood === true ? 1 : 0)
  );
}

function emptyDailyMetric(date: string): DailyMetric {
  return {
    date,
    record_count: 0,
    meal_count: 0,
    supplement_count: 0,
    post_meal_symptom_count: 0,
    bowel_count: 0,
    water_total_ml: null,
    coffee_count: 0,
    processed_food_count: 0,
    additive_high_count: 0,
    fried_food_count: 0,
    skin_core_score: null,
    skin_area_change: null,
    nasal_core_score: null,
    day_stress_peak: null,
    meal_context_stress_avg: null,
    meal_context_stress_max: null,
    sleep_duration_hours: null,
    sleep_quality: null,
    bristol_median: null,
    bristol_abnormal_count: 0,
    strain_max: null,
    bloating_avg: null,
    bloating_max: null,
    pain_avg: null,
    fiber_diversity_score: null,
    blood_or_black_stool_count: 0
  };
}

export function deriveDailyMetrics(records: TimelineRecord[], rangeDays: number, endDate = localDateKey(new Date())) {
  const dates = dateRange(endDate, rangeDays);
  const byDate = new Map(dates.map((date) => [date, emptyDailyMetric(date)]));
  const mealStress = new Map<string, number[]>();
  const bristolValues = new Map<string, number[]>();
  const strainValues = new Map<string, number[]>();
  const bloatingValues = new Map<string, number[]>();
  const painValues = new Map<string, number[]>();

  for (const record of records) {
    const date = recordDate(record);
    const metric = byDate.get(date);
    if (!metric) {
      continue;
    }

    metric.record_count += 1;

    if (record.type === "meal") {
      metric.meal_count += 1;
      if (record.payload.processed_food === true) {
        metric.processed_food_count += 1;
      }
      if (record.payload.additive_risk_level === "high") {
        metric.additive_high_count += 1;
      }
      if (hasMethod(record, "deep_fry")) {
        metric.fried_food_count += 1;
      }
      const stress = numberValue(record.payload.stress_before);
      if (stress !== null) {
        mealStress.set(date, [...(mealStress.get(date) ?? []), stress]);
      }
    }

    if (record.type === "supplement") {
      metric.supplement_count += 1;
    }

    if (record.type === "water") {
      const amount = numberValue(record.payload.amount_ml);
      if (amount !== null) {
        metric.water_total_ml = (metric.water_total_ml ?? 0) + amount;
      }
      if (record.payload.drink_type === "coffee") {
        metric.coffee_count += 1;
      }
    }

    if (record.type === "bowel") {
      metric.bowel_count += 1;
      const bristol = numberValue(record.payload.bristol_type);
      if (bristol !== null) {
        bristolValues.set(date, [...(bristolValues.get(date) ?? []), bristol]);
        if (bristol <= 2 || bristol >= 6) {
          metric.bristol_abnormal_count += 1;
        }
      }
      const strain = numberValue(record.payload.strain_level);
      if (strain !== null) {
        strainValues.set(date, [...(strainValues.get(date) ?? []), strain]);
        if (strain >= 2 && bristol !== null && bristol >= 3 && bristol <= 5) {
          metric.bristol_abnormal_count += 1;
        }
      }
      if (record.payload.urgency === true && bristol !== null && bristol < 6) {
        metric.bristol_abnormal_count += 1;
      }
      if (record.payload.blood_or_black_stool === true) {
        metric.blood_or_black_stool_count += 1;
      }
    }

    if (record.type === "post_meal_symptom") {
      metric.post_meal_symptom_count += 1;
      const bloating = numberValue(record.payload.post_meal_2h_bloating);
      if (bloating !== null) {
        bloatingValues.set(date, [...(bloatingValues.get(date) ?? []), bloating]);
      }
      const pain = numberValue(record.payload.post_meal_2h_pain);
      if (pain !== null) {
        painValues.set(date, [...(painValues.get(date) ?? []), pain]);
      }
    }

    if (record.type === "daily_summary") {
      const redness = numberValue(record.payload.skin_redness);
      const scaling = numberValue(record.payload.skin_scaling);
      const itch = numberValue(record.payload.skin_itch);
      metric.skin_core_score =
        redness !== null && scaling !== null && itch !== null ? redness + scaling + itch : metric.skin_core_score;
      metric.skin_area_change = numberValue(record.payload.skin_area_change);
      metric.nasal_core_score = numberValue(record.payload.nasal_blockage);
      metric.day_stress_peak = numberValue(record.payload.stress_peak);
      metric.fiber_diversity_score = fiberScore(record.payload);
    }

    if (record.type === "sleep") {
      metric.sleep_duration_hours = numberValue(record.payload.sleep_duration_hours);
      metric.sleep_quality = numberValue(record.payload.sleep_quality);
    }
  }

  for (const metric of byDate.values()) {
    metric.meal_context_stress_avg = average(mealStress.get(metric.date) ?? []);
    metric.meal_context_stress_max = maxNullable(mealStress.get(metric.date) ?? []);
    metric.bristol_median = median(bristolValues.get(metric.date) ?? []);
    metric.strain_max = maxNullable(strainValues.get(metric.date) ?? []);
    metric.bloating_avg = average(bloatingValues.get(metric.date) ?? []);
    metric.bloating_max = maxNullable(bloatingValues.get(metric.date) ?? []);
    metric.pain_avg = average(painValues.get(metric.date) ?? []);
  }

  return [...byDate.values()];
}

export function deriveDataQuality(metrics: DailyMetric[], rangeDays: number): DataQuality {
  const countDays = (predicate: (metric: DailyMetric) => boolean) => metrics.filter(predicate).length;
  const recordingDays = countDays((metric) => metric.record_count > 0);
  const dailySummaryDays = countDays((metric) => metric.skin_core_score !== null || metric.nasal_core_score !== null || metric.day_stress_peak !== null);

  return {
    range_days: rangeDays,
    recording_days: recordingDays,
    daily_summary_coverage: dailySummaryDays / rangeDays,
    sleep_coverage: countDays((metric) => metric.sleep_duration_hours !== null || metric.sleep_quality !== null) / rangeDays,
    meal_coverage: countDays((metric) => metric.meal_count > 0) / rangeDays,
    bowel_coverage: countDays((metric) => metric.bowel_count > 0) / rangeDays,
    post_meal_symptom_coverage: countDays((metric) => metric.post_meal_symptom_count > 0) / rangeDays,
    water_coverage: countDays((metric) => metric.water_total_ml !== null) / rangeDays,
    enough_for_trends: dailySummaryDays >= 7,
    enough_for_meal_reactions: metrics.reduce((total, metric) => total + metric.post_meal_symptom_count, 0) >= 3
  };
}

function summarizeTrend(metric_key: keyof DailyMetric, label: string, unit: string, metrics: DailyMetric[]): TrendSummary {
  const points = metrics.map((metric) => ({
    date: metric.date,
    value: typeof metric[metric_key] === "number" ? (metric[metric_key] as number) : null
  }));
  const recent = points.slice(-7).map((point) => point.value);
  const previous = points.slice(-14, -7).map((point) => point.value);
  const currentAvg = average(recent);
  const previousAvg = average(previous);
  const delta = currentAvg !== null && previousAvg !== null ? currentAvg - previousAvg : null;
  const direction = delta === null ? "unknown" : Math.abs(delta) < 0.25 ? "flat" : delta > 0 ? "up" : "down";
  const coverage = points.filter((point) => point.value !== null).length / points.length;

  return {
    metric_key,
    label,
    unit,
    direction,
    current_avg: currentAvg,
    previous_avg: previousAvg,
    delta,
    coverage,
    points
  };
}

export function deriveTrendSummaries(metrics: DailyMetric[]) {
  return [
    summarizeTrend("skin_core_score", "皮肤核心评分", "分", metrics),
    summarizeTrend("nasal_core_score", "鼻塞评分", "分", metrics),
    summarizeTrend("sleep_quality", "睡眠质量", "分", metrics),
    summarizeTrend("day_stress_peak", "日压力峰值", "分", metrics),
    summarizeTrend("water_total_ml", "饮水量", "ml", metrics),
    summarizeTrend("bristol_median", "Bristol 中位数", "型", metrics)
  ];
}

type MealWithReaction = {
  meal: TimelineRecord;
  bloating: number | null;
};

function reactionGroups(meals: MealWithReaction[], key: string, label: string, predicate: (meal: TimelineRecord) => boolean): MealReactionMetric {
  const exposed = meals.filter((item) => predicate(item.meal));
  const unexposed = meals.filter((item) => !predicate(item.meal));
  const exposedAvg = average(exposed.map((item) => item.bloating));
  const unexposedAvg = average(unexposed.map((item) => item.bloating));

  return {
    key,
    label,
    exposed_count: exposed.length,
    unexposed_count: unexposed.length,
    exposed_bloating_avg: exposedAvg,
    unexposed_bloating_avg: unexposedAvg,
    delta: exposedAvg !== null && unexposedAvg !== null ? exposedAvg - unexposedAvg : null
  };
}

export function deriveMealReactions(records: TimelineRecord[]) {
  const meals = records.filter((record) => record.type === "meal");
  const reactions = records.filter((record) => record.type === "post_meal_symptom");
  const reactionByMealId = new Map<number, TimelineRecord[]>();

  for (const reaction of reactions) {
    const relatedId = numberValue(reaction.payload.related_record_id);
    if (relatedId === null) {
      continue;
    }
    reactionByMealId.set(relatedId, [...(reactionByMealId.get(relatedId) ?? []), reaction]);
  }

  const withReactions: MealWithReaction[] = meals
    .map((meal) => {
      const mealReactions = reactionByMealId.get(meal.id) ?? [];
      const bloating = average(mealReactions.map((reaction) => numberValue(reaction.payload.post_meal_2h_bloating)));
      return { meal, bloating };
    })
    .filter((item) => item.bloating !== null);

  return [
    reactionGroups(withReactions, "processed_food", "加工食品餐", (meal) => meal.payload.processed_food === true),
    reactionGroups(withReactions, "additive_high", "高添加剂风险餐", (meal) => meal.payload.additive_risk_level === "high"),
    reactionGroups(withReactions, "deep_fry", "油炸/高温做法餐", (meal) => hasMethod(meal, "deep_fry")),
    reactionGroups(withReactions, "large_portion", "大份量餐", (meal) => meal.payload.portion_level === "large"),
    reactionGroups(withReactions, "high_meal_stress", "餐前压力较高", (meal) => (numberValue(meal.payload.stress_before) ?? 0) >= 3)
  ];
}
