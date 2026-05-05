import { Link, useLocation } from "wouter";
import { HelpChatWidget } from "@/components/HelpChatWidget";
import { useGetMe, customFetch, useListNotifications, useGetNotificationsUnreadCount, useMarkAllNotificationsRead, useMarkNotificationRead } from "@workspace/api-client-react";
import {
  LayoutDashboard,
  Building2,
  Users,
  Settings,
  LogOut,
  ChevronDown,
  Bot,
  FileText,
  Receipt,
  ShieldCheck,
  ShieldAlert,
  Globe,
  CalendarDays,
  Clock,
  Calculator,
  Crown,
  Bell,
  Hammer,
  BookUser,
  TrendingUp,
  FileSignature,
  BarChart3,
  Check,
  Sparkles,
  Menu,
  X,
} from "lucide-react";
import { useClerk } from "@clerk/react";
import { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { Badge } from "@/components/ui/badge";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

const GOLD = "#D4AF37";
const BLACK = "#0A0A0A";
const SURFACE = "#141414";
const SURFACE2 = "#1C1C1C";
const GOLD_BORDER = "#2A2200";

interface ActionCounts {
  pendingQuotes: number;
  draftQuotes: number;
  draftInvoices: number;
  submittedForms: number;
  pendingTimesheets: number;
}

function NavBadge({ count, gold = false }: { count: number; gold?: boolean }) {
  if (!count) return null;
  return (
    <span
      className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold leading-none"
      style={gold
        ? { background: GOLD, color: BLACK }
        : { background: "#222", color: "#888" }
      }
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { data: user } = useGetMe();
  const { signOut } = useClerk();

  const isOwner = user?.role === "owner";
  const isOwnerOrForeman = user?.role === "owner" || user?.role === "foreman";
  const isSuperAdmin = (user as any)?.systemRole === "super_admin";

  const qc = useQueryClient();

  const { data: counts } = useQuery<ActionCounts>({
    queryKey: ["dashboard-action-counts"],
    queryFn: () => customFetch<ActionCounts>("/api/dashboard/action-counts"),
    refetchInterval: 60_000,
    enabled: !!user,
    staleTime: 30_000,
  });

  const { data: notifications } = useListNotifications();
  const { data: unreadData } = useGetNotificationsUnreadCount();
  const markAll = useMarkAllNotificationsRead();
  const markOne = useMarkNotificationRead();

  const unreadCount = unreadData?.count ?? 0;

  const handleMarkAll = () => {
    markAll.mutate(undefined, {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ["/notifications"] });
        qc.invalidateQueries({ queryKey: ["/notifications/unread-count"] });
      },
    });
  };

  const handleMarkOne = (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    markOne.mutate({ id }, {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ["/notifications"] });
        qc.invalidateQueries({ queryKey: ["/notifications/unread-count"] });
      },
    });
  };

  const quotesBadge = (counts?.pendingQuotes ?? 0) + (counts?.draftQuotes ?? 0);
  const invoicesBadge = counts?.draftInvoices ?? 0;
  const safetyBadge = counts?.submittedForms ?? 0;
  const hoursBadge = counts?.pendingTimesheets ?? 0;

  const navigation = [
    { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard, badge: 0 },
    { name: "Projects", href: "/projects", icon: Building2, badge: 0 },
    { name: "Quotes", href: "/quotes", icon: FileText, badge: quotesBadge },
    { name: "Invoices", href: "/invoices", icon: Receipt, badge: invoicesBadge },
    ...(isOwnerOrForeman ? [{ name: "Proposals", href: "/proposals", icon: FileSignature, badge: 0 }] : []),
    ...(isOwnerOrForeman ? [{ name: "Estimates", href: "/estimates", icon: Calculator, badge: 0 }] : []),
    ...(isOwnerOrForeman ? [{ name: "Smart Estimator", href: "/smart-estimator", icon: Sparkles, badge: 0 }] : []),
    ...(isOwnerOrForeman ? [{ name: "Financials", href: "/financials", icon: BarChart3, badge: 0 }] : []),
    { name: "Contacts", href: "/contacts", icon: BookUser, badge: 0 },
    { name: "Leads", href: "/leads", icon: TrendingUp, badge: 0 },
    ...(isOwnerOrForeman ? [{ name: "Calculators", href: "/calculators", icon: Calculator, badge: 0 }] : []),
    ...(isOwnerOrForeman ? [{ name: "Schedule", href: "/schedule", icon: CalendarDays, badge: 0 }] : []),
    ...(isOwnerOrForeman ? [{ name: "Hours", href: "/hours", icon: Clock, badge: isOwnerOrForeman ? hoursBadge : 0 }] : []),
    { name: "Safety", href: "/safety", icon: ShieldAlert, badge: isOwnerOrForeman ? safetyBadge : 0 },
    ...(isOwnerOrForeman ? [{ name: "TradeHub", href: "/tradehub", icon: Globe, badge: 0 }] : []),
    { name: "AI Chat", href: "/ai-chat", icon: Bot, badge: 0 },
    ...(isOwnerOrForeman ? [{ name: "Team", href: "/team", icon: Users, badge: 0 }] : []),
    ...(isOwnerOrForeman ? [{ name: "Settings", href: "/settings", icon: Settings, badge: 0 }] : []),
  ];

  const adminNavigation = [
    ...(isOwner ? [{ name: "Admin & Billing", href: "/admin", icon: ShieldCheck, badge: 0 }] : []),
    ...(isSuperAdmin ? [{ name: "Super Admin", href: "/super-admin", icon: Crown, badge: 0 }] : []),
  ];

  const firstName = user?.firstName ?? "";
  const lastName = user?.lastName ?? "";
  const initials = `${firstName[0] ?? ""}${lastName[0] ?? ""}`.toUpperCase();
  const companyName = (user as any)?.company?.name ?? "No Company";
  const companyInitials = companyName.split(" ").slice(0, 2).map((w: string) => w[0]).join("").toUpperCase();

  return (
    <div className="flex min-h-screen w-full" style={{ background: "#F8F8F8" }}>
      {/* Black & Gold Sidebar */}
      <div
        className="hidden md:flex flex-col h-screen sticky top-0 overflow-hidden flex-shrink-0"
        style={{
          width: 260,
          background: BLACK,
          borderRight: `1px solid ${GOLD_BORDER}`,
        }}
      >
        {/* Gold radial glow */}
        <div
          style={{
            position: "absolute",
            top: -60,
            left: -60,
            width: 220,
            height: 220,
            background: `radial-gradient(circle, ${GOLD}14 0%, transparent 70%)`,
            pointerEvents: "none",
            zIndex: 0,
          }}
        />

        {/* Logo */}
        <div
          className="flex items-center gap-3 px-5 py-5 relative z-10 flex-shrink-0"
          style={{ borderBottom: `1px solid ${GOLD_BORDER}` }}
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
          <span className="font-bold text-base tracking-tight" style={{ color: "#FFF" }}>
            Site<span style={{ color: GOLD }}>Snap</span>
          </span>
        </div>

        {/* Company switcher */}
        <div className="px-4 py-3 relative z-10 flex-shrink-0">
          <div
            className="flex items-center gap-2 rounded-lg px-3 py-2 cursor-pointer"
            style={{ background: SURFACE, border: `1px solid ${GOLD_BORDER}` }}
          >
            <div
              className="rounded-md flex items-center justify-center text-xs font-bold flex-shrink-0"
              style={{
                width: 28,
                height: 28,
                background: `${GOLD}22`,
                color: GOLD,
                border: `1px solid ${GOLD}44`,
              }}
            >
              {companyInitials || "?"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold truncate" style={{ color: "#FFF" }}>{companyName}</p>
              <p className="text-xs capitalize" style={{ color: "#666" }}>{user?.role ?? "Member"}</p>
            </div>
            <ChevronDown size={13} style={{ color: "#555" }} />
          </div>
        </div>

        {/* Nav label */}
        <div className="px-5 pb-1 relative z-10">
          <p className="text-xs font-semibold tracking-widest uppercase" style={{ color: "#444" }}>Menu</p>
        </div>

        {/* Nav items */}
        <nav className="flex-1 px-3 overflow-y-auto space-y-0.5 relative z-10">
          {navigation.map((item) => {
            const isActive = location.startsWith(item.href);
            return (
              <Link key={item.name} href={item.href}>
                <div
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer relative transition-all duration-150"
                  style={{
                    background: isActive ? `${GOLD}18` : "transparent",
                    border: isActive ? `1px solid ${GOLD}33` : "1px solid transparent",
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) (e.currentTarget as HTMLElement).style.background = SURFACE2;
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) (e.currentTarget as HTMLElement).style.background = "transparent";
                  }}
                >
                  {isActive && (
                    <div style={{
                      position: "absolute",
                      left: 0,
                      top: "20%",
                      height: "60%",
                      width: 3,
                      background: GOLD,
                      borderRadius: "0 2px 2px 0",
                    }} />
                  )}
                  <item.icon
                    size={17}
                    style={{ color: isActive ? GOLD : "#555", flexShrink: 0 }}
                  />
                  <span
                    className="flex-1 text-sm font-medium truncate"
                    style={{ color: isActive ? "#FFF" : "#888" }}
                  >
                    {item.name}
                  </span>
                  <NavBadge count={item.badge} gold={isActive} />
                </div>
              </Link>
            );
          })}

          {adminNavigation.length > 0 && (
            <>
              <div style={{ height: 1, background: GOLD_BORDER, margin: "8px 8px" }} />
              <p className="px-3 pb-1 text-xs font-semibold tracking-widest uppercase" style={{ color: "#444" }}>Admin</p>
              {adminNavigation.map((item) => {
                const isActive = location.startsWith(item.href);
                return (
                  <Link key={item.name} href={item.href}>
                    <div
                      className="flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer relative transition-all duration-150"
                      style={{
                        background: isActive ? `${GOLD}18` : "transparent",
                        border: isActive ? `1px solid ${GOLD}33` : "1px solid transparent",
                      }}
                      onMouseEnter={(e) => {
                        if (!isActive) (e.currentTarget as HTMLElement).style.background = SURFACE2;
                      }}
                      onMouseLeave={(e) => {
                        if (!isActive) (e.currentTarget as HTMLElement).style.background = "transparent";
                      }}
                    >
                      {isActive && (
                        <div style={{
                          position: "absolute",
                          left: 0,
                          top: "20%",
                          height: "60%",
                          width: 3,
                          background: GOLD,
                          borderRadius: "0 2px 2px 0",
                        }} />
                      )}
                      <item.icon size={17} style={{ color: isActive ? GOLD : "#555", flexShrink: 0 }} />
                      <span className="flex-1 text-sm font-medium truncate" style={{ color: isActive ? "#FFF" : "#888" }}>
                        {item.name}
                      </span>
                    </div>
                  </Link>
                );
              })}
            </>
          )}
        </nav>

        {/* Bottom items — Notification bell */}
        <div className="px-3 py-2 space-y-0.5 relative z-10 flex-shrink-0" style={{ borderTop: `1px solid ${GOLD_BORDER}` }}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <div
                className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer relative"
                style={{ background: "transparent" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = SURFACE2; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
              >
                <div className="relative">
                  <Bell size={16} style={{ color: unreadCount > 0 ? GOLD : "#555" }} />
                  {unreadCount > 0 && (
                    <span
                      className="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full px-0.5 text-[9px] font-bold"
                      style={{ background: GOLD, color: BLACK }}
                    >
                      {unreadCount > 9 ? "9+" : unreadCount}
                    </span>
                  )}
                </div>
                <span className="flex-1 text-sm" style={{ color: unreadCount > 0 ? GOLD : "#666" }}>Notifications</span>
                {unreadCount > 0 && (
                  <span
                    className="flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold"
                    style={{ background: `${GOLD}22`, color: GOLD }}
                  >
                    {unreadCount}
                  </span>
                )}
              </div>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="right" align="end" className="w-80 p-0" style={{ marginLeft: 8 }}>
              <div className="flex items-center justify-between px-4 py-3 border-b">
                <p className="text-sm font-semibold">Notifications</p>
                {unreadCount > 0 && (
                  <button
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                    onClick={handleMarkAll}
                  >
                    Mark all read
                  </button>
                )}
              </div>
              <div className="max-h-80 overflow-y-auto">
                {!notifications || notifications.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center px-4">
                    <Bell className="h-8 w-8 text-muted-foreground/30 mb-2" />
                    <p className="text-xs text-muted-foreground">You're all caught up!</p>
                  </div>
                ) : (
                  notifications.slice(0, 10).map((n) => (
                    <div
                      key={n.id}
                      className={`flex items-start gap-3 px-4 py-3 border-b last:border-0 transition-colors ${n.isRead ? "" : "bg-amber-50/40"}`}
                    >
                      <div
                        className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-full flex-shrink-0"
                        style={{ background: n.isRead ? "#f3f4f6" : `${GOLD}22` }}
                      >
                        <Bell className="h-3.5 w-3.5" style={{ color: n.isRead ? "#9ca3af" : GOLD }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold leading-tight">{n.title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{n.body}</p>
                        <p className="text-[10px] text-muted-foreground/60 mt-1">
                          {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                        </p>
                      </div>
                      {!n.isRead && (
                        <button
                          className="flex-shrink-0 mt-1 h-5 w-5 rounded flex items-center justify-center hover:bg-gray-100 transition-colors"
                          onClick={(e) => handleMarkOne(e, n.id)}
                          title="Mark as read"
                        >
                          <Check className="h-3 w-3 text-muted-foreground" />
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* User profile card */}
        <div className="mx-3 mb-4 relative z-10 flex-shrink-0">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="w-full flex items-center gap-3 rounded-xl p-3 text-left outline-none transition-all"
                style={{
                  background: SURFACE,
                  border: `1px solid ${GOLD}22`,
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = `${GOLD}44`; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = `${GOLD}22`; }}
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
                  {initials || "?"}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold truncate" style={{ color: "#FFF" }}>
                    {firstName} {lastName}
                  </p>
                  <p className="text-xs truncate" style={{ color: GOLD, opacity: 0.7 }}>
                    {user?.email ?? ""}
                  </p>
                </div>
                <ChevronDown size={13} style={{ color: "#444" }} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>My Account</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => signOut({ redirectUrl: basePath || "/" })}
                className="text-destructive focus:text-destructive cursor-pointer"
              >
                <LogOut className="mr-2 h-4 w-4" />
                <span>Log out</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden min-w-0">
        {/* Mobile header */}
        <header className="flex md:hidden h-14 items-center justify-between gap-3 px-4 flex-shrink-0"
          style={{ background: BLACK, borderBottom: `1px solid ${GOLD_BORDER}` }}>
          <div className="flex items-center gap-2">
            <div
              className="flex items-center justify-center rounded-lg"
              style={{ width: 28, height: 28, background: `${GOLD}22`, border: `1px solid ${GOLD}44` }}
            >
              <Hammer size={14} style={{ color: GOLD }} />
            </div>
            <span className="font-bold tracking-tight" style={{ color: "#FFF" }}>
              Site<span style={{ color: GOLD }}>Snap</span>
            </span>
          </div>
          <button
            onClick={() => setMobileOpen(true)}
            className="flex items-center justify-center rounded-lg p-2 transition-colors"
            style={{ background: `${GOLD}18`, border: `1px solid ${GOLD}33` }}
            aria-label="Open navigation"
          >
            <Menu size={18} style={{ color: GOLD }} />
          </button>
        </header>

        {/* Mobile navigation drawer */}
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent
            side="left"
            className="p-0 border-0"
            style={{ width: 280, background: BLACK }}
          >
            {/* Drawer header */}
            <div
              className="flex items-center justify-between px-5 py-5"
              style={{ borderBottom: `1px solid ${GOLD_BORDER}` }}
            >
              <div className="flex items-center gap-3">
                <div
                  className="flex items-center justify-center rounded-lg"
                  style={{ width: 34, height: 34, background: `linear-gradient(135deg, ${GOLD}33 0%, ${GOLD}11 100%)`, border: `1px solid ${GOLD}55` }}
                >
                  <Hammer size={16} style={{ color: GOLD }} />
                </div>
                <span className="font-bold tracking-tight text-base" style={{ color: "#FFF" }}>
                  Site<span style={{ color: GOLD }}>Snap</span>
                </span>
              </div>
              <button
                onClick={() => setMobileOpen(false)}
                className="flex items-center justify-center rounded-lg p-1.5 transition-colors"
                style={{ background: `${GOLD}12` }}
              >
                <X size={16} style={{ color: GOLD }} />
              </button>
            </div>

            {/* Company label */}
            <div className="px-4 py-3" style={{ borderBottom: `1px solid ${GOLD_BORDER}` }}>
              <div
                className="flex items-center gap-3 rounded-xl px-3 py-2.5"
                style={{ background: SURFACE, border: `1px solid ${GOLD}22` }}
              >
                <div
                  className="rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0"
                  style={{ width: 32, height: 32, background: `${GOLD}22`, border: `1px solid ${GOLD}44`, color: GOLD }}
                >
                  {companyInitials || "?"}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold truncate" style={{ color: "#FFF" }}>{companyName}</p>
                  <p className="text-xs capitalize" style={{ color: "#666" }}>{user?.role ?? "Member"}</p>
                </div>
              </div>
            </div>

            {/* Nav items */}
            <div className="flex-1 overflow-y-auto py-3 px-3 space-y-0.5">
              {navigation.map((item) => {
                const isActive = location === `${basePath}${item.href}` || location === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all"
                    style={{
                      background: isActive ? `${GOLD}18` : "transparent",
                      border: isActive ? `1px solid ${GOLD}33` : "1px solid transparent",
                    }}
                  >
                    <item.icon size={17} style={{ color: isActive ? GOLD : "#555" }} />
                    <span className="flex-1 text-sm font-medium truncate" style={{ color: isActive ? "#FFF" : "#888" }}>
                      {item.name}
                    </span>
                    {item.badge > 0 && (
                      <span
                        className="flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-bold"
                        style={{ background: GOLD, color: BLACK }}
                      >
                        {item.badge > 99 ? "99+" : item.badge}
                      </span>
                    )}
                  </Link>
                );
              })}

              {adminNavigation.length > 0 && (
                <>
                  <div style={{ height: 1, background: GOLD_BORDER, margin: "8px 4px" }} />
                  {adminNavigation.map((item) => {
                    const isActive = location === `${basePath}${item.href}` || location === item.href;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setMobileOpen(false)}
                        className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all"
                        style={{
                          background: isActive ? `${GOLD}18` : "transparent",
                          border: isActive ? `1px solid ${GOLD}33` : "1px solid transparent",
                        }}
                      >
                        <item.icon size={17} style={{ color: isActive ? GOLD : "#555" }} />
                        <span className="text-sm font-medium" style={{ color: isActive ? "#FFF" : "#888" }}>{item.name}</span>
                      </Link>
                    );
                  })}
                </>
              )}
            </div>

            {/* User + sign out */}
            <div className="p-3" style={{ borderTop: `1px solid ${GOLD_BORDER}` }}>
              <div
                className="flex items-center gap-3 rounded-xl px-3 py-2.5 mb-2"
                style={{ background: SURFACE, border: `1px solid ${GOLD}22` }}
              >
                <div
                  className="rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                  style={{ width: 34, height: 34, background: `linear-gradient(135deg, ${GOLD}44, ${GOLD}22)`, border: `1.5px solid ${GOLD}66`, color: GOLD }}
                >
                  {initials || "?"}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold truncate" style={{ color: "#FFF" }}>{firstName} {lastName}</p>
                  <p className="text-xs truncate" style={{ color: GOLD, opacity: 0.7 }}>{user?.email ?? ""}</p>
                </div>
              </div>
              <button
                onClick={() => { setMobileOpen(false); signOut({ redirectUrl: basePath || "/" }); }}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-red-950/30"
                style={{ color: "#ef4444" }}
              >
                <LogOut size={16} />
                <span className="text-sm font-medium">Log out</span>
              </button>
            </div>
          </SheetContent>
        </Sheet>
        <main className="flex-1 overflow-y-auto p-4 md:p-8">
          <div className="mx-auto max-w-6xl">
            {children}
          </div>
        </main>
      </div>

      {/* Floating Help Chat Widget — available on every page */}
      <HelpChatWidget />
    </div>
  );
}
