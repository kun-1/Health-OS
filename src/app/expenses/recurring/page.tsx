import { RecurringManagerClient } from "@/components/expenses/recurring-manager-client";
import { LifeShell } from "@/components/life-os/life-shell";

export default function RecurringExpensesPage() {
  return (
    <LifeShell>
      <RecurringManagerClient />
    </LifeShell>
  );
}
