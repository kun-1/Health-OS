import { RecurringManagerClient } from "@/components/expenses/recurring-manager-client";
import { LifeShell } from "@/components/life-os/life-shell";

export const dynamic = "force-dynamic";

export default function ExpensesRecurringPage() {
  return (
    <LifeShell>
      <RecurringManagerClient />
    </LifeShell>
  );
}
