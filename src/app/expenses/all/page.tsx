import { Suspense } from "react";

import { AllTransactionsClient } from "@/components/expenses/all-transactions-client";
import { LifeShell } from "@/components/life-os/life-shell";

// Force dynamic so useSearchParams (inside MonthSwitcher / useSelectedMonth)
// doesn't trigger the static-prerender bailout.
export const dynamic = "force-dynamic";

export default function AllExpensesPage() {
  return (
    <LifeShell>
      <Suspense fallback={null}>
        <AllTransactionsClient />
      </Suspense>
    </LifeShell>
  );
}