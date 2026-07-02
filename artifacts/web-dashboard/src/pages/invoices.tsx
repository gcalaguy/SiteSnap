import { useState } from "react";
import { Link } from "wouter";
import { useListAllInvoices } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Receipt, ChevronRight, TrendingDown, TrendingUp, Plus } from "lucide-react";
import SearchBar from "@/components/SearchBar";
import { formatDistanceToNow, format } from "date-fns";
import { formatCurrency as fmtCAD } from "@/lib/format";


const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  sent: "Sent",
  paid: "Paid",
  overdue: "Overdue",
  cancelled: "Cancelled",
};

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-muted text-muted-foreground border-border",
  sent: "bg-blue-50 text-blue-700 border-blue-200",
  paid: "bg-green-50 text-green-700 border-green-200",
  overdue: "bg-red-50 text-red-700 border-red-200",
  cancelled: "bg-muted/50 text-muted-foreground/60 border-border",
};

type InvoiceStatus = "draft" | "sent" | "paid" | "overdue" | "cancelled";

const TABS: { label: string; value: InvoiceStatus | "all"; pill?: string }[] = [
  { label: "All",       value: "all" },
  { label: "Draft",     value: "draft",      pill: "bg-orange-500 text-white" },
  { label: "Sent",      value: "sent",       pill: "bg-blue-500 text-white" },
  { label: "Paid",      value: "paid",       pill: "bg-green-500 text-white" },
  { label: "Overdue",   value: "overdue",    pill: "bg-red-500 text-white" },
  { label: "Cancelled", value: "cancelled",  pill: "bg-yellow-400 text-yellow-900" },
];

