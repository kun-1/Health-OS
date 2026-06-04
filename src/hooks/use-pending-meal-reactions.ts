"use client";

import { useEffect, useState } from "react";

import type { TimelineRecord } from "@/lib/records/types";

export type PendingReaction = {
  mealId: number;
  mealTime: string;
  summary: string;
  readyAt: Date;
  isReady: boolean;
};

export function usePendingMealReactions(records: TimelineRecord[]) {
  const [pending, setPending] = useState<PendingReaction[]>([]);

  useEffect(() => {
    const meals = records.filter((r) => r.type === "meal");
    const reactionMealIds = new Set(
      records
        .filter((r) => r.type === "post_meal_symptom")
        .map((r) => r.payload.related_record_id)
        .filter(Boolean)
    );

    const now = Date.now();
    const result: PendingReaction[] = [];
    for (const meal of meals) {
      if (reactionMealIds.has(meal.id)) continue;
      const mealTime = new Date(meal.occurred_at).getTime();
      const readyAt = new Date(mealTime + 2 * 60 * 60 * 1000);
      const isReady = now >= readyAt.getTime();
      const hoursSinceMeal = (now - mealTime) / (60 * 60 * 1000);
      if (hoursSinceMeal > 4) continue;
      const food =
        typeof meal.payload.food_text_raw === "string" && meal.payload.food_text_raw.trim()
          ? meal.payload.food_text_raw.trim()
          : Array.isArray(meal.payload.food_items)
            ? meal.payload.food_items.map((i: Record<string, unknown>) => i.name).filter(Boolean).join("、")
            : `餐食 #${meal.id}`;
      result.push({
        mealId: meal.id,
        mealTime: meal.occurred_at,
        summary: food.slice(0, 60),
        readyAt,
        isReady
      });
    }
    setPending(result);
  }, [records]);

  return pending;
}
