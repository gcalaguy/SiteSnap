import { useState } from "react";
import {
  useListContacts,
  useCreateContact,
  useUpdateContact,
  useDeleteContact,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
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
  Search,
  Plus,
  Mail,
  Phone,
  Building2,
  Pencil,
  Trash2,
  BookUser,
  Loader2,
  User,
  Paperclip,
  ShieldCheck,
  AlertTriangle,
  ShieldAlert,
  Calendar,
} from "lucide-react";
import FileAttachmentsPanel from "@/components/FileAttachments";

const GOLD = "#C9A84C";
const BLACK = "#111111";

type ContactType = "client" | "worker" | "subcontractor" | "supplier";

const TYPE_CONFIG: Record<ContactType, { label: string; color: string; bg: string }> = {
  client:        { label: "Client",        color: "#2563EB", bg: "#DBEAFE" },
  worker:        { label: "Worker",        color: "#16A34A", bg: "#DCFCE7" },
  subcontractor: { label: "Subcontractor", color: "#7C3AED", bg: "#EDE9FE" },
  supplier:      { label: "Supplier",      color: "#D97706", bg: "#FEF3C7" },
};

const ALL_TYPES: { value: string; label: string }[] = [
  { value: "all", label: "All Types" },
  { value: "client", label: "Client" },
  { value: "worker", label: "Worker" },
  { value: "subcontractor", label: "Subcontractor" },
  { value: "supplier", label: "Supplier" },
];

interface ContactForm {
  name: string;
  company: string;
  phone: string;
  email: string;
  type: ContactType;
  coiExpiration: string;
  workersCompClearanceExpiration: string;
  complianceStatus: string;
  notes: string;
}

const EMPTY_FORM: ContactForm = {
  name: "",
  company: "",
  phone: "",
  email: "",
  type: "client",
  coiExpiration: "",
  workersCompClearanceExpiration: "",
  complianceStatus: "compliant",
  notes: "",
};

function daysUntil(dateStr: string | null | undefined): number {
  if (!dateStr) return Infinity;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - now.getTime()) / 86_400_000);
}

function computeAutoStatus(coi: string | null | undefined, wc: string | null | undefined): string {
  const coiDays = daysUntil(coi);
  const wcDays = daysUntil(wc);
  if (coiDays < 0 || wcDays < 0) return "non_compliant";
  if (coiDays <= 30 || wcDays <= 30) return "warning";
  return "compliant";
}

const COMPLIANCE_CONFIG: Record<string, { label: string; bg: string; color: string; icon: React.ElementType }> = {
  compliant:     { label: "Compliant",     bg: "#DCFCE7", color: "#16A34A", icon: ShieldCheck },
  warning:       { label: "Warning",       bg: "#FEF3C7", color: "#D97706", icon: AlertTriangle },
  non_compliant: { label: "Non-Compliant", bg: "#FEE2E2", color: "#DC2626", icon: ShieldAlert },
};

