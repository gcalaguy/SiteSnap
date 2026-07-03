import { useState } from "react";
import { useSearch } from "wouter";
import { CalendarDays, Clock } from "lucide-react";
import { useGetMe } from "@workspace/api-client-react";
import Schedule from "@/pages/schedule";
import HoursPage from "@/pages/hours";

// Consolidated Workforce hub: planning (Schedule) vs. execution (Timesheets/Hours).
// Deep-linkable via /workforce?tab=schedule|hours
type Tab = "schedule" | "hours";

export default function WorkforcePage() {
  const { data: me } = useGetMe();
  const search = useSearch();

  const hasPerm = (key: string): boolean => {
    if (!me?.permissions) return true;
    return (me.permissions as Record<string, boolean>)[key] !== false;
  };
  const canViewSchedule = hasPerm("viewSchedules");
  const canViewHours = hasPerm("viewTimesheets");

  const requestedTab = new URLSearchParams(search).get("tab");
  const [tab, setTab] = useState<Tab>(() => {
    if (requestedTab === "hours" && canViewHours) return "hours";
    if (requestedTab === "schedule" && canViewSchedule) return "schedule";
    return canViewSchedule ? "schedule" : "hours";
  });

  const tabBtnClass = (active: boolean) =>
    `flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-colors ${
      active
        ? "border-[#D4AF37] text-[#D4AF37]"
        : "border-transparent text-[#121212]/60 hover:text-[#121212] hover:border-[#D4AF37]/30"
    }`;

  return (
    <div className="flex flex-col min-h-full">
      {/* Underline tab bar */}
      <div className="border-b border-[#D4AF37]/20 bg-white shrink-0 px-6">
        <div className="flex gap-0 -mb-px">
          {canViewSchedule && (
            <button className={tabBtnClass(tab === "schedule")} onClick={() => setTab("schedule")}>
              <CalendarDays className="h-4 w-4" />
              Master Schedule
            </button>
          )}
          {canViewHours && (
            <button className={tabBtnClass(tab === "hours")} onClick={() => setTab("hours")}>
              <Clock className="h-4 w-4" />
              Timesheets / Hours
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1">
        {tab === "schedule" && canViewSchedule && <Schedule />}
        {tab === "hours" && canViewHours && <HoursPage />}
      </div>
    </div>
  );
}
