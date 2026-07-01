import { ExpensesModule } from "@/components/expenses/expenses-module";
import { ExpensesSubNav } from "@/components/expenses/expenses-sub-nav";
import { LifeShell } from "@/components/life-os/life-shell";

export const dynamic = "force-dynamic";

export default function ExpensesAnalyticsPage() {
  return (
    <LifeShell>
      <ExpensesSubNav />
      <ExpensesModule />
    </LifeShell>
  );
}
