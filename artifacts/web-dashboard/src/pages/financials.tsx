import { useState, useCallback, useEffect } from "react";
import { customFetch } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
  DollarSign,
  TrendingDown,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  Clock,
  XCircle,
  Trash2,
  Receipt,
  RefreshCw,
  Pencil,
  ClipboardList,
  ArrowRight,
  BarChart3,
  CreditCard,
} from "lucide-react";
import { format } from "date-fns";
import { Link } from "wouter";

// ── Brand ──────────────────────────────────────────────────────────────────────
const GOLD = "#C9A84C";
const BLACK = "#111111";

// ── Types ──────────────────────────────────────────────────────────────────────
type PaymentRecord = {
  id: number;
  companyId: number;
  invoiceId: number;
  amount: string;
  method: string;
  paidAt: string;
  notes?: string | null;
  createdAt: string;
};

type ChangeOrder = {
  id: number;
  companyId: number;
  projectId: number;
  title: string;
  description?: string | null;
  amount: string;
  status: "pending" | "approved" | "rejected";
  requestedByUserId: number;
  approvedByUserId?: number | null;
  approvedAt?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
};

type FinancialSummary = {
  outstanding: string;
  overdue: string;
  collected: string;
  totalInvoiced: string;
  totalPaymentsReceived: string;
  invoiceCount: number;
  pendingChangeOrders: number;
  approvedChangeOrdersValue: string;
  recentPayments: PaymentRecord[];
};

type Invoice = {
  id: number;
  invoiceNumber: string;
  title: string;
  clientName: string;
  status: string;
  total: string;
  dueDate?: string | null;
};

type Project = {
  id: number;
  name: string;
};

// ── Helpers ────────────────────────────────────────────────────────────────────
function cad(v: string | number | undefined | null) {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(
    parseFloat(String(v ?? "0")) || 0,
  );
}

const METHOD_LABELS: Record<string, string> = {
  cash: "Cash",
  cheque: "Cheque",
  "e-transfer": "E-Transfer",
  credit_card: "Credit Card",
  other: "Other",
};

const CO_STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  pending:  { label: "Pending",  color: "#D97706", bg: "#FEF3C7", icon: <Clock size={11} /> },
  approved: { label: "Approved", color: "#16A34A", bg: "#DCFCE7", icon: <CheckCircle2 size={11} /> },
  rejected: { label: "Rejected", color: "#DC2626", bg: "#FEE2E2", icon: <XCircle size={11} /> },
};

