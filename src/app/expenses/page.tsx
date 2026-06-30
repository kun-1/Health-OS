import { NutritionDashboard } from "@/components/nutrition/nutrition-dashboard";
import { LifeShell } from "@/components/life-os/life-shell";

export const dynamic = "force-dynamic";

export default function ExpensesPage() {
  return (
    <LifeShell>
      <NutritionDashboard />
    </LifeShell>
  );
}