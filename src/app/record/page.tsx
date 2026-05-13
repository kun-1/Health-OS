import { Suspense } from "react";

import { RecordClient } from "@/components/record-client";

export default function RecordPage() {
  return (
    <Suspense fallback={<p className="text-sm text-slate-600">正在加载...</p>}>
      <RecordClient />
    </Suspense>
  );
}
