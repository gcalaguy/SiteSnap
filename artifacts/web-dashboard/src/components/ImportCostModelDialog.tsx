import { useState } from "react";
import {
  useImportCostModelItem,
  getListCostModelsQueryKey,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Database, Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

const FINISH_LEVELS = ["basic", "standard", "premium", "luxury"] as const;

const PROJECT_TYPES = [
  { value: "residential_new_build", label: "Residential New Build" },
  { value: "commercial_new_build", label: "Commercial New Build" },
  { value: "renovation_residential", label: "Residential Renovation" },
  { value: "renovation_commercial", label: "Commercial Renovation" },
  { value: "addition", label: "Home Addition" },
  { value: "garage", label: "Garage" },
  { value: "deck_patio", label: "Deck / Patio" },
  { value: "basement_finish", label: "Basement Finish" },
  { value: "roofing", label: "Roofing" },
  { value: "concrete_flatwork", label: "Concrete Flatwork" },
  { value: "framing_only", label: "Framing Only" },
  { value: "landscaping", label: "Landscaping" },
];

interface Props {
  open: boolean;
  onClose: () => void;
  description: string;
  unitPrice: number;
  sourceType: "quote" | "invoice";
  sourceId: string;
  sourceLabel: string;
}

export default function ImportCostModelDialog({
  open,
  onClose,
  description,
  unitPrice,
  sourceType,
  sourceId,
  sourceLabel,
}: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const importMutation = useImportCostModelItem();

  const [projectType, setProjectType] = useState("residential_new_build");
  const [finishLevel, setFinishLevel] = useState<string>("standard");
  const [baseCostPerSqft, setBaseCostPerSqft] = useState(String(unitPrice));
  const [laborCostPerSqft, setLaborCostPerSqft] = useState("");
  const [materialCostPerSqft, setMaterialCostPerSqft] = useState("");
  const [overheadPct, setOverheadPct] = useState("10");
  const [contingencyPct, setContingencyPct] = useState("10");
  const [notes, setNotes] = useState(`Imported from ${sourceLabel}`);

  function numericField(v: string) {
    const n = parseFloat(v);
    return !isNaN(n) && n >= 0;
  }

  function validate() {
    return (
      numericField(baseCostPerSqft) &&
      numericField(laborCostPerSqft) &&
      numericField(materialCostPerSqft) &&
      numericField(overheadPct) &&
      numericField(contingencyPct)
    );
  }

  function handleSave() {
    if (!validate()) {
      toast({
        title: "Please enter valid numbers for all cost fields",
        variant: "destructive",
      });
      return;
    }
    importMutation.mutate(
      {
        data: {
          projectType,
          finishLevel: finishLevel as "basic" | "standard" | "premium" | "luxury",
          name: description,
          baseCostPerSqft,
          laborCostPerSqft,
          materialCostPerSqft,
          overheadPct,
          contingencyPct,
          notes: notes || undefined,
          sourceType,
          sourceId,
        },
      },
      {
        onSuccess: () => {
          void queryClient.invalidateQueries({
            queryKey: getListCostModelsQueryKey(),
          });
          toast({ title: "Saved to Pricing Database" });
          onClose();
        },
        onError: () => {
          toast({ title: "Failed to save", variant: "destructive" });
        },
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Database className="h-5 w-5 text-primary" />
              Save to Pricing Database
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label className="text-xs">Description (Name)</Label>
              <Input value={description} disabled className="text-sm bg-muted" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Project Type</Label>
                <Select value={projectType} onValueChange={setProjectType}>
                  <SelectTrigger className="text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PROJECT_TYPES.map((pt) => (
                      <SelectItem key={pt.value} value={pt.value}>
                        {pt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Finish Level</Label>
                <Select value={finishLevel} onValueChange={setFinishLevel}>
                  <SelectTrigger className="text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FINISH_LEVELS.map((fl) => (
                      <SelectItem key={fl} value={fl}>
                        {fl.charAt(0).toUpperCase() + fl.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Base $/sqft</Label>
                <Input
                  type="number"
                  value={baseCostPerSqft}
                  onChange={(e) => setBaseCostPerSqft(e.target.value)}
                  className="text-sm"
                  min={0}
                  step={0.01}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Labour $/sqft</Label>
                <Input
                  type="number"
                  value={laborCostPerSqft}
                  onChange={(e) => setLaborCostPerSqft(e.target.value)}
                  className="text-sm"
                  min={0}
                  step={0.01}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Material $/sqft</Label>
                <Input
                  type="number"
                  value={materialCostPerSqft}
                  onChange={(e) => setMaterialCostPerSqft(e.target.value)}
                  className="text-sm"
                  min={0}
                  step={0.01}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Overhead %</Label>
                <Input
                  type="number"
                  value={overheadPct}
                  onChange={(e) => setOverheadPct(e.target.value)}
                  className="text-sm"
                  min={0}
                  max={100}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Contingency %</Label>
                <Input
                  type="number"
                  value={contingencyPct}
                  onChange={(e) => setContingencyPct(e.target.value)}
                  className="text-sm"
                  min={0}
                  max={100}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Notes</Label>
              <Input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="text-sm"
                placeholder="Optional notes"
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              Source: {sourceLabel} · This creates a new cost model the AI estimator can reference.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave} disabled={importMutation.isPending}>
              {importMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
              ) : (
                <Database className="h-3.5 w-3.5 mr-1" />
              )}
              Save
            </Button>
          </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
