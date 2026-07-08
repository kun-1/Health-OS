// Phase A2 → Phase B: / is now the Health OS dashboard layout per the
// Open Design reference. All real data fetching continues to flow
// through `useHomeData`; the new components just render that data in
// the OD structure (KPI grid + trend + activity + inline calendar +
// control clusters + day drawer).

import { ODHome } from "./od-home";
import { LifeShell } from "./life-shell";

export const dynamic = "force-dynamic";

export default function LifeHome() {
  return (
    <LifeShell>
      <ODHome />
    </LifeShell>
  );
}
