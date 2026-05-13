import { NextRequest, NextResponse } from "next/server";

import { clampRangeDays } from "@/lib/analysis/date";
import { buildAnalysisPayload } from "@/lib/analysis/insights";
import { listRecentRecordsForAnalysis } from "@/lib/records/store";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const rangeDays = clampRangeDays(request.nextUrl.searchParams.get("range_days"));
  const records = listRecentRecordsForAnalysis();
  const analysis = buildAnalysisPayload(records, rangeDays);

  return NextResponse.json({
    date_range: analysis.date_range,
    data_quality: analysis.data_quality,
    insights: analysis.insights,
    meal_reactions: analysis.meal_reactions,
    generated_at: analysis.generated_at
  });
}
