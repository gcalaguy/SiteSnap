import { useEffect, useState } from "react";
import { format, addDays } from "date-fns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { CharCountedTextarea } from "@/components/ui/char-counted-textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { AlertTriangle, Loader2 } from "lucide-react";
import { NOTES_MAX, getProjectBg, initials, type Member, type Subcontractor, type GProject } from "@/components/schedule/shared";

interface AssignWorkerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialProjectId?: string;
  members: Member[];
  subcontractors: Subcontractor[];
  projects: GProject[];
  onSubmit: (body: Record<string, unknown>) => void;
  isSubmitting: boolean;
}

export function AssignWorkerDialog({
  open, onOpenChange, initialProjectId, members, subcontractors, projects, onSubmit, isSubmitting,
}: AssignWorkerDialogProps) {
  const [dlgUserId, setDlgUserId] = useState("");
  const [dlgContactId, setDlgContactId] = useState("");
  const [dlgProjectId, setDlgProjectId] = useState("");
  const [dlgStart, setDlgStart] = useState("");
  const [dlgEnd, setDlgEnd] = useState("");
  const [dlgNotes, setDlgNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    setDlgUserId(""); setDlgContactId(""); setDlgProjectId(initialProjectId ?? "");
    setDlgStart(format(new Date(), "yyyy-MM-dd"));
    setDlgEnd(format(addDays(new Date(), 6), "yyyy-MM-dd"));
    setDlgNotes("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialProjectId]);

  const selectedSubcontractor = dlgContactId
    ? subcontractors.find(s => String(s.id) === dlgContactId)
    : null;

  const complianceWarning = selectedSubcontractor && (selectedSubcontractor.complianceStatus === "non_compliant" || selectedSubcontractor.complianceStatus === "warning") ? selectedSubcontractor : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Assign Worker to Project</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <label className="text-sm font-medium block mb-1">Worker *</label>
            <Select value={dlgUserId} onValueChange={(v) => { setDlgUserId(v); setDlgContactId(""); }}>
              <SelectTrigger><SelectValue placeholder="Select a worker…" /></SelectTrigger>
              <SelectContent>
                {members.map(m => (
                  <SelectItem key={m.id} value={String(m.id)}>
                    <span className="flex items-center gap-2">
                      <Avatar className="h-5 w-5">
                        <AvatarFallback className="text-[9px] bg-muted">{initials(m.firstName, m.lastName)}</AvatarFallback>
                      </Avatar>
                      {m.firstName} {m.lastName}
                      <span className="text-xs text-muted-foreground capitalize ml-1">({m.role})</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-center text-xs text-muted-foreground font-medium">or</div>
          <div>
            <label className="text-sm font-medium block mb-1">Subcontractor *</label>
            <Select value={dlgContactId} onValueChange={(v) => { setDlgContactId(v); setDlgUserId(""); }}>
              <SelectTrigger><SelectValue placeholder="Select a subcontractor…" /></SelectTrigger>
              <SelectContent>
                {subcontractors.length > 0 ? subcontractors.map((s) => {
                  const isBad = s.complianceStatus === "non_compliant";
                  const isWarn = s.complianceStatus === "warning";
                  return (
                    <SelectItem key={s.id} value={String(s.id)} className="flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        {s.name}
                        {isBad && <Badge className="ml-2 text-[10px] bg-red-100 text-red-700 border-0">Non-Compliant</Badge>}
                        {isWarn && <Badge className="ml-2 text-[10px] bg-amber-100 text-amber-700 border-0">Warning</Badge>}
                        {s.complianceStatus === "compliant" && <Badge className="ml-2 text-[10px] bg-green-100 text-green-700 border-0">Compliant</Badge>}
                      </span>
                    </SelectItem>
                  );
                }) : <div className="p-2 text-xs text-muted-foreground">No subcontractors found. Add one in Contacts.</div>}
              </SelectContent>
            </Select>
          </div>
          {complianceWarning && (
            <div className={`rounded-md px-3 py-2 text-sm font-medium flex items-start gap-2 ${
              complianceWarning.complianceStatus === "non_compliant"
                ? "bg-red-50 text-red-800 border border-red-200"
                : "bg-amber-50 text-amber-800 border border-amber-200"
            }`}>
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">Compliance {complianceWarning.complianceStatus === "non_compliant" ? "Issue" : "Warning"}:</span>{" "}
                {complianceWarning.complianceStatus === "non_compliant"
                  ? "This subcontractor is missing or has expired compliance documents. You cannot assign them until the COI and WCB are updated."
                  : "This subcontractor has compliance documents expiring within 30 days. Review their COI and WCB before proceeding."}
              </div>
            </div>
          )}
          <div>
            <label className="text-sm font-medium block mb-1">Project *</label>
            <Select value={dlgProjectId} onValueChange={setDlgProjectId}>
              <SelectTrigger><SelectValue placeholder="Select a project…" /></SelectTrigger>
              <SelectContent>
                {projects.map(p => (
                  <SelectItem key={p.id} value={String(p.id)}>
                    <span className="flex items-center gap-2">
                      <div className="h-2.5 w-2.5 rounded-sm shrink-0" style={{ backgroundColor: getProjectBg(p.id) }} />
                      {p.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium block mb-1">Start Date *</label>
              <Input type="date" value={dlgStart} onChange={e => setDlgStart(e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">End Date *</label>
              <Input type="date" value={dlgEnd} min={dlgStart} onChange={e => setDlgEnd(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">Notes (optional)</label>
            <CharCountedTextarea
              placeholder="e.g. Framing crew, 7am–3pm"
              value={dlgNotes}
              onChange={e => setDlgNotes(e.target.value.slice(0, NOTES_MAX))}
              className="min-h-[60px]"
              maxLength={NOTES_MAX}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={() => {
              if ((!dlgUserId && !dlgContactId) || !dlgProjectId || !dlgStart || !dlgEnd) return;
              if (dlgContactId && complianceWarning?.complianceStatus === "non_compliant") return;
              const body: Record<string, unknown> = { projectId: Number(dlgProjectId), startDate: dlgStart, endDate: dlgEnd, notes: dlgNotes || undefined };
              if (dlgUserId) body.userId = Number(dlgUserId);
              if (dlgContactId) body.contactId = Number(dlgContactId);
              onSubmit(body);
            }}
            disabled={(!dlgUserId && !dlgContactId) || !dlgProjectId || !dlgStart || !dlgEnd || isSubmitting || (complianceWarning?.complianceStatus === "non_compliant") || dlgNotes.length >= NOTES_MAX}
          >
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Assign
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
