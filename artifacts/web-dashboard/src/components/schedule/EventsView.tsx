import { memo } from "react";
import { format, addDays } from "date-fns";
import { Clock, Edit2, Loader2, MapPin, Trash2 } from "lucide-react";
import { useScheduleEventsQuery, useDeleteScheduleEvent } from "@/hooks/schedule/useScheduleEvents";
import type { ScheduleEvent } from "@/components/schedule/shared";

const EVENT_TYPE_CONFIG: Record<string, { color: string; label: string }> = {
  meeting: { color: "#3B82F6", label: "Meeting" },
  equipment_booking: { color: "#F59E0B", label: "Equipment" },
  site_visit: { color: "#10B981", label: "Site Visit" },
  inspection: { color: "#8B5CF6", label: "Inspection" },
  other: { color: "#6B7280", label: "Other" },
};

// Off-screen rows skip layout/paint until scrolled into view; the reserved
// height keeps the scrollbar stable while that content is unmounted.
const ROW_CONTAINMENT_STYLE = { contentVisibility: "auto" as const, containIntrinsicSize: "0 88px" };

interface EventRowProps {
  evt: ScheduleEvent;
  isOwnerOrForeman: boolean;
  onEdit: (evt: ScheduleEvent) => void;
  onDelete: (id: number) => void;
}

const EventRow = memo(function EventRow({ evt, isOwnerOrForeman, onEdit, onDelete }: EventRowProps) {
  const tc = EVENT_TYPE_CONFIG[evt.type] ?? EVENT_TYPE_CONFIG.other;
  const start = new Date(evt.startTime);
  const end = new Date(evt.endTime);
  return (
    <div className="flex items-start gap-3 px-4 py-3" style={ROW_CONTAINMENT_STYLE}>
      <div className="h-2 w-2 rounded-full mt-1.5 shrink-0" style={{ backgroundColor: tc.color }} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <span className="text-xs font-semibold px-1.5 py-0.5 rounded" style={{ backgroundColor: `${tc.color}1A`, color: tc.color }}>
            {tc.label}
          </span>
          {evt.projectName && (
            <span className="text-xs text-muted-foreground truncate">{evt.projectName}</span>
          )}
        </div>
        <p className="font-semibold text-sm">{evt.title}</p>
        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {format(start, "EEE MMM d, h:mm a")} – {format(end, "h:mm a")}
          </span>
          {evt.location && (
            <span className="flex items-center gap-1">
              <MapPin className="h-3 w-3" /> {evt.location}
            </span>
          )}
        </div>
        {evt.notes && <p className="text-xs text-muted-foreground mt-1 italic">{evt.notes}</p>}
      </div>
      {isOwnerOrForeman && (
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => onEdit(evt)}
            className="text-muted-foreground hover:text-foreground transition-colors p-1"
            title="Edit event"
          >
            <Edit2 className="h-4 w-4" />
          </button>
          <button
            onClick={() => onDelete(evt.id)}
            className="text-muted-foreground hover:text-destructive transition-colors p-1"
            title="Delete event"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
});

interface EventsViewProps {
  eventsWeek: Date;
  isOwnerOrForeman: boolean;
  onEditEvent: (evt: ScheduleEvent) => void;
}

export function EventsView({ eventsWeek, isOwnerOrForeman, onEditEvent }: EventsViewProps) {
  const eventsFrom = format(eventsWeek, "yyyy-MM-dd");
  const eventsTo = format(addDays(eventsWeek, 6), "yyyy-MM-dd");
  const eventsQuery = useScheduleEventsQuery(eventsFrom, eventsTo, isOwnerOrForeman);
  const deleteEventMut = useDeleteScheduleEvent();

  return (
    <div className="h-full">
      {eventsQuery.isLoading ? (
        <div className="flex items-center justify-center h-48 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading events…
        </div>
      ) : !eventsQuery.data || eventsQuery.data.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 text-muted-foreground rounded-lg border border-dashed border-border">
          <Clock className="h-10 w-10 mb-3 opacity-40" />
          <p className="font-medium">No events this week.</p>
          <p className="text-sm mt-1">Use "New Event" to schedule a meeting, site visit, or equipment booking.</p>
        </div>
      ) : (
        <div className="rounded-lg border border-border/70 divide-y divide-border overflow-hidden">
          {eventsQuery.data.map(evt => (
            <EventRow
              key={evt.id}
              evt={evt}
              isOwnerOrForeman={isOwnerOrForeman}
              onEdit={onEditEvent}
              onDelete={deleteEventMut.mutate}
            />
          ))}
        </div>
      )}
    </div>
  );
}
