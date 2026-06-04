import { SupplementScheduleClient } from "@/components/supplement-schedule-client";

export default function SettingsPage() {
  return (
    <div className="grid gap-6">
      <div>
        <p className="text-xs font-semibold uppercase text-teal-800">Settings</p>
        <h1 className="mt-2 text-[32px] font-bold leading-tight text-[#17201c]">Settings</h1>
      </div>
      <SupplementScheduleClient />
    </div>
  );
}
