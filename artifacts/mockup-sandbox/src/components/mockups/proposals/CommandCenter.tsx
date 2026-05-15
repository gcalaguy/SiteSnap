import { useState } from "react";
import { Plus, FileSignature, Send, CheckCircle2, XCircle, Clock, DollarSign, Search, Filter, ChevronRight, TrendingUp, Users, Calendar } from "lucide-react";

const GOLD = "#D4AF37";
const BLACK = "#121212";

const rows = [
  { id: 1, title: "Foundation Repair - 123 Main St", type: "estimate", status: "draft", client: "", amount: 12500, date: "Jan 15", items: 4 },
  { id: 2, title: "Roof Replacement - Oakville", type: "proposal", status: "sent", client: "Sarah Chen", amount: 28500, date: "Jan 14", items: 8 },
  { id: 3, title: "Kitchen Renovation - Downtown", type: "estimate", status: "draft", client: "", amount: 42000, date: "Jan 10", items: 12 },
  { id: 4, title: "Deck Build - Mississauga", type: "proposal", status: "rejected", client: "Lisa Park", amount: 18500, date: "Jan 9", items: 6 },
  { id: 5, title: "Bathroom Remodel - North York", type: "proposal", status: "sent", client: "Tom Wilson", amount: 22000, date: "Jan 8", items: 9 },
  { id: 6, title: "Garage Extension - Brampton", type: "estimate", status: "draft", client: "", amount: 35000, date: "Jan 7", items: 7 },
  { id: 7, title: "Fence Installation - Etobicoke", type: "proposal", status: "approved", client: "John Smith", amount: 8900, date: "Jan 6", items: 3 },
];

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  draft:    { label: "Draft",    color: "#6B7280", bg: "#F3F4F6", icon: <Clock size={11} /> },
  sent:     { label: "Sent",     color: "#0EA5E9", bg: "#E0F2FE", icon: <Send size={11} /> },
  approved: { label: "Approved", color: "#16A34A", bg: "#DCFCE7", icon: <CheckCircle2 size={11} /> },
  rejected: { label: "Rejected", color: "#DC2626", bg: "#FEE2E2", icon: <XCircle size={11} /> },
};

export function CommandCenter() {
  const [filter, setFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const filtered = rows.filter((r) => {
    if (filter !== "all" && r.status !== filter) return false;
    if (search && !r.title.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="min-h-screen bg-[#FAFAFA] p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-[#121212]">Command Center</h1>
            <p className="text-sm text-gray-500 mt-1">All proposals and estimates at a glance</p>
          </div>
          <button className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-[#121212]" style={{ background: GOLD }}>
            <Plus size={16} /> New Estimate
          </button>
        </div>

        {/* KPI row */}
        <div className="grid grid-cols-5 gap-3 mb-6">
          {[
            { label: "Pipeline Value", value: "$166,900", icon: <DollarSign size={16} />, trend: "+12%" },
            { label: "Active Proposals", value: "4", icon: <Send size={16} /> },
            { label: "Approved", value: "1", icon: <CheckCircle2 size={16} />, trend: "25%" },
            { label: "Draft Estimates", value: "3", icon: <FileSignature size={16} /> },
            { label: "Clients", value: "5", icon: <Users size={16} /> },
          ].map((kpi) => (
            <div key={kpi.label} className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-6 h-6 rounded flex items-center justify-center" style={{ background: `${GOLD}15` }}>
                  <span style={{ color: GOLD }}>{kpi.icon}</span>
                </div>
                {kpi.trend && (
                  <span className="text-[10px] font-semibold text-green-600 flex items-center gap-0.5">
                    <TrendingUp size={10} /> {kpi.trend}
                  </span>
                )}
              </div>
              <p className="text-xl font-bold text-[#121212]">{kpi.value}</p>
              <p className="text-[10px] text-gray-400 uppercase tracking-wider mt-1">{kpi.label}</p>
            </div>
          ))}
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search proposals and estimates..." className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 text-sm bg-white" />
          </div>
          <div className="flex items-center gap-1 bg-white rounded-lg border border-gray-200 p-1">
            {["all", "draft", "sent", "approved", "rejected"].map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium capitalize transition-colors ${filter === f ? "text-[#121212] font-semibold" : "text-gray-500 hover:text-gray-700"}`}
                style={filter === f ? { background: GOLD } : {}}
              >
                {f}
              </button>
            ))}
          </div>
          <button className="flex items-center gap-1 px-3 py-2 rounded-lg border border-gray-200 bg-white text-xs text-gray-500 hover:text-gray-700">
            <Filter size={14} /> More
          </button>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Title</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Type</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Status</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Client</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Amount</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Date</th>
                <th className="px-4 py-3 w-10" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => {
                const s = STATUS_CONFIG[row.status];
                return (
                  <tr key={row.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors cursor-pointer group">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-md flex items-center justify-center" style={{ background: row.type === "estimate" ? "#F3F4F6" : `${GOLD}15` }}>
                          {row.type === "estimate" ? <FileSignature size={13} className="text-gray-500" /> : <Send size={13} style={{ color: GOLD }} />}
                        </div>
                        <span className="text-sm font-medium text-[#121212]">{row.title}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-gray-500 capitalize">{row.type}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase px-2 py-1 rounded-full" style={{ background: s.bg, color: s.color }}>
                        {s.icon} {s.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">{row.client || "—"}</td>
                    <td className="px-4 py-3 text-right text-sm font-semibold text-[#121212]">${row.amount.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right text-xs text-gray-400">{row.date}</td>
                    <td className="px-4 py-3">
                      <ChevronRight size={14} className="text-gray-300 group-hover:text-gray-500 transition-colors" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="text-center py-12 text-sm text-gray-400">No results match your filters</div>
          )}
        </div>
      </div>
    </div>
  );
}
