import { useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useGetMe, useListProjects, customFetch } from "@workspace/api-client-react";
import { useSignedDownload } from "@/hooks/useSignedUrl";
import { useToast } from "@/hooks/use-toast";
import { FeatureGuard } from "@/components/FeatureGuard";
import { UpgradePaywall } from "@/components/UpgradePaywall";
import {
  BadgeCheck,
  Search,
  FileText,
  Trash2,
  RefreshCw,
  Plus,
  Pencil,
  Upload,
  ExternalLink,
  ShieldAlert,
  Building2,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export interface Permit {
  id: string;
  companyId: number;
  projectId: number;
  projectName?: string;
  title: string;
  status: string;
  expirationDate: string | null;
  fileUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

const STATUS_OPTIONS = ["active", "pending", "approved", "expired", "closed"] as const;

const STATUS_STYLES: Record<string, string> = {
  active: "bg-emerald-50 text-emerald-600 border-emerald-100",
  approved: "bg-emerald-50 text-emerald-600 border-emerald-100",
  pending: "bg-amber-50 text-amber-600 border-amber-100",
  expired: "bg-red-50 text-red-600 border-red-100",
  closed: "bg-gray-100 text-gray-500 border-gray-200",
};

export function statusBadgeClass(status: string) {
  return STATUS_STYLES[status] ?? "bg-[#C9A84C]/10 text-[#C9A84C] border-[#C9A84C]/20";
}

function renderSafeDate(dateString: string | null | undefined) {
  if (!dateString) return "—";
  const d = new Date(dateString);
  return isNaN(d.getTime()) ? "—" : d.toLocaleDateString();
}

/** Days until expiration; negative = already expired, null = no expiry set. */
export function daysUntil(dateString: string | null): number | null {
  if (!dateString) return null;
  const d = new Date(dateString);
  if (isNaN(d.getTime())) return null;
  return Math.ceil((d.getTime() - Date.now()) / 86_400_000);
}

export function ExpirationCell({ permit }: { permit: Permit }) {
  const days = daysUntil(permit.expirationDate);
  if (days === null) return <span className="text-[#0A0A0A]/40">—</span>;
  if (days < 0) {
    return (
      <span className="text-red-500 font-medium">
        {renderSafeDate(permit.expirationDate)} (expired)
      </span>
    );
  }
  if (days <= 30) {
    return (
      <span className="text-amber-600 font-medium">
        {renderSafeDate(permit.expirationDate)} ({days}d left)
      </span>
    );
  }
  return <span className="text-[#0A0A0A]/60">{renderSafeDate(permit.expirationDate)}</span>;
}

export function PermitFileLink({ fileUrl }: { fileUrl: string | null }) {
  const { open, isFetching } = useSignedDownload(fileUrl);
  if (!fileUrl) return <span className="text-xs text-[#0A0A0A]/30">No file</span>;
  return (
    <Button
      size="sm"
      variant="ghost"
      className="h-7 px-2 text-[#C9A84C] hover:text-[#C9A84C] hover:bg-[#C9A84C]/10"
      onClick={(e) => {
        e.stopPropagation();
        open();
      }}
      disabled={isFetching}
    >
      {isFetching ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <ExternalLink className="w-3.5 h-3.5" />}
      <span className="ml-1 text-xs">View</span>
    </Button>
  );
}

interface PermitFormState {
  projectId: string;
  title: string;
  status: string;
  expirationDate: string; // yyyy-mm-dd or ""
  file: File | null;
}

const EMPTY_FORM: PermitFormState = {
  projectId: "",
  title: "",
  status: "active",
  expirationDate: "",
  file: null,
};

export function PermitFormDialog({
  open,
  onClose,
  projects,
  editing,
  fixedProjectId,
}: {
  open: boolean;
  onClose: () => void;
  projects: Array<{ id: number; name: string }>;
  editing: Permit | null;
  /** Pre-scope creation to one project and hide the project selector. */
  fixedProjectId?: number;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<PermitFormState>(() =>
    editing
      ? {
          projectId: String(editing.projectId),
          title: editing.title,
          status: editing.status,
          expirationDate: editing.expirationDate
            ? new Date(editing.expirationDate).toISOString().slice(0, 10)
            : "",
          file: null,
        }
      : EMPTY_FORM,
  );

  const save = useMutation({
    mutationFn: async () => {
      // Upload the permit document first (if provided), then link its path.
      let fileUrl: string | undefined;
      if (form.file) {
        const fd = new FormData();
        fd.append("file", form.file);
        const { objectPath } = await customFetch<{ objectPath: string }>(
          "/api/storage/uploads/file",
          { method: "POST", body: fd },
        );
        fileUrl = objectPath;
      }

      const payload: Record<string, unknown> = {
        title: form.title.trim(),
        status: form.status,
        expirationDate: form.expirationDate || (editing ? null : undefined),
        ...(fileUrl ? { fileUrl } : {}),
      };

      if (editing) {
        return customFetch<Permit>(`/api/permits/${editing.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      }
      return customFetch<Permit>("/api/permits", {
        method: "POST",
        body: JSON.stringify({
          ...payload,
          projectId: fixedProjectId ?? Number(form.projectId),
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["permits"] });
      toast({
        title: editing ? "Permit updated" : "Permit created",
        description: form.title.trim(),
      });
      onClose();
    },
    onError: (e: any) => {
      toast({
        title: editing ? "Update failed" : "Create failed",
        description: e?.message ?? "Something went wrong",
        variant: "destructive",
      });
    },
  });

  const valid =
    form.title.trim().length > 0 && (editing || fixedProjectId != null || form.projectId);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md bg-white border-[#E5E5E5]">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold" style={{ color: "#0A0A0A" }}>
            {editing ? "Edit Permit" : "New Permit"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-1">
          {!editing && fixedProjectId == null && (
            <div className="space-y-1.5">
              <Label>Project</Label>
              <Select
                value={form.projectId}
                onValueChange={(v) => setForm((f) => ({ ...f, projectId: v }))}
              >
                <SelectTrigger className="bg-white border-[#E5E5E5]">
                  <SelectValue placeholder="Select a project" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Title</Label>
            <Input
              placeholder="e.g. Building Permit #BP-2026-0142"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              className="bg-white border-[#E5E5E5]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select
                value={form.status}
                onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}
              >
                <SelectTrigger className="bg-white border-[#E5E5E5]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s} value={s} className="capitalize">
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Expiration date</Label>
              <Input
                type="date"
                value={form.expirationDate}
                onChange={(e) => setForm((f) => ({ ...f, expirationDate: e.target.value }))}
                className="bg-white border-[#E5E5E5]"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Permit document {editing ? "(replace)" : "(optional)"}</Label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp,.heic"
              className="hidden"
              onChange={(e) => setForm((f) => ({ ...f, file: e.target.files?.[0] ?? null }))}
            />
            <Button
              type="button"
              variant="outline"
              className="w-full border-[#E5E5E5] justify-start font-normal"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="w-4 h-4 mr-2 text-[#C9A84C]" />
              {form.file ? form.file.name : "Choose a file..."}
            </Button>
          </div>
        </div>
        <DialogFooter className="mt-2">
          <Button variant="outline" className="border-[#E5E5E5]" onClick={onClose}>
            Cancel
          </Button>
          <Button
            className="bg-[#C9A84C] text-black hover:bg-[#C9A84C]/90"
            disabled={!valid || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending && <RefreshCw className="w-4 h-4 mr-2 animate-spin" />}
            {editing ? "Save Changes" : "Create Permit"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PermitsPageContent() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: user } = useGetMe();
  const { data: projects = [] } = useListProjects();

  // Owners (and platform super-admins) get the company-wide global view with
  // full management. Foremen/workers get a read-only, per-project view — the
  // API enforces project assignment server-side.
  const isAdmin = user?.role === "owner" || user?.systemRole === "super_admin";

  const [search, setSearch] = useState("");
  const [projectFilter, setProjectFilter] = useState<string>("all");
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Permit | null>(null);
  const [deleting, setDeleting] = useState<Permit | null>(null);

  const projectList = useMemo(
    () => projects.map((p: any) => ({ id: p.id as number, name: p.name as string })),
    [projects],
  );
  const effectiveProjectId = selectedProjectId || (projectList[0] ? String(projectList[0].id) : "");

  // Global view (owner/admin): every permit in the company.
  const globalQuery = useQuery<Permit[]>({
    queryKey: ["permits", "global"],
    queryFn: () => customFetch<Permit[]>("/api/permits/global"),
    enabled: !!user && isAdmin,
  });

  // Project view (foreman): permits for the selected assigned project only.
  const projectQuery = useQuery<Permit[]>({
    queryKey: ["permits", "project", effectiveProjectId],
    queryFn: () => customFetch<Permit[]>(`/api/permits/project/${effectiveProjectId}`),
    enabled: !!user && !isAdmin && !!effectiveProjectId,
    retry: false,
  });

  const remove = useMutation({
    mutationFn: (permit: Permit) =>
      customFetch(`/api/permits/${permit.id}`, { method: "DELETE" }),
    onSuccess: (_, permit) => {
      queryClient.invalidateQueries({ queryKey: ["permits"] });
      toast({ title: "Permit deleted", description: permit.title });
      setDeleting(null);
    },
    onError: (e: any) => {
      toast({
        title: "Delete failed",
        description: e?.message ?? "Something went wrong",
        variant: "destructive",
      });
      setDeleting(null);
    },
  });

  const activeQuery = isAdmin ? globalQuery : projectQuery;
  const permits = activeQuery.data ?? [];
  const projectNameById = useMemo(() => {
    const m = new Map<number, string>();
    for (const p of projectList) m.set(p.id, p.name);
    return m;
  }, [projectList]);

  const filtered = permits.filter((p) => {
    if (isAdmin && projectFilter !== "all" && String(p.projectId) !== projectFilter) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    const projectName = p.projectName ?? projectNameById.get(p.projectId) ?? "";
    return (
      p.title.toLowerCase().includes(q) ||
      p.status.toLowerCase().includes(q) ||
      projectName.toLowerCase().includes(q)
    );
  });

  const expiringSoon = permits.filter((p) => {
    const d = daysUntil(p.expirationDate);
    return d !== null && d >= 0 && d <= 30;
  }).length;
  const expired = permits.filter((p) => {
    const d = daysUntil(p.expirationDate);
    return d !== null && d < 0;
  }).length;

  const accessDenied =
    !isAdmin &&
    projectQuery.error != null &&
    (projectQuery.error as any)?.status === 403;

  if (activeQuery.isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#F8F8F8" }}>
        <div className="flex items-center gap-3">
          <RefreshCw className="w-5 h-5 animate-spin text-[#C9A84C]" />
          <span className="text-sm text-[#0A0A0A]/60">Loading permits...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: "#F8F8F8" }}>
      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-[#C9A84C]/10 flex items-center justify-center">
            <BadgeCheck className="w-5 h-5 text-[#C9A84C]" />
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-bold" style={{ color: "#0A0A0A" }}>Permits</h1>
            <p className="text-xs text-[#0A0A0A]/50 mt-0.5">
              {isAdmin
                ? "All construction permits across your company"
                : "Permits for your assigned projects (view only)"}
            </p>
          </div>
          {isAdmin && (
            <Button
              className="bg-[#C9A84C] text-black hover:bg-[#C9A84C]/90"
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <Plus className="w-4 h-4 mr-1.5" /> New Permit
            </Button>
          )}
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#0A0A0A]/30" />
            <Input
              placeholder="Search by title, status or project..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 bg-white border-[#E5E5E5]"
            />
          </div>
          {isAdmin ? (
            <Select value={projectFilter} onValueChange={setProjectFilter}>
              <SelectTrigger className="sm:w-56 bg-white border-[#E5E5E5]">
                <Building2 className="w-4 h-4 mr-2 text-[#C9A84C]" />
                <SelectValue placeholder="All projects" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All projects</SelectItem>
                {projectList.map((p) => (
                  <SelectItem key={p.id} value={String(p.id)}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Select value={effectiveProjectId} onValueChange={setSelectedProjectId}>
              <SelectTrigger className="sm:w-56 bg-white border-[#E5E5E5]">
                <Building2 className="w-4 h-4 mr-2 text-[#C9A84C]" />
                <SelectValue placeholder="Select project" />
              </SelectTrigger>
              <SelectContent>
                {projectList.map((p) => (
                  <SelectItem key={p.id} value={String(p.id)}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <Card>
            <CardContent className="p-4">
              <p className="text-2xl font-bold" style={{ color: "#0A0A0A" }}>{permits.length}</p>
              <p className="text-xs text-[#0A0A0A]/50 mt-1">Total Permits</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-2xl font-bold text-amber-500">{expiringSoon}</p>
              <p className="text-xs text-[#0A0A0A]/50 mt-1">Expiring in 30 Days</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-2xl font-bold text-red-500">{expired}</p>
              <p className="text-xs text-[#0A0A0A]/50 mt-1">Expired</p>
            </CardContent>
          </Card>
        </div>

        {/* Content */}
        {accessDenied ? (
          <div className="py-16 flex flex-col items-center text-center">
            <ShieldAlert className="w-10 h-10 text-amber-400 mb-3" />
            <p className="text-sm text-[#0A0A0A]/60 font-medium">You're not assigned to this project</p>
            <p className="text-xs text-[#0A0A0A]/40 mt-1">
              Ask an owner to add you to the project team to view its permits
            </p>
          </div>
        ) : activeQuery.error ? (
          <div className="py-16 flex flex-col items-center text-center">
            <ShieldAlert className="w-10 h-10 text-red-400 mb-3" />
            <p className="text-sm text-red-500">Failed to load permits</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 flex flex-col items-center text-center">
            <FileText className="w-10 h-10 text-[#E5E5E5] mb-3" />
            <p className="text-sm text-[#0A0A0A]/50">No permits found</p>
            {isAdmin && (
              <p className="text-xs text-[#0A0A0A]/30 mt-1">
                Create your first permit with the New Permit button
              </p>
            )}
          </div>
        ) : (
          <Card className="overflow-hidden">
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#FAFAFA]">
                    <th className="text-left px-5 py-2.5 text-xs font-semibold text-[#0A0A0A]/40">Permit</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-[#0A0A0A]/40">Project</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-[#0A0A0A]/40">Status</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-[#0A0A0A]/40">Expires</th>
                    <th className="text-right px-5 py-2.5 text-xs font-semibold text-[#0A0A0A]/40">
                      {isAdmin ? "Actions" : "File"}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p) => (
                    <tr key={p.id} className="border-t border-[#F5F5F5] hover:bg-[#FAFAFA]">
                      <td className="px-5 py-3">
                        <p className="font-medium text-[#0A0A0A]">{p.title}</p>
                      </td>
                      <td className="px-4 py-3 text-[#0A0A0A]/60">
                        {p.projectName ?? projectNameById.get(p.projectId) ?? `#${p.projectId}`}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className={`capitalize ${statusBadgeClass(p.status)}`}>
                          {p.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <ExpirationCell permit={p} />
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <PermitFileLink fileUrl={p.fileUrl} />
                          {isAdmin && (
                            <>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 text-[#0A0A0A]/40 hover:text-[#0A0A0A]"
                                onClick={() => {
                                  setEditing(p);
                                  setFormOpen(true);
                                }}
                              >
                                <Pencil className="w-4 h-4" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 text-red-400 hover:text-red-600 hover:bg-red-50"
                                onClick={() => setDeleting(p)}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Create / Edit dialog (owner/admin only) */}
      {formOpen && (
        <PermitFormDialog
          key={editing?.id ?? "new"}
          open={formOpen}
          onClose={() => {
            setFormOpen(false);
            setEditing(null);
          }}
          projects={projectList}
          editing={editing}
        />
      )}

      {/* Delete confirmation */}
      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent className="bg-white border-[#E5E5E5]">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete permit?</AlertDialogTitle>
            <AlertDialogDescription>
              "{deleting?.title}" will be permanently removed. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={() => deleting && remove.mutate(deleting)}
            >
              {remove.isPending && <RefreshCw className="w-4 h-4 mr-2 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default function PermitsPage() {
  return (
    <FeatureGuard
      feature="PERMITS"
      fallback={
        <UpgradePaywall
          icon={BadgeCheck}
          title="Permits & Documentation"
          description="Track, request, and manage municipal and environmental project permits. This feature is not included in your current plan."
        />
      }
    >
      <PermitsPageContent />
    </FeatureGuard>
  );
}
