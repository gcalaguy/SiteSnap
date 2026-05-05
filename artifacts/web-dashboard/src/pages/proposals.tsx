import { useState, useCallback, useEffect } from "react";
import { customFetch } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
} from "@/components/ui/sheet";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Plus,
  Loader2,
  FileSignature,
  Trash2,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Clock,
  Send,
  Pencil,
  Save,
  BookTemplate,
  Copy,
  DollarSign,
  Percent,
  Package,
  ArrowRight,
} from "lucide-react";
import { format } from "date-fns";

// ── Brand ──────────────────────────────────────────────────────────────────────
const GOLD = "#C9A84C";
const BLACK = "#111111";

// ── Types ──────────────────────────────────────────────────────────────────────
type Item = {
  id: number;
  estimateId: number;
  name: string;
  description?: string | null;
  quantity: string;
  unitCost: string;
  margin: string;
  sortOrder: number;
};

type BuilderEstimate = {
  id: number;
  companyId: number;
  projectId?: number | null;
  title: string;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
  items?: Item[];
};

type Proposal = {
  id: number;
  companyId: number;
  builderEstimateId: number;
  title: string;
  clientName?: string | null;
  clientEmail?: string | null;
  notes?: string | null;
  status: "draft" | "sent" | "approved" | "rejected";
  approvedAt?: string | null;
  approvedByName?: string | null;
  createdAt: string;
  updatedAt: string;
  estimate?: BuilderEstimate | null;
};

type Template = {
  id: number;
  name: string;
  description?: string | null;
  createdAt: string;
  items?: Item[];
};

// ── Helpers ────────────────────────────────────────────────────────────────────
function n(v: string | number | undefined | null) {
  return parseFloat(String(v ?? "0")) || 0;
}

function calcItem(item: { quantity: string | number; unitCost: string | number; margin: string | number }) {
  const cost = n(item.quantity) * n(item.unitCost);
  const revenue = cost * (1 + n(item.margin) / 100);
  return { cost, revenue, profit: revenue - cost };
}

function calcTotals(items: Item[]) {
  return items.reduce(
    (acc, item) => {
      const { cost, revenue, profit } = calcItem(item);
      return { totalCost: acc.totalCost + cost, totalRevenue: acc.totalRevenue + revenue, totalProfit: acc.totalProfit + profit };
    },
    { totalCost: 0, totalRevenue: 0, totalProfit: 0 },
  );
}

function cad(v: number) {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(v);
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  draft:    { label: "Draft",    color: "#6B7280", bg: "#F3F4F6", icon: <Pencil size={11} /> },
  sent:     { label: "Sent",     color: "#0EA5E9", bg: "#E0F2FE", icon: <Send size={11} /> },
  approved: { label: "Approved", color: "#16A34A", bg: "#DCFCE7", icon: <CheckCircle2 size={11} /> },
  rejected: { label: "Rejected", color: "#DC2626", bg: "#FEE2E2", icon: <XCircle size={11} /> },
};

