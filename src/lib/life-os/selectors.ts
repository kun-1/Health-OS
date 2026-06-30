import type { NutritionReport } from "@/lib/nutrition/types";

/**
 * Clamp a numeric value to the [0, 100] range and round it to an integer.
 *
 * Used by both the home dashboard's headline score and the nutrition
 * module's per-axis score pills, so it lives here as a shared utility.
 */
export function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

/**
 * Headline "structureScore" rolled up from the four nutrition dimensions:
 *
 *   base = mean(PDI%, AHEI%)
 *   - plate.deviation * 18   (penalize deviation from the 50/25/25 plate)
 *   - upf.upfShare * 16      (penalize ultra-processed share)
 *   + 18 calibration offset
 *
 * The +18 offset and the two penalty weights were chosen to match the
 * distribution the nutrition dashboard has been showing since 2026-Q2;
 * if those numbers shift, the Phase B migration will replace this with a
 * shared, version-tagged formula rather than re-deriving it.
 */
export function structureScore(report: NutritionReport): number {
  const pdiPct = report.pdi.max > 0 ? (report.pdi.total / report.pdi.max) * 100 : 0;
  const aheiPct = report.ahei.max > 0 ? (report.ahei.total / report.ahei.max) * 100 : 0;
  const platePenalty = report.plate.deviation * 18;
  const upfPenalty = report.upf.upfShare * 16;
  return clampScore((pdiPct + aheiPct) / 2 - platePenalty - upfPenalty + 18);
}

/** Convenience helper for the four per-dimension sub-pills. */
export function dimensionPct(value: number, max: number): number {
  return max > 0 ? clampScore((value / max) * 100) : 0;
}