import { useState } from "react";
import { Plus, FileSignature, Send, CheckCircle2, XCircle, Clock, DollarSign, ChevronRight, Search } from "lucide-react";

const GOLD = "#D4AF37";

const mockEstimates = [
  { id: 1, title: "Foundation Repair - 123 Main St", date: "Jan 15, 2026", items: 4, total: 12500 },
  { id: 2, title: "Roof Replacement - Oakville", date: "Jan 12, 2026", items: 8, total: 28500 },
  { id: 3, title: "Kitchen Renovation - Downtown", date: "Jan 10, 2026", items: 12, total: 42000 },
  { id: 4, title: "Deck Build - Mississauga", date: "Jan 8, 2026", items: 6, total: 18500 },
];

const mockProposals = [
  { id: 1, title: "Foundation Repair Proposal", client: "John Smith", status: "approved", total: 12500, date: "Jan 16, 2026" },
  { id: 2, title: "Roof Replacement Quote", client: "Sarah Chen", status: "sent", total: 28500, date: "Jan 14, 2026" },
  { id: 3, title: "Kitchen Reno Estimate", client: "Mike Johnson", status: "draft", total: 42000, date: "Jan 11, 2026" },
  { id: 4, title: "Deck Construction Bid", client: "Lisa Park", status: "rejected", total: 18500, date: "Jan 9, 2026" },
];

const STATUS_STYLES: Record<string, { label: string; bg: string; color: string; icon: React.ReactNode }> = {
  draft:    { label: "Draft",    bg: "#F3F4F6", color: "#6B7280", icon: <Clock size={14} /> },
  sent:     { label: "Sent",     bg: "#E0F2FE", color: "#0EA5E9", icon: <Send size={14} /> },
  approved: { label: "Approved", bg: "#DCFCE7", color: "#16A34A", icon: <CheckCircle2 size={14} /> },
  rejected: { label: "Rejected", bg: "#FEE2E2", color: "#DC2626", icon: <XCircle size={14} /> },
};

export function CardGrid() {
  const [view, setView] = useState<"estimates" | "proposals">("estimates");
  const [search, setSearch] = useState("");

  return (
    <div className="min-h-screen bg-[#FAFAFA] p-8">
      {/* Top bar */}
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-[#121212]">Proposals & Estimates</h1>
            <p className="text-sm text-gray-500 mt-1">Manage your construction bids and client proposals</p>
          </div>
          <button className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-[#121212]" style={{ background: GOLD }}>
            <Plus size={16} /> New Estimate
          </button>
        </div>

        {/* Controls row */}
        <div className="flex items-center gap-3 mb-6">
          <div className="flex rounded-lg border border-gray-200 overflow-hidden bg-white">
            <button onClick={() => setView("estimates")} className={`px-4 py-2 text-sm font-medium transition-colors ${view === "estimates" ? "text-[#121212] font-semibold" : "text-gray-500 hover:text-gray-700"}`} style={view === "estimates" ? { background: GOLD } : {}}>
              Estimates
            </button>
            <button onClick={() => setView("proposals")} className={`px-4 py-2 text-sm font-medium transition-colors ${view === "proposals" ? "text-[#121212] font-semibold" : "text-gray-500 hover:text-gray-700"}`} style={view === "proposals" ? { background: GOLD } : {}}>
              Proposals
            </button>
          </div>
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search..." className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 text-sm bg-white" />
          </div>
        </div>

        {/* Grid of cards */}
        {view === "estimates" ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {mockEstimates.map((e) => (
              <div key={e.id} className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow cursor-pointer group">
                <div className="flex items-start justify-between mb-3">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: `${GOLD}15` }}>
                    <FileSignature size={18} style={{ color: GOLD }} />
                  </div>
                  <ChevronRight size={16} className="text-gray-300 group-hover:text-gray-500 transition-colors" />
                </div>
                <h3 className="font-semibold text-[#121212] mb-1">{e.title}</h3>
                <p className="text-xs text-gray-500 mb-3">{e.date}</p>
                <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                  <span className="text-xs text-gray-500">{e.items} items</span>
                  <span className="font-bold text-[#121212]">${e.total.toLocaleString()}</span>
                </div>
              </div>
            ))}
            {/* Add new card */}
            <button className="rounded-xl border-2 border-dashed border-gray-200 p-5 flex flex-col items-center justify-center gap-2 text-gray-400 hover:border-gray-300 hover:text-gray-500 transition-colors min-h-[180px]">
              <Plus size={24} />
              <span className="text-sm font-medium">New Estimate</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {mockProposals.map((p) => {
              const s = STATUS_STYLES[p.status];
              return (
                <div key={p.id} className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow cursor-pointer group">
                  <div className="flex items-start justify-between mb-3">
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: s.bg }}>
                      <Send size={18} style={{ color: s.color }} />
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full flex items-center gap-1" style={{ background: s.bg, color: s.color }}>
                      {s.icon} {s.label}
                    </span>
                  </div>
                  <h3 className="font-semibold text-[#121212] mb-1">{p.title}</h3>
                  <p className="text-xs text-gray-500 mb-1">{p.client}</p>
                  <p className="text-xs text-gray-400 mb-3">{p.date}</p>
                  <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                    <span className="text-xs text-gray-500">Total</span>
                    <span className="font-bold text-[#121212] flex items-center gap-1"><DollarSign size={14} />{p.total.toLocaleString()}</span>
                  </div>
                </div>
              );
            })}
            <button className="rounded-xl border-2 border-dashed border-gray-200 p-5 flex flex-col items-center justify-center gap-2 text-gray-400 hover:border-gray-300 hover:text-gray-500 transition-colors min-h-[180px]">
              <Plus size={24} />
              <span className="text-sm font-medium">Convert from Estimate</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
