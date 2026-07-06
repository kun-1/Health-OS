import { Suspense } from "react";

import { AllTransactionsClient } from "@/components/expenses/all-transactions-client";
import { LifeShell } from "@/components/life-os/life-shell";

export const dynamic = "force-dynamic";

export default function ExpensesTransactionsPage() {
  return (
    <LifeShell>
      <Suspense fallback={null}>
        <AllTransactionsClient />
      </Suspense>
    </LifeShell>
  );
}
