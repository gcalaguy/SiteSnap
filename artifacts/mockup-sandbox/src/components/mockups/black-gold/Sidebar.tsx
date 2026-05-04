import {
  Home,
  FolderKanban,
  FileText,
  Receipt,
  MessageSquare,
  ShieldCheck,
  Settings,
  Bell,
  ChevronRight,
  Hammer,
  Users,
  BarChart3,
} from "lucide-react";
import { useState } from "react";

const GOLD = "#D4AF37";
const BLACK = "#0A0A0A";
const SURFACE = "#141414";
const SURFACE2 = "#1C1C1C";
const BORDER = "#2A2200";

const navItems = [
  { icon: Home, label: "Dashboard", badge: null, active: true },
  { icon: FolderKanban, label: "Projects", badge: "4", active: false },
  { icon: FileText, label: "Estimates", badge: null, active: false },
  { icon: Receipt, label: "Invoices", badge: "2", active: false },
  { icon: Users, label: "Team", badge: null, active: false },
  { icon: BarChart3, label: "Reports", badge: null, active: false },
  { icon: MessageSquare, label: "AI Chat", badge: null, active: false },
  { icon: ShieldCheck, label: "Safety", badge: "1", active: false },
];

const bottomItems = [
  { icon: Bell, label: "Notifications", badge: "3" },
  { icon: Settings, label: "Settings", badge: null },
];

export function Sidebar() {
  const [active, setActive] = useState("Dashboard");

  return (
    <div
      className="flex items-center justify-center min-h-screen"
      style={{ background: "#1a1a1a" }}
    >
      <div
        className="flex flex-col h-[720px] relative overflow-hidden"
        style={{
          width: 260,
          background: BLACK,
          borderRight: `1px solid ${BORDER}`,
          fontFamily: "'Inter', sans-serif",
        }}
      >
        {/* Subtle gold glow top-left */}
        <div
          style={{
            position: "absolute",
            top: -60,
            left: -60,
            width: 200,
            height: 200,
            background: `radial-gradient(circle, ${GOLD}18 0%, transparent 70%)`,
            pointerEvents: "none",
          }}
        />

        {/* Logo */}
        <div
          className="flex items-center gap-3 px-5 py-5"
          style={{ borderBottom: `1px solid ${BORDER}` }}
        >
          <div
            className="flex items-center justify-center rounded-lg"
            style={{
              width: 36,
              height: 36,
              background: `linear-gradient(135deg, ${GOLD}33 0%, ${GOLD}11 100%)`,
              border: `1px solid ${GOLD}55`,
            }}
          >
            <Hammer size={18} style={{ color: GOLD }} />
          </div>
          <div>
            <span
              className="font-bold text-base tracking-tight"
              style={{ color: "#FFFFFF" }}
            >
              Site
            </span>
            <span
              className="font-bold text-base tracking-tight"
              style={{ color: GOLD }}
            >
              Snap
            </span>
          </div>
          <div
            className="ml-auto text-xs font-semibold px-2 py-0.5 rounded"
            style={{
              background: `${GOLD}18`,
              color: GOLD,
              border: `1px solid ${GOLD}33`,
              fontSize: 10,
            }}
          >
            PRO
          </div>
        </div>

        {/* Company */}
        <div className="px-4 py-3">
          <div
            className="flex items-center gap-2 rounded-lg px-3 py-2 cursor-pointer"
            style={{ background: SURFACE, border: `1px solid ${BORDER}` }}
          >
            <div
              className="rounded-md flex items-center justify-center text-xs font-bold"
              style={{
                width: 28,
                height: 28,
                background: `${GOLD}22`,
                color: GOLD,
                border: `1px solid ${GOLD}44`,
              }}
            >
              RC
            </div>
            <div className="flex-1 min-w-0">
              <p
                className="text-xs font-semibold truncate"
                style={{ color: "#FFFFFF" }}
              >
                Riley Construction
              </p>
              <p className="text-xs" style={{ color: "#666" }}>
                Owner
              </p>
            </div>
            <ChevronRight size={14} style={{ color: "#555" }} />
          </div>
        </div>

        {/* Section label */}
        <div className="px-5 pb-1">
          <p className="text-xs font-semibold tracking-widest uppercase" style={{ color: "#444" }}>
            Menu
          </p>
        </div>

        {/* Nav Items */}
        <nav className="flex-1 px-3 overflow-y-auto space-y-0.5">
          {navItems.map(({ icon: Icon, label, badge }) => {
            const isActive = active === label;
            return (
              <button
                key={label}
                onClick={() => setActive(label)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all duration-150 group relative"
                style={{
                  background: isActive ? `${GOLD}18` : "transparent",
                  border: isActive ? `1px solid ${GOLD}33` : "1px solid transparent",
                  cursor: "pointer",
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    (e.currentTarget as HTMLElement).style.background = "#1C1C1C";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    (e.currentTarget as HTMLElement).style.background = "transparent";
                  }
                }}
              >
                {isActive && (
                  <div
                    style={{
                      position: "absolute",
                      left: 0,
                      top: "20%",
                      height: "60%",
                      width: 3,
                      background: GOLD,
                      borderRadius: "0 2px 2px 0",
                    }}
                  />
                )}
                <Icon
                  size={17}
                  style={{ color: isActive ? GOLD : "#555", flexShrink: 0 }}
                />
                <span
                  className="flex-1 text-sm font-medium"
                  style={{ color: isActive ? "#FFF" : "#888" }}
                >
                  {label}
                </span>
                {badge && (
                  <span
                    className="text-xs font-bold rounded-full px-1.5 py-0.5"
                    style={{
                      background: isActive ? `${GOLD}33` : "#222",
                      color: isActive ? GOLD : "#555",
                      minWidth: 20,
                      textAlign: "center",
                      fontSize: 10,
                    }}
                  >
                    {badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Divider */}
        <div style={{ height: 1, background: BORDER, margin: "0 16px" }} />

        {/* Bottom Items */}
        <div className="px-3 py-2 space-y-0.5">
          {bottomItems.map(({ icon: Icon, label, badge }) => (
            <button
              key={label}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg"
              style={{ background: "transparent", border: "none", cursor: "pointer" }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background = SURFACE2;
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = "transparent";
              }}
            >
              <Icon size={16} style={{ color: "#555" }} />
              <span className="flex-1 text-sm" style={{ color: "#666" }}>
                {label}
              </span>
              {badge && (
                <span
                  className="text-xs font-bold rounded-full"
                  style={{
                    background: GOLD,
                    color: BLACK,
                    minWidth: 18,
                    height: 18,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 10,
                    fontWeight: 700,
                  }}
                >
                  {badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* User Profile */}
        <div
          className="mx-3 mb-4 rounded-xl p-3 flex items-center gap-3"
          style={{
            background: SURFACE,
            border: `1px solid ${GOLD}22`,
          }}
        >
          <div
            className="rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
            style={{
              width: 34,
              height: 34,
              background: `linear-gradient(135deg, ${GOLD}44, ${GOLD}22)`,
              border: `1.5px solid ${GOLD}66`,
              color: GOLD,
            }}
          >
            JR
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold truncate" style={{ color: "#FFF" }}>
              Jake Riley
            </p>
            <p className="text-xs truncate" style={{ color: GOLD, opacity: 0.7 }}>
              jake@riley.build
            </p>
          </div>
          <ChevronRight size={13} style={{ color: "#444" }} />
        </div>
      </div>
    </div>
  );
}
