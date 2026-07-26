import { useState } from "react";
import { Loader2, Wrench } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCompanyMembers } from "@/hooks/cor-compliance/useCompanyMembers";
import { CAPA_PRIORITY_CFG, type CapaPriority } from "@/components/cor-compliance/shared";
import { useCreateScanAction, type ScanHazard } from "@/hooks/safety-scanner/useSafetyScan";

const SEVERITY_TO_PRIORITY: Record<string, CapaPriority> = {
  critical: "critical", high: "high", medium: "medium", low: "low",
};

interface Props {
  scanId: number;
  hazard: ScanHazard | null;
  onClose: () => void;
}

export function ActionItemDrawer({ scanId, hazard, onClose }: Props) {
  const membersQuery = useCompanyMembers();
  const [assignedToUserId, setAssignedToUserId] = useState("");
  const [priority, setPriority] = useState<CapaPriority>("medium");
  const [dueDate, setDueDate] = useState("");

  const createAction = useCreateScanAction(scanId, onClose);

  function openFor(h: ScanHazard) {
    setAssignedToUserId("");
    setPriority(SEVERITY_TO_PRIORITY[h.severity] ?? "medium");
    setDueDate("");
  }

  return (
    <Sheet
      open={!!hazard}
      onOpenChange={(open) => {
        if (!open) onClose();
        else if (hazard) openFor(hazard);
      }}
    >
      <SheetContent className="w-full max-w-md" style={{ background: "#0f0f0f", border: "1px solid #2a2a2a" }}>
        {hazard && (
          <>
            <SheetHeader>
              <SheetTitle style={{ color: "#e5e5e5" }} className="flex items-center gap-2">
                <Wrench className="h-5 w-5" style={{ color: "#C9A84C" }} />
                Create Corrective Action
              </SheetTitle>
            </SheetHeader>

            <div className="space-y-4 py-4 px-4">
              <div className="rounded-lg p-3" style={{ background: "#ffffff06", border: "1px solid #2a2a2a" }}>
                <p className="text-xs font-semibold text-red-400 mb-1">{hazard.severity.toUpperCase()}</p>
                <p className="text-sm text-zinc-200 font-medium">{hazard.title}</p>
                <p className="text-xs text-zinc-500 mt-1">{hazard.description}</p>
                {hazard.remediation && (
                  <p className="text-xs text-zinc-400 mt-2">
                    <span className="font-semibold">Remediation: </span>{hazard.remediation}
                  </p>
                )}
              </div>

              <div>
                <Label className="text-xs text-zinc-400 mb-1 block">Assignee</Label>
                <Select value={assignedToUserId || "unassigned"} onValueChange={(v) => setAssignedToUserId(v === "unassigned" ? "" : v)}>
                  <SelectTrigger style={{ background: "#1a1a1a", border: "1px solid #333", color: "#e5e5e5" }}>
                    <SelectValue placeholder="Unassigned" />
                  </SelectTrigger>
                  <SelectContent style={{ background: "#1a1a1a", border: "1px solid #333" }}>
                    <SelectItem value="unassigned" style={{ color: "#71717a" }}>Unassigned</SelectItem>
                    {(membersQuery.data?.members ?? []).map((m) => (
                      <SelectItem key={m.id} value={String(m.id)} style={{ color: "#e5e5e5" }}>
                        {m.firstName} {m.lastName}
                        <span className="ml-1 text-zinc-500 capitalize">({m.role})</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-zinc-400 mb-1 block">Priority</Label>
                  <Select value={priority} onValueChange={(v) => setPriority(v as CapaPriority)}>
                    <SelectTrigger style={{ background: "#1a1a1a", border: "1px solid #333", color: "#e5e5e5" }}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent style={{ background: "#1a1a1a", border: "1px solid #333" }}>
                      {(["critical", "high", "medium", "low"] as CapaPriority[]).map((p) => (
                        <SelectItem key={p} value={p} style={{ color: CAPA_PRIORITY_CFG[p].color }}>
                          {CAPA_PRIORITY_CFG[p].label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-zinc-400 mb-1 block">Due Date</Label>
                  <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)}
                    style={{ background: "#1a1a1a", border: "1px solid #333", color: "#e5e5e5" }} />
                </div>
              </div>

              {hazard.sourcePhotoObjectPath && (
                <p className="text-xs text-zinc-500">Evidence photo auto-attached from the scan.</p>
              )}
            </div>

            <SheetFooter className="px-4">
              <Button variant="ghost" className="text-zinc-400" onClick={onClose}>Cancel</Button>
              <Button
                style={{ background: "#C9A84C", color: "#111111" }}
                disabled={createAction.isPending}
                onClick={() =>
                  createAction.mutate({
                    hazardId: hazard.id,
                    body: {
                      priority,
                      ...(dueDate ? { dueDate } : {}),
                      ...(assignedToUserId ? { assignedToUserId: parseInt(assignedToUserId) } : {}),
                    },
                  })
                }
              >
                {createAction.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create Action"}
              </Button>
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
