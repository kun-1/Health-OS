import { AllTransactionsClient } from "@/components/expenses/all-transactions-client";
import { LifeShell } from "@/components/life-os/life-shell";

export default function AllExpensesPage() {
  return (
    <LifeShell>
      <AllTransactionsClient />
    </LifeShell>
  );
}
