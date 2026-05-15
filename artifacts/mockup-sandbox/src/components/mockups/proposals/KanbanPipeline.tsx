import { useState } from "react";
import { Plus, FileSignature, Send, CheckCircle2, XCircle, Clock, DollarSign, ChevronRight } from "lucide-react";

const GOLD = "#D4AF37";
const BLACK = "#121212";

const columns = [
  { key: "draft", label: "Draft Estimates", color: "#6B7280", icon: <Clock size={14} /> },
  { key: "sent", label: "Sent / Awaiting", color: "#0EA5E9", icon: <Send size={14} /> },
  { key: "approved", label: "Approved", color: "#16A34A", icon: <CheckCircle2 size={14} /> },
  { key: "rejected", label: "Rejected", color: "#DC2626", icon: <XCircle size={14} /> },
];

const cards = [
  { id: 1, title: "Foundation Repair", client: "John Smith", total: 12500, status: "approved", items: 4 },
  { id: 2, title: "Roof Replacement", client: "Sarah Chen", total: 28500, status: "sent", items: 8 },
  { id: 3, title: "Kitchen Renovation", client: "Mike Johnson", total: 42000, status: "draft", items: 12 },
  { id: 4, title: "Deck Build", client: "Lisa Park", total: 18500, status: "rejected", items: 6 },
  { id: 5, title: "Bathroom Remodel", client: "Tom Wilson", total: 22000, status: "sent", items: 9 },
  { id: 6, title: "Garage Extension", client: "Emma Davis", total: 35000, status: "draft", items: 7 },
];

export function KanbanPipeline() {
  const [activeCol, setActiveCol] = useState<string | null>(null);

  return (
    <div className="min-h-screen bg-[#FAFAFA] p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-[#121212]">Proposal Pipeline</h1>
            <p className="text-sm text-gray-500 mt-1">Drag proposals through stages or click to manage</p>
          </div>
          <button className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-[#121212]" style={{ background: GOLD }}>
            <Plus size={16} /> New Estimate
          </button>
        </div>

        {/* Pipeline columns */}
        <div className="grid grid-cols-4 gap-4">
          {columns.map((col) => {
            const colCards = cards.filter((c) => c.status === col.key);
            const isActive = activeCol === col.key;
            return (
              <div key={col.key} className="flex flex-col">
                {/* Column header */}
                <div
                  className="flex items-center gap-2 px-3 py-2 rounded-t-lg cursor-pointer transition-colors"
                  style={{ background: isActive ? `${col.color}15` : "#fff", borderBottom: `2px solid ${col.color}` }}
                  onClick={() => setActiveCol(isActive ? null : col.key)}
                >
                  <span style={{ color: col.color }}>{col.icon}</span>
                  <span className="text-sm font-semibold text-[#121212]">{col.label}</span>
                  <span className="ml-auto text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: `${col.color}20`, color: col.color }}>
                    {colCards.length}
                  </span>
                </div>

                {/* Cards */}
                <div className="flex-1 bg-white rounded-b-lg border border-t-0 border-gray-200 p-2 space-y-2 min-h-[300px]">
                  {colCards.map((card) => (
                    <div key={card.id} className="rounded-lg border border-gray-100 p-3 hover:shadow-sm transition-shadow cursor-pointer bg-white hover:bg-gray-50">
                      <div className="flex items-start justify-between mb-1">
                        <h4 className="text-sm font-semibold text-[#121212] truncate">{card.title}</h4>
                        <ChevronRight size={14} className="text-gray-300 flex-shrink-0" />
                      </div>
                      <p className="text-xs text-gray-500 mb-2">{card.client}</p>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-400">{card.items} items</span>
                        <span className="text-sm font-bold text-[#121212]">${card.total.toLocaleString()}</span>
                      </div>
                    </div>
                  ))}
                  {colCards.length === 0 && (
                    <div className="text-center py-8 text-xs text-gray-300">No items</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Quick summary bar */}
        <div className="mt-6 grid grid-cols-4 gap-4">
          {[
            { label: "Total Pipeline", value: "$156,000", icon: <DollarSign size={16} /> },
            { label: "Win Rate", value: "25%", icon: <CheckCircle2 size={16} /> },
            { label: "Avg. Deal", value: "$26,000", icon: <FileSignature size={16} /> },
            { label: "Pending", value: "2 deals", icon: <Clock size={16} /> },
          ].map((stat) => (
            <div key={stat.label} className="bg-white rounded-lg border border-gray-200 p-4 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${GOLD}15` }}>
                <span style={{ color: GOLD }}>{stat.icon}</span>
              </div>
              <div>
                <p className="text-xs text-gray-500">{stat.label}</p>
                <p className="text-lg font-bold text-[#121212]">{stat.value}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
