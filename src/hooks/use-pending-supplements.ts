"use client";

import { useCallback, useEffect, useState } from "react";

import type { TimelineRecord } from "@/lib/records/types";

type SupplementSchedule = {
  id: number;
  supplement_name: string;
  brand: string | null;
  dose_text: string | null;
  time_of_day: string;
  days_of_week: string;
  active: number;
};

export type PendingSupplement = {
  scheduleId: number;
  supplementName: string;
  brand: string | null;
  doseText: string | null;
  timeOfDay: string;
};

export function usePendingSupplements(
  todayRecords: TimelineRecord[]
) {
  const [pending, setPending] = useState<PendingSupplement[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/supplement-schedules");
      if (!response.ok) {
        setLoading(false);
        return;
      }
      const data = await response.json();
      const schedules = (data.schedules ?? []) as SupplementSchedule[];

      const dayOfWeek = new Date().getDay();
      const activeToday = schedules.filter(
        (s) => s.active && JSON.parse(s.days_of_week || "[]").includes(dayOfWeek)
      );

      const todaySupplementNames = new Set(
        todayRecords
          .filter((r) => r.type === "supplement")
          .map((r) => String(r.payload.supplement_name ?? "").toLowerCase().trim())
      );

      const result = activeToday.filter(
        (s) => !todaySupplementNames.has(s.supplement_name.toLowerCase().trim())
      );

      setPending(
        result.map((s) => ({
          scheduleId: s.id,
          supplementName: s.supplement_name,
          brand: s.brand,
          doseText: s.dose_text,
          timeOfDay: s.time_of_day
        }))
      );
    } catch {
      /* ignore */
    }
    setLoading(false);
  }, [todayRecords]);

  useEffect(() => {
    reload().catch(() => undefined);
  }, [reload]);

  return { pending, loading, reload };
}
