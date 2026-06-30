// Stage 1: home is the nutrition dashboard. The / route renders the same
// client component as /nutrition; a single import avoids duplicating the
// page wrapper.

import { NutritionDashboard } from "@/components/nutrition/nutrition-dashboard";

export const dynamic = "force-dynamic";

export default function HomePage() {
  return <NutritionDashboard />;
}