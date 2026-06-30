// GET /api/nutrition/score?period=YYYY-MM
//
// Returns the 4-dimension nutrition report (PDI / Plate / UPF / AHEI) for
// the requested month. Public — same model as /api/insights. The expenses
// auth middleware is path-scoped and doesn't touch /api/nutrition/*.

import { NextResponse } from "next/server";

import { loadAliases } from "@/lib/nutrition/alias-store";
import { scorePeriod } from "@/lib/nutrition/score";
import type { NutritionReport } from "@/lib/nutrition/types";
import { periodSchema } from "@/lib/nutrition/dto";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const parsedPeriod = periodSchema.safeParse(searchParams.get("period"));
  if (!parsedPeriod.success) {
    return NextResponse.json(
      { error: "Invalid period. Expected YYYY-MM." },
      { status: 400 }
    );
  }

  const aliases = loadAliases();
  const report: NutritionReport = scorePeriod(
    parsedPeriod.data,
    aliases.map((a) => ({
      rawPattern: a.rawPattern,
      category: a.category,
      isUserSet: a.isUserSet
    }))
  );

  return NextResponse.json(report);
}