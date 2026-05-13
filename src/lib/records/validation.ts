import { z } from "zod";

import { recordTypes } from "@/lib/records/types";

const isoDateTime = z.string().datetime({ offset: true });
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const notes = z
  .string()
  .trim()
  .max(500)
  .optional()
  .transform((value) => (value === "" ? undefined : value));

const score04 = z.coerce.number().int().min(0).max(4);
const optionalScore04 = score04.nullish();
const nullableBoolean = z.boolean().nullable().optional();
const nonEmptyText = z.string().trim().min(1).max(200);
const optionalText = z
  .string()
  .trim()
  .max(300)
  .optional()
  .transform((value) => (value === "" ? undefined : value));

const mealPayload = z
  .object({
    meal_type: z.enum(["breakfast", "lunch", "dinner", "snack"]),
    hunger_before: score04,
    stress_before: score04,
    food_text_raw: optionalText,
    food_items: z
      .array(
        z.object({
          name: nonEmptyText,
          method: z
            .enum(["steam", "boil", "stir_fry", "deep_fry", "bake", "raw", "eat_out", "unknown"])
            .optional()
        })
      )
      .optional(),
    meal_duration_min: z.coerce.number().int().min(1).max(600).optional(),
    processed_food: nullableBoolean,
    additive_risk_level: z.enum(["none", "low", "medium", "high"]).optional(),
    additive_tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
    portion_level: z.enum(["small", "normal", "large"]).optional(),
    notes
  })
  .refine(
    (payload) =>
      Boolean(payload.food_text_raw) || Boolean(payload.food_items?.some((item) => item.name.trim().length > 0)),
    { message: "food_text_raw or food_items is required" }
  );

const supplementPayload = z.object({
  supplement_name: nonEmptyText,
  brand: optionalText,
  dose_text: optionalText,
  taken_with_meal: nullableBoolean,
  related_record_id: z.coerce.number().int().positive().optional(),
  notes
});

const postMealSymptomPayload = z.object({
  related_record_id: z.coerce.number().int().positive(),
  post_meal_2h_bloating: optionalScore04,
  post_meal_2h_pain: optionalScore04,
  post_meal_2h_reflux: nullableBoolean,
  post_meal_2h_heaviness: optionalScore04,
  gas: optionalScore04,
  notes
});

const bowelPayload = z.object({
  bristol_type: z.coerce.number().int().min(1).max(7),
  strain_level: z.coerce.number().int().min(0).max(3),
  urgency: nullableBoolean,
  incomplete_emptying: nullableBoolean,
  blood_or_black_stool: nullableBoolean,
  notes
});

const waterPayload = z.object({
  amount_ml: z.coerce.number().int().min(1).max(5000),
  drink_type: z.enum(["water", "coffee", "tea", "other"]).optional(),
  sweating_or_exercise: z.enum(["none", "light", "moderate", "heavy"]).optional(),
  urine_color_optional: z.enum(["light", "normal", "dark"]).optional(),
  notes
});

const nosebleedPayload = z.object({
  nosebleed_side: z.enum(["left", "right", "both", "unknown"]).optional(),
  nosebleed_amount: z.enum(["light", "moderate", "heavy"]).optional(),
  nosebleed_duration_min: z.coerce.number().int().min(1).max(1440).optional(),
  notes
});

const dailySummaryPayload = z.object({
  summary_date: dateOnly,
  skin_redness: score04,
  skin_scaling: score04,
  skin_itch: score04,
  skin_area_change: z.coerce.number().int().min(-1).max(1),
  nasal_blockage: score04,
  stress_peak: score04,
  skin_thickness: optionalScore04,
  photo_taken: nullableBoolean,
  runny_nose: optionalScore04,
  sneezing: optionalScore04,
  facial_pressure_or_sinus_pain: optionalScore04,
  smell_reduction: nullableBoolean,
  stress_duration: z.enum(["none", "<1h", "1-4h", ">4h"]).optional(),
  control_feeling: optionalScore04,
  major_stressor: nullableBoolean,
  stress_note: optionalText,
  vegetable_count: z.coerce.number().int().min(0).max(30).optional(),
  fruit_count: z.coerce.number().int().min(0).max(30).optional(),
  legume: nullableBoolean,
  whole_grain: nullableBoolean,
  fermented_food: nullableBoolean,
  mouth_ulcer: nullableBoolean,
  gum_bleeding_or_pain: nullableBoolean,
  tongue_abnormality: nullableBoolean,
  notes
});

const sleepPayload = z.object({
  sleep_date: dateOnly,
  sleep_duration_hours: z.coerce.number().min(0).max(24),
  night_awakenings: z.enum(["0", "1", "2", "3_plus"]),
  sleep_quality: score04,
  sleep_disruption: z.enum(["none", "itch", "nasal", "both"]),
  bed_at: isoDateTime.optional(),
  wake_at: isoDateTime.optional(),
  sleep_latency_min: z.coerce.number().int().min(0).max(600).optional(),
  wake_rested: optionalScore04,
  notes
});

export const payloadSchemas = {
  meal: mealPayload,
  supplement: supplementPayload,
  post_meal_symptom: postMealSymptomPayload,
  bowel: bowelPayload,
  water: waterPayload,
  nosebleed: nosebleedPayload,
  daily_summary: dailySummaryPayload,
  sleep: sleepPayload
};

export const createRecordSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("meal"), occurred_at: isoDateTime, payload: mealPayload }),
  z.object({ type: z.literal("supplement"), occurred_at: isoDateTime, payload: supplementPayload }),
  z.object({ type: z.literal("post_meal_symptom"), occurred_at: isoDateTime, payload: postMealSymptomPayload }),
  z.object({ type: z.literal("bowel"), occurred_at: isoDateTime, payload: bowelPayload }),
  z.object({ type: z.literal("water"), occurred_at: isoDateTime, payload: waterPayload }),
  z.object({ type: z.literal("nosebleed"), occurred_at: isoDateTime, payload: nosebleedPayload }),
  z.object({ type: z.literal("daily_summary"), occurred_at: isoDateTime, payload: dailySummaryPayload }),
  z.object({ type: z.literal("sleep"), occurred_at: isoDateTime, payload: sleepPayload })
]);

export const getRecordsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(30),
  cursor: z.string().optional()
});

export function isRecordType(value: string): value is (typeof recordTypes)[number] {
  return recordTypes.includes(value as (typeof recordTypes)[number]);
}
