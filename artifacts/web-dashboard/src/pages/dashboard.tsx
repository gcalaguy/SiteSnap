import { useGetDashboardSummary, useGetRecentActivity } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, FileText, MessageSquareWarning, Users, Activity, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import { WeatherCard } from "@/components/WeatherCard";
import { Link } from "wouter";

const GOLD = "#C9A84C";
const BLACK = "#111111";

export default function Dashboard() {
  const { data: summary, isLoading: isLoadingSummary } = useGetDashboardSummary();
  const { data: activity, isLoading: isLoadingActivity } = useGetRecentActivity();

  if (isLoadingSummary || isLoadingActivity) {
    return <div className="p-8 text-center text-muted-foreground animate-pulse">Loading dashboard...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">Overview of your company's projects and activities.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
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
                  {summary?.totalProjects ?? 0} total · {((summary?.totalProjects ?? 0) - (summary?.activeProjects ?? 0))} completed
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
      </div>

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
          <Card style={{ background: BLACK, border: "none", boxShadow: "0 4px 16px rgba(0,0,0,0.18)" }}>
            <CardHeader>
              <CardTitle style={{ color: GOLD }}>Quick Actions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-sm text-zinc-500 p-4 rounded-md" style={{ background: "#1a1a1a", border: "1px solid #2a2a2a" }}>
                Navigate to a specific project to create daily reports, submit RFIs, or analyze costs.
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
