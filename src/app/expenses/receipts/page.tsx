import { ReceiptsModule } from "@/components/expenses/receipts-module";
import { ExpensesSubNav } from "@/components/expenses/expenses-sub-nav";
import { LifeShell } from "@/components/life-os/life-shell";

export const dynamic = "force-dynamic";

export default function ExpensesReceiptsPage() {
  return (
    <LifeShell>
      <ExpensesSubNav />
      <ReceiptsModule />
    </LifeShell>
  );
}
