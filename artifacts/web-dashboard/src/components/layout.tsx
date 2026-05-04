import { Link, useLocation } from "wouter";
import { useGetMe, customFetch } from "@workspace/api-client-react";
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
} from "lucide-react";
import { useClerk } from "@clerk/react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useQuery } from "@tanstack/react-query";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

interface ActionCounts {
  pendingQuotes: number;
  draftQuotes: number;
  draftInvoices: number;
  submittedForms: number;
  pendingTimesheets: number;
}

function NavBadge({ count, variant = "orange" }: { count: number; variant?: "orange" | "blue" | "red" }) {
  if (!count) return null;
  const colors = {
    orange: "bg-primary text-white",
    blue: "bg-blue-500 text-white",
    red: "bg-red-500 text-white",
  };
  return (
    <span className={`ml-auto flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold leading-none ${colors[variant]}`}>
      {count > 99 ? "99+" : count}
    </span>
  );
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { data: user } = useGetMe();
  const { signOut } = useClerk();

  const isOwner = user?.role === "owner";
  const isOwnerOrForeman = user?.role === "owner" || user?.role === "foreman";
  const isSuperAdmin = (user as any)?.systemRole === "super_admin";

  const { data: counts } = useQuery<ActionCounts>({
    queryKey: ["dashboard-action-counts"],
    queryFn: () => customFetch<ActionCounts>("/api/dashboard/action-counts"),
    refetchInterval: 60_000,
    enabled: !!user,
    staleTime: 30_000,
  });

  // Quotes badge: pending_approval (needs review) + drafts
  const quotesBadge = (counts?.pendingQuotes ?? 0) + (counts?.draftQuotes ?? 0);
  // Invoices badge: drafts only
  const invoicesBadge = counts?.draftInvoices ?? 0;
  // Safety badge: submitted (unreviewed) forms
  const safetyBadge = counts?.submittedForms ?? 0;
  // Hours badge: pending timesheets
  const hoursBadge = counts?.pendingTimesheets ?? 0;

  const navigation = [
    { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard, badge: 0, badgeVariant: "orange" as const },
    { name: "Projects", href: "/projects", icon: Building2, badge: 0, badgeVariant: "orange" as const },
    { name: "Quotes", href: "/quotes", icon: FileText, badge: quotesBadge, badgeVariant: (counts?.pendingQuotes ?? 0) > 0 ? "orange" as const : "blue" as const },
    { name: "Invoices", href: "/invoices", icon: Receipt, badge: invoicesBadge, badgeVariant: "blue" as const },
    { name: "AI Chat", href: "/ai-chat", icon: Bot, badge: 0, badgeVariant: "orange" as const },
    { name: "Safety", href: "/safety", icon: ShieldAlert, badge: isOwnerOrForeman ? safetyBadge : 0, badgeVariant: "red" as const },
    ...(isOwnerOrForeman ? [{ name: "TradeHub", href: "/tradehub", icon: Globe, badge: 0, badgeVariant: "orange" as const }] : []),
    ...(isOwnerOrForeman ? [{ name: "Calculators", href: "/calculators", icon: Calculator, badge: 0, badgeVariant: "orange" as const }] : []),
    ...(isOwnerOrForeman ? [{ name: "Schedule", href: "/schedule", icon: CalendarDays, badge: 0, badgeVariant: "orange" as const }] : []),
    ...(isOwnerOrForeman ? [{ name: "Hours", href: "/hours", icon: Clock, badge: isOwnerOrForeman ? hoursBadge : 0, badgeVariant: "orange" as const }] : []),
    ...(isOwnerOrForeman ? [{ name: "Estimates", href: "/estimates", icon: Calculator, badge: 0, badgeVariant: "orange" as const }] : []),
    ...(isOwnerOrForeman ? [{ name: "Team", href: "/team", icon: Users, badge: 0, badgeVariant: "orange" as const }] : []),
    ...(isOwnerOrForeman ? [{ name: "Settings", href: "/settings", icon: Settings, badge: 0, badgeVariant: "orange" as const }] : []),
  ];

  const adminNavigation = [
    ...(isOwner ? [{ name: "Admin & Billing", href: "/admin", icon: ShieldCheck, badge: 0, badgeVariant: "orange" as const }] : []),
    ...(isSuperAdmin ? [{ name: "Super Admin", href: "/super-admin", icon: Crown, badge: 0, badgeVariant: "orange" as const }] : []),
  ];

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-muted/10">
        <Sidebar className="border-r border-border bg-sidebar">
          <SidebarHeader className="border-b border-border/10 p-4">
            <div className="flex items-center gap-3">
              <img src="/sitesnap-logo.png" alt="Site Snap" className="h-9 w-9 rounded object-contain bg-black" />
              <span className="text-lg font-bold tracking-tight text-sidebar-foreground">Site Snap</span>
            </div>
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel className="text-xs uppercase tracking-wider text-muted-foreground/70 mb-2 px-4">Menu</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {navigation.map((item) => {
                    const isActive = location.startsWith(item.href);
                    return (
                      <SidebarMenuItem key={item.name}>
                        <SidebarMenuButton asChild isActive={isActive} tooltip={item.name}>
                          <Link href={item.href} className="flex items-center gap-3 font-medium">
                            <item.icon className="h-5 w-5 shrink-0" />
                            <span className="flex-1 truncate">{item.name}</span>
                            <NavBadge count={item.badge} variant={item.badgeVariant} />
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            {adminNavigation.length > 0 && (
              <SidebarGroup>
                <SidebarGroupLabel className="text-xs uppercase tracking-wider text-muted-foreground/70 mb-2 px-4">Admin</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {adminNavigation.map((item) => {
                      const isActive = location.startsWith(item.href);
                      return (
                        <SidebarMenuItem key={item.name}>
                          <SidebarMenuButton asChild isActive={isActive} tooltip={item.name}>
                            <Link href={item.href} className="flex items-center gap-3 font-medium">
                              <item.icon className="h-5 w-5 shrink-0" />
                              <span className="flex-1 truncate">{item.name}</span>
                              <NavBadge count={item.badge} variant={item.badgeVariant} />
                            </Link>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      );
                    })}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            )}
          </SidebarContent>
          <SidebarFooter className="border-t border-border/10 p-4">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex w-full items-center gap-3 rounded-md p-2 text-left hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors outline-none focus:ring-2 focus:ring-sidebar-ring">
                  <Avatar className="h-8 w-8 bg-primary/20 text-primary border border-primary/20">
                    <AvatarFallback className="text-xs font-bold bg-transparent">
                      {user?.firstName?.[0]}{user?.lastName?.[0]}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex flex-1 flex-col overflow-hidden">
                    <span className="truncate text-sm font-medium text-sidebar-foreground">
                      {user?.firstName} {user?.lastName}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {(user as any)?.company?.name || "No Company"}
                    </span>
                  </div>
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>My Account</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => signOut({ redirectUrl: basePath || "/" })} className="text-destructive focus:text-destructive cursor-pointer">
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Log out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarFooter>
        </Sidebar>

        <div className="flex w-full flex-col overflow-hidden">
          <header className="flex h-16 shrink-0 items-center gap-4 border-b border-border bg-card px-6 md:hidden">
            <SidebarTrigger />
            <span className="text-lg font-bold tracking-tight">Site Snap</span>
          </header>
          <main className="flex-1 overflow-y-auto p-4 md:p-8">
            <div className="mx-auto max-w-6xl">
              {children}
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
