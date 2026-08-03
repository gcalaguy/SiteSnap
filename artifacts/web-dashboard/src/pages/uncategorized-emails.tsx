import { useState } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetMe,
  useListUncategorizedEmails,
  getListUncategorizedEmailsQueryKey,
  useAssignEmailThreadToProject,
  useArchiveUncategorizedEmail,
  useIgnoreUncategorizedEmail,
  useBulkAssignUncategorizedEmails,
  useCreateProjectAndAssignUncategorizedEmail,
  useListProjects,
  type EmailThread,
  type Project,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Inbox,
  Mail,
  Zap,
  Check,
  Folder,
  Plus,
  Archive,
  EyeOff,
  RefreshCw,
  AlertTriangle,
  Search,
  Filter,
  Settings2,
} from "lucide-react";

type StatusFilter = "all" | "unassigned" | "suggested";

const FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "suggested", label: "Suggested" },
  { value: "unassigned", label: "Unassigned" },
];

function relativeDateLabel(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.floor(diffH / 24);
  if (diffD === 1) return "Yesterday";
  if (diffD < 7) return `${diffD}d ago`;
  return d.toLocaleDateString("en-CA", { month: "short", day: "numeric" });
}

function ProjectPickerDialog({
  open,
  projects,
  onClose,
  onSelect,
}: {
  open: boolean;
  projects: Project[];
  onClose: () => void;
  onSelect: (projectId: number) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md max-h-[70vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Select Project</DialogTitle>
        </DialogHeader>
        {projects.length === 0 ? (
          <p className="text-sm text-foreground/50 py-6 text-center">No projects available</p>
        ) : (
          <div className="divide-y divide-border">
            {projects.map((p) => (
              <button
                key={p.id}
                onClick={() => onSelect(p.id)}
                className="w-full flex items-center justify-between py-3 text-left hover:text-primary"
              >
                <span className="text-sm font-medium">{p.name}</span>
              </button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function CreateProjectDialog({
  open,
  onClose,
  onSubmit,
  submitting,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: { name: string; address: string; city: string; province: string }) => void;
  submitting: boolean;
}) {
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [province, setProvince] = useState("");

  const isValid = name.trim() && address.trim() && city.trim() && province.trim();

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New Project</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Input placeholder="Project name" value={name} onChange={(e) => setName(e.target.value)} className="bg-background border-border" />
          <Input placeholder="Address" value={address} onChange={(e) => setAddress(e.target.value)} className="bg-background border-border" />
          <div className="grid grid-cols-2 gap-2">
            <Input placeholder="City" value={city} onChange={(e) => setCity(e.target.value)} className="bg-background border-border" />
            <Input placeholder="Province" value={province} onChange={(e) => setProvince(e.target.value)} className="bg-background border-border" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" className="border-border" onClick={onClose}>
            Cancel
          </Button>
          <Button
            className="bg-primary text-black hover:bg-primary/90"
            disabled={!isValid || submitting}
            onClick={() => isValid && onSubmit({ name: name.trim(), address: address.trim(), city: city.trim(), province: province.trim() })}
          >
            {submitting && <RefreshCw className="w-4 h-4 mr-2 animate-spin" />}
            Create & Assign
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ThreadRow({
  thread,
  projects,
  selectMode,
  selected,
  onToggleSelect,
  onRefetch,
}: {
  thread: EmailThread;
  projects: Project[];
  selectMode: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  onRefetch: () => void;
}) {
  const { toast } = useToast();
  const [showAssign, setShowAssign] = useState(false);
  const [showCreateProject, setShowCreateProject] = useState(false);

  const { mutateAsync: assignThread, isPending: assigning } = useAssignEmailThreadToProject();
  const { mutateAsync: archiveThread, isPending: archiving } = useArchiveUncategorizedEmail();
  const { mutateAsync: ignoreThread, isPending: ignoring } = useIgnoreUncategorizedEmail();
  const { mutateAsync: createProjectAndAssign, isPending: creatingProject } = useCreateProjectAndAssignUncategorizedEmail();

  const suggestedProject = projects.find((p) => p.id === thread.suggestedProjectId);

  async function handleAssign(projectId: number) {
    setShowAssign(false);
    try {
      await assignThread({ threadId: thread.id, data: { projectId } });
      onRefetch();
    } catch {
      toast({ title: "Failed", description: "Could not assign this thread. Please try again.", variant: "destructive" });
    }
  }

  async function handleArchive() {
    try {
      await archiveThread({ threadId: thread.id });
      onRefetch();
    } catch {
      toast({ title: "Failed", description: "Could not archive this thread. Please try again.", variant: "destructive" });
    }
  }

  async function handleIgnore() {
    try {
      await ignoreThread({ threadId: thread.id });
      onRefetch();
    } catch {
      toast({ title: "Failed", description: "Could not ignore this thread. Please try again.", variant: "destructive" });
    }
  }

  async function handleCreateProject(data: { name: string; address: string; city: string; province: string }) {
    try {
      await createProjectAndAssign({ threadId: thread.id, data });
      setShowCreateProject(false);
      onRefetch();
    } catch {
      toast({ title: "Failed", description: "Could not create the project. Please try again.", variant: "destructive" });
    }
  }

  const busy = assigning || archiving || ignoring || creatingProject;

  return (
    <>
      <Card className={selectMode ? "cursor-pointer hover:border-primary/40" : ""} onClick={selectMode ? onToggleSelect : undefined}>
        <CardContent className="p-4 space-y-2.5">
          <div className="flex items-start gap-3">
            {selectMode && (
              <input type="checkbox" checked={selected} readOnly className="mt-1 accent-[hsl(var(--primary))]" />
            )}
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <Mail className="w-3.5 h-3.5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm text-foreground truncate">{thread.subject || "(no subject)"}</p>
              <p className="text-xs text-foreground/50 truncate">
                {(thread.participantEmails ?? []).slice(0, 2).join(", ") || "Unknown participants"}
              </p>
            </div>
            <span className="text-xs text-foreground/40 shrink-0">{relativeDateLabel(thread.lastMessageAt)}</span>
          </div>

          {thread.triageStatus === "suggested" && suggestedProject && (
            <div className="flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
              <Zap className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
              <p className="text-xs text-primary leading-relaxed">
                {thread.matchConfidence}% match — likely <span className="font-bold">{suggestedProject.name}</span>
                {(thread.matchReasons ?? []).length > 0 && (
                  <span className="text-foreground/60">
                    {" "}
                    ({thread.matchReasons!.map((r) => `${r.signal.replace(/_/g, " ")}: ${r.value}`).join(", ")})
                  </span>
                )}
              </p>
            </div>
          )}

          {!selectMode && (
            <div className="flex flex-wrap items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
              {thread.triageStatus === "suggested" && suggestedProject && (
                <Button size="sm" className="h-7 px-2.5 bg-primary text-black hover:bg-primary/90" disabled={busy} onClick={() => handleAssign(suggestedProject.id)}>
                  <Check className="w-3.5 h-3.5 mr-1" /> Confirm
                </Button>
              )}
              <Button size="sm" variant="outline" className="h-7 px-2.5 border-border" disabled={busy} onClick={() => setShowAssign(true)}>
                <Folder className="w-3.5 h-3.5 mr-1" /> Assign
              </Button>
              <Button size="sm" variant="outline" className="h-7 px-2.5 border-border" disabled={busy} onClick={() => setShowCreateProject(true)}>
                <Plus className="w-3.5 h-3.5 mr-1" /> New Project
              </Button>
              <Button size="icon" variant="ghost" className="h-7 w-7 text-foreground/50" disabled={busy} onClick={handleArchive} aria-label="Archive">
                <Archive className="w-3.5 h-3.5" />
              </Button>
              <Button size="icon" variant="ghost" className="h-7 w-7 text-foreground/50" disabled={busy} onClick={handleIgnore} aria-label="Ignore">
                <EyeOff className="w-3.5 h-3.5" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <ProjectPickerDialog open={showAssign} projects={projects} onClose={() => setShowAssign(false)} onSelect={handleAssign} />
      <CreateProjectDialog open={showCreateProject} onClose={() => setShowCreateProject(false)} onSubmit={handleCreateProject} submitting={creatingProject} />
    </>
  );
}

export default function UncategorizedEmailsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: me } = useGetMe();
  const isOwner = me?.role === "owner" || me?.systemRole === "super_admin";
  const canView = !me?.permissions || (me.permissions as Record<string, boolean>).viewProjectCommunications !== false;

  const [filter, setFilter] = useState<StatusFilter>("all");
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [bulkTarget, setBulkTarget] = useState(false);

  const { data, isLoading, isError, refetch } = useListUncategorizedEmails(
    filter === "all" ? undefined : { status: filter },
    {
      query: {
        queryKey: getListUncategorizedEmailsQueryKey(filter === "all" ? undefined : { status: filter }),
        enabled: canView,
      },
    },
  );
  const { data: projects = [] } = useListProjects();

  const { mutateAsync: bulkAssign, isPending: bulkAssigning } = useBulkAssignUncategorizedEmails();

  function refetchInbox() {
    queryClient.invalidateQueries({ queryKey: getListUncategorizedEmailsQueryKey(filter === "all" ? undefined : { status: filter }) });
  }

  function toggleSelect(id: number) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function handleBulkAssign(projectId: number) {
    setBulkTarget(false);
    try {
      await bulkAssign({ data: { threadIds: selectedIds, projectId } });
      setSelectedIds([]);
      setSelectMode(false);
      refetchInbox();
    } catch {
      toast({ title: "Failed", description: "Could not assign the selected threads. Please try again.", variant: "destructive" });
    }
  }

  if (!canView) {
    return (
      <div className="py-16 flex flex-col items-center text-center">
        <AlertTriangle className="w-10 h-10 text-amber-400 mb-3" />
        <p className="text-sm font-medium">You don't have access to Project Communications.</p>
      </div>
    );
  }

  const threads = data?.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-foreground flex items-center gap-2">
            <Inbox className="h-6 w-6 text-primary" />
            Uncategorized Emails
          </h1>
          <p className="text-sm text-foreground/60 font-medium">Emails waiting to be filed to a project.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/communications-search">
            <Button variant="outline" size="sm" className="border-border">
              <Search className="w-3.5 h-3.5 mr-1.5" /> Search Builder
            </Button>
          </Link>
          {isOwner && (
            <>
              <Link href="/email-filing-rules">
                <Button variant="outline" size="sm" className="border-border">
                  <Filter className="w-3.5 h-3.5 mr-1.5" /> Filing Rules
                </Button>
              </Link>
              <Link href="/email-integrations">
                <Button variant="outline" size="sm" className="border-border">
                  <Settings2 className="w-3.5 h-3.5 mr-1.5" /> Integrations
                </Button>
              </Link>
            </>
          )}
          <Button
            variant={selectMode ? "default" : "outline"}
            size="sm"
            className={selectMode ? "bg-primary text-black hover:bg-primary/90" : "border-border"}
            onClick={() => {
              setSelectMode((v) => !v);
              setSelectedIds([]);
            }}
          >
            {selectMode ? "Cancel" : "Select"}
          </Button>
        </div>
      </div>

      <div className="flex gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
              filter === f.value ? "bg-primary text-black border-primary" : "bg-muted text-foreground/70 border-border hover:text-foreground"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="py-16 text-center text-foreground/60 animate-pulse font-medium">Loading inbox…</div>
      ) : isError ? (
        <div className="py-16 flex flex-col items-center text-center">
          <AlertTriangle className="w-10 h-10 text-red-400 mb-3" />
          <p className="text-sm text-red-500 mb-3">Failed to load inbox</p>
          <Button variant="outline" size="sm" className="border-border" onClick={() => refetch()}>
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Retry
          </Button>
        </div>
      ) : threads.length === 0 ? (
        <Card>
          <CardContent className="py-16 flex flex-col items-center gap-2 text-center">
            <Inbox className="h-10 w-10 text-foreground/20" />
            <p className="text-foreground/60 font-medium">All caught up</p>
            <p className="text-xs text-foreground/40">Nothing waiting to be filed right now.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 max-w-2xl pb-16">
          {threads.map((thread) => (
            <ThreadRow
              key={thread.id}
              thread={thread}
              projects={projects}
              selectMode={selectMode}
              selected={selectedIds.includes(thread.id)}
              onToggleSelect={() => toggleSelect(thread.id)}
              onRefetch={refetchInbox}
            />
          ))}
        </div>
      )}

      {selectMode && selectedIds.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 border-t border-border bg-card px-6 py-3 flex items-center gap-3 z-20">
          <span className="text-sm font-medium">{selectedIds.length} selected</span>
          <Button className="bg-primary text-black hover:bg-primary/90" disabled={bulkAssigning} onClick={() => setBulkTarget(true)}>
            {bulkAssigning && <RefreshCw className="w-4 h-4 mr-2 animate-spin" />}
            Bulk Assign
          </Button>
        </div>
      )}

      <ProjectPickerDialog open={bulkTarget} projects={projects} onClose={() => setBulkTarget(false)} onSelect={handleBulkAssign} />
    </div>
  );
}
