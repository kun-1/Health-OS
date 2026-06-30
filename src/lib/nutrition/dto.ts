// Stage 1 nutrition API DTOs + zod schemas. Validation at the boundary keeps
// the score lib typed-pure.

import { z } from "zod";

import { nutritionCategories } from "@/db/schema";

export const periodSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "period must be YYYY-MM");

export const aliasCategorySchema = z.enum(nutritionCategories);

export const patchAliasBodySchema = z.object({
  category: aliasCategorySchema
});

export type PatchAliasBody = z.infer<typeof patchAliasBodySchema>;

// /api/nutrition/preview — classify a single name_zh without scoring the
// whole period. Used by the receipt form to surface the predicted bucket
// before the user saves. Trims whitespace, requires at least one char.
export const previewNameSchema = z
  .string()
  .trim()
  .min(1, "name is required")
  .max(120, "name too long");