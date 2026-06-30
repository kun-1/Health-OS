import { ReceiptsModule } from "@/components/expenses/receipts-module";
import { LifeShell } from "@/components/life-os/life-shell";

export const dynamic = "force-dynamic";

export default function ReceiptsPage() {
  return (
    <LifeShell>
      <ReceiptsModule />
    </LifeShell>
  );
}
