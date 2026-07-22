import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Wallet, Paperclip, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { formatCurrency } from "@/lib/format";
import { useSignedDownload } from "@/hooks/useSignedUrl";
import { useToast } from "@/hooks/use-toast";
import { SortMenu, compareBy, type SortState } from "@/components/SortMenu";

type SortKey = "date" | "vendor" | "project" | "submittedBy" | "amount" | "tax" | "status";

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "date", label: "Date" },
  { key: "vendor", label: "Vendor" },
  { key: "project", label: "Project" },
  { key: "submittedBy", label: "Submitted By" },
  { key: "amount", label: "Amount" },
  { key: "tax", label: "Tax" },
  { key: "status", label: "Status" },
];

interface CompanyExpense {
  id: number;
  projectId: number;
  projectName: string;
  amount: string;
  description: string;
  vendorName: string | null;
  taxAmount: string | null;
  expenseDate: string | null;
  receiptObjectPath: string | null;
  status: string;
  createdAt: string;
  submittedByName: string;
}

type Period = "month" | "all";

// Same "this month" boundary the dashboard's "This Month's Spend" tile uses
// (COALESCE(expense_date, created_at) >= first of current month) so the totals match.
function isThisMonth(e: CompanyExpense): boolean {
  const now = new Date();
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  if (e.expenseDate) {
    // expenseDate is a date-only "YYYY-MM-DD" string — compare the calendar
    // month directly. Parsing it with `new Date(...)` would read it as UTC
    // midnight and can shift a day when read back via local getMonth().
    return e.expenseDate.slice(0, 7) === currentMonthKey;
  }
  const d = new Date(e.createdAt);
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

export default function CompanyExpensesPage({ initialPeriod = "all" }: { initialPeriod?: Period }) {
  const { data: expenses = [], isLoading } = useQuery<CompanyExpense[]>({
    queryKey: ["financials", "expenses"],
    queryFn: () => customFetch("/api/financials/expenses"),
  });
  const [sort, setSort] = useState<SortState<SortKey>>({ key: "date", dir: "desc" });
  const [period, setPeriod] = useState<Period>(initialPeriod);

  const periodExpenses = useMemo(
    () => (period === "month" ? expenses.filter(isThisMonth) : expenses),
    [expenses, period],
  );

  const total = periodExpenses.reduce((s, e) => s + parseFloat(e.amount), 0);

  const sortedExpenses = useMemo(() => {
    return [...periodExpenses].sort((a, b) => compareBy(a, b, sort.key, sort.dir, (e, key) => {
      switch (key) {
        case "date": return new Date(e.expenseDate ?? e.createdAt).getTime();
        case "vendor": return e.vendorName;
        case "project": return e.projectName;
        case "submittedBy": return e.submittedByName;
        case "amount": return parseFloat(e.amount);
        case "tax": return e.taxAmount != null ? parseFloat(e.taxAmount) : null;
        case "status": return e.status;
      }
    }));
  }, [periodExpenses, sort]);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-extrabold text-[#121212] flex items-center gap-2">
            <Wallet className="h-5 w-5" style={{ color: "#D4AF37" }} />
            Company Expenses
          </h2>
          <p className="text-sm text-[#121212]/60 font-medium">
            Every submitted receipt across all projects, for tax, audit, and bookkeeping.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {!isLoading && expenses.length > 0 && (
            <div className="flex items-center rounded-full border border-[#D4AF37]/20 p-0.5">
              {(["month", "all"] as Period[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPeriod(p)}
                  className={`px-3 py-1 text-xs font-semibold rounded-full transition-colors ${
                    period === p ? "bg-[#D4AF37] text-white" : "text-[#121212]/60 hover:text-[#121212]"
                  }`}
                >
                  {p === "month" ? "This Month" : "All Time"}
                </button>
              ))}
            </div>
          )}
          {!isLoading && expenses.length > 0 && (
            <SortMenu options={SORT_OPTIONS} value={sort} onChange={setSort} />
          )}
          {!isLoading && expenses.length > 0 && (
            <p className="text-sm font-bold text-[#121212] whitespace-nowrap">Total: {formatCurrency(total)}</p>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="py-16 text-center text-[#121212]/60 animate-pulse font-medium">Loading expenses…</div>
      ) : expenses.length === 0 ? (
        <Card className="border-[#D4AF37]/20">
          <CardContent className="py-16 flex flex-col items-center gap-3 text-center">
            <Wallet className="h-10 w-10 text-[#D4AF37]/40" />
            <p className="text-[#121212]/60 font-medium">No expenses submitted yet.</p>
          </CardContent>
        </Card>
      ) : sortedExpenses.length === 0 ? (
        <Card className="border-[#D4AF37]/20">
          <CardContent className="py-16 flex flex-col items-center gap-3 text-center">
            <Wallet className="h-10 w-10 text-[#D4AF37]/40" />
            <p className="text-[#121212]/60 font-medium">No expenses submitted this month.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-[#D4AF37]/20">
          <table className="w-full text-sm">
            <thead className="bg-[#FAFAFA] border-b border-[#D4AF37]/20">
              <tr className="text-left text-xs font-semibold text-[#121212]/60 uppercase tracking-wide">
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Vendor</th>
                <th className="px-4 py-3">Project</th>
                <th className="px-4 py-3">Submitted By</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3 text-right">Tax</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Receipt</th>
              </tr>
            </thead>
            <tbody>
              {sortedExpenses.map((e) => (
                <tr key={e.id} className="border-b border-[#D4AF37]/10 last:border-0">
                  <td className="px-4 py-3 text-[#121212]/80 whitespace-nowrap">
                    {format(new Date(e.expenseDate ?? e.createdAt), "MMM d, yyyy")}
                  </td>
                  <td className="px-4 py-3 font-semibold text-[#121212]">{e.vendorName ?? "—"}</td>
                  <td className="px-4 py-3 text-[#121212]/80">{e.projectName}</td>
                  <td className="px-4 py-3 text-[#121212]/80">{e.submittedByName}</td>
                  <td className="px-4 py-3 text-right font-semibold text-[#121212]">{formatCurrency(e.amount)}</td>
                  <td className="px-4 py-3 text-right text-[#121212]/70">{e.taxAmount ? formatCurrency(e.taxAmount) : "—"}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-semibold ${
                        e.status === "processed" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      {e.status === "processed" ? "Processed" : "Pending Review"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {e.receiptObjectPath ? <ReceiptLink objectPath={e.receiptObjectPath} /> : <span className="text-[#121212]/40">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ReceiptLink({ objectPath }: { objectPath: string }) {
  const { toast } = useToast();
  const { open, isFetching } = useSignedDownload(objectPath);
  return (
    <button
      type="button"
      onClick={() => open((message) => toast({ title: message, variant: "destructive" }))}
      disabled={isFetching}
      className="flex items-center gap-1 text-xs text-[#D4AF37] font-medium hover:underline disabled:opacity-50"
    >
      {isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5" />}
      View
    </button>
  );
}
