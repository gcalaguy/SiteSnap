import { useState } from "react";
import { useParams, Link, useLocation } from "wouter";
import { 
  useGetProject, 
  useGetProjectSummary, 
  useListDailyReports, 
  useListCostAnalyses, 
  useListRFIs 
} from "@workspace/api-client-react";
import { format } from "date-fns";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, ChevronLeft, MapPin, Calendar, DollarSign, FileText, AlertTriangle, Building } from "lucide-react";

export default function ProjectDetail() {
  const params = useParams();
  const projectId = Number(params.id);
  const [, setLocation] = useLocation();

  const { data: project, isLoading: projectLoading } = useGetProject(projectId, { query: { enabled: !!projectId } });
  const { data: summary } = useGetProjectSummary(projectId, { query: { enabled: !!projectId } });
  const { data: reports } = useListDailyReports(projectId, { query: { enabled: !!projectId } });
  const { data: costAnalyses } = useListCostAnalyses(projectId, { query: { enabled: !!projectId } });
  const { data: rfis } = useListRFIs(projectId, { query: { enabled: !!projectId } });

  const getStatusBadge = (status?: string) => {
    if (!status) return null;
    switch (status) {
      case "active": return <Badge variant="default" className="bg-green-600">Active</Badge>;
      case "planning": return <Badge variant="secondary">Planning</Badge>;
      case "on_hold": return <Badge variant="outline" className="text-orange-600 border-orange-600">On Hold</Badge>;
      case "completed": return <Badge variant="default" className="bg-blue-600">Completed</Badge>;
      case "cancelled": return <Badge variant="destructive">Cancelled</Badge>;
      default: return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case "urgent": return <Badge variant="destructive">Urgent</Badge>;
      case "high": return <Badge variant="default" className="bg-orange-600">High</Badge>;
      case "medium": return <Badge variant="secondary">Medium</Badge>;
      case "low": return <Badge variant="outline">Low</Badge>;
      default: return <Badge variant="outline">{priority}</Badge>;
    }
  }

  if (projectLoading) return <div className="p-8 text-center text-muted-foreground animate-pulse">Loading project...</div>;
  if (!project) return <div className="p-8 text-center">Project not found</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="outline" size="icon" onClick={() => setLocation("/projects")}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-3xl font-bold tracking-tight">{project.name}</h1>
            {getStatusBadge(project.status)}
          </div>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-1"><MapPin className="h-4 w-4" /> {project.address}, {project.city}, {project.province}</span>
            {project.startDate && <span className="flex items-center gap-1"><Calendar className="h-4 w-4" /> Started: {format(new Date(project.startDate), "MMM d, yyyy")}</span>}
          </div>
        </div>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-4 lg:w-[600px]">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="reports">Daily Reports</TabsTrigger>
          <TabsTrigger value="cost">Cost Analysis</TabsTrigger>
          <TabsTrigger value="rfis">RFIs</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4 mt-6">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Budget</CardTitle>
                <DollarSign className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">${summary?.totalBudget?.toLocaleString() || "0"}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Spent</CardTitle>
                <DollarSign className="h-4 w-4 text-destructive" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">${summary?.totalSpent?.toLocaleString() || "0"}</div>
                {summary?.budgetUtilizationPercent && (
                  <p className="text-xs text-muted-foreground">{summary.budgetUtilizationPercent.toFixed(1)}% utilized</p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Daily Reports</CardTitle>
                <FileText className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{summary?.reportCount || 0}</div>
                {summary?.lastReportDate && <p className="text-xs text-muted-foreground">Last: {format(new Date(summary.lastReportDate), "MMM d")}</p>}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Open RFIs</CardTitle>
                <AlertTriangle className="h-4 w-4 text-orange-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{summary?.openRFICount || 0}</div>
                <p className="text-xs text-muted-foreground">{summary?.closedRFICount || 0} closed</p>
              </CardContent>
            </Card>
          </div>
          {project.description && (
            <Card>
              <CardHeader>
                <CardTitle>Project Description</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground whitespace-pre-wrap">{project.description}</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="reports" className="mt-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-xl font-bold">Daily Reports</h3>
            <Button onClick={() => setLocation(`/projects/${projectId}/reports/new`)}>
              <Plus className="mr-2 h-4 w-4" /> New Report
            </Button>
          </div>
          {reports?.length === 0 ? (
            <div className="text-center p-8 border rounded-md bg-card">
              <FileText className="mx-auto h-8 w-8 text-muted-foreground mb-3" />
              <p>No daily reports yet.</p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {reports?.map(report => (
                <Card key={report.id} className="hover:border-primary/50 transition-colors cursor-pointer">
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start mb-2">
                      <span className="font-bold text-lg">{format(new Date(report.reportDate), "MMM d, yyyy")}</span>
                      <Badge variant="outline">Crew: {report.crewCount}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-2 mt-2">{report.workPerformed}</p>
                    {report.aiSummary && (
                      <div className="mt-3 text-xs bg-muted/30 p-2 rounded border border-border/50">
                        <span className="font-semibold block mb-1">AI Summary:</span>
                        <span className="line-clamp-2 text-muted-foreground">{report.aiSummary}</span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="cost" className="mt-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-xl font-bold">Cost Analysis</h3>
            <Button onClick={() => setLocation(`/projects/${projectId}/cost/new`)}>
              <Plus className="mr-2 h-4 w-4" /> Add Cost Record
            </Button>
          </div>
          {costAnalyses?.length === 0 ? (
            <div className="text-center p-8 border rounded-md bg-card">
              <DollarSign className="mx-auto h-8 w-8 text-muted-foreground mb-3" />
              <p>No cost records yet.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {costAnalyses?.map(cost => (
                <Card key={cost.id}>
                  <CardHeader className="pb-2">
                    <div className="flex justify-between items-center">
                      <CardTitle className="text-lg">{cost.periodLabel}</CardTitle>
                      <span className="font-bold text-lg text-destructive">${cost.totalCost.toLocaleString()}</span>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mt-2 border-t pt-4">
                      <div><span className="text-muted-foreground block text-xs">Labour</span><span className="font-medium">${cost.labourCost.toLocaleString()}</span></div>
                      <div><span className="text-muted-foreground block text-xs">Materials</span><span className="font-medium">${cost.materialsCost.toLocaleString()}</span></div>
                      <div><span className="text-muted-foreground block text-xs">Equipment</span><span className="font-medium">${cost.equipmentCost.toLocaleString()}</span></div>
                      <div><span className="text-muted-foreground block text-xs">Other</span><span className="font-medium">${cost.otherCost.toLocaleString()}</span></div>
                    </div>
                    {cost.aiAnalysis && (
                      <div className="mt-4 text-sm bg-blue-50/50 dark:bg-blue-900/10 p-3 rounded border border-blue-200 dark:border-blue-800">
                        <span className="font-semibold block mb-1 text-blue-700 dark:text-blue-400">AI Insight:</span>
                        <span className="text-muted-foreground whitespace-pre-wrap">{cost.aiAnalysis}</span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="rfis" className="mt-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-xl font-bold">RFIs</h3>
            <Button onClick={() => setLocation(`/projects/${projectId}/rfis/new`)}>
              <Plus className="mr-2 h-4 w-4" /> Create RFI
            </Button>
          </div>
          {rfis?.length === 0 ? (
            <div className="text-center p-8 border rounded-md bg-card">
              <AlertTriangle className="mx-auto h-8 w-8 text-muted-foreground mb-3" />
              <p>No RFIs generated.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {rfis?.map(rfi => (
                <div key={rfi.id} className="flex items-start justify-between p-4 border rounded-md bg-card hover:border-primary/50 transition-colors cursor-pointer">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium text-muted-foreground">{rfi.rfiNumber}</span>
                      <h4 className="font-bold text-lg">{rfi.subject}</h4>
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-1 max-w-2xl">{rfi.description}</p>
                    {rfi.dueDate && <p className="text-xs text-muted-foreground mt-2">Due: {format(new Date(rfi.dueDate), "MMM d, yyyy")}</p>}
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <Badge variant={rfi.status === 'open' || rfi.status === 'in_review' ? 'default' : 'secondary'} className={rfi.status === 'open' ? 'bg-orange-600' : ''}>
                      {rfi.status.replace("_", " ").toUpperCase()}
                    </Badge>
                    {getPriorityBadge(rfi.priority)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
