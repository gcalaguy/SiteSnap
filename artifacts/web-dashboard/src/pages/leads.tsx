import { useState, useRef } from "react";
import {
  useListLeads,
  useCreateLead,
  useUpdateLead,
  useDeleteLead,
  useConvertLead,
  useListLeadActivities,
  useCreateLeadActivity,
  useListContacts,
  getListLeadsQueryKey,
  getListLeadActivitiesQueryKey,
  getListProjectsQueryKey,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CharCountedTextarea } from "@/components/ui/char-counted-textarea";
import {
  createLeadBodyNotesMax as LEAD_NOTES_MAX,
  updateLeadBodyNotesMax as EDIT_NOTES_MAX,
  createLeadActivityBodyNotesMax as ACTIVITY_NOTES_MAX,
} from "@workspace/api-zod";
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
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
import {
  Plus,
  Loader2,
  TrendingUp,
  Phone,
  Mail,
  Users,
  FileText,
  Trash2,
  Rocket,
  MapPin,
  DollarSign,
  Clock,
  MessageSquare,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import SearchBar from "@/components/SearchBar";
import { format } from "date-fns";

const GOLD = "#C9A84C";
const BLACK = "#111111";

// ─── Stage config ──────────────────────────────────────────────────────────────
type Stage =
  | "new_lead"
  | "contacted"
  | "estimate_scheduled"
  | "proposal_sent"
  | "won"
  | "lost";

const STAGES: {
  key: Stage;
  label: string;
  color: string;
  bg: string;
  border: string;
  icon: React.ReactNode;
}[] = [
  {
    key: "new_lead",
    label: "New Lead",
    color: "#6366F1",
    bg: "#EEF2FF",
    border: "#C7D2FE",
    icon: <TrendingUp size={13} />,
  },
  {
    key: "contacted",
    label: "Contacted",
    color: "#0EA5E9",
    bg: "#E0F2FE",
    border: "#BAE6FD",
    icon: <Phone size={13} />,
  },
  {
    key: "estimate_scheduled",
    label: "Estimate Scheduled",
    color: "#F59E0B",
    bg: "#FEF3C7",
    border: "#FDE68A",
    icon: <Clock size={13} />,
  },
  {
    key: "proposal_sent",
    label: "Proposal Sent",
    color: "#8B5CF6",
    bg: "#EDE9FE",
    border: "#DDD6FE",
    icon: <FileText size={13} />,
  },
  {
    key: "won",
    label: "Won",
    color: "#16A34A",
    bg: "#DCFCE7",
    border: "#BBF7D0",
    icon: <CheckCircle2 size={13} />,
  },
  {
    key: "lost",
    label: "Lost",
    color: "#DC2626",
    bg: "#FEE2E2",
    border: "#FECACA",
    icon: <XCircle size={13} />,
  },
];

const SOURCE_LABELS: Record<string, string> = {
  referral: "Referral",
  website: "Website",
  ads: "Ads",
  social_media: "Social Media",
  cold_call: "Cold Call",
  other: "Other",
};

const ACTIVITY_ICONS: Record<string, React.ReactNode> = {
  call: <Phone size={13} />,
  email: <Mail size={13} />,
  meeting: <Users size={13} />,
  note: <MessageSquare size={13} />,
};

type LeadWithContact = {
  id: number;
  title: string;
  source: string;
  stage: Stage;
  estimatedValue?: string | null;
  notes?: string | null;
  convertedProjectId?: number | null;
  contact?: {
    id: number;
    name: string;
    company?: string | null;
    email?: string | null;
    phone?: string | null;
  } | null;
  createdAt: string;
};

// ─── Main component ────────────────────────────────────────────────────────────
export default function Leads() {
  const { toast } = useToast();

  // Data
  const { data: leads = [], isLoading } = useListLeads();
  const { data: contacts = [] } = useListContacts({});

  // UI state
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedLead, setSelectedLead] = useState<LeadWithContact | null>(null);
  const [stageGroupFilter, setStageGroupFilter] = useState<"pipeline" | "won" | "closed" | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [convertOpen, setConvertOpen] = useState(false);
  const [convertAddress, setConvertAddress] = useState("");
  const [convertCity, setConvertCity] = useState("");
  const [convertProvince, setConvertProvince] = useState("");

  // Drag-and-drop state
  const dragLeadId = useRef<number | null>(null);

  // Create form
  const [form, setForm] = useState({
    contactId: "",
    title: "",
    source: "other",
    estimatedValue: "",
    notes: "",
    stage: "new_lead" as Stage,
  });

  // Mutations
  const createLead = useCreateLead({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListLeadsQueryKey() });
        toast({ title: "Lead created" });
        setCreateOpen(false);
        setForm({ contactId: "", title: "", source: "other", estimatedValue: "", notes: "", stage: "new_lead" });
      },
      onError: () => toast({ title: "Failed to create lead", variant: "destructive" }),
    },
  });

  const updateLead = useUpdateLead({
    mutation: {
      onSuccess: (updated) => {
        queryClient.invalidateQueries({ queryKey: getListLeadsQueryKey() });
        if (selectedLead?.id === updated.id) setSelectedLead(updated as LeadWithContact);
      },
      onError: () => toast({ title: "Failed to update lead", variant: "destructive" }),
    },
  });

  const deleteLead = useDeleteLead({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListLeadsQueryKey() });
        toast({ title: "Lead deleted" });
        setDeleteId(null);
        if (selectedLead?.id === deleteId) setSelectedLead(null);
      },
      onError: () => toast({ title: "Failed to delete lead", variant: "destructive" }),
    },
  });

  const convertLead = useConvertLead({
    mutation: {
      onSuccess: (data: any) => {
        queryClient.invalidateQueries({ queryKey: getListLeadsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
        toast({ title: `Project "${data.project?.name}" created!` });
        setConvertOpen(false);
        setSelectedLead(null);
      },
      onError: () => toast({ title: "Failed to convert lead", variant: "destructive" }),
    },
  });

  // Drag handlers
  function onDragStart(leadId: number) {
    dragLeadId.current = leadId;
  }

  function onDrop(stage: Stage) {
    const leadId = dragLeadId.current;
    if (!leadId) return;
    const lead = (leads as LeadWithContact[]).find((l) => l.id === leadId);
    if (!lead || lead.stage === stage) return;
    updateLead.mutate({ leadId, data: { stage } });
    dragLeadId.current = null;
  }

  function handleCreate() {
    if (!form.contactId || !form.title.trim()) {
      toast({ title: "Contact and title are required", variant: "destructive" });
      return;
    }
    createLead.mutate({
      data: {
        contactId: parseInt(form.contactId),
        title: form.title.trim(),
        source: form.source as any,
        estimatedValue: form.estimatedValue ? parseFloat(form.estimatedValue) : undefined,
        notes: form.notes.trim() || undefined,
        stage: form.stage,
      },
    });
  }

  function handleConvert() {
    if (!selectedLead || !convertAddress.trim() || !convertCity.trim() || !convertProvince.trim()) {
      toast({ title: "All address fields are required", variant: "destructive" });
      return;
    }
    convertLead.mutate({
      leadId: selectedLead.id,
      data: { address: convertAddress.trim(), city: convertCity.trim(), province: convertProvince.trim() },
    });
  }

  const allLeads = (searchQuery
    ? (leads as LeadWithContact[]).filter((l) => {
        const s = searchQuery.toLowerCase();
        return (
          (l.title ?? "").toLowerCase().includes(s) ||
          (l.contact?.name ?? "").toLowerCase().includes(s) ||
          (l.contact?.company ?? "").toLowerCase().includes(s) ||
          (l.contact?.phone ?? "").toLowerCase().includes(s) ||
          (l.contact?.email ?? "").toLowerCase().includes(s)
        );
      })
    : leads
  ) as LeadWithContact[];

  // Totals
  const totalValue = allLeads.reduce((s, l) => s + (l.estimatedValue ? parseFloat(l.estimatedValue) : 0), 0);
  const wonValue = allLeads
    .filter((l) => l.stage === "won")
    .reduce((s, l) => s + (l.estimatedValue ? parseFloat(l.estimatedValue) : 0), 0);

  const fmt = (v: number) =>
    v >= 1_000_000
      ? `$${(v / 1_000_000).toFixed(1)}M`
      : v >= 1000
      ? `$${(v / 1000).toFixed(0)}K`
      : `$${v.toFixed(0)}`;

  return (
    <div className="space-y-5 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-[#121212] flex items-center gap-2">
            <TrendingUp className="h-7 w-7" style={{ color: "#D4AF37" }} />
            Pipeline
          </h1>
          <p className="text-[#121212]/60 text-sm font-medium">Drag cards between stages to move leads</p>
        </div>
        <Button
          onClick={() => setCreateOpen(true)}
          className="font-semibold bg-[#D4AF37] hover:bg-[#b5922e] text-white"
        >
          <Plus className="mr-2 h-4 w-4" /> New Lead
        </Button>
      </div>

      <SearchBar
        value={searchQuery}
        onChange={setSearchQuery}
        placeholder="Search by name, company, phone, or email …"
        className="w-full sm:w-80 flex-shrink-0"
      />

      {/* Summary pills */}
      <div className="flex gap-3 flex-wrap flex-shrink-0">
        {([
          { label: "Total Leads",    value: String(allLeads.length), color: "#D4AF37",      filter: null          as "pipeline" | "won" | "closed" | null },
          { label: "Pipeline Value", value: fmt(totalValue),          color: "#D4AF37",      filter: "pipeline"    as const },
          { label: "Won Value",      value: fmt(wonValue),            color: "#16A34A", filter: "won"         as const },
          {
            label: "Win Rate",
            value: allLeads.filter((l) => l.stage === "won" || l.stage === "lost").length > 0
              ? `${Math.round((allLeads.filter((l) => l.stage === "won").length / allLeads.filter((l) => l.stage === "won" || l.stage === "lost").length) * 100)}%`
              : "—",
            color: "#0EA5E9",
            filter: "closed" as const,
          },
        ] as const).map((s) => {
          const isActive = stageGroupFilter === s.filter && s.filter !== null;
          return (
            <button
              key={s.label}
              onClick={() => setStageGroupFilter(stageGroupFilter === s.filter ? null : s.filter)}
              className="flex items-center gap-2 rounded-xl px-4 py-3 text-sm transition-all hover:opacity-90 active:scale-95 bg-white"
              style={{
                border: isActive ? `2px solid ${s.color}` : "2px solid rgba(212,175,55,0.20)",
                boxShadow: isActive ? `0 0 0 1px ${s.color}22, 0 4px 12px rgba(0,0,0,0.06)` : "0 2px 8px rgba(0,0,0,0.04)",
                cursor: "pointer",
              }}
            >
              <span className="font-extrabold uppercase tracking-wide text-xs" style={{ color: "#D4AF37" }}>{s.label}</span>
              <span className="font-extrabold text-base text-[#121212]">{s.value}</span>
            </button>
          );
        })}
        {stageGroupFilter !== null && (
          <button
            onClick={() => setStageGroupFilter(null)}
            className="flex items-center gap-1.5 rounded-xl px-3 py-3 text-xs text-[#121212]/50 hover:text-[#121212] transition-colors bg-white border border-[#D4AF37]/20"
          >
            Clear filter
          </button>
        )}
      </div>

      {/* Kanban board */}
      {isLoading ? (
        <div className="flex items-center justify-center flex-1">
          <Loader2 className="h-8 w-8 animate-spin" style={{ color: "#D4AF37" }} />
        </div>
      ) : (
        <div
          className="flex gap-3 overflow-x-auto pb-4 flex-1"
          style={{ minHeight: 0 }}
        >
          {STAGES.filter((stage) => {
            if (!stageGroupFilter) return true;
            if (stageGroupFilter === "pipeline") return !["won", "lost"].includes(stage.key);
            if (stageGroupFilter === "won")       return stage.key === "won";
            if (stageGroupFilter === "closed")    return stage.key === "won" || stage.key === "lost";
            return true;
          }).map((stage) => {
            const stageLeads = allLeads.filter((l) => l.stage === stage.key);
            const stageValue = stageLeads.reduce(
              (s, l) => s + (l.estimatedValue ? parseFloat(l.estimatedValue) : 0),
              0,
            );

            return (
              <div
                key={stage.key}
                className="flex flex-col flex-shrink-0 rounded-xl overflow-hidden"
                style={{
                  width: 240,
                  background: "#F8F8F8",
                  border: "1px solid #E5E5E5",
                }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => onDrop(stage.key)}
              >
                {/* Column header */}
                <div
                  className="px-3 py-2.5 flex items-center justify-between flex-shrink-0"
                  style={{
                    background: stage.bg,
                    borderBottom: `1px solid ${stage.border}`,
                  }}
                >
                  <div className="flex items-center gap-1.5" style={{ color: stage.color }}>
                    {stage.icon}
                    <span className="text-xs font-bold uppercase tracking-wide">{stage.label}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span
                      className="text-xs font-bold rounded-full px-1.5 py-0.5 min-w-5 text-center"
                      style={{ background: stage.color, color: "#fff" }}
                    >
                      {stageLeads.length}
                    </span>
                  </div>
                </div>

                {stageValue > 0 && (
                  <div
                    className="px-3 py-1 text-xs font-semibold"
                    style={{ color: stage.color, background: stage.bg, borderBottom: `1px solid ${stage.border}` }}
                  >
                    {fmt(stageValue)}
                  </div>
                )}

                {/* Cards */}
                <div className="flex-1 overflow-y-auto p-2 space-y-2">
                  {stageLeads.length === 0 && (
                    <div className="text-center text-xs text-muted-foreground py-8 select-none opacity-50">
                      Drop here
                    </div>
                  )}
                  {stageLeads.map((lead) => (
                    <LeadCard
                      key={lead.id}
                      lead={lead}
                      stage={stage}
                      onDragStart={onDragStart}
                      onClick={() => setSelectedLead(lead)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create lead dialog */}
      <Dialog open={createOpen} onOpenChange={(o) => { setCreateOpen(o); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New Lead</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Contact *</label>
              <Select value={form.contactId} onValueChange={(v) => setForm((f) => ({ ...f, contactId: v, title: f.title || (contacts.find((c) => c.id === parseInt(v))?.name ?? "") }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a contact…" />
                </SelectTrigger>
                <SelectContent>
                  {contacts.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.name}{c.company ? ` — ${c.company}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Lead Title *</label>
              <Input
                placeholder="e.g. Kitchen renovation — Smith residence"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Source</label>
                <Select value={form.source} onValueChange={(v) => setForm((f) => ({ ...f, source: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(SOURCE_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Est. Value ($)</label>
                <Input
                  type="number"
                  placeholder="0"
                  value={form.estimatedValue}
                  onChange={(e) => setForm((f) => ({ ...f, estimatedValue: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Stage</label>
              <Select value={form.stage} onValueChange={(v) => setForm((f) => ({ ...f, stage: v as Stage }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STAGES.map((s) => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Notes</label>
              <CharCountedTextarea
                placeholder="Any relevant details…"
                rows={3}
                maxLength={LEAD_NOTES_MAX}
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={createLead.isPending}>Cancel</Button>
            <Button
              onClick={handleCreate}
              disabled={createLead.isPending}
              style={{ background: GOLD, color: BLACK }}
              className="font-semibold"
            >
              {createLead.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Lead
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Lead detail sheet */}
      <Sheet open={!!selectedLead} onOpenChange={(o) => { if (!o) setSelectedLead(null); }}>
        <SheetContent className="w-full max-w-lg overflow-y-auto" style={{ padding: 0 }}>
          {selectedLead && (
            <LeadDetail
              lead={selectedLead}
              onClose={() => setSelectedLead(null)}
              onDelete={(id) => { setDeleteId(id); }}
              onStageChange={(stage) => updateLead.mutate({ leadId: selectedLead.id, data: { stage } })}
              onConvert={() => { setConvertOpen(true); }}
              onUpdate={(data) => updateLead.mutate({ leadId: selectedLead.id, data })}
            />
          )}
        </SheetContent>
      </Sheet>

      {/* Convert to project dialog */}
      <Dialog open={convertOpen} onOpenChange={setConvertOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Convert to Project</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            A new project will be created from this lead. Fill in the site address.
          </p>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Street Address *</label>
              <Input placeholder="123 Main St" value={convertAddress} onChange={(e) => setConvertAddress(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">City *</label>
                <Input placeholder="Toronto" value={convertCity} onChange={(e) => setConvertCity(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Province *</label>
                <Input placeholder="ON" value={convertProvince} onChange={(e) => setConvertProvince(e.target.value)} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConvertOpen(false)}>Cancel</Button>
            <Button
              onClick={handleConvert}
              disabled={convertLead.isPending}
              style={{ background: "#16A34A", color: "#fff" }}
              className="font-semibold"
            >
              {convertLead.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <Rocket className="mr-2 h-4 w-4" />
              Create Project
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={deleteId !== null} onOpenChange={(o) => { if (!o) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete lead?</AlertDialogTitle>
            <AlertDialogDescription>All activity logs will also be deleted. This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId !== null && deleteLead.mutate({ leadId: deleteId })}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Lead card (Kanban) ────────────────────────────────────────────────────────
function LeadCard({
  lead,
  stage,
  onDragStart,
  onClick,
}: {
  lead: LeadWithContact;
  stage: (typeof STAGES)[0];
  onDragStart: (id: number) => void;
  onClick: () => void;
}) {
  return (
    <div
      draggable
      onDragStart={() => onDragStart(lead.id)}
      onClick={onClick}
      className="bg-white rounded-lg p-3 cursor-pointer select-none hover:shadow-md transition-shadow"
      style={{ border: "1px solid #E5E5E5" }}
    >
      {/* Title */}
      <p className="text-sm font-semibold leading-tight mb-1.5 line-clamp-2">{lead.title}</p>

      {/* Contact */}
      {lead.contact && (
        <p className="text-xs text-muted-foreground mb-2 truncate flex items-center gap-1">
          <Users size={10} />
          {lead.contact.name}
          {lead.contact.company ? ` · ${lead.contact.company}` : ""}
        </p>
      )}

      {/* Value + source row */}
      <div className="flex items-center justify-between">
        {lead.estimatedValue && parseFloat(lead.estimatedValue) > 0 ? (
          <span className="text-xs font-bold" style={{ color: GOLD }}>
            ${parseFloat(lead.estimatedValue).toLocaleString()}
          </span>
        ) : (
          <span />
        )}
        <span
          className="text-[10px] font-medium rounded-full px-1.5 py-0.5"
          style={{ background: stage.bg, color: stage.color }}
        >
          {SOURCE_LABELS[lead.source] ?? lead.source}
        </span>
      </div>

      {lead.convertedProjectId && (
        <div className="mt-1.5 flex items-center gap-1 text-[10px] font-semibold text-green-700">
          <Rocket size={10} /> Converted
        </div>
      )}
    </div>
  );
}

// ─── Lead detail sheet ─────────────────────────────────────────────────────────
function LeadDetail({
  lead,
  onClose,
  onDelete,
  onStageChange,
  onConvert,
  onUpdate,
}: {
  lead: LeadWithContact;
  onClose: () => void;
  onDelete: (id: number) => void;
  onStageChange: (stage: Stage) => void;
  onConvert: () => void;
  onUpdate: (data: any) => void;
}) {
  const { toast } = useToast();
  const { data: activities = [], isLoading: loadingActivities } = useListLeadActivities(
    lead.id,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { query: { enabled: !!lead.id } as any },
  );

  const createActivity = useCreateLeadActivity({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListLeadActivitiesQueryKey(lead.id) });
        setActivityForm({ type: "call", notes: "" });
        toast({ title: "Activity logged" });
      },
      onError: () => toast({ title: "Failed to log activity", variant: "destructive" }),
    },
  });

  const [activityForm, setActivityForm] = useState({ type: "call", notes: "" });
  const [editNotes, setEditNotes] = useState(lead.notes ?? "");
  const [notesEditing, setNotesEditing] = useState(false);

  const stage = STAGES.find((s) => s.key === lead.stage) ?? STAGES[0];

  function saveNotes() {
    onUpdate({ notes: editNotes.trim() || null });
    setNotesEditing(false);
  }

  function logActivity() {
    if (!activityForm.notes.trim()) {
      toast({ title: "Notes are required", variant: "destructive" });
      return;
    }
    createActivity.mutate({
      leadId: lead.id,
      data: { type: activityForm.type as any, notes: activityForm.notes.trim() },
    });
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-5 flex-shrink-0" style={{ background: BLACK, borderBottom: `1px solid #222` }}>
        <div className="flex items-start justify-between gap-3 mb-3">
          <h2 className="text-base font-bold text-white leading-tight">{lead.title}</h2>
          <Button
            size="sm"
            variant="ghost"
            className="text-red-400 hover:text-red-400 hover:bg-red-400/10 flex-shrink-0"
            onClick={() => onDelete(lead.id)}
          >
            <Trash2 size={14} />
          </Button>
        </div>

        {/* Stage selector */}
        <div className="flex flex-wrap gap-1.5">
          {STAGES.map((s) => (
            <button
              key={s.key}
              onClick={() => onStageChange(s.key)}
              className="text-[10px] font-bold rounded-full px-2 py-1 flex items-center gap-1 transition-all"
              style={{
                background: lead.stage === s.key ? s.color : "#222",
                color: lead.stage === s.key ? "#fff" : "#666",
                border: lead.stage === s.key ? `1px solid ${s.color}` : "1px solid #333",
              }}
            >
              {s.icon} {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
        {/* Contact info */}
        {lead.contact && (
          <div className="rounded-xl p-4 space-y-2" style={{ background: "#F8F8F8", border: "1px solid #E5E5E5" }}>
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Contact</p>
            <p className="font-semibold text-sm">{lead.contact.name}</p>
            {lead.contact.company && (
              <p className="text-xs text-muted-foreground">{lead.contact.company}</p>
            )}
            <div className="flex flex-col gap-1">
              {lead.contact.email && (
                <a href={`mailto:${lead.contact.email}`} className="text-xs text-blue-600 flex items-center gap-1 hover:underline">
                  <Mail size={11} /> {lead.contact.email}
                </a>
              )}
              {lead.contact.phone && (
                <a href={`tel:${lead.contact.phone}`} className="text-xs text-blue-600 flex items-center gap-1 hover:underline">
                  <Phone size={11} /> {lead.contact.phone}
                </a>
              )}
            </div>
          </div>
        )}

        {/* Lead meta */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg p-3 text-center" style={{ background: "#F8F8F8", border: "1px solid #E5E5E5" }}>
            <p className="text-xs text-muted-foreground mb-1">Est. Value</p>
            <p className="font-bold text-base" style={{ color: GOLD }}>
              {lead.estimatedValue && parseFloat(lead.estimatedValue) > 0
                ? `$${parseFloat(lead.estimatedValue).toLocaleString()}`
                : "—"}
            </p>
          </div>
          <div className="rounded-lg p-3 text-center" style={{ background: "#F8F8F8", border: "1px solid #E5E5E5" }}>
            <p className="text-xs text-muted-foreground mb-1">Source</p>
            <p className="font-bold text-sm">{SOURCE_LABELS[lead.source] ?? lead.source}</p>
          </div>
        </div>

        {/* Notes */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Notes</p>
            {!notesEditing && (
              <button
                className="text-xs text-blue-600 hover:underline"
                onClick={() => { setEditNotes(lead.notes ?? ""); setNotesEditing(true); }}
              >
                Edit
              </button>
            )}
          </div>
          {notesEditing ? (
            <div className="space-y-2">
              <CharCountedTextarea rows={4} maxLength={EDIT_NOTES_MAX} value={editNotes} onChange={(e) => setEditNotes(e.target.value)} className="text-sm" />
              <div className="flex gap-2">
                <Button size="sm" onClick={saveNotes} style={{ background: GOLD, color: BLACK }} className="font-semibold">Save</Button>
                <Button size="sm" variant="outline" onClick={() => setNotesEditing(false)}>Cancel</Button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground rounded-lg p-3" style={{ background: "#F8F8F8", border: "1px solid #E5E5E5", minHeight: 48 }}>
              {lead.notes || <span className="italic opacity-50">No notes</span>}
            </p>
          )}
        </div>

        {/* Convert button */}
        {lead.stage === "won" && !lead.convertedProjectId && (
          <Button
            className="w-full font-semibold"
            style={{ background: "#16A34A", color: "#fff" }}
            onClick={onConvert}
          >
            <Rocket className="mr-2 h-4 w-4" />
            Convert to Project
          </Button>
        )}
        {lead.convertedProjectId && (
          <div className="flex items-center gap-2 text-sm text-green-700 font-semibold bg-green-50 rounded-lg px-3 py-2 border border-green-200">
            <CheckCircle2 size={15} /> Converted to project
          </div>
        )}

        {/* Log activity */}
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2">Log Activity</p>
          <div className="rounded-xl p-3 space-y-2" style={{ background: "#F8F8F8", border: "1px solid #E5E5E5" }}>
            <div className="flex gap-2">
              {(["call", "email", "meeting", "note"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setActivityForm((f) => ({ ...f, type: t }))}
                  className="flex-1 text-[10px] font-bold py-1.5 rounded-md flex flex-col items-center gap-0.5 transition-all capitalize"
                  style={{
                    background: activityForm.type === t ? BLACK : "#fff",
                    color: activityForm.type === t ? GOLD : "#888",
                    border: `1px solid ${activityForm.type === t ? BLACK : "#E5E5E5"}`,
                  }}
                >
                  {ACTIVITY_ICONS[t]}
                  {t}
                </button>
              ))}
            </div>
            <CharCountedTextarea
              rows={2}
              maxLength={ACTIVITY_NOTES_MAX}
              placeholder="What happened? Add details…"
              value={activityForm.notes}
              onChange={(e) => setActivityForm((f) => ({ ...f, notes: e.target.value }))}
              className="text-sm"
            />
            <Button
              size="sm"
              className="w-full font-semibold"
              style={{ background: BLACK, color: GOLD }}
              onClick={logActivity}
              disabled={createActivity.isPending}
            >
              {createActivity.isPending && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
              Log Activity
            </Button>
          </div>
        </div>

        {/* Activity feed */}
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2">Activity Log</p>
          {loadingActivities ? (
            <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : activities.length === 0 ? (
            <p className="text-xs text-muted-foreground italic text-center py-4">No activities yet</p>
          ) : (
            <div className="space-y-2">
              {activities.map((a) => (
                <div
                  key={a.id}
                  className="rounded-lg p-3"
                  style={{ background: "#F8F8F8", border: "1px solid #E5E5E5" }}
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-1.5 text-xs font-semibold capitalize" style={{ color: BLACK }}>
                      {ACTIVITY_ICONS[a.type]}
                      {a.type}
                      {a.user && (
                        <span className="text-muted-foreground font-normal">
                          · {a.user.firstName} {a.user.lastName}
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-muted-foreground">
                      {format(new Date(a.createdAt), "MMM d, h:mm a")}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">{a.notes}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
