import { useListProjectCommunicationTimeline, type CommunicationTimelineEvent } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import {
  FileText,
  CheckCircle2,
  XCircle,
  Calendar,
  Edit3,
  Send,
  DollarSign,
  Circle,
  Mail,
  AlertCircle,
  Clock,
} from "lucide-react";

const EVENT_ICON: Record<string, typeof Circle> = {
  permit_submitted: FileText,
  permit_approved: CheckCircle2,
  permit_rejected: XCircle,
  inspection_scheduled: Calendar,
  inspection_passed: CheckCircle2,
  inspection_failed: XCircle,
  change_order_received: Edit3,
  change_order_approved: CheckCircle2,
  invoice_sent: Send,
  invoice_paid: DollarSign,
  payment_requested: DollarSign,
  quote_sent: Send,
  quote_accepted: CheckCircle2,
  other: Circle,
};

const EVENT_LABEL: Record<string, string> = {
  permit_submitted: "Permit Submitted",
  permit_approved: "Permit Approved",
  permit_rejected: "Permit Rejected",
  inspection_scheduled: "Inspection Scheduled",
  inspection_passed: "Inspection Passed",
  inspection_failed: "Inspection Failed",
  change_order_received: "Change Order Received",
  change_order_approved: "Change Order Approved",
  invoice_sent: "Invoice Sent",
  invoice_paid: "Invoice Paid",
  payment_requested: "Payment Requested",
  quote_sent: "Quote Sent",
  quote_accepted: "Quote Accepted",
  other: "Event",
};

function dateLabel(iso: string | null | undefined) {
  if (!iso) return "Date unknown";
  return new Date(iso).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" });
}

function EventRow({ event, onPress }: { event: CommunicationTimelineEvent; onPress: () => void }) {
  const Icon = EVENT_ICON[event.eventType] ?? Circle;
  return (
    <button onClick={onPress} className="w-full text-left">
      <Card className="hover:border-primary/40 transition-colors">
        <CardContent className="p-3 flex items-start gap-3">
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <Icon className="w-3.5 h-3.5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">{EVENT_LABEL[event.eventType] ?? event.eventType}</p>
            <p className="text-xs text-foreground/50 mt-0.5">{event.description}</p>
            <p className="text-[11px] text-foreground/40 mt-1 flex items-center gap-1">
              <Clock className="w-3 h-3" /> {dateLabel(event.eventDate)}
            </p>
          </div>
          <Mail className="w-3.5 h-3.5 text-foreground/30 shrink-0" />
        </CardContent>
      </Card>
    </button>
  );
}

export function TimelinePanel({ projectId, onOpenThread }: { projectId: number; onOpenThread: (threadId: number) => void }) {
  const { data, isLoading, isError, refetch } = useListProjectCommunicationTimeline(projectId);
  const events = data?.data ?? [];

  if (isLoading) return <div className="py-8 text-center text-foreground/60 animate-pulse text-sm">Loading…</div>;

  if (isError) {
    return (
      <div className="py-10 flex flex-col items-center text-center gap-2">
        <AlertCircle className="w-6 h-6 text-foreground/30" />
        <p className="text-sm text-foreground/60">Failed to load timeline</p>
        <button onClick={() => refetch()} className="text-xs text-primary hover:underline">Retry</button>
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="py-10 flex flex-col items-center text-center gap-2 border border-dashed border-border rounded-lg">
        <Clock className="w-6 h-6 text-foreground/30" />
        <p className="text-sm font-medium">No timeline events yet</p>
        <p className="text-xs text-foreground/40 max-w-xs">
          Milestones like permit approvals, inspections, and change orders will appear here as they're detected in
          synced emails.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {events.map((e) => (
        <EventRow key={e.id} event={e} onPress={() => onOpenThread(e.threadId)} />
      ))}
    </div>
  );
}
