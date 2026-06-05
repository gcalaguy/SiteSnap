import { useState, useCallback } from "react";
import { customFetch } from "@workspace/api-client-react";
import {
  useListBuilderEstimates,
  useListProposals,
  useListEstimateTemplates,
  useCreateBuilderEstimate,
  useDeleteBuilderEstimate,
  useConvertEstimateToProposal,
  useUpdateProposal,
  useDeleteProposal,
  useApproveProposal,
  useCreateEstimateTemplate,
  useDeleteEstimateTemplate,
  getListBuilderEstimatesQueryKey,
  getListProposalsQueryKey,
  getListEstimateTemplatesQueryKey,
} from "@workspace/api-client-react";
import { queryClient } from "@/lib/queryClient";
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
  Search,
  Filter,
  Users,
  TrendingUp,
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
  const [proposalStatusFilter, setProposalStatusFilter] = useState<string | null>(null);

  // Data via React Query (cached, resilient)
  const estimatesRaw = useListBuilderEstimates();
  const estimates = (estimatesRaw.data ?? []) as BuilderEstimate[];
  const estimatesLoading = estimatesRaw.isLoading;

  const proposalsRaw = useListProposals();
  const proposals = (proposalsRaw.data ?? []) as Proposal[];
  const proposalsLoading = proposalsRaw.isLoading;

  const { data: templates = [], refetch: refetchTemplates } = useListEstimateTemplates();

  // UI state
  const [selectedEstimate, setSelectedEstimate] = useState<BuilderEstimate | null>(null);
  const [selectedProposal, setSelectedProposal] = useState<Proposal | null>(null);
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

  // Mutations
  const createEstimate = useCreateBuilderEstimate();
  const deleteEstimate = useDeleteBuilderEstimate();
  const convertEstimate = useConvertEstimateToProposal();
  const updateProposal = useUpdateProposal();
  const deleteProposalMut = useDeleteProposal();
  const approveProposalMut = useApproveProposal();
  const createTemplate = useCreateEstimateTemplate();
  const deleteTemplateMut = useDeleteEstimateTemplate();

  // Open estimate builder
  async function openEstimate(estimate: BuilderEstimate) {
    try {
      const data = await apiFetch(`/builder-estimates/${estimate.id}`) as BuilderEstimate;
      setSelectedEstimate(data);
    } catch { toast({ title: "Failed to load estimate", variant: "destructive" }); }
  }

  // Open proposal
  async function openProposal(proposal: Proposal) {
    try {
      const data = await apiFetch(`/proposals/${proposal.id}`) as Proposal;
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
      }) as BuilderEstimate;
      queryClient.invalidateQueries({ queryKey: getListBuilderEstimatesQueryKey() });
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
      queryClient.invalidateQueries({ queryKey: getListBuilderEstimatesQueryKey() });
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
      }) as Proposal;
      queryClient.invalidateQueries({ queryKey: getListProposalsQueryKey() });
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
      }) as Proposal;
      queryClient.invalidateQueries({ queryKey: getListProposalsQueryKey() });
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
      }) as Proposal;
      queryClient.invalidateQueries({ queryKey: getListProposalsQueryKey() });
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
      queryClient.invalidateQueries({ queryKey: getListProposalsQueryKey() });
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
      await refetchTemplates();
      toast({ title: "Template saved!" });
    } catch { toast({ title: "Failed to save template", variant: "destructive" }); }
    finally { setIsSubmitting(false); }
  }

  // Load template items into current estimate
  async function handleLoadTemplate(template: Template) {
    if (!selectedEstimate) return;
    setIsSubmitting(true);
    try {
      const tpl = await apiFetch(`/estimate-templates/${template.id}/items`) as { items?: any[] };
      for (const item of tpl.items ?? []) {
        await apiFetch(`/builder-estimates/${selectedEstimate.id}/items`, {
          method: "POST",
          body: JSON.stringify({ name: item.name, description: item.description, quantity: n(item.quantity), unitCost: n(item.unitCost), margin: n(item.margin) }),
        });
      }
      queryClient.invalidateQueries({ queryKey: getListBuilderEstimatesQueryKey() });
      const updated = await apiFetch(`/builder-estimates/${selectedEstimate.id}`) as BuilderEstimate;
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
      await refetchTemplates();
      toast({ title: "Template deleted" });
    } catch { toast({ title: "Failed to delete template", variant: "destructive" }); }
  }

  // Totals
  const proposalStats = {
    total: proposals.length,
    approved: proposals.filter((p) => p.status === "approved").length,
    pending: proposals.filter((p) => p.status === "sent").length,
  };

  // KPI data
  const pipelineValue = proposals.reduce((sum, p) => {
    const items = p.estimate?.items ?? [];
    return sum + items.reduce((acc, item) => acc + (n(item.quantity) * n(item.unitCost) * (1 + n(item.margin) / 100)), 0);
  }, 0);
  const uniqueClients = new Set(proposals.filter((p) => p.clientName).map((p) => p.clientName)).size;

  // Unified list filter/search
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<string>("all");

  const allRows = [
    ...estimates.map((e) => ({ id: `est-${e.id}`, type: "estimate" as const, title: e.title, status: "draft" as const, client: "", amount: (e.items ?? []).reduce((acc, item) => acc + n(item.quantity) * n(item.unitCost) * (1 + n(item.margin) / 100), 0), date: e.createdAt, raw: e })),
    ...proposals.map((p) => {
      const items = p.estimate?.items ?? [];
      const amount = items.reduce((acc, item) => acc + n(item.quantity) * n(item.unitCost) * (1 + n(item.margin) / 100), 0);
      return { id: `prop-${p.id}`, type: "proposal" as const, title: p.title, status: p.status, client: p.clientName ?? "", amount, date: p.createdAt, raw: p };
    }),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const filteredRows = allRows.filter((r) => {
    if (tab === "estimates" && r.type !== "estimate") return false;
    if (tab === "proposals" && r.type !== "proposal") return false;
    if (filter !== "all" && r.status !== filter) return false;
    if (search && !r.title.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="space-y-4 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#121212]">Command Center</h1>
          <p className="text-sm text-gray-500 mt-1 font-semibold">All proposals and estimates at a glance</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setCreateEstimateOpen(true)} style={{ background: GOLD, color: BLACK }} className="font-semibold">
            <Plus className="mr-2 h-4 w-4" /> New Estimate
          </Button>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 flex-shrink-0">
        {[
          { label: "Pipeline Value", value: cad(pipelineValue), icon: <DollarSign size={16} />, trend: proposals.length > 0 ? `+${proposals.filter((p) => p.status === "sent").length} active` : undefined },
          { label: "Active Proposals", value: String(proposals.filter((p) => p.status === "sent").length), icon: <Send size={16} /> },
          { label: "Approved", value: String(proposalStats.approved), icon: <CheckCircle2 size={16} />, trend: proposals.length > 0 ? `${Math.round((proposalStats.approved / proposals.length) * 100)}%` : undefined },
          { label: "Draft Estimates", value: String(estimates.length), icon: <FileSignature size={16} /> },
          { label: "Clients", value: String(uniqueClients || proposals.filter((p) => p.clientName).length), icon: <Users size={16} /> },
        ].map((kpi) => (
          <div key={kpi.label} className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-6 h-6 rounded flex items-center justify-center" style={{ background: `${GOLD}15` }}>
                <span style={{ color: GOLD }}>{kpi.icon}</span>
              </div>
              {kpi.trend && (
                <span className="text-[10px] font-semibold text-green-600 flex items-center gap-0.5">
                  <TrendingUp size={10} /> {kpi.trend}
                </span>
              )}
            </div>
            <p className="text-xl font-bold text-[#121212]">{kpi.value}</p>
            <p className="text-[10px] text-gray-400 uppercase tracking-wider mt-1">{kpi.label}</p>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-shrink-0 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search proposals and estimates..." className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 text-sm bg-white text-[#121212] focus:border-[#D4AF37] outline-none" />
        </div>
        <Tabs value={tab} onValueChange={(v) => { setTab(v as any); setFilter("all"); }} className="w-fit">
          <TabsList className="border border-gray-200 bg-white">
            <TabsTrigger value="estimates" className="text-gray-500 data-[state=active]:bg-[#D4AF37] data-[state=active]:text-white font-semibold text-xs">Estimate Builder</TabsTrigger>
            <TabsTrigger value="proposals" className="text-gray-500 data-[state=active]:bg-[#D4AF37] data-[state=active]:text-white font-semibold text-xs">Proposals</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex items-center gap-1 bg-white rounded-lg border border-gray-200 p-1">
          {["all", "draft", "sent", "approved", "rejected"].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium capitalize transition-colors ${filter === f ? "text-[#121212] font-semibold" : "text-gray-500 hover:text-gray-700"}`}
              style={filter === f ? { background: GOLD } : {}}
            >
              {f}
            </button>
          ))}
        </div>
        <button className="flex items-center gap-1 px-3 py-2 rounded-lg border border-gray-200 bg-white text-xs text-gray-500 hover:text-gray-700">
          <Filter size={14} /> More
        </button>
      </div>

      {/* Unified data table */}
      <div className="flex-1 min-h-0 bg-white rounded-xl border border-gray-200 overflow-hidden flex flex-col">
        <div className="overflow-auto flex-1">
          <table className="w-full">
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-gray-100 bg-white">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Title</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Type</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Status</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Client</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Amount</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Date</th>
                <th className="px-4 py-3 w-10" />
              </tr>
            </thead>
            <tbody>
              {tab === "estimates" && estimatesLoading ? (
                <tr><td colSpan={7} className="text-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground mx-auto" /></td></tr>
              ) : tab === "proposals" && proposalsLoading ? (
                <tr><td colSpan={7} className="text-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground mx-auto" /></td></tr>
              ) : filteredRows.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-12 text-sm text-gray-400">
                  {tab === "estimates" ? (
                    <div><FileSignature className="mx-auto mb-2 opacity-30" size={32} /><p>No estimates yet</p></div>
                  ) : (
                    <div><Send className="mx-auto mb-2 opacity-30" size={32} /><p>No proposals match your filters</p></div>
                  )}
                </td></tr>
              ) : filteredRows.map((row) => {
                const s = STATUS_CONFIG[row.status] ?? STATUS_CONFIG.draft;
                return (
                  <tr
                    key={row.id}
                    className="border-b border-gray-50 hover:bg-gray-50 transition-colors cursor-pointer group"
                    onClick={() => row.type === "estimate" ? openEstimate(row.raw as BuilderEstimate) : openProposal(row.raw as Proposal)}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-md flex items-center justify-center" style={{ background: row.type === "estimate" ? "#F3F4F6" : `${GOLD}15` }}>
                          {row.type === "estimate" ? <FileSignature size={13} className="text-gray-500" /> : <Send size={13} style={{ color: GOLD }} />}
                        </div>
                        <span className="text-sm font-medium text-[#121212]">{row.title}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-gray-500 capitalize">{row.type}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase px-2 py-1 rounded-full" style={{ background: s.bg, color: s.color }}>
                        {s.icon} {s.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">{row.client || "—"}</td>
                    <td className="px-4 py-3 text-right text-sm font-semibold text-[#121212]">{row.amount > 0 ? cad(row.amount) : "—"}</td>
                    <td className="px-4 py-3 text-right text-xs text-gray-400">{format(new Date(row.date), "MMM d, yyyy")}</td>
                    <td className="px-4 py-3">
                      <ChevronRight size={14} className="text-gray-300 group-hover:text-gray-500 transition-colors" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Selected detail panel (right side overlay when active) */}
      {selectedEstimate && (
        <Sheet open={!!selectedEstimate} onOpenChange={() => setSelectedEstimate(null)}>
          <SheetContent className="w-[520px] sm:max-w-[520px] overflow-y-auto">
            <EstimateBuilder
              estimate={selectedEstimate}
              onUpdate={(updated) => {
                setSelectedEstimate(updated);
                queryClient.invalidateQueries({ queryKey: getListBuilderEstimatesQueryKey() });
              }}
              onDelete={() => setDeleteEstimateId(selectedEstimate.id)}
              onConvert={() => setConvertOpen(true)}
              onSaveTemplate={() => setSaveTemplateOpen(true)}
              onLoadTemplate={() => setTemplateOpen(true)}
              toast={toast}
            />
          </SheetContent>
        </Sheet>
      )}
      {selectedProposal && (
        <Sheet open={!!selectedProposal} onOpenChange={() => setSelectedProposal(null)}>
          <SheetContent className="w-[520px] sm:max-w-[520px] overflow-y-auto">
            <ProposalView
              proposal={selectedProposal}
              onStatusChange={(status) => handleProposalStatus(selectedProposal.id, status)}
              onApprove={() => setApproveOpen(true)}
              onDelete={() => setDeleteProposalId(selectedProposal.id)}
              toast={toast}
              onUpdate={(updated) => {
                queryClient.invalidateQueries({ queryKey: getListProposalsQueryKey() });
                setSelectedProposal((p) => p ? { ...p, ...updated } : p);
              }}
            />
          </SheetContent>
        </Sheet>
      )}

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
      }) as BuilderEstimate;
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
      }) as Item;
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
      }) as Item;
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
          <div className="flex flex-col gap-1">
            <Input className="h-7 text-sm" placeholder="Item name…" value={addRow.name} onChange={(e) => setAddRow((r) => ({ ...r, name: e.target.value }))} onKeyDown={(e) => e.key === "Enter" && addItem()} />
            <Input className="h-7 text-sm text-muted-foreground" placeholder="Item description…" value={addRow.description} onChange={(e) => setAddRow((r) => ({ ...r, description: e.target.value }))} />
          </div>
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
      }) as Proposal;
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
