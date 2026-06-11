import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import {
  useListRFIs,
  useDeleteRFI,
  useUpdateRFI,
  getListRFIsQueryKey,
} from "@workspace/api-client-react";
import { format } from "date-fns";
import { queryClient } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { CharCountedTextarea } from "@/components/ui/char-counted-textarea";
import { Plus, ChevronDown, ChevronUp, AlertTriangle, Pencil, Trash2, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  createRFIBodyDescriptionMax as RFI_DESC_MAX,
  updateRFIBodyResponseMax as RFI_RESPONSE_MAX,
} from "@workspace/api-zod";
import type { Member } from "./TasksTab";

export function RFIsTab({
  projectId,
  isOwnerOrForeman,
  members,
}: {
  projectId: number;
  isOwnerOrForeman: boolean;
  members: Member[];
}) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [rfiStatusFilter, setRfiStatusFilter] = useState<"all" | "open" | "in_review" | "answered" | "closed">("all");
  const { data: rfis } = useListRFIs(
    projectId,
    rfiStatusFilter !== "all" ? { status: rfiStatusFilter as "open" | "in_review" | "answered" | "closed" } : undefined,
  );

  const [expandedRfiId, setExpandedRfiId] = useState<number | null>(null);
  const [editingRfiId, setEditingRfiId] = useState<number | null>(null);
  const [editRfiDesc, setEditRfiDesc] = useState("");
  const [editRfiResponse, setEditRfiResponse] = useState("");

  useEffect(() => {
    if (!editingRfiId) return;
    const r = (rfis ?? []).find((x: any) => x.id === editingRfiId);
    if (r) {
      setEditRfiDesc(r.description ?? "");
      setEditRfiResponse(r.response ?? "");
    }
  }, [editingRfiId]);

  const deleteRFI = useDeleteRFI({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListRFIsQueryKey(projectId) });
        toast({ title: "RFI deleted" });
      },
      onError: (err: any) => toast({ title: err?.message ?? "Failed to delete RFI", variant: "destructive" }),
    },
  });

  const updateRFI = useUpdateRFI({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListRFIsQueryKey(projectId) });
        setEditingRfiId(null);
        toast({ title: "RFI updated" });
      },
      onError: (err: any) => toast({ title: err?.message ?? "Failed to update RFI", variant: "destructive" }),
    },
  });

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case "urgent": return <Badge variant="destructive">Urgent</Badge>;
      case "high": return <Badge variant="default" className="bg-orange-600">High</Badge>;
      case "medium": return <Badge variant="secondary">Medium</Badge>;
      case "low": return <Badge variant="outline">Low</Badge>;
      default: return <Badge variant="outline">{priority}</Badge>;
    }
  };

  return (
    <>
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-xl font-bold">RFIs</h3>
        <Button onClick={() => setLocation(`/projects/${projectId}/rfis/new`)}>
          <Plus className="mr-2 h-4 w-4" /> Create RFI
        </Button>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {(["all", "open", "in_review", "answered", "closed"] as const).map((s) => {
          const label =
            s === "all" ? "All" :
            s === "open" ? "Open" :
            s === "in_review" ? "In Review" :
            s === "answered" ? "Answered" : "Closed";
          const active = rfiStatusFilter === s;
          return (
            <button
              key={s}
              onClick={() => setRfiStatusFilter(s)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                active
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-muted text-muted-foreground border-border hover:border-foreground/30"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {rfis?.length === 0 ? (
        <div className="text-center p-8 border rounded-md bg-card">
          <AlertTriangle className="mx-auto h-8 w-8 text-muted-foreground mb-3" />
          <p>No RFIs generated.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {rfis?.map(rfi => {
            const isRfiExpanded = expandedRfiId === rfi.id;
            return (
              <Card
                key={rfi.id}
                className="hover:border-primary/50 transition-colors cursor-pointer select-none"
                onClick={() => setExpandedRfiId(isRfiExpanded ? null : rfi.id)}
              >
                <CardContent className="p-4">
                  {/* Header */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-sm font-medium text-muted-foreground shrink-0">{rfi.rfiNumber}</span>
                        <h4 className="font-bold text-base">{rfi.subject}</h4>
                      </div>
                      <p className={`text-sm text-muted-foreground ${isRfiExpanded ? "" : "line-clamp-1"}`}>{rfi.description}</p>
                      {rfi.dueDate && <p className="text-xs text-muted-foreground mt-1.5">Due: {format(new Date(rfi.dueDate), "MMM d, yyyy")}</p>}
                    </div>
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      <div className="flex items-center gap-2">
                        <Badge variant={rfi.status === 'open' || rfi.status === 'in_review' ? 'default' : 'secondary'} className={rfi.status === 'open' ? 'bg-orange-600' : ''}>
                          {rfi.status.replace("_", " ").toUpperCase()}
                        </Badge>
                        {isRfiExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                        {isOwnerOrForeman && (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 hover:bg-muted"
                              title="Edit RFI"
                              onClick={(e) => { e.stopPropagation(); setEditingRfiId(rfi.id); }}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                              title="Delete RFI"
                              onClick={(e) => { e.stopPropagation(); deleteRFI.mutate({ projectId, rfiId: rfi.id }); }}
                              disabled={deleteRFI.isPending}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        )}
                      </div>
                      {getPriorityBadge(rfi.priority)}
                    </div>
                  </div>

                  {/* Expanded detail */}
                  {isRfiExpanded && (
                    <div className="mt-4 space-y-3 border-t border-border pt-3">
                      {rfi.response && (
                        <div>
                          <p className="text-xs font-semibold text-foreground mb-1">Response</p>
                          <p className="text-sm text-muted-foreground whitespace-pre-wrap">{rfi.response}</p>
                        </div>
                      )}
                      {rfi.aiDraftResponse && (
                        <div className="bg-blue-50/50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 rounded-md p-3">
                          <p className="text-xs font-semibold text-blue-700 dark:text-blue-400 mb-1 flex items-center gap-1">
                            <span>✦</span> AI Draft Response
                          </p>
                          <p className="text-sm text-muted-foreground whitespace-pre-wrap">{rfi.aiDraftResponse}</p>
                        </div>
                      )}
                      {rfi.closedAt && (
                        <p className="text-xs text-muted-foreground">Closed: {format(new Date(rfi.closedAt), "MMM d, yyyy")}</p>
                      )}
                      {!rfi.response && !rfi.aiDraftResponse && (
                        <p className="text-sm text-muted-foreground italic">No response recorded yet.</p>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Edit RFI Dialog */}
      {(() => {
        const rfi = rfis?.find((r: any) => r.id === editingRfiId);
        if (!rfi) return null;
        return (
          <Dialog open={!!editingRfiId} onOpenChange={() => setEditingRfiId(null)}>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader><DialogTitle>Edit RFI</DialogTitle></DialogHeader>
              <div className="space-y-3 py-2">
                <Label>Subject</Label>
                <Input defaultValue={rfi.subject} id={`edit-rfi-subject-${rfi.id}`} />
                <Label>Description</Label>
                <CharCountedTextarea
                  value={editRfiDesc}
                  onChange={(e) => setEditRfiDesc(e.target.value.slice(0, RFI_DESC_MAX))}
                  rows={3}
                  maxLength={RFI_DESC_MAX}
                />
                <Label>Priority</Label>
                <Select defaultValue={rfi.priority}>
                  <SelectTrigger id={`edit-rfi-priority-${rfi.id}`}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
                <Label>Status</Label>
                <Select defaultValue={rfi.status}>
                  <SelectTrigger id={`edit-rfi-status-${rfi.id}`}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">Open</SelectItem>
                    <SelectItem value="in_review">In Review</SelectItem>
                    <SelectItem value="answered">Answered</SelectItem>
                    <SelectItem value="closed">Closed</SelectItem>
                  </SelectContent>
                </Select>
                <Label>Due Date</Label>
                <Input type="date" defaultValue={rfi.dueDate ? rfi.dueDate.split("T")[0] : ""} id={`edit-rfi-due-${rfi.id}`} />
                <Label>Response</Label>
                <CharCountedTextarea
                  value={editRfiResponse}
                  onChange={(e) => setEditRfiResponse(e.target.value.slice(0, RFI_RESPONSE_MAX))}
                  rows={3}
                  maxLength={RFI_RESPONSE_MAX}
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setEditingRfiId(null)}>Cancel</Button>
                <Button
                  onClick={() => {
                    const subject = (document.getElementById(`edit-rfi-subject-${rfi.id}`) as HTMLInputElement)?.value;
                    const priority = (document.getElementById(`edit-rfi-priority-${rfi.id}`) as HTMLInputElement)?.value;
                    const status = (document.getElementById(`edit-rfi-status-${rfi.id}`) as HTMLInputElement)?.value;
                    const due = (document.getElementById(`edit-rfi-due-${rfi.id}`) as HTMLInputElement)?.value;
                    updateRFI.mutate({
                      projectId,
                      rfiId: rfi.id,
                      data: {
                        subject,
                        description: editRfiDesc,
                        priority: priority || rfi.priority,
                        status: status || rfi.status,
                        dueDate: due ? new Date(due).toISOString() : undefined,
                        response: editRfiResponse || undefined,
                      } as any,
                    });
                  }}
                  disabled={updateRFI.isPending || editRfiDesc.length >= RFI_DESC_MAX || editRfiResponse.length >= RFI_RESPONSE_MAX}
                >
                  {updateRFI.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Changes"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        );
      })()}
    </>
  );
}
