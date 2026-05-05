import {
  useGetDashboardSummary,
  useGetRecentActivity,
  useGetDashboardSmartSummary,
  useListNotifications,
  useGetNotificationsUnreadCount,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Building2,
  FileText,
  MessageSquareWarning,
  Users,
  Activity,
  ChevronRight,
  BookUser,
  TrendingUp,
  AlertTriangle,
  DollarSign,
  Sparkles,
  Bell,
  Check,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { WeatherCard } from "@/components/WeatherCard";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";

const GOLD = "#C9A84C";
const BLACK = "#111111";

function fmt(n: number, opts?: Intl.NumberFormatOptions) {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0,
    ...opts,
  }).format(n);
}

export default function Dashboard() {
  const { data: summary, isLoading: isLoadingSummary } = useGetDashboardSummary();
  const { data: activity, isLoading: isLoadingActivity } = useGetRecentActivity();
  const { data: smartSummary } = useGetDashboardSmartSummary();
  const { data: notifications } = useListNotifications();
  const { data: unread } = useGetNotificationsUnreadCount();
  const markAll = useMarkAllNotificationsRead();
  const markOne = useMarkNotificationRead();
  const qc = useQueryClient();

  const handleMarkAll = () => {
    markAll.mutate(undefined, {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ["/notifications"] });
        qc.invalidateQueries({ queryKey: ["/notifications/unread-count"] });
      },
    });
  };

  const handleMarkOne = (id: number) => {
    markOne.mutate({ id }, {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ["/notifications"] });
        qc.invalidateQueries({ queryKey: ["/notifications/unread-count"] });
      },
    });
  };

  if (isLoadingSummary || isLoadingActivity) {
    return <div className="p-8 text-center text-muted-foreground animate-pulse">Loading dashboard...</div>;
  }

  const overdueInvoices = (summary as any)?.overdueInvoices ?? 0;
  const overdueAmount = (summary as any)?.overdueInvoiceAmount ?? 0;
  const pipeline = (summary as any)?.revenuePipeline ?? 0;
  const activeLeads = (summary as any)?.activeLeads ?? 0;
  const unreadCount = unread?.count ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">Overview of your company's projects and activities.</p>
      </div>

      {/* Smart Summary Banner */}
      {smartSummary?.summary && (
        <Card className="border-amber-200/40 bg-gradient-to-r from-amber-50/80 to-orange-50/60">
          <CardContent className="flex items-start gap-3 pt-4 pb-4">
            <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-full flex-shrink-0"
              style={{ background: `${GOLD}22`, border: `1.5px solid ${GOLD}44` }}>
              <Sparkles className="h-4 w-4" style={{ color: GOLD }} />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 mb-1">Smart Insights</p>
              <p className="text-sm text-gray-700 leading-relaxed">{smartSummary.summary}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stat Cards Row 1 — Projects / Reports / RFIs / Team / Contacts */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <Link href="/projects" className="block group">
          <Card className="cursor-pointer transition-all duration-150 hover:shadow-xl" style={{ background: BLACK, border: "none", boxShadow: "0 4px 16px rgba(0,0,0,0.18)" }}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider" style={{ color: GOLD }}>Active Projects</CardTitle>
              <Building2 className="h-4 w-4" style={{ color: GOLD }} />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-white">{summary?.activeProjects ?? 0}</div>
              <div className="flex items-center justify-between mt-1">
                <p className="text-xs text-zinc-500">
                  {summary?.totalProjects ?? 0} total
                </p>
                <ChevronRight className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: GOLD }} />
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/reports" className="block group">
          <Card className="cursor-pointer transition-all duration-150 hover:shadow-xl" style={{ background: BLACK, border: "none", boxShadow: "0 4px 16px rgba(0,0,0,0.18)" }}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider" style={{ color: GOLD }}>Reports This Week</CardTitle>
              <FileText className="h-4 w-4" style={{ color: GOLD }} />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-white">{summary?.reportsThisWeek || 0}</div>
              <div className="flex items-center justify-between mt-1">
                <p className="text-xs text-zinc-500">Daily reports submitted</p>
                <ChevronRight className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: GOLD }} />
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/rfis" className="block group">
          <Card className="cursor-pointer transition-all duration-150 hover:shadow-xl" style={{ background: BLACK, border: "none", boxShadow: "0 4px 16px rgba(0,0,0,0.18)" }}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider" style={{ color: GOLD }}>Open RFIs</CardTitle>
              <MessageSquareWarning className="h-4 w-4" style={{ color: GOLD }} />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-white">{summary?.openRFIs || 0}</div>
              <div className="flex items-center justify-between mt-1">
                <p className="text-xs text-zinc-500">Awaiting response</p>
                <ChevronRight className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: GOLD }} />
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/team" className="block group">
          <Card className="cursor-pointer transition-all duration-150 hover:shadow-xl" style={{ background: BLACK, border: "none", boxShadow: "0 4px 16px rgba(0,0,0,0.18)" }}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider" style={{ color: GOLD }}>Team Members</CardTitle>
              <Users className="h-4 w-4" style={{ color: GOLD }} />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-white">{summary?.teamMemberCount || 0}</div>
              <div className="flex items-center justify-between mt-1">
                <p className="text-xs text-zinc-500">Active in workspace</p>
                <ChevronRight className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: GOLD }} />
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/contacts" className="block group">
          <Card className="cursor-pointer transition-all duration-150 hover:shadow-xl" style={{ background: BLACK, border: "none", boxShadow: "0 4px 16px rgba(0,0,0,0.18)" }}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider" style={{ color: GOLD }}>Total Contacts</CardTitle>
              <BookUser className="h-4 w-4" style={{ color: GOLD }} />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-white">{(summary as any)?.totalContacts ?? 0}</div>
              <div className="flex items-center justify-between mt-1">
                <p className="text-xs text-zinc-500">Clients, workers &amp; suppliers</p>
                <ChevronRight className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: GOLD }} />
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Insight Cards Row 2 — Revenue Pipeline / Overdue Invoices / Active Leads */}
      <div className="grid gap-4 md:grid-cols-3">
        <Link href="/leads" className="block group">
          <Card className="cursor-pointer transition-all border-emerald-200/60 hover:shadow-md">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-emerald-700">Revenue Pipeline</CardTitle>
              <TrendingUp className="h-4 w-4 text-emerald-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-emerald-800">{fmt(pipeline)}</div>
              <div className="flex items-center justify-between mt-1">
                <p className="text-xs text-muted-foreground">{activeLeads} active lead{activeLeads !== 1 ? "s" : ""}</p>
                <ChevronRight className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-opacity text-emerald-600" />
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/invoices" className="block group">
          <Card className={`cursor-pointer transition-all hover:shadow-md ${overdueInvoices > 0 ? "border-red-200/80 bg-red-50/30" : "border-border"}`}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className={`text-xs font-semibold uppercase tracking-wider ${overdueInvoices > 0 ? "text-red-700" : "text-muted-foreground"}`}>
                Overdue Invoices
              </CardTitle>
              {overdueInvoices > 0
                ? <AlertTriangle className="h-4 w-4 text-red-500" />
                : <DollarSign className="h-4 w-4 text-muted-foreground" />
              }
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${overdueInvoices > 0 ? "text-red-700" : "text-foreground"}`}>
                {overdueInvoices > 0 ? fmt(overdueAmount) : "All clear"}
              </div>
              <div className="flex items-center justify-between mt-1">
                <p className="text-xs text-muted-foreground">
                  {overdueInvoices > 0 ? `${overdueInvoices} invoice${overdueInvoices !== 1 ? "s" : ""} past due` : "No overdue invoices"}
                </p>
                <ChevronRight className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </CardContent>
          </Card>
        </Link>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">This Month's Spend</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{fmt(summary?.totalSpentThisMonth ?? 0)}</div>
            <div className="mt-1">
              <p className="text-xs text-muted-foreground">
                Budget: {fmt(summary?.totalBudgetAllProjects ?? 0)}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Bottom Row — Activity / Notifications + Weather */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-4">
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-8">
              {activity?.length === 0 ? (
                <div className="text-center text-sm text-muted-foreground py-4">No recent activity.</div>
              ) : (
                activity?.map((item) => (
                  <div key={item.id} className="flex items-center">
                    <div className="mt-1 flex h-9 w-9 items-center justify-center rounded-full shrink-0" style={{ background: BLACK }}>
                      <Activity className="h-4 w-4" style={{ color: GOLD }} />
                    </div>
                    <div className="ml-4 space-y-1">
                      <p className="text-sm font-medium leading-none">{item.description}</p>
                      <p className="text-sm text-muted-foreground">
                        {item.userName} • {item.projectName && <span className="font-semibold text-foreground">{item.projectName} • </span>}
                        {format(new Date(item.createdAt), "MMM d, h:mm a")}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        <div className="col-span-3 flex flex-col gap-4">
          <WeatherCard />

          {/* Notifications Panel */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-sm">Notifications</CardTitle>
                  {unreadCount > 0 && (
                    <Badge
                      className="h-5 min-w-5 text-[10px] font-bold px-1.5"
                      style={{ background: GOLD, color: BLACK, border: "none" }}
                    >
                      {unreadCount}
                    </Badge>
                  )}
                </div>
                {unreadCount > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs h-7 px-2 text-muted-foreground"
                    onClick={handleMarkAll}
                  >
                    Mark all read
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="px-3 pb-3">
              {!notifications || notifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-6 text-center">
                  <Bell className="h-8 w-8 text-muted-foreground/30 mb-2" />
                  <p className="text-xs text-muted-foreground">No notifications</p>
                </div>
              ) : (
                <div className="space-y-1 max-h-64 overflow-y-auto">
                  {notifications.slice(0, 8).map((n) => (
                    <div
                      key={n.id}
                      className={`flex items-start gap-2.5 rounded-lg px-2 py-2 transition-colors ${n.isRead ? "opacity-60" : "bg-amber-50/60"}`}
                    >
                      <div
                        className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full flex-shrink-0"
                        style={{ background: n.isRead ? "#f3f4f6" : `${GOLD}22` }}
                      >
                        <Bell className="h-3 w-3" style={{ color: n.isRead ? "#9ca3af" : GOLD }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold leading-tight">{n.title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5 leading-tight">{n.body}</p>
                        <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                          {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                        </p>
                      </div>
                      {!n.isRead && (
                        <button
                          className="flex-shrink-0 mt-0.5 h-5 w-5 rounded flex items-center justify-center hover:bg-gray-100 transition-colors"
                          onClick={() => handleMarkOne(n.id)}
                          title="Mark as read"
                        >
                          <Check className="h-3 w-3 text-muted-foreground" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
