import { useState } from "react";
import { format } from "date-fns";
import {
  AlertTriangle, Building2, ChevronDown, ChevronUp, ExternalLink, FileCheck,
  HardHat, Loader2, Mail, Pencil, Plus, Send, Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  GOLD, BLACK, TRADE_TYPE_LABELS, SUB_DOC_TYPE_LABELS, SUB_DOC_REQUIRED,
  SUB_DOC_STATUS_CFG, ALL_SUB_DOC_TYPES, ErrorState, SubStatusBadge,
} from "./shared";
import type { Subcontractor, SubcontractorDoc, SubDocType, SubDocStatus } from "./shared";
import { useSubcontractors } from "@/hooks/cor-compliance/useSubcontractors";

const EMPTY_SUB_FORM = {
  companyName: "", contactName: "", contactEmail: "",
  contactPhone: "", tradeType: "general" as string, notes: "",
};

const EMPTY_DOC_FORM = {
  docType: "wsib_clearance" as SubDocType,
  docStatus: "pending" as SubDocStatus,
  documentUrl: "", issueDate: "", expiryDate: "", notes: "",
};

export function SubcontractorsTab({ isAdmin }: { isAdmin: boolean }) {
  const {
    subsQuery, summaryQuery, createMut, updateMut, deleteMut, upsertDocMut, deleteDocMut, inviteMut,
  } = useSubcontractors(isAdmin);

  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editSub, setEditSub] = useState<Subcontractor | null>(null);
  const [docTarget, setDocTarget] = useState<{ subId: number; existing?: SubcontractorDoc; defaultType?: SubDocType } | null>(null);
  const [subForm, setSubForm] = useState({ ...EMPTY_SUB_FORM });
  const [docForm, setDocForm] = useState({ ...EMPTY_DOC_FORM });

  function openCreate() { setSubForm({ ...EMPTY_SUB_FORM }); setShowCreate(true); }
  function openEdit(s: Subcontractor) {
    setEditSub(s);
    setSubForm({
      companyName: s.companyName, contactName: s.contactName ?? "",
      contactEmail: s.contactEmail ?? "", contactPhone: s.contactPhone ?? "",
      tradeType: s.tradeType, notes: s.notes ?? "",
    });
  }
  function openDoc(subId: number, existing?: SubcontractorDoc, defaultType?: SubDocType) {
    setDocTarget({ subId, existing, defaultType });
    setDocForm(existing ? {
      docType: existing.docType, docStatus: existing.docStatus,
      documentUrl: existing.documentUrl ?? "", issueDate: existing.issueDate ?? "",
      expiryDate: existing.expiryDate ?? "", notes: existing.notes ?? "",
    } : { ...EMPTY_DOC_FORM, docType: defaultType ?? "wsib_clearance" });
  }

  const subs = subsQuery.data?.subcontractors ?? [];
  const summary = summaryQuery.data;
  const flagged = subs.filter((s) => s.overallStatus === "expired" || s.overallStatus === "non_compliant");

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-zinc-600">
        <Building2 className="h-9 w-9 mb-2 opacity-30" />
        <p className="text-sm">Subcontractor compliance is managed by your administrator.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Summary stats */}
      {summary && (
        <div className="grid grid-cols-4 gap-3">
          {([
            { label: "Total", value: summary.total, color: GOLD },
            { label: "Compliant", value: summary.compliant, color: "#16a34a" },
            { label: "Flagged", value: summary.expired + summary.nonCompliant, color: "#dc2626" },
            { label: "Pending", value: summary.pending, color: "#ca8a04" },
          ] as const).map(({ label, value, color }) => (
            <Card key={label} style={{ background: BLACK, border: "none", boxShadow: "0 2px 12px rgba(0,0,0,0.2)" }}>
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold" style={{ color }}>{value}</p>
                <p className="text-xs text-zinc-500 mt-0.5">{label}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Flagged warning banner */}
      {flagged.length > 0 && (
        <div className="flex items-start gap-3 p-4 rounded-lg border border-red-900/40 bg-red-950/30">
          <AlertTriangle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-red-300">
              {flagged.length} subcontractor{flagged.length !== 1 ? "s" : ""} require attention
            </p>
            <p className="text-xs text-red-400 mt-0.5">
              {flagged.map((s) => s.companyName).join(", ")} — expired or missing required compliance documents
            </p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: GOLD }}>
          Trade Partners &amp; Compliance
        </p>
        <Button size="sm" onClick={openCreate} style={{ background: GOLD, color: BLACK }}>
          <Plus className="h-4 w-4 mr-1" /> Add Subcontractor
        </Button>
      </div>

      {/* Loading / error */}
      {subsQuery.isLoading && <Skeleton className="h-40 rounded-lg" style={{ background: "#1a1a1a" }} />}
      {subsQuery.isError && <ErrorState message="Could not load subcontractors." />}
      {!subsQuery.isLoading && subs.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-zinc-600">
          <HardHat className="h-9 w-9 mb-2 opacity-30" />
          <p className="text-sm">No subcontractors added yet.</p>
        </div>
      )}

      {/* Subcontractor rows */}
      <div className="space-y-3">
        {subs.map((sub) => {
          const isExpanded = expandedId === sub.id;
          const docMap = new Map(sub.docs.map((d) => [d.docType, d]));
          const requiredOk = (["wsib_clearance", "insurance_certificate"] as SubDocType[])
            .filter((t) => docMap.get(t)?.docStatus === "valid").length;

          return (
            <Card key={sub.id} style={{ background: BLACK, border: "none", boxShadow: "0 2px 8px rgba(0,0,0,0.3)" }}>
              <CardContent className="p-4">
                {/* Row header */}
                <div className="flex items-center gap-3 flex-wrap">
                  <button
                    className="flex items-center gap-3 flex-1 min-w-0 text-left"
                    onClick={() => setExpandedId(isExpanded ? null : sub.id)}
                  >
                    <Building2 className="h-5 w-5 text-zinc-500 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-zinc-100 truncate">{sub.companyName}</p>
                      <p className="text-xs text-zinc-500">
                        {TRADE_TYPE_LABELS[sub.tradeType] ?? sub.tradeType}
                        {sub.contactEmail && ` · ${sub.contactEmail}`}
                      </p>
                    </div>
                    <SubStatusBadge status={sub.overallStatus} />
                    <span className="text-xs text-zinc-600 shrink-0">{requiredOk}/2 req.</span>
                    {isExpanded
                      ? <ChevronUp className="h-4 w-4 text-zinc-500 shrink-0" />
                      : <ChevronDown className="h-4 w-4 text-zinc-500 shrink-0" />}
                  </button>
                  <div className="flex items-center gap-1 shrink-0">
                    {sub.invitedAt ? (
                      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded"
                        style={{ background: "#0e3a2120", color: "#4ade80", border: "1px solid #14532d40" }}
                        title={`Invited ${format(new Date(sub.invitedAt), "MMM d, yyyy")}`}>
                        <Send className="h-3 w-3" />
                        Invited
                      </span>
                    ) : (
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-zinc-400 hover:text-blue-300"
                        disabled={inviteMut.isPending && inviteMut.variables === sub.id}
                        onClick={() => inviteMut.mutate(sub.id)}
                        title={sub.contactEmail ? `Send invite to ${sub.contactEmail}` : "Record invite (add contact email to enable email delivery)"}>
                        {inviteMut.isPending && inviteMut.variables === sub.id
                          ? <Loader2 className="h-3 w-3 animate-spin" />
                          : <><Mail className="h-3 w-3 mr-1" />Invite</>
                        }
                      </Button>
                    )}
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(sub)}>
                      <Pencil className="h-3.5 w-3.5 text-zinc-400" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7"
                      onClick={() => { if (confirm(`Remove ${sub.companyName}?`)) deleteMut.mutate(sub.id); }}>
                      <Trash2 className="h-3.5 w-3.5 text-red-400" />
                    </Button>
                  </div>
                </div>

                {/* Expanded doc tracking */}
                {isExpanded && (
                  <div className="mt-4 space-y-2 border-t pt-4" style={{ borderColor: "#1f1f1f" }}>
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                        Compliance Documents
                      </p>
                      {sub.invitedAt && (
                        <span className="text-xs text-zinc-600">
                          Invite sent {format(new Date(sub.invitedAt), "MMM d, yyyy")}
                        </span>
                      )}
                      {!sub.invitedAt && sub.contactEmail && (
                        <Button size="sm" variant="ghost" className="h-6 px-2 text-xs text-blue-400 hover:text-blue-300"
                          disabled={inviteMut.isPending}
                          onClick={() => inviteMut.mutate(sub.id)}>
                          <Mail className="h-3 w-3 mr-1" />
                          Request Documents
                        </Button>
                      )}
                    </div>
                    {ALL_SUB_DOC_TYPES.map((dt) => {
                      const doc = docMap.get(dt);
                      const required = SUB_DOC_REQUIRED[dt];
                      const statusCfg = doc ? SUB_DOC_STATUS_CFG[doc.docStatus] : null;
                      return (
                        <div key={dt} className="flex items-center gap-3 py-2 rounded px-2"
                          style={{ background: "#161616" }}>
                          <FileCheck className="h-4 w-4 text-zinc-600 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-zinc-300">
                              {SUB_DOC_TYPE_LABELS[dt]}
                              {required && <span className="text-red-400 ml-1 text-xs">*</span>}
                            </p>
                            {doc && (
                              <p className="text-xs text-zinc-600">
                                {doc.expiryDate && `Expires ${doc.expiryDate}`}
                                {doc.documentUrl && (
                                  <a href={doc.documentUrl} target="_blank" rel="noreferrer"
                                    className="ml-2 inline-flex items-center gap-0.5 text-blue-400 hover:underline">
                                    View <ExternalLink className="h-2.5 w-2.5" />
                                  </a>
                                )}
                              </p>
                            )}
                          </div>
                          {statusCfg
                            ? <span className="text-xs font-semibold shrink-0" style={{ color: statusCfg.color }}>
                                {statusCfg.label}
                              </span>
                            : <span className="text-xs text-zinc-600 shrink-0">Not uploaded</span>
                          }
                          <div className="flex gap-1 shrink-0">
                            <Button size="sm" variant="ghost" className="h-6 px-2 text-xs text-zinc-400"
                              onClick={() => openDoc(sub.id, doc, dt)}>
                              {doc ? "Update" : "Add"}
                            </Button>
                            {doc && (
                              <Button size="icon" variant="ghost" className="h-6 w-6"
                                onClick={() => deleteDocMut.mutate({ subId: sub.id, docId: doc.id })}>
                                <Trash2 className="h-3 w-3 text-red-400" />
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Add / Edit subcontractor dialog */}
      <Dialog open={showCreate || !!editSub} onOpenChange={(o) => { if (!o) { setShowCreate(false); setEditSub(null); } }}>
        <DialogContent style={{ background: "#111", border: "1px solid #2a2a2a", color: "white" }}>
          <DialogHeader>
            <DialogTitle style={{ color: GOLD }}>{editSub ? "Edit Subcontractor" : "Add Subcontractor"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-zinc-400 text-xs">Company Name *</Label>
              <Input value={subForm.companyName} onChange={(e) => setSubForm((f) => ({ ...f, companyName: e.target.value }))}
                placeholder="Acme Electrical Ltd." style={{ background: "#1a1a1a", border: "1px solid #2a2a2a", color: "white" }} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-zinc-400 text-xs">Contact Name</Label>
                <Input value={subForm.contactName} onChange={(e) => setSubForm((f) => ({ ...f, contactName: e.target.value }))}
                  placeholder="Jane Smith" style={{ background: "#1a1a1a", border: "1px solid #2a2a2a", color: "white" }} />
              </div>
              <div>
                <Label className="text-zinc-400 text-xs">Trade Type *</Label>
                <Select value={subForm.tradeType} onValueChange={(v) => setSubForm((f) => ({ ...f, tradeType: v }))}>
                  <SelectTrigger style={{ background: "#1a1a1a", border: "1px solid #2a2a2a", color: "white" }}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent style={{ background: "#1a1a1a", border: "1px solid #2a2a2a" }}>
                    {Object.entries(TRADE_TYPE_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k} style={{ color: "white" }}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-zinc-400 text-xs">Contact Email</Label>
                <Input value={subForm.contactEmail} onChange={(e) => setSubForm((f) => ({ ...f, contactEmail: e.target.value }))}
                  placeholder="contact@company.com" style={{ background: "#1a1a1a", border: "1px solid #2a2a2a", color: "white" }} />
              </div>
              <div>
                <Label className="text-zinc-400 text-xs">Phone</Label>
                <Input value={subForm.contactPhone} onChange={(e) => setSubForm((f) => ({ ...f, contactPhone: e.target.value }))}
                  placeholder="416-555-0100" style={{ background: "#1a1a1a", border: "1px solid #2a2a2a", color: "white" }} />
              </div>
            </div>
            <div>
              <Label className="text-zinc-400 text-xs">Notes</Label>
              <Textarea value={subForm.notes} onChange={(e) => setSubForm((f) => ({ ...f, notes: e.target.value }))}
                rows={2} style={{ background: "#1a1a1a", border: "1px solid #2a2a2a", color: "white" }} />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => { setShowCreate(false); setEditSub(null); }} className="text-zinc-400">
              Cancel
            </Button>
            <Button style={{ background: GOLD, color: BLACK }}
              disabled={!subForm.companyName.trim() || createMut.isPending || updateMut.isPending}
              onClick={() => editSub
                ? updateMut.mutate({ id: editSub.id, body: subForm }, { onSuccess: () => setEditSub(null) })
                : createMut.mutate(subForm, { onSuccess: () => setShowCreate(false) })
              }>
              {(createMut.isPending || updateMut.isPending)
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : editSub ? "Save Changes" : "Add Subcontractor"
              }
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add / Update compliance doc dialog */}
      <Dialog open={!!docTarget} onOpenChange={(o) => { if (!o) setDocTarget(null); }}>
        <DialogContent style={{ background: "#111", border: "1px solid #2a2a2a", color: "white" }}>
          <DialogHeader>
            <DialogTitle style={{ color: GOLD }}>
              {docTarget?.existing ? "Update Document" : "Add Compliance Document"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-zinc-400 text-xs">Document Type</Label>
              <Select value={docForm.docType} onValueChange={(v) => setDocForm((f) => ({ ...f, docType: v as SubDocType }))}>
                <SelectTrigger style={{ background: "#1a1a1a", border: "1px solid #2a2a2a", color: "white" }}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent style={{ background: "#1a1a1a", border: "1px solid #2a2a2a" }}>
                  {ALL_SUB_DOC_TYPES.map((t) => (
                    <SelectItem key={t} value={t} style={{ color: "white" }}>
                      {SUB_DOC_TYPE_LABELS[t]}{SUB_DOC_REQUIRED[t] ? " *" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-zinc-400 text-xs">Status</Label>
              <Select value={docForm.docStatus} onValueChange={(v) => setDocForm((f) => ({ ...f, docStatus: v as SubDocStatus }))}>
                <SelectTrigger style={{ background: "#1a1a1a", border: "1px solid #2a2a2a", color: "white" }}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent style={{ background: "#1a1a1a", border: "1px solid #2a2a2a" }}>
                  {(["valid","pending","expired","rejected"] as SubDocStatus[]).map((s) => (
                    <SelectItem key={s} value={s} style={{ color: "white" }}>
                      {SUB_DOC_STATUS_CFG[s].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-zinc-400 text-xs">Issue Date</Label>
                <Input type="date" value={docForm.issueDate} onChange={(e) => setDocForm((f) => ({ ...f, issueDate: e.target.value }))}
                  style={{ background: "#1a1a1a", border: "1px solid #2a2a2a", color: "white" }} />
              </div>
              <div>
                <Label className="text-zinc-400 text-xs">Expiry Date</Label>
                <Input type="date" value={docForm.expiryDate} onChange={(e) => setDocForm((f) => ({ ...f, expiryDate: e.target.value }))}
                  style={{ background: "#1a1a1a", border: "1px solid #2a2a2a", color: "white" }} />
              </div>
            </div>
            <div>
              <Label className="text-zinc-400 text-xs">Document URL</Label>
              <Input value={docForm.documentUrl} onChange={(e) => setDocForm((f) => ({ ...f, documentUrl: e.target.value }))}
                placeholder="https://..." style={{ background: "#1a1a1a", border: "1px solid #2a2a2a", color: "white" }} />
            </div>
            <div>
              <Label className="text-zinc-400 text-xs">Notes</Label>
              <Textarea value={docForm.notes} onChange={(e) => setDocForm((f) => ({ ...f, notes: e.target.value }))}
                rows={2} style={{ background: "#1a1a1a", border: "1px solid #2a2a2a", color: "white" }} />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setDocTarget(null)} className="text-zinc-400">Cancel</Button>
            <Button style={{ background: GOLD, color: BLACK }}
              disabled={upsertDocMut.isPending}
              onClick={() => docTarget && upsertDocMut.mutate({ subId: docTarget.subId, body: docForm }, { onSuccess: () => setDocTarget(null) })}>
              {upsertDocMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Document"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
