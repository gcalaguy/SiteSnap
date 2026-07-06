import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { CharCountedTextarea } from "@/components/ui/char-counted-textarea";
import { Loader2 } from "lucide-react";
import { useEquipmentMutations } from "@/hooks/schedule/useEquipment";
import { NOTES_MAX, type Equipment } from "@/components/schedule/shared";

const EQUIPMENT_TYPES = ["excavator", "lift", "crane", "truck", "tools", "other"];
const EQUIPMENT_STATUSES = [
  { value: "available", label: "Available" },
  { value: "in_use", label: "In Use" },
  { value: "maintenance", label: "Maintenance" },
  { value: "retired", label: "Retired" },
];

interface EquipmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingEquipment: Equipment | null;
}

export function EquipmentDialog({ open, onOpenChange, editingEquipment }: EquipmentDialogProps) {
  const [eqName, setEqName] = useState("");
  const [eqType, setEqType] = useState("other");
  const [eqStatus, setEqStatus] = useState("available");
  const [eqNotes, setEqNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    if (editingEquipment) {
      setEqName(editingEquipment.name);
      setEqType(editingEquipment.type);
      setEqStatus(editingEquipment.status);
      setEqNotes(editingEquipment.notes ?? "");
    } else {
      setEqName(""); setEqType("other"); setEqStatus("available"); setEqNotes("");
    }
  }, [open, editingEquipment]);

  const { createEquipMut, updateEquipMut } = useEquipmentMutations(() => onOpenChange(false));
  const editEquipId = editingEquipment?.id ?? null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{editEquipId ? "Edit Equipment" : "Add Equipment"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <label className="text-sm font-medium block mb-1">Name *</label>
            <Input placeholder="e.g. Excavator #2" value={eqName} onChange={e => setEqName(e.target.value)} />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">Type</label>
            <Select value={eqType} onValueChange={setEqType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {EQUIPMENT_TYPES.map(t => (
                  <SelectItem key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">Status</label>
            <Select value={eqStatus} onValueChange={setEqStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {EQUIPMENT_STATUSES.map(s => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">Notes (optional)</label>
            <CharCountedTextarea
              placeholder="e.g. Due for service in June"
              value={eqNotes}
              onChange={e => setEqNotes(e.target.value.slice(0, NOTES_MAX))}
              className="min-h-[60px]"
              maxLength={NOTES_MAX}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={() => {
              if (!eqName) return;
              const body = { name: eqName, type: eqType, status: eqStatus, notes: eqNotes || undefined };
              if (editEquipId) {
                updateEquipMut.mutate({ id: editEquipId, ...body });
              } else {
                createEquipMut.mutate(body);
              }
            }}
            disabled={!eqName || createEquipMut.isPending || updateEquipMut.isPending || eqNotes.length >= NOTES_MAX}
          >
            {(createEquipMut.isPending || updateEquipMut.isPending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {editEquipId ? "Save Changes" : "Add Equipment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