// ── API helpers ────────────────────────────────────────────────────────────────
async function apiFetch(path: string, opts?: RequestInit) {
  return customFetch(`/api${path}`, opts);
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function Proposals() {
  const { toast } = useToast();
  const [tab, setTab] = useState<"estimates" | "proposals">("estimates");

  // Estimates
  const [estimates, setEstimates] = useState<BuilderEstimate[]>([]);
  const [estimatesLoading, setEstimatesLoading] = useState(true);
  const [selectedEstimate, setSelectedEstimate] = useState<BuilderEstimate | null>(null);

  // Proposals
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [proposalsLoading, setProposalsLoading] = useState(true);
  const [selectedProposal, setSelectedProposal] = useState<Proposal | null>(null);

  // Templates
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [templateName, setTemplateName] = useState("");

  // Dialogs
  const [createEstimateOpen, setCreateEstimateOpen] = useState(false);
  const [createEstimateTitle, setCreateEstimateTitle] = useState("");
  const [createEstimateNotes, setCreateEstimateNotes] = useState("");
  const [deleteEstimateId, setDeleteEstimateId] = useState<number | null>(null);
  const [deleteProposalId, setDeleteProposalId] = useState<number | null>(null);
  const [convertOpen, setConvertOpen] = useState(false);
  const [convertForm, setConvertForm] = useState({ clientName: "", clientEmail: "", notes: "" });
  const [approveOpen, setApproveOpen] = useState(false);
  const [approveSignature, setApproveSignature] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Load estimates
  const loadEstimates = useCallback(async () => {
    try {
      setEstimatesLoading(true);
      const data = await apiFetch("/builder-estimates");
      setEstimates(data ?? []);
    } catch { /* ignore */ }
    finally { setEstimatesLoading(false); }
  }, []);

  // Load proposals
  const loadProposals = useCallback(async () => {
    try {
      setProposalsLoading(true);
      const data = await apiFetch("/proposals");
      setProposals(data ?? []);
    } catch { /* ignore */ }
    finally { setProposalsLoading(false); }
  }, []);

  // Load templates
  const loadTemplates = useCallback(async () => {
    try {
      const data = await apiFetch("/estimate-templates");
      setTemplates(data ?? []);
    } catch { /* ignore */ }
  }, []);

  // Initial load
  useEffect(() => { loadEstimates(); loadProposals(); loadTemplates(); }, []);

  // Open estimate builder
  async function openEstimate(estimate: BuilderEstimate) {
    try {
      const data = await apiFetch(`/builder-estimates/${estimate.id}`);
      setSelectedEstimate(data);
    } catch { toast({ title: "Failed to load estimate", variant: "destructive" }); }
  }

  // Open proposal
  async function openProposal(proposal: Proposal) {
    try {
      const data = await apiFetch(`/proposals/${proposal.id}`);
      setSelectedProposal(data);
    } catch { toast({ title: "Failed to load proposal", variant: "destructive" }); }
  }

  // Create estimate
  async function handleCreateEstimate() {
    if (!createEstimateTitle.trim()) return;
    setIsSubmitting(true);
    try {
      const data = await apiFetch("/builder-estimates", {
        method: "POST",
        body: JSON.stringify({ title: createEstimateTitle.trim(), notes: createEstimateNotes.trim() || null }),
      });
      setEstimates((prev) => [data, ...prev]);
      setCreateEstimateOpen(false);
      setCreateEstimateTitle("");
      setCreateEstimateNotes("");
      setSelectedEstimate(data);
      toast({ title: "Estimate created" });
    } catch { toast({ title: "Failed to create estimate", variant: "destructive" }); }
    finally { setIsSubmitting(false); }
  }

  // Delete estimate
  async function handleDeleteEstimate() {
    if (!deleteEstimateId) return;
    setIsSubmitting(true);
    try {
      await apiFetch(`/builder-estimates/${deleteEstimateId}`, { method: "DELETE" });
      setEstimates((prev) => prev.filter((e) => e.id !== deleteEstimateId));
      if (selectedEstimate?.id === deleteEstimateId) setSelectedEstimate(null);
      setDeleteEstimateId(null);
      toast({ title: "Estimate deleted" });
    } catch { toast({ title: "Failed to delete estimate", variant: "destructive" }); }
    finally { setIsSubmitting(false); }
  }

  // Convert estimate → proposal
  async function handleConvert() {
    if (!selectedEstimate) return;
    setIsSubmitting(true);
    try {
      const data = await apiFetch(`/builder-estimates/${selectedEstimate.id}/convert`, {
        method: "POST",
        body: JSON.stringify({
          clientName: convertForm.clientName.trim() || null,
          clientEmail: convertForm.clientEmail.trim() || null,
          notes: convertForm.notes.trim() || null,
        }),
      });
      setProposals((prev) => [data, ...prev]);
      setConvertOpen(false);
      setConvertForm({ clientName: "", clientEmail: "", notes: "" });
      setTab("proposals");
      toast({ title: "Proposal created!" });
    } catch { toast({ title: "Failed to create proposal", variant: "destructive" }); }
    finally { setIsSubmitting(false); }
  }

  // Update proposal status
  async function handleProposalStatus(id: number, status: string) {
    try {
      const data = await apiFetch(`/proposals/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      setProposals((prev) => prev.map((p) => (p.id === id ? data : p)));
      if (selectedProposal?.id === id) setSelectedProposal((p) => p ? { ...p, status: data.status } : p);
      toast({ title: `Marked as ${status}` });
    } catch { toast({ title: "Failed to update proposal", variant: "destructive" }); }
  }

  // Approve proposal
  async function handleApprove() {
    if (!selectedProposal || !approveSignature.trim()) return;
    setIsSubmitting(true);
    try {
      const data = await apiFetch(`/proposals/${selectedProposal.id}/approve`, {
        method: "POST",
        body: JSON.stringify({ approvedByName: approveSignature.trim() }),
      });
      setProposals((prev) => prev.map((p) => (p.id === data.id ? data : p)));
      setSelectedProposal((p) => p ? { ...p, ...data } : p);
      setApproveOpen(false);
      setApproveSignature("");
      toast({ title: "Proposal approved!" });
    } catch { toast({ title: "Failed to approve proposal", variant: "destructive" }); }
    finally { setIsSubmitting(false); }
  }

  // Delete proposal
  async function handleDeleteProposal() {
    if (!deleteProposalId) return;
    setIsSubmitting(true);
    try {
      await apiFetch(`/proposals/${deleteProposalId}`, { method: "DELETE" });
      setProposals((prev) => prev.filter((p) => p.id !== deleteProposalId));
      if (selectedProposal?.id === deleteProposalId) setSelectedProposal(null);
      setDeleteProposalId(null);
      toast({ title: "Proposal deleted" });
    } catch { toast({ title: "Failed to delete proposal", variant: "destructive" }); }
    finally { setIsSubmitting(false); }
  }

  // Save as template
  async function handleSaveTemplate() {
    if (!selectedEstimate || !templateName.trim()) return;
    const items = (selectedEstimate.items ?? []).map((item) => ({
      name: item.name,
      description: item.description,
      quantity: n(item.quantity),
      unitCost: n(item.unitCost),
      margin: n(item.margin),
    }));
    if (items.length === 0) { toast({ title: "Add at least one line item first", variant: "destructive" }); return; }
    setIsSubmitting(true);
    try {
      await apiFetch("/estimate-templates", {
        method: "POST",
        body: JSON.stringify({ name: templateName.trim(), items }),
      });
      setSaveTemplateOpen(false);
      setTemplateName("");
      await loadTemplates();
      toast({ title: "Template saved!" });
    } catch { toast({ title: "Failed to save template", variant: "destructive" }); }
    finally { setIsSubmitting(false); }
  }

  // Load template items into current estimate
  async function handleLoadTemplate(template: Template) {
    if (!selectedEstimate) return;
    setIsSubmitting(true);
    try {
      const tpl = await apiFetch(`/estimate-templates/${template.id}/items`);
      for (const item of tpl.items ?? []) {
        await apiFetch(`/builder-estimates/${selectedEstimate.id}/items`, {
          method: "POST",
          body: JSON.stringify({ name: item.name, description: item.description, quantity: n(item.quantity), unitCost: n(item.unitCost), margin: n(item.margin) }),
        });
      }
      const updated = await apiFetch(`/builder-estimates/${selectedEstimate.id}`);
      setSelectedEstimate(updated);
      setTemplateOpen(false);
      toast({ title: `Loaded "${template.name}" template` });
    } catch { toast({ title: "Failed to load template", variant: "destructive" }); }
    finally { setIsSubmitting(false); }
  }

  // Delete template
  async function handleDeleteTemplate(id: number) {
    try {
      await apiFetch(`/estimate-templates/${id}`, { method: "DELETE" });
      setTemplates((prev) => prev.filter((t) => t.id !== id));
      toast({ title: "Template deleted" });
    } catch { toast({ title: "Failed to delete template", variant: "destructive" }); }
  }

  // Totals
  const proposalStats = {
    total: proposals.length,
    approved: proposals.filter((p) => p.status === "approved").length,
    pending: proposals.filter((p) => p.status === "sent").length,
  };

  return (
    <div className="space-y-4 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Proposals</h1>
          <p className="text-muted-foreground text-sm">Build estimates and send professional proposals</p>
        </div>
        <div className="flex gap-2">
          {tab === "estimates" && (
            <Button onClick={() => setCreateEstimateOpen(true)} style={{ background: GOLD, color: BLACK }} className="font-semibold">
              <Plus className="mr-2 h-4 w-4" /> New Estimate
            </Button>
          )}
        </div>
      </div>

      {/* Summary pills */}
      <div className="flex gap-3 flex-wrap flex-shrink-0">
        {[
          { label: "Estimates", value: String(estimates.length), color: GOLD },
          { label: "Proposals", value: String(proposalStats.total), color: "#6366F1" },
          { label: "Approved", value: String(proposalStats.approved), color: "#16A34A" },
          { label: "Awaiting", value: String(proposalStats.pending), color: "#0EA5E9" },
        ].map((s) => (
          <div key={s.label} className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm" style={{ background: "#fff", border: "1px solid #E5E5E5" }}>
            <span className="text-muted-foreground font-medium">{s.label}</span>
            <span className="font-bold" style={{ color: s.color }}>{s.value}</span>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="flex-1 flex flex-col min-h-0">
        <TabsList className="flex-shrink-0 w-fit">
          <TabsTrigger value="estimates">Estimate Builder</TabsTrigger>
          <TabsTrigger value="proposals">Proposals</TabsTrigger>
        </TabsList>

        {/* ── Estimates tab ── */}
        <TabsContent value="estimates" className="flex-1 flex gap-4 min-h-0 mt-3">
          {/* Left: list */}
          <div className="w-72 flex-shrink-0 overflow-y-auto space-y-2">
            {estimatesLoading ? (
              <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : estimates.length === 0 ? (
              <div className="text-center py-10 text-sm text-muted-foreground">
                <FileSignature className="mx-auto mb-2 opacity-30" size={32} />
                No estimates yet
              </div>
            ) : estimates.map((est) => (
              <div
                key={est.id}
                onClick={() => openEstimate(est)}
                className="rounded-xl p-3 cursor-pointer transition-all hover:shadow-md"
                style={{
                  background: selectedEstimate?.id === est.id ? BLACK : "#fff",
                  border: `1px solid ${selectedEstimate?.id === est.id ? BLACK : "#E5E5E5"}`,
                }}
              >
                <p className="text-sm font-semibold truncate" style={{ color: selectedEstimate?.id === est.id ? "#fff" : BLACK }}>{est.title}</p>
                <p className="text-xs mt-0.5" style={{ color: selectedEstimate?.id === est.id ? "#aaa" : "#999" }}>
                  {format(new Date(est.createdAt), "MMM d, yyyy")}
                </p>
              </div>
            ))}
          </div>

          {/* Right: builder */}
          <div className="flex-1 min-h-0 overflow-y-auto">
            {selectedEstimate ? (
              <EstimateBuilder
                estimate={selectedEstimate}
                onUpdate={(updated) => {
                  setSelectedEstimate(updated);
                  setEstimates((prev) => prev.map((e) => e.id === updated.id ? { ...e, title: updated.title, notes: updated.notes } : e));
                }}
                onDelete={() => setDeleteEstimateId(selectedEstimate.id)}
                onConvert={() => setConvertOpen(true)}
                onSaveTemplate={() => setSaveTemplateOpen(true)}
                onLoadTemplate={() => setTemplateOpen(true)}
                toast={toast}
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground select-none">
                <FileSignature size={48} className="mb-3 opacity-20" />
                <p className="text-sm">Select an estimate to build it</p>
                <p className="text-xs mt-1 opacity-60">or create a new one</p>
              </div>
            )}
          </div>
        </TabsContent>

        {/* ── Proposals tab ── */}
        <TabsContent value="proposals" className="flex-1 flex gap-4 min-h-0 mt-3">
          {/* Left: list */}
          <div className="w-72 flex-shrink-0 overflow-y-auto space-y-2">
            {proposalsLoading ? (
              <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : proposals.length === 0 ? (
              <div className="text-center py-10 text-sm text-muted-foreground">
                <Send className="mx-auto mb-2 opacity-30" size={32} />
                No proposals yet
                <p className="text-xs mt-1 opacity-60">Convert an estimate to get started</p>
              </div>
            ) : proposals.map((p) => {
              const s = STATUS_CONFIG[p.status] ?? STATUS_CONFIG.draft;
              return (
                <div
                  key={p.id}
                  onClick={() => openProposal(p)}
                  className="rounded-xl p-3 cursor-pointer transition-all hover:shadow-md"
                  style={{
                    background: selectedProposal?.id === p.id ? BLACK : "#fff",
                    border: `1px solid ${selectedProposal?.id === p.id ? BLACK : "#E5E5E5"}`,
                  }}
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <p className="text-sm font-semibold truncate" style={{ color: selectedProposal?.id === p.id ? "#fff" : BLACK }}>{p.title}</p>
                    <span className="text-[10px] font-bold rounded-full px-1.5 py-0.5 flex items-center gap-0.5 flex-shrink-0" style={{ background: s.bg, color: s.color }}>
                      {s.icon} {s.label}
                    </span>
                  </div>
                  {p.clientName && <p className="text-xs" style={{ color: selectedProposal?.id === p.id ? "#aaa" : "#999" }}>{p.clientName}</p>}
                  <p className="text-xs mt-0.5" style={{ color: selectedProposal?.id === p.id ? "#888" : "#bbb" }}>
                    {format(new Date(p.createdAt), "MMM d, yyyy")}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Right: proposal view */}
          <div className="flex-1 min-h-0 overflow-y-auto">
            {selectedProposal ? (
              <ProposalView
                proposal={selectedProposal}
                onStatusChange={(status) => handleProposalStatus(selectedProposal.id, status)}
                onApprove={() => setApproveOpen(true)}
                onDelete={() => setDeleteProposalId(selectedProposal.id)}
                toast={toast}
                onUpdate={(updated) => {
                  setProposals((prev) => prev.map((p) => p.id === updated.id ? { ...p, ...updated } : p));
                  setSelectedProposal((p) => p ? { ...p, ...updated } : p);
                }}
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground select-none">
                <Send size={48} className="mb-3 opacity-20" />
                <p className="text-sm">Select a proposal to view it</p>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Create estimate dialog */}
      <Dialog open={createEstimateOpen} onOpenChange={setCreateEstimateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>New Estimate</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Title *</label>
              <Input placeholder="e.g. Kitchen Renovation — Smith" value={createEstimateTitle} onChange={(e) => setCreateEstimateTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleCreateEstimate()} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Notes</label>
              <Textarea placeholder="Any notes or scope description…" rows={3} value={createEstimateNotes} onChange={(e) => setCreateEstimateNotes(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateEstimateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateEstimate} disabled={isSubmitting || !createEstimateTitle.trim()} style={{ background: GOLD, color: BLACK }} className="font-semibold">
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Convert to proposal dialog */}
      <Dialog open={convertOpen} onOpenChange={setConvertOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Create Proposal from Estimate</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Optionally add client details. You can update these later.</p>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Client Name</label>
              <Input placeholder="Jane Smith" value={convertForm.clientName} onChange={(e) => setConvertForm((f) => ({ ...f, clientName: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Client Email</label>
              <Input type="email" placeholder="jane@example.com" value={convertForm.clientEmail} onChange={(e) => setConvertForm((f) => ({ ...f, clientEmail: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Cover Note</label>
              <Textarea placeholder="Thank you for the opportunity…" rows={3} value={convertForm.notes} onChange={(e) => setConvertForm((f) => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConvertOpen(false)}>Cancel</Button>
            <Button onClick={handleConvert} disabled={isSubmitting} style={{ background: GOLD, color: BLACK }} className="font-semibold">
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <ArrowRight className="mr-2 h-4 w-4" /> Create Proposal
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Save template dialog */}
      <Dialog open={saveTemplateOpen} onOpenChange={setSaveTemplateOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Save as Template</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Save the current line items as a reusable template.</p>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Template Name *</label>
            <Input placeholder="e.g. Standard Renovation" value={templateName} onChange={(e) => setTemplateName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSaveTemplate()} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveTemplateOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveTemplate} disabled={isSubmitting || !templateName.trim()} style={{ background: GOLD, color: BLACK }} className="font-semibold">
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <Save className="mr-2 h-4 w-4" /> Save Template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Load template dialog */}
      <Dialog open={templateOpen} onOpenChange={setTemplateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Load Template</DialogTitle></DialogHeader>
          {templates.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No templates saved yet. Build an estimate and save it as a template.</p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {templates.map((t) => (
                <div key={t.id} className="flex items-center justify-between rounded-lg p-3" style={{ background: "#F8F8F8", border: "1px solid #E5E5E5" }}>
                  <div>
                    <p className="text-sm font-semibold">{t.name}</p>
                    <p className="text-xs text-muted-foreground">{format(new Date(t.createdAt), "MMM d, yyyy")}</p>
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" onClick={() => handleLoadTemplate(t)} disabled={isSubmitting}>
                      <Copy size={13} className="mr-1" /> Use
                    </Button>
                    <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => handleDeleteTemplate(t.id)}>
                      <Trash2 size={13} />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setTemplateOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Approve dialog */}
      <Dialog open={approveOpen} onOpenChange={setApproveOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Approve Proposal</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Type your full name to confirm approval. This acts as your electronic signature.</p>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Full Name (Signature) *</label>
            <Input placeholder="e.g. Jane Smith" value={approveSignature} onChange={(e) => setApproveSignature(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveOpen(false)}>Cancel</Button>
            <Button onClick={handleApprove} disabled={isSubmitting || !approveSignature.trim()} className="font-semibold" style={{ background: "#16A34A", color: "#fff" }}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <CheckCircle2 className="mr-2 h-4 w-4" /> Approve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete estimate confirm */}
      <AlertDialog open={deleteEstimateId !== null} onOpenChange={(o) => { if (!o) setDeleteEstimateId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete estimate?</AlertDialogTitle>
            <AlertDialogDescription>All line items and associated proposals will also be deleted.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteEstimate} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete proposal confirm */}
      <AlertDialog open={deleteProposalId !== null} onOpenChange={(o) => { if (!o) setDeleteProposalId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete proposal?</AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteProposal} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ── Estimate Builder ───────────────────────────────────────────────────────────
function EstimateBuilder({
  estimate,
  onUpdate,
  onDelete,
  onConvert,
  onSaveTemplate,
  onLoadTemplate,
  toast,
}: {
  estimate: BuilderEstimate;
  onUpdate: (e: BuilderEstimate) => void;
  onDelete: () => void;
  onConvert: () => void;
  onSaveTemplate: () => void;
  onLoadTemplate: () => void;
  toast: any;
}) {
  const items = estimate.items ?? [];
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleVal, setTitleVal] = useState(estimate.title);
  const [isSavingTitle, setIsSavingTitle] = useState(false);
  const [addRow, setAddRow] = useState({ name: "", description: "", quantity: "1", unitCost: "0", margin: "20" });
  const [isAdding, setIsAdding] = useState(false);
  const [editRow, setEditRow] = useState<{ id: number; field: string } | null>(null);
  const [editVal, setEditVal] = useState("");

  const totals = calcTotals(items);
  const profitMargin = totals.totalRevenue > 0 ? ((totals.totalProfit / totals.totalRevenue) * 100).toFixed(1) : "0";

  async function saveTitle() {
    if (!titleVal.trim() || titleVal === estimate.title) { setEditingTitle(false); return; }
    setIsSavingTitle(true);
    try {
      const data = await apiFetch(`/builder-estimates/${estimate.id}`, {
        method: "PATCH",
        body: JSON.stringify({ title: titleVal.trim() }),
      });
      onUpdate({ ...data, items: estimate.items });
      setEditingTitle(false);
    } catch { toast({ title: "Failed to update title", variant: "destructive" }); }
    finally { setIsSavingTitle(false); }
  }

  async function addItem() {
    if (!addRow.name.trim()) { toast({ title: "Item name is required", variant: "destructive" }); return; }
    setIsAdding(true);
    try {
      const data = await apiFetch(`/builder-estimates/${estimate.id}/items`, {
        method: "POST",
        body: JSON.stringify({
          name: addRow.name.trim(),
          description: addRow.description.trim() || null,
          quantity: parseFloat(addRow.quantity) || 1,
          unitCost: parseFloat(addRow.unitCost) || 0,
          margin: parseFloat(addRow.margin) || 0,
        }),
      });
      onUpdate({ ...estimate, items: [...items, data] });
      setAddRow({ name: "", description: "", quantity: "1", unitCost: "0", margin: "20" });
    } catch { toast({ title: "Failed to add item", variant: "destructive" }); }
    finally { setIsAdding(false); }
  }

  async function updateItemField(item: Item, field: string, val: string) {
    try {
      const body: Record<string, unknown> = {};
      if (field === "name") body.name = val;
      else if (field === "description") body.description = val || null;
      else if (field === "quantity") body.quantity = parseFloat(val) || 1;
      else if (field === "unitCost") body.unitCost = parseFloat(val) || 0;
      else if (field === "margin") body.margin = parseFloat(val) || 0;

      const updated = await apiFetch(`/builder-estimates/${estimate.id}/items/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      onUpdate({ ...estimate, items: items.map((i) => (i.id === item.id ? updated : i)) });
    } catch { toast({ title: "Failed to update item", variant: "destructive" }); }
    setEditRow(null);
  }

  async function deleteItem(id: number) {
    try {
      await apiFetch(`/builder-estimates/${estimate.id}/items/${id}`, { method: "DELETE" });
      onUpdate({ ...estimate, items: items.filter((i) => i.id !== id) });
    } catch { toast({ title: "Failed to delete item", variant: "destructive" }); }
  }

  return (
    <div className="space-y-4">
      {/* Title + actions */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          {editingTitle ? (
            <div className="flex items-center gap-2">
              <Input
                value={titleVal}
                onChange={(e) => setTitleVal(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") saveTitle(); if (e.key === "Escape") setEditingTitle(false); }}
                className="font-bold text-lg h-9 flex-1"
                autoFocus
              />
              <Button size="sm" onClick={saveTitle} disabled={isSavingTitle} style={{ background: GOLD, color: BLACK }}>
                {isSavingTitle ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setEditingTitle(false)}>✕</Button>
            </div>
          ) : (
            <div className="flex items-center gap-2 group cursor-pointer" onClick={() => { setTitleVal(estimate.title); setEditingTitle(true); }}>
              <h2 className="text-xl font-bold truncate">{estimate.title}</h2>
              <Pencil size={14} className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
            </div>
          )}
        </div>
        <div className="flex gap-1.5 flex-shrink-0">
          <Button size="sm" variant="outline" onClick={onLoadTemplate} title="Load template">
            <BookTemplate size={14} className="mr-1" /> Template
          </Button>
          <Button size="sm" variant="outline" onClick={onSaveTemplate} title="Save as template">
            <Save size={14} />
          </Button>
          <Button size="sm" variant="outline" className="text-destructive hover:text-destructive" onClick={onDelete}>
            <Trash2 size={14} />
          </Button>
          <Button size="sm" onClick={onConvert} style={{ background: GOLD, color: BLACK }} className="font-semibold">
            <ArrowRight size={14} className="mr-1" /> Proposal
          </Button>
        </div>
      </div>

      {/* Line items table */}
      <div className="rounded-xl overflow-hidden" style={{ border: "1px solid #E5E5E5" }}>
        {/* Header */}
        <div
          className="grid text-xs font-bold uppercase tracking-wide px-3 py-2.5"
          style={{ gridTemplateColumns: "1fr 80px 100px 70px 80px 80px 32px", background: BLACK, color: "#aaa" }}
        >
          <span>Item</span>
          <span className="text-right">Qty</span>
          <span className="text-right">Unit Cost</span>
          <span className="text-right">Margin %</span>
          <span className="text-right">Total Cost</span>
          <span className="text-right" style={{ color: GOLD }}>Revenue</span>
          <span />
        </div>

        {/* Rows */}
        {items.length === 0 ? (
          <div className="text-center py-8 text-sm text-muted-foreground bg-white">Add your first line item below</div>
        ) : items.map((item) => {
          const { cost, revenue } = calcItem(item);
          return (
            <div
              key={item.id}
              className="grid items-center px-3 py-2 bg-white hover:bg-gray-50 border-b border-gray-100"
              style={{ gridTemplateColumns: "1fr 80px 100px 70px 80px 80px 32px" }}
            >
              {/* Name */}
              <div>
                {editRow?.id === item.id && editRow.field === "name" ? (
                  <Input
                    className="h-7 text-sm"
                    autoFocus
                    value={editVal}
                    onChange={(e) => setEditVal(e.target.value)}
                    onBlur={() => updateItemField(item, "name", editVal)}
                    onKeyDown={(e) => { if (e.key === "Enter") updateItemField(item, "name", editVal); if (e.key === "Escape") setEditRow(null); }}
                  />
                ) : (
                  <div className="cursor-pointer" onClick={() => { setEditRow({ id: item.id, field: "name" }); setEditVal(item.name); }}>
                    <p className="text-sm font-medium">{item.name}</p>
                    {item.description && <p className="text-xs text-muted-foreground">{item.description}</p>}
                  </div>
                )}
              </div>

              {/* Qty */}
              <div className="text-right">
                {editRow?.id === item.id && editRow.field === "quantity" ? (
                  <Input className="h-7 text-sm text-right w-full" autoFocus value={editVal} onChange={(e) => setEditVal(e.target.value)} onBlur={() => updateItemField(item, "quantity", editVal)} onKeyDown={(e) => { if (e.key === "Enter") updateItemField(item, "quantity", editVal); if (e.key === "Escape") setEditRow(null); }} />
                ) : (
                  <span className="text-sm cursor-pointer hover:text-blue-600" onClick={() => { setEditRow({ id: item.id, field: "quantity" }); setEditVal(String(n(item.quantity))); }}>{n(item.quantity)}</span>
                )}
              </div>

              {/* Unit cost */}
              <div className="text-right">
                {editRow?.id === item.id && editRow.field === "unitCost" ? (
                  <Input className="h-7 text-sm text-right w-full" autoFocus value={editVal} onChange={(e) => setEditVal(e.target.value)} onBlur={() => updateItemField(item, "unitCost", editVal)} onKeyDown={(e) => { if (e.key === "Enter") updateItemField(item, "unitCost", editVal); if (e.key === "Escape") setEditRow(null); }} />
                ) : (
                  <span className="text-sm cursor-pointer hover:text-blue-600" onClick={() => { setEditRow({ id: item.id, field: "unitCost" }); setEditVal(String(n(item.unitCost))); }}>{cad(n(item.unitCost))}</span>
                )}
              </div>

              {/* Margin */}
              <div className="text-right">
                {editRow?.id === item.id && editRow.field === "margin" ? (
                  <Input className="h-7 text-sm text-right w-full" autoFocus value={editVal} onChange={(e) => setEditVal(e.target.value)} onBlur={() => updateItemField(item, "margin", editVal)} onKeyDown={(e) => { if (e.key === "Enter") updateItemField(item, "margin", editVal); if (e.key === "Escape") setEditRow(null); }} />
                ) : (
                  <span className="text-sm cursor-pointer hover:text-blue-600" style={{ color: "#6366F1" }} onClick={() => { setEditRow({ id: item.id, field: "margin" }); setEditVal(String(n(item.margin))); }}>{n(item.margin)}%</span>
                )}
              </div>

              {/* Total cost */}
              <div className="text-right text-sm text-muted-foreground">{cad(cost)}</div>

              {/* Revenue */}
              <div className="text-right text-sm font-semibold" style={{ color: GOLD }}>{cad(revenue)}</div>

              {/* Delete */}
              <div className="flex justify-end">
                <button onClick={() => deleteItem(item.id)} className="text-muted-foreground hover:text-destructive transition-colors">
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          );
        })}

        {/* Add row */}
        <div className="grid items-center gap-1 px-3 py-2 bg-gray-50 border-t border-gray-200" style={{ gridTemplateColumns: "1fr 80px 100px 70px 80px 80px 64px" }}>
          <Input className="h-7 text-sm" placeholder="Item name…" value={addRow.name} onChange={(e) => setAddRow((r) => ({ ...r, name: e.target.value }))} onKeyDown={(e) => e.key === "Enter" && addItem()} />
          <Input className="h-7 text-sm text-right" placeholder="Qty" value={addRow.quantity} onChange={(e) => setAddRow((r) => ({ ...r, quantity: e.target.value }))} />
          <Input className="h-7 text-sm text-right" placeholder="Unit cost" value={addRow.unitCost} onChange={(e) => setAddRow((r) => ({ ...r, unitCost: e.target.value }))} />
          <Input className="h-7 text-sm text-right" placeholder="%" value={addRow.margin} onChange={(e) => setAddRow((r) => ({ ...r, margin: e.target.value }))} />
          <span />
          <span />
          <Button size="sm" className="h-7 w-full text-xs font-semibold" style={{ background: GOLD, color: BLACK }} onClick={addItem} disabled={isAdding}>
            {isAdding ? <Loader2 size={12} className="animate-spin" /> : <><Plus size={12} className="mr-0.5" /> Add</>}
          </Button>
        </div>

        {/* Totals footer */}
        {items.length > 0 && (
          <div className="px-4 py-3 space-y-1 border-t" style={{ background: BLACK }}>
            <div className="flex justify-between text-xs" style={{ color: "#666" }}>
              <span>Total Cost</span>
              <span>{cad(totals.totalCost)}</span>
            </div>
            <div className="flex justify-between text-xs" style={{ color: "#666" }}>
              <span>Total Profit</span>
              <span style={{ color: "#4ADE80" }}>+{cad(totals.totalProfit)}</span>
            </div>
            <div className="flex justify-between text-sm font-bold pt-1 border-t border-gray-700">
              <span style={{ color: "#fff" }}>Total Revenue</span>
              <div className="text-right">
                <span style={{ color: GOLD }}>{cad(totals.totalRevenue)}</span>
                <span className="text-xs ml-2" style={{ color: "#888" }}>{profitMargin}% margin</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Proposal View ─────────────────────────────────────────────────────────────
function ProposalView({
  proposal,
  onStatusChange,
  onApprove,
  onDelete,
  onUpdate,
  toast,
}: {
  proposal: Proposal;
  onStatusChange: (status: string) => void;
  onApprove: () => void;
  onDelete: () => void;
  onUpdate: (updated: Partial<Proposal>) => void;
  toast: any;
}) {
  const estimate = proposal.estimate;
  const items = estimate?.items ?? [];
  const totals = calcTotals(items);
  const s = STATUS_CONFIG[proposal.status] ?? STATUS_CONFIG.draft;

  const [editClientOpen, setEditClientOpen] = useState(false);
  const [clientName, setClientName] = useState(proposal.clientName ?? "");
  const [clientEmail, setClientEmail] = useState(proposal.clientEmail ?? "");
  const [isSaving, setIsSaving] = useState(false);

  async function saveClient() {
    setIsSaving(true);
    try {
      const data = await apiFetch(`/proposals/${proposal.id}`, {
        method: "PATCH",
        body: JSON.stringify({ clientName: clientName.trim() || null, clientEmail: clientEmail.trim() || null }),
      });
      onUpdate({ clientName: data.clientName, clientEmail: data.clientEmail });
      setEditClientOpen(false);
      toast({ title: "Client info updated" });
    } catch { toast({ title: "Failed to update", variant: "destructive" }); }
    finally { setIsSaving(false); }
  }

  return (
    <div className="space-y-4 max-w-2xl">
      {/* Proposal header card */}
      <div className="rounded-xl overflow-hidden" style={{ border: "1px solid #E5E5E5" }}>
        {/* Dark header */}
        <div className="px-5 py-4 flex items-start justify-between gap-3" style={{ background: BLACK }}>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold uppercase tracking-wide mb-1" style={{ color: GOLD }}>Proposal</p>
            <h2 className="text-lg font-bold text-white truncate">{proposal.title}</h2>
            {proposal.clientName && <p className="text-sm mt-0.5" style={{ color: "#aaa" }}>For {proposal.clientName}</p>}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-xs font-bold rounded-full px-2 py-1 flex items-center gap-1" style={{ background: s.bg, color: s.color }}>
              {s.icon} {s.label}
            </span>
            <Button size="sm" variant="ghost" className="text-red-400 hover:text-red-400 hover:bg-red-400/10" onClick={onDelete}>
              <Trash2 size={13} />
            </Button>
          </div>
        </div>

        {/* Status + actions bar */}
        <div className="px-5 py-3 flex items-center gap-2 flex-wrap" style={{ background: "#F8F8F8", borderBottom: "1px solid #E5E5E5" }}>
          <span className="text-xs text-muted-foreground font-medium mr-1">Status:</span>
          {(["draft", "sent", "approved", "rejected"] as const).map((st) => {
            const cfg = STATUS_CONFIG[st];
            return (
              <button
                key={st}
                onClick={() => st !== "approved" ? onStatusChange(st) : onApprove()}
                className="text-xs font-semibold rounded-full px-2.5 py-1 transition-all flex items-center gap-1"
                style={{
                  background: proposal.status === st ? cfg.color : cfg.bg,
                  color: proposal.status === st ? "#fff" : cfg.color,
                  border: `1px solid ${cfg.color}`,
                }}
              >
                {cfg.icon} {cfg.label}
              </button>
            );
          })}
        </div>

        {/* Client info */}
        <div className="px-5 py-4 bg-white">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Client</p>
            <button onClick={() => setEditClientOpen(true)} className="text-xs text-blue-600 hover:underline flex items-center gap-0.5">
              <Pencil size={10} /> Edit
            </button>
          </div>
          {proposal.clientName || proposal.clientEmail ? (
            <div>
              {proposal.clientName && <p className="text-sm font-semibold">{proposal.clientName}</p>}
              {proposal.clientEmail && <p className="text-xs text-muted-foreground">{proposal.clientEmail}</p>}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground italic">No client info added</p>
          )}
        </div>

        {/* Approval info */}
        {proposal.status === "approved" && proposal.approvedByName && (
          <div className="px-5 py-3 flex items-center gap-2 text-sm" style={{ background: "#DCFCE7", borderTop: "1px solid #BBF7D0" }}>
            <CheckCircle2 size={15} className="text-green-700" />
            <span className="text-green-800 font-medium">Approved by <strong>{proposal.approvedByName}</strong></span>
            {proposal.approvedAt && <span className="text-green-700 text-xs">· {format(new Date(proposal.approvedAt), "MMM d, yyyy h:mm a")}</span>}
          </div>
        )}
      </div>

      {/* Line items table */}
      {items.length > 0 && (
        <div className="rounded-xl overflow-hidden" style={{ border: "1px solid #E5E5E5" }}>
          <div className="grid text-xs font-bold uppercase tracking-wide px-4 py-2.5" style={{ gridTemplateColumns: "1fr 70px 100px 70px 90px", background: "#F8F8F8", borderBottom: "1px solid #E5E5E5" }}>
            <span>Item</span>
            <span className="text-right">Qty</span>
            <span className="text-right">Unit Cost</span>
            <span className="text-right">Margin</span>
            <span className="text-right">Total</span>
          </div>
          {items.map((item) => {
            const { revenue } = calcItem(item);
            return (
              <div key={item.id} className="grid items-center px-4 py-2.5 bg-white border-b border-gray-100" style={{ gridTemplateColumns: "1fr 70px 100px 70px 90px" }}>
                <div>
                  <p className="text-sm font-medium">{item.name}</p>
                  {item.description && <p className="text-xs text-muted-foreground">{item.description}</p>}
                </div>
                <div className="text-right text-sm">{n(item.quantity)}</div>
                <div className="text-right text-sm">{cad(n(item.unitCost))}</div>
                <div className="text-right text-sm text-muted-foreground">{n(item.margin)}%</div>
                <div className="text-right text-sm font-semibold" style={{ color: GOLD }}>{cad(revenue)}</div>
              </div>
            );
          })}
          {/* Totals */}
          <div className="px-4 py-3 space-y-1" style={{ background: BLACK }}>
            <div className="flex justify-between text-xs" style={{ color: "#666" }}>
              <span>Total Cost</span><span>{cad(totals.totalCost)}</span>
            </div>
            <div className="flex justify-between text-xs" style={{ color: "#4ADE80" }}>
              <span>Profit</span><span>+{cad(totals.totalProfit)}</span>
            </div>
            <div className="flex justify-between text-sm font-bold border-t border-gray-700 pt-1">
              <span className="text-white">Total</span>
              <span style={{ color: GOLD }}>{cad(totals.totalRevenue)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Notes */}
      {proposal.notes && (
        <div className="rounded-xl px-4 py-3" style={{ background: "#FFFBEB", border: "1px solid #FDE68A" }}>
          <p className="text-xs font-bold uppercase tracking-wide text-amber-700 mb-1">Cover Note</p>
          <p className="text-sm text-amber-900">{proposal.notes}</p>
        </div>
      )}

      {/* Edit client dialog */}
      <Dialog open={editClientOpen} onOpenChange={setEditClientOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Edit Client Info</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Client Name</label>
              <Input value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Jane Smith" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Client Email</label>
              <Input type="email" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} placeholder="jane@example.com" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditClientOpen(false)}>Cancel</Button>
            <Button onClick={saveClient} disabled={isSaving} style={{ background: GOLD, color: BLACK }} className="font-semibold">
              {isSaving && <Loader2 size={13} className="mr-2 animate-spin" />} Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
