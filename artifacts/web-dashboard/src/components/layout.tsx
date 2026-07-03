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
  BadgeCheck,
  FileText,
  Receipt,
  ShieldCheck,
  ShieldAlert,
  Globe,
  CalendarDays,
  Calculator,
  Crown,
  Bell,
  MessageSquare,
  MessageSquareWarning,
  Hammer,
  BookUser,
  BarChart3,
  Check,
  Menu,
  X,
  Package,
  DollarSign,
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
import { CompanySwitcher } from "@/components/CompanySwitcher";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

const GOLD = "#D4AF37";
const BLACK = "#0A0A0A";
const SURFACE = "#141414";
const SURFACE2 = "#1C1C1C";
const GOLD_BORDER = "#2A2200";

const SECTION_ORDER = ["operations", "financials", "compliance"] as const;
const SECTION_LABELS: Record<(typeof SECTION_ORDER)[number], string> = {
  operations: "Operations",
  financials: "Financials",
  compliance: "Compliance",
};

const SIDEBAR_COLLAPSED_STORAGE_KEY = "sitesnap-sidebar-collapsed-sections";

function readCollapsedSections(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY);
    const parsed = stored ? JSON.parse(stored) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

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
  const [collapsedSections, setCollapsedSections] = useState<string[]>(readCollapsedSections);
  const { data: user } = useGetMe();
  const { signOut } = useClerk();

  const toggleSection = (key: string) => {
    setCollapsedSections((prev) => {
      const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key];
      try {
        window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore write failures (e.g. private browsing storage restrictions)
      }
      return next;
    });
  };

  const isOwnerOrForeman = user?.role === "owner" || user?.role === "foreman";
  const isWorker = user?.role === "worker";
  const isSuperAdmin = user?.systemRole === "super_admin";

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
  const financialsBadge = quotesBadge + invoicesBadge;
  const safetyBadge = counts?.submittedForms ?? 0;
  const hoursBadge = counts?.pendingTimesheets ?? 0;

  const { data: featuresData } = useQuery<{ features: string[] }>({
    queryKey: ["me-features"],
    queryFn: () => customFetch<{ features: string[] }>("/api/users/me/features"),
    enabled: !!user?.activeCompanyId,
    staleTime: 60_000,
  });
  const planFeatures = featuresData?.features ?? null;
  const has = (key: string) => isSuperAdmin || planFeatures === null || planFeatures.some((f) => f.toUpperCase() === key.toUpperCase());

  // Check member permissions — server always returns resolved values (owners/foremen = all true,
  // workers = their custom settings merged with defaults). Defaults to true while loading.
  const hasPerm = (key: string): boolean => {
    if (!user?.permissions) return true;
    return (user.permissions as Record<string, boolean>)[key] !== false;
  };

  // Workforce hub merges Schedule + Hours, each gated by its own permission — show the
  // nav item if the user can see either sub-tab.
  const canViewWorkforce = hasPerm("viewSchedules") || hasPerm("viewTimesheets");

  const navigation = [
    { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard, badge: 0, section: "operations" },
    { name: "Risk Dashboard", href: "/risk-dashboard", icon: BarChart3, badge: 0, featureKey: "RISK_DASHBOARD", permissionKey: "viewRiskTab", section: "operations" },
    { name: "Projects", href: "/projects", icon: Building2, badge: 0, section: "operations" },
    ...(isOwnerOrForeman ? [{ name: "Inventory", href: "/inventory", icon: Package, badge: 0, featureKey: "INVENTORY", section: "operations" }] : []),
    // Consolidated CRM hub — Active Leads / Directory sub-tabs.
    ...(isWorker ? [] : [{ name: "CRM", href: "/crm", icon: BookUser, badge: 0, featureKey: "CONTACTS", section: "operations" }]),
    ...(isOwnerOrForeman ? [{ name: "Calculators", href: "/calculators", icon: Calculator, badge: 0, featureKey: "CALCULATORS", section: "operations" }] : []),
    // Consolidated Workforce hub — Master Schedule / Timesheets sub-tabs, each internally
    // gated by its own permission (viewSchedules / viewTimesheets).
    ...(canViewWorkforce ? [{ name: "Workforce", href: "/workforce", icon: CalendarDays, badge: isOwnerOrForeman ? hoursBadge : 0, featureKey: "SCHEDULING", section: "operations" }] : []),
    { name: "TradeHub", href: "/tradehub", icon: Globe, badge: 0, featureKey: "TRADEHUB", permissionKey: "viewTradeHub", section: "operations" },
    { name: "AI Chat", href: "/ai-chat", icon: Bot, badge: 0, featureKey: "AI_CHAT", permissionKey: "viewAskAI", section: "operations" },
    ...(isOwnerOrForeman ? [{ name: "RFI & Submittal", href: "/rfi-submittal", icon: MessageSquareWarning, badge: 0, featureKey: "RFI_SUBMITTAL", section: "operations" }] : []),
    ...(isOwnerOrForeman ? [{ name: "Team", href: "/team", icon: Users, badge: 0, section: "operations" }] : []),
    // Consolidated pre-construction & billing lifecycle hub — Estimates & Proposals /
    // Quotes / Invoices sub-tabs, each internally gated by its own permission/feature.
    { name: "Financials", href: "/financials", icon: DollarSign, badge: financialsBadge, section: "financials" },
    { name: "Expenses", href: "/expenses", icon: Receipt, badge: 0, permissionKey: "submitExpenses", section: "financials" },
    { name: "Field Logs", href: "/field-logs", icon: FileText, badge: 0, featureKey: "SAFETY_FORMS", permissionKey: "viewSafetyTab", section: "compliance" },
    ...(isOwnerOrForeman ? [{ name: "Permits", href: "/permits", icon: BadgeCheck, badge: 0, featureKey: "PERMITS", section: "compliance" }] : []),
    { name: "Safety & Compliance", href: "/safety-compliance", icon: ShieldAlert, badge: isOwnerOrForeman ? safetyBadge : 0, featureKey: "SAFETY_FORMS", permissionKey: "viewSafetyTab", section: "compliance" },
    // Admin compliance review across ALL workers — owner/foreman only, distinct from the
    // worker-facing "My Vault" (own documents only) below.
    ...(isOwnerOrForeman ? [{ name: "Worker Documents", href: "/worker-documents", icon: ShieldCheck, badge: 0, featureKey: "WORKER_DOCUMENTS", section: "compliance" }] : []),
    { name: "My Vault", href: "/my-vault", icon: ShieldCheck, badge: 0, permissionKey: "viewVault", section: "compliance" },
    ...(isOwnerOrForeman ? [{ name: "Settings", href: "/settings", icon: Settings, badge: 0 }] : []),
  ];

  const adminNavigation = [
    ...(isSuperAdmin ? [{ name: "Super Admin", href: "/super-admin", icon: Crown, badge: 0 }] : []),
  ];

  const isNavItemVisible = (item: (typeof navigation)[number]) => {
    const locked = !!(item as any).featureKey && !has((item as any).featureKey);
    const permBlocked = !!(item as any).permissionKey && !hasPerm((item as any).permissionKey);
    return !locked && !permBlocked;
  };
  const visibleNavigation = navigation.filter(isNavItemVisible);
  const navSections = SECTION_ORDER.map((key) => ({
    key,
    label: SECTION_LABELS[key],
    items: visibleNavigation.filter((item) => (item as any).section === key),
  })).filter((section) => section.items.length > 0);
  const unsectionedNavItems = visibleNavigation.filter((item) => !(item as any).section);

  const firstName = user?.firstName ?? "";
  const lastName = user?.lastName ?? "";
  const initials = `${firstName[0] ?? ""}${lastName[0] ?? ""}`.toUpperCase();

  return (
    <div className="flex min-h-screen w-full" style={{ background: "#F8F8F8" }}>
      {/* Black & Gold Sidebar */}
      <div
        className="hidden md:flex flex-col h-screen sticky top-0 overflow-hidden flex-shrink-0 gap-[0px] ml-[0px] mr-[0px] mt-[0px] mb-[0px] pl-[0px] pr-[0px] pt-[0px] pb-[0px]"
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
          <CompanySwitcher user={user} />
        </div>

        {/* Nav items */}
        <nav className="flex-1 px-3 overflow-y-auto relative z-10">
          {navSections.map((section) => {
            const collapsed = collapsedSections.includes(section.key);
            return (
              <div key={section.key} className="mb-3 last:mb-0">
                <button
                  type="button"
                  onClick={() => toggleSection(section.key)}
                  className="w-full flex items-center justify-between px-3 pb-1 pt-1 text-[10px] font-semibold tracking-widest uppercase transition-colors"
                  style={{ color: "#3D3D3D" }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "#6B6B6B"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "#3D3D3D"; }}
                  aria-expanded={!collapsed}
                >
                  <span>{section.label}</span>
                  <ChevronDown
                    size={12}
                    style={{
                      transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)",
                      transition: "transform 200ms ease",
                      flexShrink: 0,
                    }}
                  />
                </button>
                <div
                  style={{
                    display: "grid",
                    gridTemplateRows: collapsed ? "0fr" : "1fr",
                    transition: "grid-template-rows 200ms ease",
                  }}
                >
                  <div className="overflow-hidden">
                    <div className="space-y-0.5">
                      {section.items.map((item) => {
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
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {unsectionedNavItems.length > 0 && (
            <div className="space-y-0.5 pt-1" style={{ borderTop: `1px solid ${GOLD_BORDER}` }}>
              {unsectionedNavItems.map((item) => {
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
            </div>
          )}

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
                <span className="flex-1 text-sm text-[#d4af37]" style={{ color: unreadCount > 0 ? GOLD : "#666" }}>Notifications</span>
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
                  notifications.slice(0, 10).map((n) => {
                    const isMsg = n.type === "message";
                    const NotifIcon =
                      isMsg ? Bot
                      : n.type === "rfi" ? MessageSquare
                      : n.type === "tradehub_message" ? MessageSquare
                      : n.type === "tradehub_post" ? Hammer
                      : Bell;
                    const href =
                      isMsg ? `${basePath}/ai-chat`
                      : n.type === "tradehub_message" ? `${basePath}/tradehub/messages/${n.referenceId}`
                      : n.type === "tradehub_post" ? `${basePath}/tradehub/posts/${n.referenceId}`
                      : n.projectId
                        ? `${basePath}/projects/${n.projectId}`
                        : undefined;
                    const Wrapper = href
                      ? ({ children }: { children: React.ReactNode }) => (
                          <a href={href} className="block hover:no-underline">{children}</a>
                        )
                      : ({ children }: { children: React.ReactNode }) => <>{children}</>;
                    return (
                      <Wrapper key={n.id}>
                        <div
                          className={`flex items-start gap-3 px-4 py-3 border-b last:border-0 transition-colors cursor-pointer ${n.isRead ? "hover:bg-gray-50/50" : "bg-amber-50/40 hover:bg-amber-50/60"}`}
                        >
                          <div
                            className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-full flex-shrink-0"
                            style={{ background: n.isRead ? "#f3f4f6" : `${GOLD}22` }}
                          >
                            <NotifIcon className="h-3.5 w-3.5" style={{ color: n.isRead ? "#9ca3af" : GOLD }} />
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
                      </Wrapper>
                    );
                  })
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

            {/* Company switcher */}
            <div className="px-4 py-3" style={{ borderBottom: `1px solid ${GOLD_BORDER}` }}>
              <CompanySwitcher user={user} />
            </div>

            {/* Nav items */}
            <div className="flex-1 overflow-y-auto py-3 px-3">
              {navSections.map((section) => {
                const collapsed = collapsedSections.includes(section.key);
                return (
                  <div key={section.key} className="mb-3 last:mb-0">
                    <button
                      type="button"
                      onClick={() => toggleSection(section.key)}
                      className="w-full flex items-center justify-between px-3 pb-1 pt-1 text-[10px] font-semibold tracking-widest uppercase transition-colors"
                      style={{ color: "#3D3D3D" }}
                      aria-expanded={!collapsed}
                    >
                      <span>{section.label}</span>
                      <ChevronDown
                        size={12}
                        style={{
                          transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)",
                          transition: "transform 200ms ease",
                          flexShrink: 0,
                        }}
                      />
                    </button>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateRows: collapsed ? "0fr" : "1fr",
                        transition: "grid-template-rows 200ms ease",
                      }}
                    >
                      <div className="overflow-hidden">
                        <div className="space-y-0.5">
                          {section.items.map((item) => {
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
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}

              {unsectionedNavItems.length > 0 && (
                <div className="space-y-0.5 pt-1" style={{ borderTop: `1px solid ${GOLD_BORDER}` }}>
                  {unsectionedNavItems.map((item) => {
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
                </div>
              )}

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
        <main className="flex-1 overflow-y-auto p-3 md:p-5 rounded-tl-[0px] rounded-tr-[0px] rounded-br-[0px] rounded-bl-[0px] text-[#d0a539]">
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
