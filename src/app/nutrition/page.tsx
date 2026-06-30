import { LifeShell } from "@/components/life-os/life-shell";
import { NutritionModule } from "@/components/nutrition/nutrition-module";

export const dynamic = "force-dynamic";

export default function NutritionPage() {
  return (
    <LifeShell>
      <NutritionModule />
    </LifeShell>
  );
}
