// Phase A: / is now the Life OS home. /nutrition keeps the existing
// NutritionDashboard (see src/app/nutrition/page.tsx).

import { LifeHome } from "@/components/life-os/life-home";

export const dynamic = "force-dynamic";

export default function HomePage() {
  return <LifeHome />;
}