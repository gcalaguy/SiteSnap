import { useState } from "react";
import { useSearch } from "wouter";
import { Calculator, FileText, Receipt, Wallet, DollarSign } from "lucide-react";
import { useGetMe } from "@workspace/api-client-react";
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
        ? "border-[#D4AF37] text-[#D4AF37]"
        : "border-transparent text-[#121212]/60 hover:text-[#121212] hover:border-[#D4AF37]/30"
    }`;

  const subTabBtnClass = (active: boolean) =>
    `px-3 py-1.5 text-xs font-semibold rounded-full border transition-colors ${
      active
        ? "bg-[#D4AF37] text-white border-[#D4AF37]"
        : "bg-white text-[#121212]/60 border-[#D4AF37]/20 hover:border-[#D4AF37]/40"
    }`;

  return (
    <div className="flex flex-col min-h-full">
      {/* Main tab bar — industrial underline style, matches Safety & Compliance */}
      <div className="border-b border-[#D4AF37]/20 bg-white shrink-0 px-6">
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
        <div className="flex items-center gap-2 px-6 py-2.5 border-b border-[#D4AF37]/10 bg-[#FAFAFA] shrink-0">
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
        {tab === "expenses" && canViewExpenses && <CompanyExpensesPage />}
        {tab === "payments" && canViewPayments && <PaymentsChangeOrdersPage />}
      </div>
    </div>
  );
}
