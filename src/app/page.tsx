// Phase A: / is now the Life OS home. /nutrition keeps the existing
// NutritionDashboard (see src/app/nutrition/page.tsx).
//
// LifeHome (and its descendant useHomeData / useSelectedMonth) reads
// `?month=YYYY-MM` from the URL. Next.js 15 requires the closest
// Suspense ancestor to those client hooks, so the page wraps it here.

import { Suspense } from "react";

import LifeHome from "@/components/life-os/life-home";

export const dynamic = "force-dynamic";

export default function HomePage() {
  return (
    <Suspense fallback={null}>
      <LifeHome />
    </Suspense>
  );
}
