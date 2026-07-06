import { memo } from "react";
import { format, addDays } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
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

// Off-screen cards skip layout/paint until scrolled into view; the reserved
// height keeps the scrollbar stable while that content is unmounted.
const CARD_CONTAINMENT_STYLE = { contentVisibility: "auto" as const, containIntrinsicSize: "0 96px" };

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
    <Card className="overflow-hidden" style={CARD_CONTAINMENT_STYLE}>
      <div className="flex">
        <div className="w-1 shrink-0" style={{ backgroundColor: tc.color }} />
        <CardContent className="py-3 px-4 flex-1">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: tc.color }}>
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
        </CardContent>
      </div>
    </Card>
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
    <div className="space-y-3">
      {eventsQuery.isLoading ? (
        <div className="flex items-center justify-center h-48 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading events…
        </div>
      ) : !eventsQuery.data || eventsQuery.data.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center h-48 text-muted-foreground">
            <Clock className="h-10 w-10 mb-3 opacity-40" />
            <p className="font-medium">No events this week.</p>
            <p className="text-sm mt-1">Use "New Event" to schedule a meeting, site visit, or equipment booking.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
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
