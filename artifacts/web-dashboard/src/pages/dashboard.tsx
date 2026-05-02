import { useGetDashboardSummary, useGetRecentActivity } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, FileText, MessageSquareWarning, Users, Activity } from "lucide-react";
import { format } from "date-fns";

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
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Projects</CardTitle>
            <Building2 className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.activeProjects || 0}</div>
            <p className="text-xs text-muted-foreground">
              Out of {summary?.totalProjects || 0} total projects
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Reports This Week</CardTitle>
            <FileText className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.reportsThisWeek || 0}</div>
            <p className="text-xs text-muted-foreground">Daily reports submitted</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Open RFIs</CardTitle>
            <MessageSquareWarning className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.openRFIs || 0}</div>
            <p className="text-xs text-muted-foreground">Awaiting response</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Team Members</CardTitle>
            <Users className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.teamMemberCount || 0}</div>
            <p className="text-xs text-muted-foreground">Active in workspace</p>
          </CardContent>
        </Card>
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
                    <div className="mt-1 flex h-9 w-9 items-center justify-center rounded-full border bg-muted">
                      <Activity className="h-4 w-4 text-muted-foreground" />
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

        <Card className="col-span-3">
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            {/* Quick action buttons would go here - but they usually need a project context first */}
            <div className="text-sm text-muted-foreground bg-muted/50 p-4 rounded-md border border-border">
              Navigate to a specific project to create daily reports, submit RFIs, or analyze costs.
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
