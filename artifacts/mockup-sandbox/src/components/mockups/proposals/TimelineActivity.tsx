import { useState } from "react";
import { Plus, FileSignature, Send, CheckCircle2, XCircle, Clock, DollarSign, ChevronDown, ChevronUp } from "lucide-react";

const GOLD = "#D4AF37";

const timeline = [
  {
    date: "Today",
    events: [
      { id: 1, type: "proposal", title: "Foundation Repair Proposal", client: "John Smith", action: "approved", amount: 12500, time: "2:30 PM" },
      { id: 2, type: "estimate", title: "New Estimate Created", client: "Bathroom Remodel", action: "created", amount: 22000, time: "10:15 AM" },
    ],
  },
  {
    date: "Yesterday",
    events: [
      { id: 3, type: "proposal", title: "Roof Replacement Quote", client: "Sarah Chen", action: "sent", amount: 28500, time: "4:00 PM" },
      { id: 4, type: "proposal", title: "Deck Construction Bid", client: "Lisa Park", action: "rejected", amount: 18500, time: "11:30 AM" },
    ],
  },
  {
    date: "Jan 10",
    events: [
      { id: 5, type: "estimate", title: "Kitchen Renovation", client: "Mike Johnson", action: "created", amount: 42000, time: "9:00 AM" },
      { id: 6, type: "proposal", title: "Garage Extension", client: "Emma Davis", action: "draft", amount: 35000, time: "Jan 10" },
    ],
  },
];

const ACTION_CONFIG: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  approved: { label: "Approved", color: "#16A34A", bg: "#DCFCE7", icon: <CheckCircle2 size={14} /> },
  sent:     { label: "Sent",     color: "#0EA5E9", bg: "#E0F2FE", icon: <Send size={14} /> },
  rejected: { label: "Rejected", color: "#DC2626", bg: "#FEE2E2", icon: <XCircle size={14} /> },
  draft:    { label: "Draft",    color: "#6B7280", bg: "#F3F4F6", icon: <Clock size={14} /> },
  created:  { label: "Created",  color: "#D4AF37", bg: "#FEF9E7", icon: <FileSignature size={14} /> },
};

export function TimelineActivity() {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  return (
    <div className="min-h-screen bg-[#FAFAFA] p-8">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-[#121212]">Activity Timeline</h1>
            <p className="text-sm text-gray-500 mt-1">Chronological view of all estimates and proposals</p>
          </div>
          <button className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-[#121212]" style={{ background: GOLD }}>
            <Plus size={16} /> New
          </button>
        </div>

        {/* Timeline */}
        <div className="relative">
          {/* Vertical line */}
          <div className="absolute left-6 top-0 bottom-0 w-px bg-gray-200" />

          {timeline.map((day) => (
            <div key={day.date} className="mb-8">
              {/* Date label */}
              <div className="flex items-center gap-3 mb-4">
                <div className="w-3 h-3 rounded-full bg-white border-2 border-gray-300 relative z-10" />
                <span className="text-xs font-bold uppercase tracking-wider text-gray-400">{day.date}</span>
              </div>

              {/* Events */}
              <div className="space-y-3 ml-10">
                {day.events.map((event) => {
                  const cfg = ACTION_CONFIG[event.action];
                  const isExpanded = expanded[event.id];
                  return (
                    <div key={event.id} className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-sm transition-shadow">
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: cfg.bg }}>
                          <span style={{ color: cfg.color }}>{cfg.icon}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="text-sm font-semibold text-[#121212]">{event.title}</h4>
                            <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full" style={{ background: cfg.bg, color: cfg.color }}>
                              {cfg.label}
                            </span>
                          </div>
                          <p className="text-xs text-gray-500">{event.client} · {event.time}</p>

                          {isExpanded && (
                            <div className="mt-3 pt-3 border-t border-gray-100 flex items-center gap-4">
                              <div className="text-sm font-bold text-[#121212] flex items-center gap-1">
                                <DollarSign size={14} />{event.amount.toLocaleString()}
                              </div>
                              <div className="flex gap-2">
                                <button className="text-xs text-gray-500 hover:text-gray-700 underline">View details</button>
                                <button className="text-xs text-gray-500 hover:text-gray-700 underline">Duplicate</button>
                              </div>
                            </div>
                          )}
                        </div>
                        <button onClick={() => setExpanded({ ...expanded, [event.id]: !isExpanded })} className="text-gray-300 hover:text-gray-500 transition-colors">
                          {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
