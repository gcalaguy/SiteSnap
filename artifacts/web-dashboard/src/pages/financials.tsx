import { useState } from "react";
import { Link, useSearch } from "wouter";
import { Calculator, FileText, Receipt, Wallet, DollarSign, TrendingUp, AlertTriangle } from "lucide-react";
import { useGetMe, useGetDashboardSummary } from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/format";
import { FeatureGuard } from "@/components/FeatureGuard";
import EstimatesPage from "@/pages/estimates";
import ProposalsPage from "@/pages/proposals";
import QuotesPage from "@/pages/quotes";
import InvoicesPage from "@/pages/invoices";
import PaymentsChangeOrdersPage from "@/pages/payments-change-orders";
import CompanyExpensesPage from "@/pages/company-expenses";

// Consolidated pre-construction & billing lifecycle hub:
//   Estimates & Proposals  ->  Quotes  ->  Invoices  ->  Expenses  ->  Payments & Change Orders
// Deep-linkable via /financials?tab=estimating|quotes|invoices|expenses|payments&sub=estimates|proposals
type MainTab = "estimating" | "quotes" | "invoices" | "expenses" | "payments";
type EstimatingSubTab = "estimates" | "proposals";

export default function FinancialsHubPage() {
  const { data: me } = useGetMe();
  const { data: summary } = useGetDashboardSummary();
  const search = useSearch();
  const isOwnerOrForeman = me?.role === "owner" || me?.role === "foreman";
  const hasPerm = (key: string): boolean => {
    if (!me?.permissions) return true;
    return (me.permissions as Record<string, boolean>)[key] !== false;
  };

  const canViewEstimates = hasPerm("viewEstimator");
  const canViewProposals = isOwnerOrForeman;
  const canViewQuotes = hasPerm("viewQuotes");
  const canViewInvoices = hasPerm("viewFinancials");
  const canViewPayments = isOwnerOrForeman;
  const canViewExpenses = hasPerm("viewFinancials");

  const canViewEstimating = canViewEstimates || canViewProposals;

  const params = new URLSearchParams(search);
  const requestedTab = params.get("tab");
  const requestedSub = params.get("sub");
  const requestedPeriod = params.get("period");

  const [tab, setTab] = useState<MainTab>(() => {
    if (requestedTab === "quotes" && canViewQuotes) return "quotes";
    if ((requestedTab === "invoices" || requestedSub === "invoices") && canViewInvoices) return "invoices";
    if (requestedTab === "expenses" && canViewExpenses) return "expenses";
    if ((requestedTab === "payments" || requestedSub === "payments") && canViewPayments) return "payments";
    if (requestedTab === "estimating" && canViewEstimating) return "estimating";
    return canViewEstimating ? "estimating" : canViewQuotes ? "quotes" : canViewInvoices ? "invoices" : canViewExpenses ? "expenses" : "payments";
  });
  const [estimatingSubTab, setEstimatingSubTab] = useState<EstimatingSubTab>(() => {
    if (requestedSub === "proposals" && canViewProposals) return "proposals";
    if (requestedSub === "estimates" && canViewEstimates) return "estimates";
    return canViewEstimates ? "estimates" : "proposals";
  });

  const tabBtnClass = (active: boolean) =>
    `flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-colors ${
      active
        ? "border-primary text-primary"
        : "border-transparent text-foreground/60 hover:text-foreground hover:border-primary/30"
    }`;

  const subTabBtnClass = (active: boolean) =>
    `px-3 py-1.5 text-xs font-semibold rounded-full border transition-colors ${
      active
        ? "bg-primary text-primary-foreground border-primary"
        : "bg-card text-foreground/60 border-primary/20 hover:border-primary/40"
    }`;

  const overdueInvoices = summary?.overdueInvoices ?? 0;

  return (
    <div className="flex flex-col min-h-full">
      {/* KPI strip — Revenue Pipeline / Overdue Invoices / This Month's Spend.
          Same three figures as the Dashboard's Financials section; this hub is their drill-down. */}
      {isOwnerOrForeman && summary && (
        <div className="grid grid-cols-3 gap-3 p-6 pb-4">
          <Link href="/crm?tab=leads" className="block">
            <Card className="flex items-center gap-3 px-4 py-3 border-border/60 shadow-sm cursor-pointer transition-all hover:shadow-md hover:border-border">
              <div className="flex items-center justify-center h-9 w-9 rounded-lg shrink-0 bg-primary/15 text-primary">
                <TrendingUp className="h-4.5 w-4.5" />
              </div>
              <div className="min-w-0">
                <p className="text-xl font-bold leading-tight text-foreground">{formatCurrency(summary.revenuePipeline ?? 0, { maximumFractionDigits: 0 })}</p>
                <p className="text-xs text-muted-foreground truncate">Revenue Pipeline</p>
              </div>
            </Card>
          </Link>
          {canViewInvoices && (
            <Card
              onClick={() => setTab("invoices")}
              className={cn(
                "flex items-center gap-3 px-4 py-3 border-border/60 shadow-sm cursor-pointer transition-all hover:shadow-md hover:border-border",
                tab === "invoices" && "ring-1 ring-primary/30 border-primary/30",
                overdueInvoices > 0 && "border-destructive/30",
              )}
            >
              <div className={cn(
                "flex items-center justify-center h-9 w-9 rounded-lg shrink-0",
                overdueInvoices > 0 ? "bg-destructive/15 text-destructive" : "bg-primary/15 text-primary",
              )}>
                {overdueInvoices > 0 ? <AlertTriangle className="h-4.5 w-4.5" /> : <DollarSign className="h-4.5 w-4.5" />}
              </div>
              <div className="min-w-0">
                <p className={cn("text-xl font-bold leading-tight", overdueInvoices > 0 ? "text-destructive" : "text-foreground")}>
                  {overdueInvoices > 0 ? formatCurrency(summary.overdueInvoiceAmount ?? 0, { maximumFractionDigits: 0 }) : "All clear"}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {overdueInvoices > 0 ? `${overdueInvoices} overdue invoice${overdueInvoices !== 1 ? "s" : ""}` : "Overdue Invoices"}
                </p>
              </div>
            </Card>
          )}
          {canViewExpenses && (
            <Card
              onClick={() => setTab("expenses")}
              className={cn(
                "flex items-center gap-3 px-4 py-3 border-border/60 shadow-sm cursor-pointer transition-all hover:shadow-md hover:border-border",
                tab === "expenses" && "ring-1 ring-primary/30 border-primary/30",
              )}
            >
              <div className="flex items-center justify-center h-9 w-9 rounded-lg shrink-0 bg-primary/15 text-primary">
                <Wallet className="h-4.5 w-4.5" />
              </div>
              <div className="min-w-0">
                <p className="text-xl font-bold leading-tight text-foreground">{formatCurrency(summary.totalSpentThisMonth ?? 0, { maximumFractionDigits: 0 })}</p>
                <p className="text-xs text-muted-foreground truncate">This Month's Spend</p>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* Main tab bar — industrial underline style, matches Safety & Compliance */}
      <div className="border-b border-primary/20 bg-card shrink-0 px-6">
        <div className="flex gap-0 -mb-px">
          {canViewEstimating && (
            <button className={tabBtnClass(tab === "estimating")} onClick={() => setTab("estimating")}>
              <Calculator className="h-4 w-4" />
              Estimates & Proposals
            </button>
          )}
          {canViewQuotes && (
            <button className={tabBtnClass(tab === "quotes")} onClick={() => setTab("quotes")}>
              <FileText className="h-4 w-4" />
              Quotes
            </button>
          )}
          {canViewInvoices && (
            <button className={tabBtnClass(tab === "invoices")} onClick={() => setTab("invoices")}>
              <Receipt className="h-4 w-4" />
              Invoices
            </button>
          )}
          {canViewExpenses && (
            <button className={tabBtnClass(tab === "expenses")} onClick={() => setTab("expenses")}>
              <Wallet className="h-4 w-4" />
              Expenses
            </button>
          )}
          {canViewPayments && (
            <button className={tabBtnClass(tab === "payments")} onClick={() => setTab("payments")}>
              <DollarSign className="h-4 w-4" />
              Payments & Change Orders
            </button>
          )}
        </div>
      </div>

      {/* Secondary dense segment for tabs that house two lifecycle phases */}
      {tab === "estimating" && canViewEstimates && canViewProposals && (
        <div className="flex items-center gap-2 px-6 py-2.5 border-b border-primary/10 bg-muted/40 shrink-0">
          <button className={subTabBtnClass(estimatingSubTab === "estimates")} onClick={() => setEstimatingSubTab("estimates")}>
            Estimates
          </button>
          <button className={subTabBtnClass(estimatingSubTab === "proposals")} onClick={() => setEstimatingSubTab("proposals")}>
            Proposals
          </button>
        </div>
      )}

      {/* Content */}
      <div className="flex-1">
        {tab === "estimating" && (
          <>
            {estimatingSubTab === "estimates" && canViewEstimates && <EstimatesPage />}
            {estimatingSubTab === "proposals" && canViewProposals && (
              <FeatureGuard feature="PROPOSALS">
                <ProposalsPage />
              </FeatureGuard>
            )}
          </>
        )}
        {tab === "quotes" && canViewQuotes && <QuotesPage />}
        {tab === "invoices" && canViewInvoices && <InvoicesPage />}
        {tab === "expenses" && canViewExpenses && (
          <CompanyExpensesPage initialPeriod={requestedPeriod === "month" ? "month" : "all"} />
        )}
        {tab === "payments" && canViewPayments && <PaymentsChangeOrdersPage />}
      </div>
    </div>
  );
}
