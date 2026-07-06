import { ExpensesModule } from "@/components/expenses/expenses-module";
import { LifeShell } from "@/components/life-os/life-shell";

export const dynamic = "force-dynamic";

export default function ExpensesAnalyticsPage() {
  return (
    <LifeShell>
      <ExpensesModule />
    </LifeShell>
  );
}
