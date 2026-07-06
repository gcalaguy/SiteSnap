import { useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { CharCountedTextarea } from "@/components/ui/char-counted-textarea";
import { AlertTriangle, Loader2, Users, Video, X } from "lucide-react";
import { useScheduleEventMutations } from "@/hooks/schedule/useScheduleEvents";
import { useToast } from "@/hooks/use-toast";
import { GOLD, NOTES_MAX, type ScheduleEvent, type ScheduleConflictGroup } from "@/components/schedule/shared";

const EVENT_TYPES = ["meeting", "equipment_booking", "site_visit", "inspection", "other"];

interface EventDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingEvent: ScheduleEvent | null;
}

export function EventDialog({ open, onOpenChange, editingEvent }: EventDialogProps) {
  const { toast } = useToast();
  const [evtTitle, setEvtTitle] = useState("");
  const [evtType, setEvtType] = useState("meeting");
  const [evtProjectId, setEvtProjectId] = useState("");
  const [evtDate, setEvtDate] = useState("");
  const [evtStartTime, setEvtStartTime] = useState("09:00");
  const [evtEndTime, setEvtEndTime] = useState("10:00");
  const [evtLocation, setEvtLocation] = useState("");
  const [evtNotes, setEvtNotes] = useState("");
  const [evtMeetingPlatform, setEvtMeetingPlatform] = useState("");
  const [evtMeetingLink, setEvtMeetingLink] = useState("");
  const [evtConflicts, setEvtConflicts] = useState<ScheduleConflictGroup[]>([]);
  const [evtRecipientEmails, setEvtRecipientEmails] = useState<string[]>([]);
  const [evtEmailInput, setEvtEmailInput] = useState("");

  useEffect(() => {
    if (!open) return;
    if (editingEvent) {
      setEvtTitle(editingEvent.title);
      setEvtType(editingEvent.type);
      setEvtProjectId(editingEvent.projectId ? String(editingEvent.projectId) : "");
      setEvtConflicts([]);
      setEvtDate(format(parseISO(editingEvent.startTime), "yyyy-MM-dd"));
      setEvtStartTime(format(parseISO(editingEvent.startTime), "HH:mm"));
      setEvtEndTime(format(parseISO(editingEvent.endTime), "HH:mm"));
      setEvtLocation(editingEvent.location ?? "");
      setEvtNotes(editingEvent.notes ?? "");
      setEvtMeetingPlatform(editingEvent.meetingPlatform ?? "");
      setEvtMeetingLink(editingEvent.meetingLink ?? "");
      setEvtRecipientEmails([]);
      setEvtEmailInput("");
    } else {
      setEvtTitle(""); setEvtType("meeting"); setEvtProjectId(""); setEvtConflicts([]);
      setEvtDate(format(new Date(), "yyyy-MM-dd")); setEvtStartTime("09:00"); setEvtEndTime("10:00");
      setEvtLocation(""); setEvtNotes(""); setEvtMeetingPlatform(""); setEvtMeetingLink("");
      setEvtRecipientEmails([]); setEvtEmailInput("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editingEvent]);

  const { createEventMut, updateEventMut } = useScheduleEventMutations(setEvtConflicts, () => onOpenChange(false));

  function addEvtEmail(raw: string) {
    const email = raw.trim().toLowerCase();
    if (!email || !email.includes("@")) return;
    setEvtRecipientEmails(prev => prev.includes(email) ? prev : [...prev, email]);
    setEvtEmailInput("");
  }

  function handleEvtEmailKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === "," || e.key === "Tab") {
      e.preventDefault();
      addEvtEmail(evtEmailInput);
    } else if (e.key === "Backspace" && !evtEmailInput) {
      setEvtRecipientEmails(prev => prev.slice(0, -1));
    }
  }

  async function pickContacts() {
    if (!("contacts" in navigator && "ContactsManager" in window)) {
      toast({ title: "Contact picker not supported in this browser", variant: "destructive" });
      return;
    }
    try {
      const picked = await navigator.contacts?.select(["email"], { multiple: true });
      const newEmails: string[] = (picked ?? []).flatMap((c) => c.email ?? [])
        .map((e: string) => e.trim().toLowerCase())
        .filter(Boolean);
      setEvtRecipientEmails(prev => [...new Set([...prev, ...newEmails])]);
    } catch {
      // user cancelled — do nothing
    }
  }

  const editEvtId = editingEvent?.id ?? null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editEvtId ? "Edit Event" : "New Event"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <label className="text-sm font-medium block mb-1">Title *</label>
            <Input placeholder="e.g. Site Safety Meeting" value={evtTitle} onChange={e => setEvtTitle(e.target.value)} />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">Type</label>
            <Select value={evtType} onValueChange={setEvtType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {EVENT_TYPES.map(t => (
                  <SelectItem key={t} value={t}>{t.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">Date *</label>
            <Input type="date" value={evtDate} onChange={e => setEvtDate(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium block mb-1">Start Time *</label>
              <Input type="time" value={evtStartTime} onChange={e => setEvtStartTime(e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">End Time *</label>
              <Input type="time" value={evtEndTime} onChange={e => setEvtEndTime(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">Location (optional)</label>
            <Input placeholder="e.g. Site office, 123 Main St" value={evtLocation} onChange={e => setEvtLocation(e.target.value)} />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">Notes (optional)</label>
            <CharCountedTextarea
              placeholder="Additional details…"
              value={evtNotes}
              onChange={e => setEvtNotes(e.target.value.slice(0, NOTES_MAX))}
              className="min-h-[60px]"
              maxLength={NOTES_MAX}
            />
          </div>
          {evtType === "meeting" && (
            <div className="space-y-2">
              <label className="text-sm font-medium block">Online Meeting (optional)</label>
              <Select value={evtMeetingPlatform || "none"} onValueChange={v => { setEvtMeetingPlatform(v === "none" ? "" : v); setEvtMeetingLink(""); }}>
                <SelectTrigger>
                  <SelectValue placeholder="No online meeting" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No online meeting</SelectItem>
                  <SelectItem value="google_meet">
                    <span className="flex items-center gap-2"><Video className="h-3.5 w-3.5 text-green-600" />Google Meet</span>
                  </SelectItem>
                  <SelectItem value="zoom">
                    <span className="flex items-center gap-2"><Video className="h-3.5 w-3.5 text-blue-600" />Zoom</span>
                  </SelectItem>
                  <SelectItem value="teams">
                    <span className="flex items-center gap-2"><Video className="h-3.5 w-3.5 text-purple-600" />Microsoft Teams</span>
                  </SelectItem>
                </SelectContent>
              </Select>
              {evtMeetingPlatform && (
                <div>
                  <Input
                    placeholder="Paste meeting link (or leave blank to auto-generate)"
                    value={evtMeetingLink}
                    onChange={e => setEvtMeetingLink(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Leave blank to auto-generate when OAuth is configured for this platform.
                  </p>
                </div>
              )}
            </div>
          )}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium">Recipients</label>
              <button
                type="button"
                onClick={pickContacts}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground border border-border rounded-md px-2 py-1 transition-colors"
              >
                <Users className="h-3 w-3" /> Pick from contacts
              </button>
            </div>
            {/* Email chip input */}
            <div
              className="min-h-[40px] flex flex-wrap gap-1.5 items-center p-2 rounded-md border border-input bg-background cursor-text focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-0"
              onClick={e => (e.currentTarget.querySelector("input") as HTMLInputElement)?.focus()}
            >
              {evtRecipientEmails.map(email => (
                <span key={email} className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium text-[#111111]" style={{ background: GOLD }}>
                  {email}
                  <button
                    type="button"
                    onClick={e => { e.stopPropagation(); setEvtRecipientEmails(prev => prev.filter(x => x !== email)); }}
                    className="hover:opacity-70 transition-opacity ml-0.5"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
              <input
                type="email"
                placeholder={evtRecipientEmails.length === 0 ? "Type email and press Enter or comma…" : ""}
                value={evtEmailInput}
                onChange={e => setEvtEmailInput(e.target.value)}
                onKeyDown={handleEvtEmailKeyDown}
                onBlur={() => addEvtEmail(evtEmailInput)}
                className="flex-1 min-w-[160px] bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1.5">
              {evtRecipientEmails.length === 0
                ? "Add at least one recipient to send an email invite."
                : `Invite will be sent to ${evtRecipientEmails.length} recipient${evtRecipientEmails.length !== 1 ? "s" : ""}.`}
            </p>
          </div>
          {evtConflicts.length > 0 && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 flex gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
              <div className="text-sm text-destructive">
                <p className="font-medium mb-1">Scheduling conflict detected</p>
                {evtConflicts.map((c, i) => (
                  <p key={i} className="text-xs">{c.conflicts?.[0]?.title ?? "Conflict"} overlaps this time</p>
                ))}
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={() => {
              if (!evtTitle || !evtDate || !evtStartTime || !evtEndTime) return;
              setEvtConflicts([]);
              const payload = {
                title: evtTitle,
                type: evtType,
                projectId: evtProjectId ? Number(evtProjectId) : undefined,
                startTime: `${evtDate}T${evtStartTime}:00`,
                endTime: `${evtDate}T${evtEndTime}:00`,
                location: evtLocation || undefined,
                notes: evtNotes || undefined,
                meetingPlatform: evtMeetingPlatform || undefined,
                meetingLink: evtMeetingLink || undefined,
              };
              if (editEvtId) {
                updateEventMut.mutate({ id: editEvtId, ...payload });
              } else {
                createEventMut.mutate({
                  ...payload,
                  recipientEmails: evtRecipientEmails.length > 0 ? evtRecipientEmails : undefined,
                });
              }
            }}
            disabled={!evtTitle || !evtDate || !evtStartTime || !evtEndTime || createEventMut.isPending || updateEventMut.isPending || evtNotes.length >= NOTES_MAX}
          >
            {(createEventMut.isPending || updateEventMut.isPending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {editEvtId ? "Save Changes" : "Create Event"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
