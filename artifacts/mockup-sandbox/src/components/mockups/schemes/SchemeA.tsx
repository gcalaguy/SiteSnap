import { Briefcase, FileText, MessageSquare, Users, Wind, Droplets, MapPin, Cloud, Activity } from "lucide-react";

const stats = [
  { label: "Active Projects", value: "4", sub: "4 total · 0 completed", icon: Briefcase },
  { label: "Reports This Week", value: "15", sub: "Daily reports submitted", icon: FileText },
  { label: "Open RFIs", value: "2", sub: "Awaiting response", icon: MessageSquare },
  { label: "Team Members", value: "3", sub: "Active in workspace", icon: Users },
];

const activity = [
  { text: 'Task "driveway" assigned to guy cala', meta: "guy cala · basement · May 4, 8:46 AM" },
  { text: "Today we had three crew on site. The weather was rainy and cold, but we ended up getting the work do…", meta: "guy cala · 123 Basement · May 4, 8:11 AM" },
  { text: 'Task "atdaf" assigned to guy cala', meta: "guy cala · basement · May 4, 1:46 AM" },
  { text: 'guy cala scheduled on "123 Basement" from 2026-05-07 to 2026-05-12', meta: "guy cala · 123 Basement · May 4, 1:40 AM" },
  { text: "RFI RFI-001: RFI – Clarification Required for Deck Scope, Design, and Construction Requirements", meta: "gcalandra · 2344 · May 4, 12:02 AM" },
];

export function SchemeA() {
  return (
    <div className="min-h-screen flex" style={{ background: "#f1f5f9", fontFamily: "Inter, sans-serif" }}>
      {/* Sidebar */}
      <aside style={{ width: 220, background: "#0f172a", flexShrink: 0 }} className="flex flex-col pt-6 px-4">
        <div className="mb-8">
          <div style={{ color: "#3b82f6", fontWeight: 700, fontSize: 18 }}>Site Snap</div>
          <div style={{ color: "#64748b", fontSize: 11, marginTop: 2 }}>Construction AI</div>
        </div>
        {["Dashboard", "Projects", "Quotes", "Reports", "RFIs", "Schedule", "Settings"].map((item, i) => (
          <div key={item} style={{
            padding: "9px 12px", borderRadius: 6, marginBottom: 2, fontSize: 13, cursor: "pointer",
            background: i === 0 ? "#1e3a5f" : "transparent",
            color: i === 0 ? "#93c5fd" : "#94a3b8",
            fontWeight: i === 0 ? 600 : 400,
          }}>{item}</div>
        ))}
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto p-6">
        <div style={{ marginBottom: 20 }}>
          <h1 style={{ fontWeight: 700, fontSize: 22, color: "#0f172a" }}>Dashboard</h1>
          <p style={{ color: "#64748b", fontSize: 13, marginTop: 2 }}>Welcome back. Here's what's happening today.</p>
        </div>

        {/* Stat cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 20 }}>
          {stats.map(({ label, value, sub, icon: Icon }) => (
            <div key={label} style={{ background: "#fff", borderRadius: 10, padding: "16px 18px", boxShadow: "0 1px 4px rgba(0,0,0,0.07)", border: "1px solid #e2e8f0" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                <span style={{ fontSize: 12, color: "#64748b", fontWeight: 500 }}>{label}</span>
                <Icon size={16} color="#3b82f6" />
              </div>
              <div style={{ fontSize: 28, fontWeight: 700, color: "#0f172a" }}>{value}</div>
              <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>{sub}</div>
            </div>
          ))}
        </div>

        {/* Bottom row */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 14 }}>
          {/* Recent Activity */}
          <div style={{ background: "#fff", borderRadius: 10, padding: "18px 20px", boxShadow: "0 1px 4px rgba(0,0,0,0.07)", border: "1px solid #e2e8f0" }}>
            <h2 style={{ fontWeight: 700, fontSize: 14, color: "#0f172a", marginBottom: 14 }}>Recent Activity</h2>
            {activity.map((a, i) => (
              <div key={i} style={{ display: "flex", gap: 12, padding: "10px 0", borderBottom: i < activity.length - 1 ? "1px solid #f1f5f9" : "none" }}>
                <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#eff6ff", border: "1px solid #bfdbfe", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Activity size={13} color="#3b82f6" />
                </div>
                <div>
                  <p style={{ fontSize: 13, color: "#1e293b", lineHeight: 1.4 }}>{a.text}</p>
                  <p style={{ fontSize: 11, color: "#94a3b8", marginTop: 3 }}>{a.meta}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Right column */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {/* Weather */}
            <div style={{ background: "#fff", borderRadius: 10, padding: "18px 20px", boxShadow: "0 1px 4px rgba(0,0,0,0.07)", border: "1px solid #e2e8f0" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, color: "#3b82f6", fontSize: 13, fontWeight: 600 }}>
                <Cloud size={14} /> Job Site Weather
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ fontSize: 28, fontWeight: 700, color: "#0f172a" }}>15°C</div>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13, fontWeight: 600, color: "#1e293b" }}>
                    <MapPin size={11} color="#3b82f6" /> King, Ontario
                  </div>
                  <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>Partly Cloudy</div>
                  <div style={{ display: "flex", gap: 10, marginTop: 6, fontSize: 11, color: "#94a3b8" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 3 }}><Wind size={10} /> 19 km/h</span>
                    <span style={{ display: "flex", alignItems: "center", gap: 3 }}><Droplets size={10} /> 66%</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Actions */}
            <div style={{ background: "#fff", borderRadius: 10, padding: "18px 20px", boxShadow: "0 1px 4px rgba(0,0,0,0.07)", border: "1px solid #e2e8f0" }}>
              <h2 style={{ fontWeight: 700, fontSize: 14, color: "#0f172a", marginBottom: 10 }}>Quick Actions</h2>
              <div style={{ background: "#f8fafc", borderRadius: 7, padding: "12px 14px", fontSize: 12, color: "#64748b", border: "1px solid #e2e8f0" }}>
                Navigate to a specific project to create daily reports, submit RFIs, or analyze costs.
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
