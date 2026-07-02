import { useState } from "react";
import { Link } from "wouter";
import { useListAllQuotes } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, FileText, ChevronRight } from "lucide-react";
import SearchBar from "@/components/SearchBar";
import { formatDistanceToNow } from "date-fns";
import { formatCurrency as fmtCAD } from "@/lib/format";


const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  pending_approval: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  converted: "Invoiced",
};

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-muted text-muted-foreground border-border",
  pending_approval: "bg-yellow-50 text-yellow-700 border-yellow-200",
  approved: "bg-green-50 text-green-700 border-green-200",
  rejected: "bg-red-50 text-red-700 border-red-200",
  converted: "bg-blue-50 text-blue-700 border-blue-200",
};

type QuoteStatus = "draft" | "pending_approval" | "approved" | "rejected" | "converted";

const TABS: { label: string; value: QuoteStatus | "all"; pill?: string }[] = [
  { label: "All",      value: "all" },
  { label: "Draft",    value: "draft",            pill: "bg-orange-500 text-white" },
  { label: "Pending",  value: "pending_approval", pill: "bg-yellow-400 text-yellow-900" },
  { label: "Approved", value: "approved",          pill: "bg-blue-500 text-white" },
  { label: "Rejected", value: "rejected",          pill: "bg-red-500 text-white" },
  { label: "Invoiced", value: "converted",         pill: "bg-green-500 text-white" },
];

export default function Quotes() {
  const [statusFilter, setStatusFilter] = useState<QuoteStatus | "all">("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Fetch filtered list for display
  const { data: quotes, isLoading } = useListAllQuotes(
    statusFilter !== "all" ? { status: statusFilter } : {},
  );

  // Always fetch all quotes to compute per-bucket counts
  const { data: allQuotes } = useListAllQuotes({});
  const counts = (allQuotes ?? []).reduce<Record<string, number>>((acc, q) => {
    acc[q.status] = (acc[q.status] ?? 0) + 1;
    return acc;
  }, {});
  const totalCount = allQuotes?.length ?? 0;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-[#121212] flex items-center gap-2">
            <FileText className="h-6 w-6" style={{ color: "#D4AF37" }} />
            Quotes
          </h1>
          <p className="text-sm text-[#121212]/60 mt-1 font-medium">Create and manage client quotes</p>
        </div>
        <Button asChild className="bg-[#D4AF37] hover:bg-[#b5922e] text-white font-semibold">
          <Link href="/quotes/new">
            <Plus className="h-4 w-4 mr-2" />
            New Quote
          </Link>
        </Button>
      </div>

      <SearchBar
        value={searchQuery}
        onChange={setSearchQuery}
        placeholder="Search by client, quote number, or cost …"
        className="w-full sm:w-80"
      />

      <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as QuoteStatus | "all")}>
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
      ) : !quotes?.length ? (
        <Card className="border-dashed border-[#D4AF37]/30 bg-white">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <FileText className="h-12 w-12 text-[#D4AF37]/40 mb-4" />
            <p className="text-lg font-extrabold text-[#121212]">No quotes yet</p>
            <p className="text-sm text-[#121212]/60 mt-1 mb-6 font-medium">
              Create your first quote — or use AI to fill it from a voice description.
            </p>
            <Button asChild className="bg-[#D4AF37] hover:bg-[#b5922e] text-white font-semibold">
              <Link href="/quotes/new">
                <Plus className="h-4 w-4 mr-2" />
                New Quote
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {(searchQuery
            ? quotes.filter((q) => {
                const s = searchQuery.toLowerCase();
                return (
                  (q.clientName ?? "").toLowerCase().includes(s) ||
                  (q.quoteNumber ?? "").toLowerCase().includes(s) ||
                  (q.title ?? "").toLowerCase().includes(s) ||
                  fmtCAD(q.total).toLowerCase().includes(s)
                );
              })
            : quotes
          ).map((q) => (
            <Link key={q.id} href={`/quotes/${q.id}`}>
              <Card className="hover:border-[#D4AF37]/40 hover:shadow-sm transition-all cursor-pointer border-[#D4AF37]/20 bg-white">
                <CardContent className="flex items-center justify-between p-4">
                  <div className="flex items-start gap-4 flex-1 min-w-0">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg shrink-0" style={{ background: "rgba(201,168,76,0.12)" }}>
                      <FileText className="h-5 w-5" style={{ color: "#D4AF37" }} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-extrabold text-[#121212] truncate">{q.title}</span>
                        <Badge variant="outline" className={`text-xs shrink-0 font-extrabold ${STATUS_COLORS[q.status]}`}>
                          {STATUS_LABELS[q.status]}
                        </Badge>
                      </div>
                      <p className="text-sm text-[#121212]/60 mt-0.5 font-medium">
                        {q.quoteNumber} · {q.clientName}
                      </p>
                      <p className="text-xs text-[#121212]/50 mt-0.5 font-medium">
                        {formatDistanceToNow(new Date(q.createdAt), { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 shrink-0 ml-4">
                    <div className="text-right hidden sm:block">
                      <p className="font-extrabold text-[#121212]">{fmtCAD(q.total)}</p>
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
