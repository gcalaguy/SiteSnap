import { useState } from "react";
import {
  ChevronDown, ChevronRight, FileCheck, Loader2, Lock, Pencil, Plus, Trash2, UserCheck, Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { GOLD, BLACK, IHSA_ELEMENTS, CAPA_PRIORITY_CFG, CapaPriorityBadge, CapaStatusBadge } from "./shared";
import type { CapaPriority, CapaTicket } from "./shared";
import {
  useCapaList, useCapaSummary, useCreateCapa, useUpdateCapa, useCloseCapa, useVoidCapa,
} from "@/hooks/cor-compliance/useCapa";
import { useCompanyMembers } from "@/hooks/cor-compliance/useCompanyMembers";

const EMPTY_CAPA_FORM = {
  title: "", description: "", ihsaElement: "", priority: "medium" as CapaPriority,
  assignedToUserId: "", dueDate: "",
};

const EMPTY_CLOSE_FORM = { closureNotes: "", evidencePhotoUrl: "" };

export function CapaTab() {
  const [statusFilter, setStatusFilter] = useState("open");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [showCreate, setShowCreate] = useState(false);
  const [editTicket, setEditTicket] = useState<CapaTicket | null>(null);
  const [closeTicket, setCloseTicket] = useState<CapaTicket | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [capaForm, setCapaForm] = useState({ ...EMPTY_CAPA_FORM });
  const [closeForm, setCloseForm] = useState({ ...EMPTY_CLOSE_FORM });

  const listQuery = useCapaList(statusFilter);
  const membersQuery = useCompanyMembers();
  const summaryQuery = useCapaSummary();

  const createMutation = useCreateCapa(() => { setShowCreate(false); setCapaForm({ ...EMPTY_CAPA_FORM }); });
  const updateMutation = useUpdateCapa("CAPA ticket updated", () => setEditTicket(null));
  const closeMutation = useCloseCapa({
    title: "CAPA closed & locked",
    description: "The corrective action record is now tamper-proof.",
    onDone: () => { setCloseTicket(null); setCloseForm({ ...EMPTY_CLOSE_FORM }); },
  });
  const voidMutation = useVoidCapa();

  const summary = summaryQuery.data;
  const today = new Date().toISOString().split("T")[0]!;

  return (
    <div className="space-y-5">
      {/* Summary stats */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            { label: "Open",           value: summary.open,           color: "#ef4444" },
            { label: "In Progress",    value: summary.inProgress,     color: "#3b82f6" },
            { label: "Pending Review", value: summary.pendingReview,  color: "#f59e0b" },
            { label: "Closed",         value: summary.closed,         color: "#22c55e" },
            { label: "Overdue",        value: summary.overdue,        color: "#dc2626" },
          ].map((s) => (
            <Card key={s.label} style={{ background: "#111111", border: "1px solid #2a2a2a" }}>
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</p>
                <p className="text-xs text-zinc-500 mt-1">{s.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40" style={{ background: "#1a1a1a", border: "1px solid #333", color: "#e5e5e5" }}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent style={{ background: "#1a1a1a", border: "1px solid #333" }}>
            <SelectItem value="all"            style={{ color: "#e5e5e5" }}>All Tickets</SelectItem>
            <SelectItem value="open"           style={{ color: "#e5e5e5" }}>Open</SelectItem>
            <SelectItem value="in_progress"    style={{ color: "#e5e5e5" }}>In Progress</SelectItem>
            <SelectItem value="pending_review" style={{ color: "#e5e5e5" }}>Pending Review</SelectItem>
            <SelectItem value="closed"         style={{ color: "#e5e5e5" }}>Closed</SelectItem>
            <SelectItem value="void"           style={{ color: "#e5e5e5" }}>Void</SelectItem>
          </SelectContent>
        </Select>

        <Select value={sourceFilter} onValueChange={setSourceFilter}>
          <SelectTrigger className="w-36" style={{ background: "#1a1a1a", border: "1px solid #333", color: "#e5e5e5" }}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent style={{ background: "#1a1a1a", border: "1px solid #333" }}>
            <SelectItem value="all"         style={{ color: "#e5e5e5" }}>All Sources</SelectItem>
            <SelectItem value="inspection"  style={{ color: "#e5e5e5" }}>Inspections</SelectItem>
            <SelectItem value="audit_trail" style={{ color: "#e5e5e5" }}>Audit Trail</SelectItem>
            <SelectItem value="manual"      style={{ color: "#e5e5e5" }}>Manual</SelectItem>
          </SelectContent>
        </Select>

        <Button style={{ background: GOLD, color: BLACK, fontWeight: 600 }}
          onClick={() => { setCapaForm({ ...EMPTY_CAPA_FORM }); setShowCreate(true); }}>
          <Plus className="h-4 w-4 mr-2" />Create CAPA
        </Button>

        {listQuery.isFetching && <Loader2 className="h-4 w-4 animate-spin text-zinc-500" />}
      </div>

      {listQuery.isError && <div className="py-6 text-center text-sm text-red-400">Could not load CAPA tickets.</div>}

      {listQuery.isLoading && (
        <div className="space-y-2">
          {[1,2,3].map((i) => <Skeleton key={i} className="h-16 rounded-lg" style={{ background: "#1a1a1a" }} />)}
        </div>
      )}

      {/* Ticket list */}
      {listQuery.data && (() => {
        const filteredTickets = (listQuery.data.data ?? []).filter(
          (t) => sourceFilter === "all" || t.sourceType === sourceFilter,
        );
        if (!filteredTickets.length) return (
          <div className="flex flex-col items-center justify-center py-14 text-zinc-600">
            <Wrench className="h-8 w-8 mb-2 opacity-30" />
            <p className="text-sm">No CAPA tickets for this filter.</p>
          </div>
        );
        return (
        <div className="space-y-2">
          {filteredTickets.map((ticket) => {
            const isExpanded = expandedId === ticket.id;
            const isOverdue = ticket.dueDate && ticket.dueDate < today && ticket.status !== "closed" && ticket.status !== "void";

            return (
              <Card key={ticket.id} style={{ background: "#111111", border: `1px solid ${isOverdue ? "#7f1d1d" : "#2a2a2a"}` }}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <CapaPriorityBadge priority={ticket.priority} />
                        <CapaStatusBadge status={ticket.status} />
                        {ticket.sourceType === "inspection" && (
                          <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: "#78350f44", color: "#fbbf24" }}>From Inspection</span>
                        )}
                        {ticket.sourceType === "audit_trail" && (
                          <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: "#ffffff10", color: "#71717a" }}>Auto-generated</span>
                        )}
                        {isOverdue && (
                          <span className="text-xs font-bold text-red-400">● OVERDUE</span>
                        )}
                      </div>
                      <p className="text-sm font-medium text-zinc-200 truncate">{ticket.title}</p>
                      <div className="flex flex-wrap gap-3 mt-1">
                        {ticket.ihsaElement && (
                          <span className="text-xs text-zinc-500">{IHSA_ELEMENTS[ticket.ihsaElement] ?? ticket.ihsaElement}</span>
                        )}
                        {ticket.assignedToName && (
                          <span className="text-xs text-zinc-500 flex items-center gap-1">
                            <UserCheck className="h-3 w-3" />{ticket.assignedToName}
                          </span>
                        )}
                        {ticket.dueDate && (
                          <span className="text-xs" style={{ color: isOverdue ? "#ef4444" : "#71717a" }}>
                            Due {ticket.dueDate}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {!ticket.isLocked && (
                        <>
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0"
                            style={{ color: "#71717a" }}
                            onClick={() => {
                              setEditTicket(ticket);
                              setCapaForm({
                                title: ticket.title,
                                description: ticket.description ?? "",
                                ihsaElement: ticket.ihsaElement ?? "",
                                priority: ticket.priority,
                                assignedToUserId: ticket.assignedToUserId ? String(ticket.assignedToUserId) : "",
                                dueDate: ticket.dueDate ?? "",
                              });
                            }}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          {ticket.status !== "void" && ticket.status !== "closed" && (
                            <Button size="sm" variant="ghost" className="h-7 px-2"
                              style={{ color: "#22c55e", fontSize: 11, fontWeight: 700 }}
                              onClick={() => { setCloseTicket(ticket); setCloseForm({ ...EMPTY_CLOSE_FORM }); }}>
                              Close
                            </Button>
                          )}
                          {ticket.status !== "void" && ticket.status !== "closed" && (
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0"
                              style={{ color: "#71717a" }}
                              onClick={() => { if (confirm("Void this CAPA ticket?")) voidMutation.mutate(ticket.id); }}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </>
                      )}
                      <button
                        className="h-7 w-7 flex items-center justify-center rounded"
                        style={{ color: "#71717a" }}
                        onClick={() => setExpandedId(isExpanded ? null : ticket.id)}>
                        {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div className="mt-3 pt-3 space-y-2" style={{ borderTop: "1px solid #1f1f1f" }}>
                      {ticket.description && (
                        <p className="text-xs text-zinc-400 leading-relaxed">{ticket.description}</p>
                      )}
                      {ticket.closureNotes && (
                        <div className="rounded p-3" style={{ background: "#ffffff06", border: "1px solid #2a2a2a" }}>
                          <p className="text-xs font-semibold text-zinc-400 mb-1">Closure Notes</p>
                          <p className="text-xs text-zinc-300">{ticket.closureNotes}</p>
                        </div>
                      )}
                      {ticket.evidencePhotoUrl && (
                        <a href={ticket.evidencePhotoUrl} target="_blank" rel="noreferrer"
                          className="inline-flex items-center gap-1 text-xs"
                          style={{ color: GOLD }}>
                          <FileCheck className="h-3 w-3" />View Evidence Photo
                        </a>
                      )}
                      {ticket.isLocked && (
                        <div className="flex items-center gap-1.5 text-xs text-green-400">
                          <Lock className="h-3 w-3" />
                          Record locked — due diligence proven
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
        );
      })()}

      {/* Create / Edit dialog */}
      <Dialog open={showCreate || !!editTicket} onOpenChange={(open) => {
        if (!open) { setShowCreate(false); setEditTicket(null); }
      }}>
        <DialogContent style={{ background: "#0f0f0f", border: "1px solid #2a2a2a", maxWidth: 520 }}>
          <DialogHeader>
            <DialogTitle style={{ color: "#e5e5e5" }} className="flex items-center gap-2">
              <Wrench className="h-5 w-5" style={{ color: GOLD }} />
              {editTicket ? "Edit CAPA Ticket" : "Create CAPA Ticket"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label className="text-xs text-zinc-400 mb-1 block">Title *</Label>
              <Input value={capaForm.title} onChange={(e) => setCapaForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Describe the corrective action needed"
                style={{ background: "#1a1a1a", border: "1px solid #333", color: "#e5e5e5" }} />
            </div>
            <div>
              <Label className="text-xs text-zinc-400 mb-1 block">Description</Label>
              <Textarea value={capaForm.description}
                onChange={(e) => setCapaForm((f) => ({ ...f, description: e.target.value }))}
                rows={3} style={{ background: "#1a1a1a", border: "1px solid #333", color: "#e5e5e5" }} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-zinc-400 mb-1 block">Priority</Label>
                <Select value={capaForm.priority} onValueChange={(v) => setCapaForm((f) => ({ ...f, priority: v as CapaPriority }))}>
                  <SelectTrigger style={{ background: "#1a1a1a", border: "1px solid #333", color: "#e5e5e5" }}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent style={{ background: "#1a1a1a", border: "1px solid #333" }}>
                    {(["critical","high","medium","low"] as CapaPriority[]).map((p) => (
                      <SelectItem key={p} value={p} style={{ color: CAPA_PRIORITY_CFG[p].color }}>
                        {CAPA_PRIORITY_CFG[p].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-zinc-400 mb-1 block">Due Date</Label>
                <Input type="date" value={capaForm.dueDate}
                  onChange={(e) => setCapaForm((f) => ({ ...f, dueDate: e.target.value }))}
                  style={{ background: "#1a1a1a", border: "1px solid #333", color: "#e5e5e5" }} />
              </div>
            </div>
            <div>
              <Label className="text-xs text-zinc-400 mb-1 block">Assign to team member</Label>
              <Select
                value={capaForm.assignedToUserId || "unassigned"}
                onValueChange={(v) => setCapaForm((f) => ({ ...f, assignedToUserId: v === "unassigned" ? "" : v }))}>
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
            <div>
              <Label className="text-xs text-zinc-400 mb-1 block">IHSA Element</Label>
              <Select value={capaForm.ihsaElement || "none"} onValueChange={(v) => setCapaForm((f) => ({ ...f, ihsaElement: v === "none" ? "" : v }))}>
                <SelectTrigger style={{ background: "#1a1a1a", border: "1px solid #333", color: "#e5e5e5" }}>
                  <SelectValue placeholder="Select element…" />
                </SelectTrigger>
                <SelectContent style={{ background: "#1a1a1a", border: "1px solid #333" }}>
                  <SelectItem value="none" style={{ color: "#71717a" }}>None</SelectItem>
                  {Object.entries(IHSA_ELEMENTS).map(([k, v]) => (
                    <SelectItem key={k} value={k} style={{ color: "#e5e5e5" }}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" className="text-zinc-400"
              onClick={() => { setShowCreate(false); setEditTicket(null); }}>
              Cancel
            </Button>
            <Button style={{ background: GOLD, color: BLACK }}
              disabled={!capaForm.title.trim() || createMutation.isPending || updateMutation.isPending}
              onClick={() => {
                const body: Record<string, unknown> = {
                  title: capaForm.title,
                  priority: capaForm.priority,
                  ...(capaForm.description ? { description: capaForm.description } : {}),
                  ...(capaForm.ihsaElement ? { ihsaElement: capaForm.ihsaElement } : {}),
                  ...(capaForm.dueDate ? { dueDate: capaForm.dueDate } : {}),
                  ...(capaForm.assignedToUserId ? { assignedToUserId: parseInt(capaForm.assignedToUserId) } : {}),
                };
                if (editTicket) {
                  updateMutation.mutate({ id: editTicket.id, body });
                } else {
                  createMutation.mutate(body);
                }
              }}>
              {(createMutation.isPending || updateMutation.isPending)
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : editTicket ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Close / lock dialog */}
      <Dialog open={!!closeTicket} onOpenChange={(open) => !open && setCloseTicket(null)}>
        <DialogContent style={{ background: "#0f0f0f", border: "1px solid #2a2a2a", maxWidth: 500 }}>
          <DialogHeader>
            <DialogTitle style={{ color: "#e5e5e5" }} className="flex items-center gap-2">
              <Lock className="h-5 w-5" style={{ color: GOLD }} />
              Close & Lock CAPA
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="rounded-lg p-3" style={{ background: "#ffffff06", border: "1px solid #2a2a2a" }}>
              <p className="text-xs text-amber-400 font-semibold mb-1">Warning — irreversible action</p>
              <p className="text-xs text-zinc-400">
                Closing this CAPA permanently locks the record. You must provide closure notes and upload evidence (photo URL) that the corrective action was completed. This proves due diligence under IHSA COR.
              </p>
            </div>
            <div>
              <Label className="text-xs text-zinc-400 mb-1 block">Closure Notes * (min 5 characters)</Label>
              <Textarea value={closeForm.closureNotes}
                onChange={(e) => setCloseForm((f) => ({ ...f, closureNotes: e.target.value }))}
                rows={4} placeholder="Describe what was done to correct and prevent recurrence…"
                style={{ background: "#1a1a1a", border: "1px solid #333", color: "#e5e5e5" }} />
            </div>
            <div>
              <Label className="text-xs text-zinc-400 mb-1 block">Evidence Photo URL (optional)</Label>
              <Input value={closeForm.evidencePhotoUrl}
                onChange={(e) => setCloseForm((f) => ({ ...f, evidencePhotoUrl: e.target.value }))}
                placeholder="https://…"
                style={{ background: "#1a1a1a", border: "1px solid #333", color: "#e5e5e5" }} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" className="text-zinc-400" onClick={() => setCloseTicket(null)}>Cancel</Button>
            <Button
              style={{ background: "#16a34a", color: "#ffffff" }}
              disabled={closeForm.closureNotes.trim().length < 5 || closeMutation.isPending}
              onClick={() => {
                if (!closeTicket) return;
                closeMutation.mutate({
                  id: closeTicket.id,
                  body: {
                    closureNotes: closeForm.closureNotes,
                    ...(closeForm.evidencePhotoUrl ? { evidencePhotoUrl: closeForm.evidencePhotoUrl } : {}),
                  },
                });
              }}>
              {closeMutation.isPending
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <><Lock className="h-4 w-4 mr-2" />Close & Lock Record</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