async function apiFetch(path: string, opts?: RequestInit) {
  return customFetch(`/api${path}`, opts);
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function Financials() {
  const { toast } = useToast();
  const [tab, setTab] = useState<"overview" | "payments" | "change-orders">("overview");

  const [summary, setSummary] = useState<FinancialSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);

  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [paymentsLoading, setPaymentsLoading] = useState(true);

  const [changeOrders, setChangeOrders] = useState<ChangeOrder[]>([]);
  const [changeOrdersLoading, setChangeOrdersLoading] = useState(false);

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);

  // Record payment dialog
  const [recordPaymentOpen, setRecordPaymentOpen] = useState(false);
  const [paymentForm, setPaymentForm] = useState({ invoiceId: "", amount: "", method: "e-transfer", notes: "" });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Delete payment
  const [deletePaymentId, setDeletePaymentId] = useState<number | null>(null);

  // Create change order dialog
  const [createCOOpen, setCreateCOOpen] = useState(false);
  const [coForm, setCoForm] = useState({ projectId: "", title: "", description: "", amount: "", notes: "" });

  // Delete change order
  const [deleteCOId, setDeleteCOId] = useState<number | null>(null);

  // Load functions
  const loadSummary = useCallback(async () => {
    try {
      setSummaryLoading(true);
      const data = await apiFetch("/financials/summary") as FinancialSummary;
      setSummary(data);
    } catch { /* ignore */ }
    finally { setSummaryLoading(false); }
  }, []);

  const loadPayments = useCallback(async () => {
    try {
      setPaymentsLoading(true);
      const data = await apiFetch("/payments") as PaymentRecord[];
      setPayments(data ?? []);
    } catch { /* ignore */ }
    finally { setPaymentsLoading(false); }
  }, []);

  const loadChangeOrders = useCallback(async () => {
    try {
      setChangeOrdersLoading(true);
      const data = await apiFetch("/change-orders") as ChangeOrder[];
      setChangeOrders(data ?? []);
    } catch { /* ignore */ }
    finally { setChangeOrdersLoading(false); }
  }, []);

  const loadInvoices = useCallback(async () => {
    try {
      const data = await apiFetch("/invoices") as Invoice[];
      setInvoices((data ?? []).filter((inv) => inv.status !== "paid" && inv.status !== "cancelled"));
    } catch { /* ignore */ }
  }, []);

  const loadProjects = useCallback(async () => {
    try {
      const data = await apiFetch("/projects") as Project[];
      setProjects(data ?? []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    loadSummary();
    loadPayments();
    loadChangeOrders();
    loadInvoices();
    loadProjects();
  }, []);

  // ── Record payment ──────────────────────────────────────────────────────────
  async function handleRecordPayment() {
    if (!paymentForm.invoiceId || !paymentForm.amount) {
      toast({ title: "Invoice and amount are required", variant: "destructive" });
      return;
    }
    setIsSubmitting(true);
    try {
      const data = await apiFetch(`/invoices/${paymentForm.invoiceId}/payments`, {
        method: "POST",
        body: JSON.stringify({
          amount: parseFloat(paymentForm.amount),
          method: paymentForm.method,
          notes: paymentForm.notes.trim() || null,
        }),
      }) as PaymentRecord;
      setPayments((prev) => [data, ...prev]);
      setRecordPaymentOpen(false);
      setPaymentForm({ invoiceId: "", amount: "", method: "e-transfer", notes: "" });
      await loadSummary();
      toast({ title: "Payment recorded" });
    } catch (err: any) {
      toast({ title: err?.message ?? "Failed to record payment", variant: "destructive" });
    }
    finally { setIsSubmitting(false); }
  }

  // ── Delete payment ──────────────────────────────────────────────────────────
  async function handleDeletePayment() {
    if (!deletePaymentId) return;
    setIsSubmitting(true);
    try {
      await apiFetch(`/payments/${deletePaymentId}`, { method: "DELETE" });
      setPayments((prev) => prev.filter((p) => p.id !== deletePaymentId));
      setDeletePaymentId(null);
      await loadSummary();
      toast({ title: "Payment deleted" });
    } catch { toast({ title: "Failed to delete payment", variant: "destructive" }); }
    finally { setIsSubmitting(false); }
  }

  // ── Create change order ─────────────────────────────────────────────────────
  async function handleCreateCO() {
    if (!coForm.projectId || !coForm.title.trim() || !coForm.amount) {
      toast({ title: "Project, title, and amount are required", variant: "destructive" });
      return;
    }
    setIsSubmitting(true);
    try {
      const data = await apiFetch("/change-orders", {
        method: "POST",
        body: JSON.stringify({
          projectId: parseInt(coForm.projectId),
          title: coForm.title.trim(),
          description: coForm.description.trim() || null,
          amount: parseFloat(coForm.amount),
          notes: coForm.notes.trim() || null,
        }),
      }) as ChangeOrder;
      setChangeOrders((prev) => [data, ...prev]);
      setCreateCOOpen(false);
      setCoForm({ projectId: "", title: "", description: "", amount: "", notes: "" });
      await loadSummary();
      toast({ title: "Change order created" });
    } catch (err: any) {
      toast({ title: err?.message ?? "Failed to create change order", variant: "destructive" });
    }
    finally { setIsSubmitting(false); }
  }

  // ── Approve / reject change order ───────────────────────────────────────────
  async function handleCOAction(id: number, action: "approve" | "reject") {
    try {
      const data = await apiFetch(`/change-orders/${id}/${action}`, { method: "POST" }) as ChangeOrder;
      setChangeOrders((prev) => prev.map((co) => co.id === id ? data : co));
      await loadSummary();
      toast({ title: action === "approve" ? "Change order approved" : "Change order rejected" });
    } catch { toast({ title: `Failed to ${action} change order`, variant: "destructive" }); }
  }

  // ── Delete change order ─────────────────────────────────────────────────────
  async function handleDeleteCO() {
    if (!deleteCOId) return;
    setIsSubmitting(true);
    try {
      await apiFetch(`/change-orders/${deleteCOId}`, { method: "DELETE" });
      setChangeOrders((prev) => prev.filter((co) => co.id !== deleteCOId));
      setDeleteCOId(null);
      await loadSummary();
      toast({ title: "Change order deleted" });
    } catch { toast({ title: "Failed to delete change order", variant: "destructive" }); }
    finally { setIsSubmitting(false); }
  }

  return (
    <div className="space-y-4 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Financials</h1>
          <p className="text-muted-foreground text-sm">Payments, change orders, and revenue tracking</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => { loadSummary(); loadPayments(); loadChangeOrders(); }}>
            <RefreshCw size={14} className="mr-1" /> Refresh
          </Button>
          {tab === "payments" && (
            <Button onClick={() => setRecordPaymentOpen(true)} style={{ background: GOLD, color: BLACK }} className="font-semibold">
              <Plus className="mr-2 h-4 w-4" /> Record Payment
            </Button>
          )}
          {tab === "change-orders" && (
            <Button onClick={() => setCreateCOOpen(true)} style={{ background: GOLD, color: BLACK }} className="font-semibold">
              <Plus className="mr-2 h-4 w-4" /> Change Order
            </Button>
          )}
        </div>
      </div>

      {/* Summary stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 flex-shrink-0">
        {summaryLoading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)
        ) : ([
          { label: "Outstanding", value: summary?.outstanding, icon: TrendingDown, color: "#F59E0B", note: `${summary?.invoiceCount ?? 0} invoices`,   targetTab: "payments"      as const },
          { label: "Overdue",     value: summary?.overdue,     icon: AlertCircle,  color: "#EF4444", note: "needs attention",                           targetTab: "payments"      as const },
          { label: "Collected",   value: summary?.collected,   icon: TrendingUp,   color: "#22C55E", note: "fully paid invoices",                       targetTab: "payments"      as const },
          { label: "Pending COs", value: summary?.pendingChangeOrders !== undefined ? String(summary.pendingChangeOrders) : "0", icon: ClipboardList, color: GOLD, note: `+${cad(summary?.approvedChangeOrdersValue)} approved`, isCnt: true, targetTab: "change-orders" as const },
        ].map(({ label, value, icon: Icon, color, note, isCnt, targetTab }) => {
          const isActive = tab === targetTab;
          return (
            <button
              key={label}
              onClick={() => setTab(targetTab)}
              className="rounded-xl p-4 space-y-1 text-left w-full transition-all hover:opacity-90 active:scale-[0.98]"
              style={{
                background: BLACK,
                border: `1px solid ${isActive ? color : "#222"}`,
                boxShadow: isActive ? `0 0 0 1px ${color}33, 0 4px 16px ${color}22` : undefined,
                cursor: "pointer",
              }}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide" style={{ color }}>{label}</span>
                <Icon size={14} style={{ color }} />
              </div>
              <p className="text-2xl font-bold text-white">{isCnt ? value : cad(value)}</p>
              <p className="text-xs" style={{ color: "#666" }}>{note}</p>
            </button>
          );
        }))}
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="flex-1 flex flex-col min-h-0">
        <TabsList className="flex-shrink-0 w-fit">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
          <TabsTrigger value="change-orders">Change Orders</TabsTrigger>
        </TabsList>

        {/* ── Overview Tab ── */}
        <TabsContent value="overview" className="flex-1 min-h-0 overflow-y-auto mt-4 space-y-6">
          {/* Revenue breakdown */}
          <div>
            <h2 className="text-base font-semibold mb-3">Revenue Breakdown</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {[
                { label: "Total Invoiced",        value: summary?.totalInvoiced,        desc: "all invoices combined" },
                { label: "Payments Received",     value: summary?.totalPaymentsReceived, desc: "actual cash collected" },
                { label: "Approved Change Orders",value: summary?.approvedChangeOrdersValue, desc: "added project scope" },
              ].map(({ label, value, desc }) => (
                <div key={label} className="rounded-xl p-4" style={{ background: "#F8F8F8", border: "1px solid #E5E5E5" }}>
                  <p className="text-xs text-muted-foreground font-medium mb-1">{label}</p>
                  <p className="text-xl font-bold">{cad(value)}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Recent payments */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-semibold">Recent Payments</h2>
              <Button size="sm" variant="ghost" onClick={() => setTab("payments")} className="text-xs">
                View all <ArrowRight size={12} className="ml-1" />
              </Button>
            </div>
            {summaryLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}
              </div>
            ) : !summary?.recentPayments?.length ? (
              <div className="rounded-xl p-6 text-center text-sm text-muted-foreground" style={{ background: "#F8F8F8", border: "1px solid #E5E5E5" }}>
                <CreditCard size={28} className="mx-auto mb-2 opacity-30" />
                No payments recorded yet
              </div>
            ) : (
              <div className="rounded-xl overflow-hidden" style={{ border: "1px solid #E5E5E5" }}>
                {summary.recentPayments.map((p, i) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between px-4 py-3"
                    style={{ background: i % 2 === 0 ? "#fff" : "#FAFAFA", borderBottom: i < (summary.recentPayments.length - 1) ? "1px solid #F0F0F0" : "none" }}
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "#F0FDF4" }}>
                        <DollarSign size={14} className="text-green-600" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">Invoice #{p.invoiceId}</p>
                        <p className="text-xs text-muted-foreground">{METHOD_LABELS[p.method] ?? p.method} · {format(new Date(p.paidAt), "MMM d, yyyy")}</p>
                      </div>
                    </div>
                    <span className="text-sm font-bold" style={{ color: "#16A34A" }}>+{cad(p.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Pending change orders summary */}
          {(summary?.pendingChangeOrders ?? 0) > 0 && (
            <div className="rounded-xl p-4 flex items-center gap-3" style={{ background: "#FFFBEB", border: "1px solid #FDE68A" }}>
              <AlertCircle size={18} className="text-amber-600 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-amber-900">
                  {summary!.pendingChangeOrders} change order{summary!.pendingChangeOrders > 1 ? "s" : ""} awaiting approval
                </p>
                <p className="text-xs text-amber-700">Review and approve or reject in the Change Orders tab</p>
              </div>
              <Button size="sm" variant="outline" onClick={() => setTab("change-orders")} className="border-amber-300 text-amber-800 hover:bg-amber-50">
                Review <ArrowRight size={12} className="ml-1" />
              </Button>
            </div>
          )}
        </TabsContent>

        {/* ── Payments Tab ── */}
        <TabsContent value="payments" className="flex-1 min-h-0 overflow-y-auto mt-4">
          {paymentsLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
            </div>
          ) : payments.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <CreditCard size={48} className="mb-3 opacity-20" />
              <p className="text-sm font-medium">No payments yet</p>
              <p className="text-xs mt-1 opacity-60">Record a payment against any invoice</p>
              <Button className="mt-4" onClick={() => setRecordPaymentOpen(true)} style={{ background: GOLD, color: BLACK }}>
                <Plus size={14} className="mr-2" /> Record First Payment
              </Button>
            </div>
          ) : (
            <div className="rounded-xl overflow-hidden" style={{ border: "1px solid #E5E5E5" }}>
              {/* Table header */}
              <div className="grid text-xs font-bold uppercase tracking-wide px-4 py-2.5" style={{ gridTemplateColumns: "1fr 120px 140px 120px 32px", background: BLACK, color: "#aaa" }}>
                <span>Invoice</span>
                <span>Method</span>
                <span>Date</span>
                <span className="text-right">Amount</span>
                <span />
              </div>
              {payments.map((payment, i) => (
                <div
                  key={payment.id}
                  className="grid items-center px-4 py-3"
                  style={{ gridTemplateColumns: "1fr 120px 140px 120px 32px", background: i % 2 === 0 ? "#fff" : "#FAFAFA", borderBottom: i < payments.length - 1 ? "1px solid #F0F0F0" : "none" }}
                >
                  <div>
                    <Link href={`/invoices/${payment.invoiceId}`} className="text-sm font-medium text-blue-600 hover:underline">
                      Invoice #{payment.invoiceId}
                    </Link>
                    {payment.notes && <p className="text-xs text-muted-foreground truncate">{payment.notes}</p>}
                  </div>
                  <span className="text-sm">{METHOD_LABELS[payment.method] ?? payment.method}</span>
                  <span className="text-sm text-muted-foreground">{format(new Date(payment.paidAt), "MMM d, yyyy")}</span>
                  <span className="text-sm font-bold text-right" style={{ color: "#16A34A" }}>+{cad(payment.amount)}</span>
                  <button onClick={() => setDeletePaymentId(payment.id)} className="text-muted-foreground hover:text-destructive flex justify-end">
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── Change Orders Tab ── */}
        <TabsContent value="change-orders" className="flex-1 min-h-0 overflow-y-auto mt-4">
          {changeOrdersLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
            </div>
          ) : changeOrders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <ClipboardList size={48} className="mb-3 opacity-20" />
              <p className="text-sm font-medium">No change orders yet</p>
              <p className="text-xs mt-1 opacity-60">Add extra costs to a project</p>
              <Button className="mt-4" onClick={() => setCreateCOOpen(true)} style={{ background: GOLD, color: BLACK }}>
                <Plus size={14} className="mr-2" /> Create Change Order
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {changeOrders.map((co) => {
                const s = CO_STATUS_CONFIG[co.status] ?? CO_STATUS_CONFIG.pending;
                return (
                  <div key={co.id} className="rounded-xl p-4" style={{ background: "#fff", border: "1px solid #E5E5E5" }}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-semibold">{co.title}</p>
                          <span className="text-[10px] font-bold rounded-full px-1.5 py-0.5 flex items-center gap-0.5" style={{ background: s.bg, color: s.color }}>
                            {s.icon} {s.label}
                          </span>
                        </div>
                        {co.description && <p className="text-xs text-muted-foreground mt-0.5">{co.description}</p>}
                        <p className="text-xs text-muted-foreground mt-1">Project #{co.projectId} · {format(new Date(co.createdAt), "MMM d, yyyy")}</p>
                        {co.approvedAt && <p className="text-xs text-green-700 mt-0.5">Approved {format(new Date(co.approvedAt), "MMM d, yyyy")}</p>}
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-lg font-bold" style={{ color: GOLD }}>{cad(co.amount)}</p>
                        {co.status === "pending" && (
                          <div className="flex gap-1 mt-2 justify-end">
                            <Button size="sm" className="h-7 text-xs font-semibold" style={{ background: "#16A34A", color: "#fff" }} onClick={() => handleCOAction(co.id, "approve")}>
                              <CheckCircle2 size={11} className="mr-1" /> Approve
                            </Button>
                            <Button size="sm" variant="outline" className="h-7 text-xs text-destructive hover:text-destructive border-red-200" onClick={() => handleCOAction(co.id, "reject")}>
                              <XCircle size={11} className="mr-1" /> Reject
                            </Button>
                          </div>
                        )}
                        <button onClick={() => setDeleteCOId(co.id)} className="text-xs text-muted-foreground hover:text-destructive mt-2 flex items-center gap-0.5 ml-auto">
                          <Trash2 size={11} /> Delete
                        </button>
                      </div>
                    </div>
                    {co.notes && (
                      <p className="text-xs text-muted-foreground mt-2 pt-2 border-t border-gray-100">{co.notes}</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Record Payment Dialog */}
      <Dialog open={recordPaymentOpen} onOpenChange={setRecordPaymentOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Record Payment</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Invoice *</label>
              <Select value={paymentForm.invoiceId} onValueChange={(v) => setPaymentForm((f) => ({ ...f, invoiceId: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select an invoice…" />
                </SelectTrigger>
                <SelectContent>
                  {invoices.length === 0
                    ? <SelectItem value="none" disabled>No open invoices</SelectItem>
                    : invoices.map((inv) => (
                      <SelectItem key={inv.id} value={String(inv.id)}>
                        {inv.invoiceNumber} — {inv.clientName} ({cad(inv.total)})
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Amount (CAD) *</label>
                <Input type="number" step="0.01" placeholder="0.00" value={paymentForm.amount} onChange={(e) => setPaymentForm((f) => ({ ...f, amount: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Method</label>
                <Select value={paymentForm.method} onValueChange={(v) => setPaymentForm((f) => ({ ...f, method: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(METHOD_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Notes</label>
              <Textarea placeholder="e.g. Deposit received…" rows={2} value={paymentForm.notes} onChange={(e) => setPaymentForm((f) => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRecordPaymentOpen(false)}>Cancel</Button>
            <Button onClick={handleRecordPayment} disabled={isSubmitting || !paymentForm.invoiceId || !paymentForm.amount} style={{ background: GOLD, color: BLACK }} className="font-semibold">
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <DollarSign className="mr-2 h-4 w-4" /> Record Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Change Order Dialog */}
      <Dialog open={createCOOpen} onOpenChange={setCreateCOOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Create Change Order</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Add extra scope or costs to a project. Requires approval before proceeding.</p>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Project *</label>
              <Select value={coForm.projectId} onValueChange={(v) => setCoForm((f) => ({ ...f, projectId: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select project…" />
                </SelectTrigger>
                <SelectContent>
                  {projects.length === 0
                    ? <SelectItem value="none" disabled>No projects</SelectItem>
                    : projects.map((p) => (
                      <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Title *</label>
              <Input placeholder="e.g. Additional electrical work" value={coForm.title} onChange={(e) => setCoForm((f) => ({ ...f, title: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Description</label>
              <Textarea placeholder="Describe the extra scope…" rows={2} value={coForm.description} onChange={(e) => setCoForm((f) => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Amount (CAD) *</label>
              <Input type="number" step="0.01" placeholder="0.00" value={coForm.amount} onChange={(e) => setCoForm((f) => ({ ...f, amount: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Notes</label>
              <Input placeholder="Any other notes…" value={coForm.notes} onChange={(e) => setCoForm((f) => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateCOOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateCO} disabled={isSubmitting || !coForm.projectId || !coForm.title.trim() || !coForm.amount} style={{ background: GOLD, color: BLACK }} className="font-semibold">
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <Plus className="mr-2 h-4 w-4" /> Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete payment confirm */}
      <AlertDialog open={deletePaymentId !== null} onOpenChange={(o) => { if (!o) setDeletePaymentId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete payment?</AlertDialogTitle>
            <AlertDialogDescription>This will remove the payment record. The invoice status may revert if it was auto-marked as paid.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeletePayment} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete change order confirm */}
      <AlertDialog open={deleteCOId !== null} onOpenChange={(o) => { if (!o) setDeleteCOId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete change order?</AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteCO} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
