import { InspectionHistoryTab } from "@/components/voice-inspection/InspectionHistoryTab";

/** AI Voice Inspection Assistant shell — supervisor-facing review list, mounted as a tab in safety-compliance.tsx. Submissions are mobile-only (voice recording). */
export default function VoiceInspectionPage() {
  return (
    <div className="p-6">
      <InspectionHistoryTab />
    </div>
  );
}
