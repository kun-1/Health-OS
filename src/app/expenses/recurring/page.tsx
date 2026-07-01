import { Suspense } from "react";

import { RecurringManagerClient } from "@/components/expenses/recurring-manager-client";
import { LifeShell } from "@/components/life-os/life-shell";

// Force dynamic so useSearchParams (inside MonthSwitcher / useSelectedMonth)
// doesn't trigger the static-prerender bailout.
export const dynamic = "force-dynamic";

export default function RecurringExpensesPage() {
  return (
    <LifeShell>
      <Suspense fallback={null}>
        <RecurringManagerClient />
      </Suspense>
    </LifeShell>
  );
}