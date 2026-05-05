import { useState } from "react";
import { Link } from "wouter";
import { useListAllInvoices } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Receipt, ChevronRight, TrendingDown, TrendingUp, Plus } from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";

const GOLD = "#C9A84C";
const BLACK = "#111111";

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

const TABS: { label: string; value: InvoiceStatus | "all" }[] = [
  { label: "All", value: "all" },
  { label: "Draft", value: "draft" },
  { label: "Sent", value: "sent" },
  { label: "Paid", value: "paid" },
  { label: "Overdue", value: "overdue" },
  { label: "Cancelled", value: "cancelled" },
];

export default function Invoices() {
  const [statusFilter, setStatusFilter] = useState<InvoiceStatus | "all">("all");
  const { data: invoices, isLoading } = useListAllInvoices(
    statusFilter !== "all" ? { status: statusFilter } : {},
  );

  const fmtCAD = (v: string | number) =>
    new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(Number(v));

  const totalOutstanding = invoices
    ?.filter((i) => i.status === "sent" || i.status === "overdue")
    .reduce((s, i) => s + Number(i.total), 0) ?? 0;

  const totalPaid = invoices
    ?.filter((i) => i.status === "paid")
    .reduce((s, i) => s + Number(i.total), 0) ?? 0;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Invoices</h1>
          <p className="text-sm text-muted-foreground mt-1">Track payments and invoice status</p>
        </div>
        <Button asChild style={{ background: GOLD, color: BLACK }}>
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
          <div key={label} className="rounded-xl p-4" style={{ background: BLACK, boxShadow: "0 4px 16px rgba(0,0,0,0.18)" }}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: GOLD }}>{label}</span>
              <Icon size={15} style={{ color: GOLD }} />
            </div>
            <p className="text-2xl font-bold text-white">{value}</p>
          </div>
        ))}
      </div>

      <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as InvoiceStatus | "all")}>
        <TabsList className="flex gap-1 flex-wrap h-auto">
          {TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value} className="text-sm">
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      ) : !invoices?.length ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Receipt className="h-12 w-12 text-muted-foreground/40 mb-4" />
            <p className="text-lg font-medium text-foreground">No invoices yet</p>
            <p className="text-sm text-muted-foreground mt-1 mb-4">
              Create an invoice directly or convert an approved quote.
            </p>
            <Button asChild style={{ background: GOLD, color: BLACK }}>
              <Link href="/invoices/new">
                <Plus className="h-4 w-4 mr-2" />
                New Invoice
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {invoices.map((inv) => (
            <Link key={inv.id} href={`/invoices/${inv.id}`}>
              <Card className="hover:border-primary/40 hover:shadow-sm transition-all cursor-pointer">
                <CardContent className="flex items-center justify-between p-4">
                  <div className="flex items-start gap-4 flex-1 min-w-0">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
                      <Receipt className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-foreground truncate">{inv.title}</span>
                        <Badge variant="outline" className={`text-xs shrink-0 ${STATUS_COLORS[inv.status]}`}>
                          {STATUS_LABELS[inv.status]}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        {inv.invoiceNumber} · {inv.clientName}
                      </p>
                      {inv.dueDate && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Due {format(new Date(inv.dueDate), "MMM d, yyyy")}
                        </p>
                      )}
                      {!inv.dueDate && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {formatDistanceToNow(new Date(inv.createdAt), { addSuffix: true })}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-4 shrink-0 ml-4">
                    <div className="text-right hidden sm:block">
                      <p className="font-bold text-foreground">{fmtCAD(inv.total)}</p>
                      <p className="text-xs text-muted-foreground">incl. HST</p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
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
