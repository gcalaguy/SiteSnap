import { useState } from "react";
import { Loader2, Plus } from "lucide-react";
import {
  useListProjects,
  useCreateProject,
  getListProjectsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

const NEW_PROJECT_VALUE = "__new_project__";

interface Props {
  value: number | null;
  onChange: (projectId: number) => void;
  placeholder?: string;
  allowAll?: boolean;
}

/** Existing-project dropdown with an inline "+ New Project" quick-create option — used for both filtering and reassigning a voice note's project. */
export function ProjectSelect({ value, onChange, placeholder = "Select a project", allowAll = false }: Props) {
  const { data: projects = [] } = useListProjects();
  const [creating, setCreating] = useState(false);

  return (
    <>
      <Select
        value={value != null ? String(value) : allowAll ? "all" : undefined}
        onValueChange={(v) => {
          if (v === NEW_PROJECT_VALUE) {
            setCreating(true);
            return;
          }
          if (v === "all") return;
          onChange(parseInt(v));
        }}
      >
        <SelectTrigger style={{ background: "#1a1a1a", border: "1px solid #333", color: "#e5e5e5" }}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent style={{ background: "#1a1a1a", border: "1px solid #333" }}>
          {allowAll && (
            <SelectItem value="all" style={{ color: "#e5e5e5" }}>All projects</SelectItem>
          )}
          {projects.map((p) => (
            <SelectItem key={p.id} value={String(p.id)} style={{ color: "#e5e5e5" }}>
              {p.name}
            </SelectItem>
          ))}
          <SelectItem value={NEW_PROJECT_VALUE} style={{ color: "#C9A84C" }}>
            <span className="flex items-center gap-1.5"><Plus className="h-3.5 w-3.5" />New project…</span>
          </SelectItem>
        </SelectContent>
      </Select>

      <QuickCreateProjectDialog
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(projectId) => onChange(projectId)}
      />
    </>
  );
}

function QuickCreateProjectDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (projectId: number) => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createProject = useCreateProject();
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [province, setProvince] = useState("");

  function reset() {
    setName("");
    setAddress("");
    setCity("");
    setProvince("");
  }

  function handleSubmit() {
    if (!name.trim() || !address.trim() || !city.trim() || !province.trim()) {
      toast({ title: "Enter a project name, address, city, and province", variant: "destructive" });
      return;
    }
    createProject.mutate(
      { data: { name: name.trim(), address: address.trim(), city: city.trim(), province: province.trim(), status: "active" } },
      {
        onSuccess: (project) => {
          queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
          toast({ title: "Project created" });
          onCreated(project.id);
          reset();
          onClose();
        },
        onError: () => toast({ title: "Failed to create project", variant: "destructive" }),
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { reset(); onClose(); } }}>
      <DialogContent style={{ background: "#0f0f0f", border: "1px solid #2a2a2a" }}>
        <DialogHeader>
          <DialogTitle style={{ color: "#e5e5e5" }}>New Project</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label className="text-xs text-zinc-400 mb-1 block">Project Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Maple Street Renovation"
              style={{ background: "#1a1a1a", border: "1px solid #333", color: "#e5e5e5" }} />
          </div>
          <div>
            <Label className="text-xs text-zinc-400 mb-1 block">Address</Label>
            <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="e.g. 123 Maple St"
              style={{ background: "#1a1a1a", border: "1px solid #333", color: "#e5e5e5" }} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-zinc-400 mb-1 block">City</Label>
              <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="e.g. Toronto"
                style={{ background: "#1a1a1a", border: "1px solid #333", color: "#e5e5e5" }} />
            </div>
            <div>
              <Label className="text-xs text-zinc-400 mb-1 block">Province</Label>
              <Input value={province} onChange={(e) => setProvince(e.target.value)} placeholder="e.g. ON"
                style={{ background: "#1a1a1a", border: "1px solid #333", color: "#e5e5e5" }} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" className="text-zinc-400" onClick={() => { reset(); onClose(); }}>Cancel</Button>
          <Button style={{ background: "#C9A84C", color: "#111111" }} disabled={createProject.isPending} onClick={handleSubmit}>
            {createProject.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create Project"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