export default function Invoices() {
  const [statusFilter, setStatusFilter] = useState<InvoiceStatus | "all">("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Filtered list for display
  const { data: invoices, isLoading } = useListAllInvoices(
    statusFilter !== "all" ? { status: statusFilter } : {},
  );

  // Always fetch all invoices for counts + summary cards
  const { data: allInvoices } = useListAllInvoices({});
  const counts = (allInvoices ?? []).reduce<Record<string, number>>((acc, i) => {
    acc[i.status] = (acc[i.status] ?? 0) + 1;
    return acc;
  }, {});
  const totalCount = allInvoices?.length ?? 0;

  const totalOutstanding = (allInvoices ?? [])
    .filter((i) => i.status === "sent" || i.status === "overdue")
    .reduce((s, i) => s + Number(i.total), 0);

  const totalPaid = (allInvoices ?? [])
    .filter((i) => i.status === "paid")
    .reduce((s, i) => s + Number(i.total), 0);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-[#121212] flex items-center gap-2">
            <Receipt className="h-6 w-6" style={{ color: "#D4AF37" }} />
            Invoices
          </h1>
          <p className="text-sm text-[#121212]/60 mt-1 font-medium">Track payments and invoice status</p>
        </div>
        <Button asChild className="bg-[#D4AF37] hover:bg-[#b5922e] text-white font-semibold">
          <Link href="/invoices/new">
            <Plus className="h-4 w-4 mr-2" />
            New Invoice
          </Link>
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4">
        {[
          { label: "Outstanding", value: fmtCAD(totalOutstanding), icon: TrendingDown },
          { label: "Collected",   value: fmtCAD(totalPaid),        icon: TrendingUp  },
        ].map(({ label, value, icon: Icon }) => (
          <div key={label} className="rounded-xl p-4 bg-white border border-[#D4AF37]/20 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-extrabold uppercase tracking-wider text-[#D4AF37]">{label}</span>
              <Icon size={15} style={{ color: "#D4AF37" }} />
            </div>
            <p className="text-2xl font-extrabold text-[#121212]">{value}</p>
          </div>
        ))}
      </div>

      <SearchBar
        value={searchQuery}
        onChange={setSearchQuery}
        placeholder="Search by client, invoice number, status, or amount …"
        className="w-full sm:w-80"
      />

      <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as InvoiceStatus | "all")}>
        <TabsList
          className="flex gap-1 flex-wrap h-auto border border-[#D4AF37]/20 bg-white rounded-lg p-1"
        >
          {TABS.map((t) => {
            const count = t.value === "all" ? totalCount : (counts[t.value] ?? 0);
            const pillBase = t.pill ?? "bg-[#D4AF37]/15 text-[#D4AF37]";
            return (
              <TabsTrigger
                key={t.value}
                value={t.value}
                className="group text-sm text-[#121212]/60 data-[state=active]:bg-[#D4AF37] data-[state=active]:text-white data-[state=active]:font-semibold gap-1.5 rounded-md"
              >
                {t.label}
                {count > 0 && (
                  <span className={`inline-flex items-center justify-center rounded-full px-1.5 py-px text-[10px] font-bold leading-none min-w-[18px] ${pillBase}`}>
                    {count}
                  </span>
                )}
              </TabsTrigger>
            );
          })}
        </TabsList>
      </Tabs>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      ) : !invoices?.length ? (
        <Card className="border-dashed border-[#D4AF37]/30 bg-white">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Receipt className="h-12 w-12 text-[#D4AF37]/40 mb-4" />
            <p className="text-lg font-extrabold text-[#121212]">No invoices yet</p>
            <p className="text-sm text-[#121212]/60 mt-1 mb-4 font-medium">
              Create an invoice directly or convert an approved quote.
            </p>
            <Button asChild className="bg-[#D4AF37] hover:bg-[#b5922e] text-white font-semibold">
              <Link href="/invoices/new">
                <Plus className="h-4 w-4 mr-2" />
                New Invoice
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {(searchQuery
            ? invoices.filter((inv) => {
                const s = searchQuery.toLowerCase();
                return (
                  (inv.clientName ?? "").toLowerCase().includes(s) ||
                  (inv.invoiceNumber ?? "").toLowerCase().includes(s) ||
                  (inv.title ?? "").toLowerCase().includes(s) ||
                  (STATUS_LABELS[inv.status] ?? "").toLowerCase().includes(s) ||
                  fmtCAD(inv.total).toLowerCase().includes(s)
                );
              })
            : invoices
          ).map((inv) => (
            <Link key={inv.id} href={`/invoices/${inv.id}`}>
              <Card className="hover:border-[#D4AF37]/40 hover:shadow-sm transition-all cursor-pointer border-[#D4AF37]/20 bg-white">
                <CardContent className="flex items-center justify-between p-4">
                  <div className="flex items-start gap-4 flex-1 min-w-0">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg shrink-0" style={{ background: "rgba(201,168,76,0.12)" }}>
                      <Receipt className="h-5 w-5" style={{ color: "#D4AF37" }} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-extrabold text-[#121212] truncate">{inv.title}</span>
                        <Badge variant="outline" className={`text-xs shrink-0 font-extrabold ${STATUS_COLORS[inv.status]}`}>
                          {STATUS_LABELS[inv.status]}
                        </Badge>
                      </div>
                      <p className="text-sm text-[#121212]/60 mt-0.5 font-medium">
                        {inv.invoiceNumber} · {inv.clientName}
                      </p>
                      {inv.dueDate && (
                        <p className="text-xs text-[#121212]/50 mt-0.5 font-medium">
                          Due {format(new Date(inv.dueDate), "MMM d, yyyy")}
                        </p>
                      )}
                      {!inv.dueDate && (
                        <p className="text-xs text-[#121212]/50 mt-0.5 font-medium">
                          {formatDistanceToNow(new Date(inv.createdAt), { addSuffix: true })}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-4 shrink-0 ml-4">
                    <div className="text-right hidden sm:block">
                      <p className="font-extrabold text-[#121212]">{fmtCAD(inv.total)}</p>
                      <p className="text-xs text-[#121212]/50">incl. HST</p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-[#D4AF37]" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