export default function Contacts() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<ContactForm>(EMPTY_FORM);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [filesContact, setFilesContact] = useState<{ id: number; name: string } | null>(null);

  const { data: contacts = [], isLoading } = useListContacts({
    search: search || undefined,
    type: typeFilter !== "all" ? (typeFilter as ContactType) : undefined,
  });

  const createContact = useCreateContact({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["listContacts"] });
        queryClient.invalidateQueries({ queryKey: ["getDashboardSummary"] });
        toast({ title: "Contact created" });
        setDialogOpen(false);
        setForm(EMPTY_FORM);
      },
      onError: () => toast({ title: "Failed to create contact", variant: "destructive" }),
    },
  });

  const updateContact = useUpdateContact({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["listContacts"] });
        toast({ title: "Contact updated" });
        setDialogOpen(false);
        setEditId(null);
        setForm(EMPTY_FORM);
      },
      onError: () => toast({ title: "Failed to update contact", variant: "destructive" }),
    },
  });

  const deleteContact = useDeleteContact({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["listContacts"] });
        queryClient.invalidateQueries({ queryKey: ["getDashboardSummary"] });
        toast({ title: "Contact deleted" });
        setDeleteId(null);
      },
      onError: () => toast({ title: "Failed to delete contact", variant: "destructive" }),
    },
  });

  function openCreate() {
    setEditId(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  }

  function openEdit(c: (typeof contacts)[0]) {
    setEditId(c.id);
    setForm({
      name: c.name,
      company: c.company ?? "",
      phone: c.phone ?? "",
      email: c.email ?? "",
      type: c.type as ContactType,
      coiExpiration: c.coiExpiration ?? "",
      workersCompClearanceExpiration: c.workersCompClearanceExpiration ?? "",
      complianceStatus: c.complianceStatus ?? "compliant",
      notes: c.notes ?? "",
    });
    setDialogOpen(true);
  }

  function handleSubmit() {
    const autoStatus = computeAutoStatus(form.coiExpiration, form.workersCompClearanceExpiration);
    const payload = {
      name: form.name.trim(),
      company: form.company.trim() || undefined,
      phone: form.phone.trim() || undefined,
      email: form.email.trim() || undefined,
      type: form.type,
      coiExpiration: form.coiExpiration || undefined,
      workersCompClearanceExpiration: form.workersCompClearanceExpiration || undefined,
      complianceStatus: (form.complianceStatus || autoStatus) as "compliant" | "non_compliant" | "warning",
      notes: form.notes.trim() || undefined,
    };

    if (!payload.name) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }

    if (editId !== null) {
      updateContact.mutate({ contactId: editId, data: payload });
    } else {
      createContact.mutate({ data: payload });
    }
  }

  const isSaving = createContact.isPending || updateContact.isPending;

  const typeCounts = contacts.reduce<Record<string, number>>((acc, c) => {
    acc[c.type] = (acc[c.type] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-[#121212] flex items-center gap-2">
            <BookUser className="h-7 w-7" style={{ color: "#D4AF37" }} />
            Contacts
          </h1>
          <p className="text-[#121212]/60 font-medium">CRM — clients, workers, subcontractors & suppliers</p>
        </div>
        <Button
          onClick={openCreate}
          className="font-semibold bg-[#D4AF37] hover:bg-[#b5922e] text-white"
        >
          <Plus className="mr-2 h-4 w-4" /> New Contact
        </Button>
      </div>

      {/* Stats row */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        {(["client", "worker", "subcontractor", "supplier"] as ContactType[]).map((t) => {
          const cfg = TYPE_CONFIG[t];
          const active = typeFilter === t;
          return (
            <div
              key={t}
              className="rounded-xl p-4 flex items-center gap-3 cursor-pointer transition-all bg-white"
              style={{
                border: active ? `2px solid #D4AF37` : "2px solid rgba(212,175,55,0.20)",
                boxShadow: active ? `0 0 0 2px rgba(212,175,55,0.10), 0 4px 12px rgba(0,0,0,0.06)` : "0 2px 8px rgba(0,0,0,0.04)",
              }}
              onClick={() => setTypeFilter(active ? "all" : t)}
            >
              <div
                className="rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ width: 36, height: 36, background: "rgba(212,175,55,0.12)" }}
              >
                <User size={16} style={{ color: "#D4AF37" }} />
              </div>
              <div>
                <p className="text-xs font-extrabold uppercase tracking-wide" style={{ color: "#D4AF37" }}>
                  {cfg.label}
                </p>
                <p className="text-2xl font-extrabold text-[#121212]">
                  {typeCounts[t] ?? 0}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Search + filter */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-56">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search name, email, company..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Filter type" />
          </SelectTrigger>
          <SelectContent>
            {ALL_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Contact list */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-7 w-7 animate-spin" style={{ color: "#D4AF37" }} />
        </div>
      ) : contacts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div
            className="rounded-full flex items-center justify-center mb-4"
            style={{ width: 64, height: 64, background: "rgba(212,175,55,0.12)" }}
          >
            <BookUser size={28} style={{ color: "#D4AF37" }} />
          </div>
          <h3 className="text-lg font-extrabold mb-1 text-[#121212]">No contacts yet</h3>
          <p className="text-sm text-[#121212]/60 mb-4 font-medium">
            {search || typeFilter !== "all" ? "No contacts match your filters." : "Add your first client, worker, subcontractor or supplier."}
          </p>
          {!search && typeFilter === "all" && (
            <Button onClick={openCreate} className="font-semibold bg-[#D4AF37] hover:bg-[#b5922e] text-white">
              <Plus className="mr-2 h-4 w-4" /> Add Contact
            </Button>
          )}
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {contacts.map((c) => {
            const cfg = TYPE_CONFIG[c.type as ContactType] ?? TYPE_CONFIG.client;
            const comp = COMPLIANCE_CONFIG[c.complianceStatus as string] ?? COMPLIANCE_CONFIG.compliant;
            const CompIcon = comp.icon;
            const coiDays = daysUntil(c.coiExpiration);
            const wcDays = daysUntil(c.workersCompClearanceExpiration);
            const auto = computeAutoStatus(c.coiExpiration, c.workersCompClearanceExpiration);
            const showAutoWarning = auto === "non_compliant" || auto === "warning";
            return (
              <div
                key={c.id}
                className="bg-white rounded-xl border p-5 flex flex-col gap-3 group hover:shadow-md transition-all"
                style={{ borderColor: "rgba(212,175,55,0.20)" }}
              >
                {/* Top row */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className="rounded-full flex items-center justify-center flex-shrink-0 text-sm font-extrabold"
                      style={{
                        width: 40,
                        height: 40,
                        background: cfg.bg,
                        color: cfg.color,
                      }}
                    >
                      {c.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="font-extrabold text-sm truncate text-[#121212]">{c.name}</p>
                      {c.company && (
                        <p className="text-xs text-[#121212]/60 truncate flex items-center gap-1 font-medium">
                          <Building2 size={11} /> {c.company}
                        </p>
                      )}
                    </div>
                  </div>
                  <Badge
                    className="flex-shrink-0 text-xs font-extrabold border-0"
                    style={{ background: cfg.bg, color: cfg.color }}
                  >
                    {cfg.label}
                  </Badge>
                </div>

                {/* Compliance badge */}
                {(c.type === "subcontractor" || c.type === "supplier") && (
                  <div className="flex items-center gap-2">
                    <Badge
                      className="text-xs font-extrabold border-0 gap-1"
                      style={{ background: comp.bg, color: comp.color }}
                    >
                      <CompIcon className="h-3 w-3" /> {comp.label}
                    </Badge>
                    {showAutoWarning && (
                      <span className="text-[10px] font-semibold text-amber-600">
                        {auto === "non_compliant" ? "Expired" : "Expires soon"}
                      </span>
                    )}
                  </div>
                )}

                {/* Contact info */}
                <div className="space-y-1">
                  {c.email && (
                    <a
                      href={`mailto:${c.email}`}
                      className="flex items-center gap-2 text-xs text-[#121212]/60 hover:text-[#121212] transition-colors truncate font-medium"
                    >
                      <Mail size={12} /> {c.email}
                    </a>
                  )}
                  {c.phone && (
                    <a
                      href={`tel:${c.phone}`}
                      className="flex items-center gap-2 text-xs text-[#121212]/60 hover:text-[#121212] transition-colors font-medium"
                    >
                      <Phone size={12} /> {c.phone}
                    </a>
                  )}
                </div>

                {/* Expiration dates */}
                {(c.type === "subcontractor" || c.type === "supplier") && (c.coiExpiration || c.workersCompClearanceExpiration) && (
                  <div className="text-[10px] text-[#121212]/50 space-y-0.5 font-medium">
                    {c.coiExpiration && (
                      <div className="flex items-center gap-1">
                        <Calendar size={10} /> COI expires {c.coiExpiration}
                        {coiDays < 0 && <span className="text-red-600 font-semibold">(Expired)</span>}
                        {coiDays >= 0 && coiDays <= 30 && <span className="text-amber-600 font-semibold">({coiDays}d)</span>}
                      </div>
                    )}
                    {c.workersCompClearanceExpiration && (
                      <div className="flex items-center gap-1">
                        <Calendar size={10} /> WCB expires {c.workersCompClearanceExpiration}
                        {wcDays < 0 && <span className="text-red-600 font-semibold">(Expired)</span>}
                        {wcDays >= 0 && wcDays <= 30 && <span className="text-amber-600 font-semibold">({wcDays}d)</span>}
                      </div>
                    )}
                  </div>
                )}

                {c.notes && (
                  <p className="text-xs text-[#121212]/60 bg-[#D4AF37]/5 rounded-md px-3 py-2 line-clamp-2 font-medium">
                    {c.notes}
                  </p>
                )}

                {/* Actions */}
                <div className="flex gap-1.5 mt-auto pt-1 border-t border-[#D4AF37]/10">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="flex-1 text-xs h-7 font-semibold text-[#121212]/70 hover:text-[#121212] hover:bg-[#D4AF37]/10"
                    onClick={() => openEdit(c)}
                  >
                    <Pencil size={12} className="mr-1" /> Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="flex-1 text-xs h-7 font-semibold text-[#121212]/70 hover:text-[#121212] hover:bg-[#D4AF37]/10"
                    onClick={() => setFilesContact({ id: c.id, name: c.name })}
                  >
                    <Paperclip size={12} className="mr-1" /> Files
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-xs h-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() => setDeleteId(c.id)}
                  >
                    <Trash2 size={12} />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) { setEditId(null); setForm(EMPTY_FORM); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editId ? "Edit Contact" : "New Contact"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Name *</label>
              <Input
                placeholder="Full name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Company / Organization</label>
              <Input
                placeholder="Optional"
                value={form.company}
                onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Phone</label>
                <Input
                  placeholder="+1 (555) 000-0000"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Email</label>
                <Input
                  type="email"
                  placeholder="email@example.com"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Type</label>
              <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v as ContactType }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="client">Client</SelectItem>
                  <SelectItem value="worker">Worker</SelectItem>
                  <SelectItem value="subcontractor">Subcontractor</SelectItem>
                  <SelectItem value="supplier">Supplier</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {(form.type === "subcontractor" || form.type === "supplier") && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">COI Expiration</label>
                    <Input
                      type="date"
                      value={form.coiExpiration}
                      onChange={(e) => setForm((f) => ({ ...f, coiExpiration: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">WCB Expiration</label>
                    <Input
                      type="date"
                      value={form.workersCompClearanceExpiration}
                      onChange={(e) => setForm((f) => ({ ...f, workersCompClearanceExpiration: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Compliance Status</label>
                  <Select value={form.complianceStatus} onValueChange={(v) => setForm((f) => ({ ...f, complianceStatus: v }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="compliant">Compliant</SelectItem>
                      <SelectItem value="warning">Warning</SelectItem>
                      <SelectItem value="non_compliant">Non-Compliant</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground">
                    Auto: {computeAutoStatus(form.coiExpiration, form.workersCompClearanceExpiration).replace("_", "-")}
                  </p>
                </div>
              </>
            )}

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Notes</label>
              <Textarea
                placeholder="Any relevant notes..."
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={isSaving}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={isSaving}
              style={{ background: GOLD, color: BLACK }}
              className="font-semibold"
            >
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editId ? "Save Changes" : "Create Contact"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Files Dialog */}
      <Dialog open={filesContact !== null} onOpenChange={(o) => { if (!o) setFilesContact(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Paperclip className="h-4 w-4" />
              Files — {filesContact?.name}
            </DialogTitle>
          </DialogHeader>
          {filesContact && (
            <div className="py-2">
              <FileAttachmentsPanel entityType="contact" entityId={filesContact.id} />
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={deleteId !== null} onOpenChange={(o) => { if (!o) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete contact?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The contact will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId !== null && deleteContact.mutate({ contactId: deleteId })}
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
