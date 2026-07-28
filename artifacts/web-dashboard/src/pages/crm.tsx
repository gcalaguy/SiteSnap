import { useState } from "react";
import { useSearch } from "wouter";
import { TrendingUp, BookUser } from "lucide-react";
import Leads from "@/pages/leads";
import Contacts from "@/pages/contacts";

// Consolidated CRM hub: early-stage pursuits vs. the permanent directory.
// Deep-linkable via /crm?tab=leads|directory
type Tab = "leads" | "directory";

export default function CrmPage() {
  const search = useSearch();
  const requestedTab = new URLSearchParams(search).get("tab");

  const [tab, setTab] = useState<Tab>(() => (requestedTab === "directory" ? "directory" : "leads"));

  const tabBtnClass = (active: boolean) =>
    `flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-colors ${
      active
        ? "border-primary text-primary"
        : "border-transparent text-foreground/60 hover:text-foreground hover:border-primary/30"
    }`;

  return (
    <div className="flex flex-col min-h-full">
      {/* Underline tab bar */}
      <div className="border-b border-primary/20 bg-card shrink-0 px-6">
        <div className="flex gap-0 -mb-px">
          <button className={tabBtnClass(tab === "leads")} onClick={() => setTab("leads")}>
            <TrendingUp className="h-4 w-4" />
            Active Leads
          </button>
          <button className={tabBtnClass(tab === "directory")} onClick={() => setTab("directory")}>
            <BookUser className="h-4 w-4" />
            Directory
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1">
        {tab === "leads" && <Leads />}
        {tab === "directory" && <Contacts />}
      </div>
    </div>
  );
}
