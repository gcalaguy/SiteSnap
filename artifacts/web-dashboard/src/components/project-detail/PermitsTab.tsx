import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useGetMe, customFetch, ApiError } from "@workspace/api-client-react";
import {
  type Permit,
  PermitFormDialog,
  PermitFileLink,
  ExpirationCell,
  statusBadgeClass,
} from "@/pages/permits";
import { useToast } from "@/hooks/use-toast";
import { BadgeCheck, Plus, Pencil, Trash2, RefreshCw, ShieldAlert, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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

/**
 * Project-scoped Permits tab. Queries /api/permits/project/:projectId — owners
 * can create (pre-scoped to this project), edit and delete; foremen get the
 * same list read-only (enforced server-side as well).
 */
export default function PermitsTab({ projectId }: { projectId: number }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: me } = useGetMe();
  const isOwner = me?.role === "owner" || me?.systemRole === "super_admin";

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Permit | null>(null);
  const [deleting, setDeleting] = useState<Permit | null>(null);

  const { data: permits = [], isLoading, error } = useQuery<Permit[]>({
    queryKey: ["permits", "project", String(projectId)],
    queryFn: () => customFetch<Permit[]>(`/api/permits/project/${projectId}`),
    enabled: !!me && !!projectId,
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
    onError: (e) => {
      toast({
        title: "Delete failed",
        description: e?.message ?? "Something went wrong",
        variant: "destructive",
      });
      setDeleting(null);
    },
  });

  const accessDenied = error instanceof ApiError && error.status === 403;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 gap-3">
        <RefreshCw className="w-5 h-5 animate-spin text-[#C9A84C]" />
        <span className="text-sm text-muted-foreground">Loading permits...</span>
      </div>
    );
  }

  if (accessDenied) {
    return (
      <div className="py-16 flex flex-col items-center text-center">
        <ShieldAlert className="w-10 h-10 text-amber-400 mb-3" />
        <p className="text-sm font-medium">You're not assigned to this project</p>
        <p className="text-xs text-muted-foreground mt-1">
          Ask an owner to add you to the project team to view its permits
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-16 flex flex-col items-center text-center">
        <ShieldAlert className="w-10 h-10 text-red-400 mb-3" />
        <p className="text-sm text-red-500">Failed to load permits</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          <BadgeCheck className="w-5 h-5 text-[#C9A84C]" />
          <h3 className="text-xl font-bold">Permits</h3>
          <span className="text-sm text-muted-foreground">{permits.length} total</span>
        </div>
        {isOwner && (
          <Button
            size="sm"
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

      {permits.length === 0 ? (
        <div className="text-center p-8 border rounded-md bg-card">
          <FileText className="mx-auto h-8 w-8 text-muted-foreground mb-3" />
          <p className="font-medium">No permits yet</p>
          <p className="text-sm text-muted-foreground mt-1">
            {isOwner
              ? "Add the first permit for this project with the New Permit button."
              : "Permits for this project will appear here once added."}
          </p>
        </div>
      ) : (
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/40">
                  <th className="text-left px-5 py-2.5 text-xs font-semibold text-muted-foreground">Permit</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Status</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Expires</th>
                  <th className="text-right px-5 py-2.5 text-xs font-semibold text-muted-foreground">
                    {isOwner ? "Actions" : "File"}
                  </th>
                </tr>
              </thead>
              <tbody>
                {permits.map((p) => (
                  <tr key={p.id} className="border-t hover:bg-muted/20">
                    <td className="px-5 py-3">
                      <p className="font-medium">{p.title}</p>
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
                        {isOwner && (
                          <>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 text-muted-foreground hover:text-foreground"
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

      {formOpen && (
        <PermitFormDialog
          key={editing?.id ?? "new"}
          open={formOpen}
          onClose={() => {
            setFormOpen(false);
            setEditing(null);
          }}
          projects={[]}
          editing={editing}
          fixedProjectId={projectId}
        />
      )}

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
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
