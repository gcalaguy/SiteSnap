import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import {
  useListDailyReports,
  useDeleteDailyReport,
  useUpdateDailyReport,
  getListDailyReportsQueryKey,
} from "@workspace/api-client-react";
import { format } from "date-fns";
import { queryClient } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { CharCountedTextarea } from "@/components/ui/char-counted-textarea";
import { Plus, ChevronDown, ChevronUp, FileText, Pencil, Trash2, Loader2, User, Cloud, Thermometer, Package, Wrench, TriangleAlert, Mic } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { createDailyReportBodyWorkPerformedMax as REPORT_FIELD_MAX } from "@workspace/api-zod";
import { PhotoThumbnail } from "./PhotoThumbnail";
import type { Member } from "./TasksTab";
import { getMemberName } from "./TasksTab";

export function ReportsTab({
  projectId,
  selectedWorkerId,
  members,
  isOwnerOrForeman,
}: {
  projectId: number;
  selectedWorkerId: number | null;
  members: Member[];
  isOwnerOrForeman: boolean;
}) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const { data: reports } = useListDailyReports(projectId);

  const [expandedReportId, setExpandedReportId] = useState<number | null>(null);
  const [editingReportId, setEditingReportId] = useState<number | null>(null);
  const [editReportWork, setEditReportWork] = useState("");
  const [editReportMaterials, setEditReportMaterials] = useState("");
  const [editReportIssues, setEditReportIssues] = useState("");

  const selectedMember = selectedWorkerId ? members.find((m) => m.id === selectedWorkerId) : null;

  const filteredReports = selectedWorkerId
    ? (reports ?? []).filter((r: any) => r.submittedByUserId === selectedWorkerId)
    : (reports ?? []);

  useEffect(() => {
    if (!editingReportId) return;
    const r = filteredReports.find((x: any) => x.id === editingReportId);
    if (r) {
      setEditReportWork(r.workPerformed ?? "");
      setEditReportMaterials(r.materialsUsed ?? "");
      setEditReportIssues(r.issues ?? "");
    }
  }, [editingReportId]);

  const deleteDailyReport = useDeleteDailyReport({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListDailyReportsQueryKey(projectId) });
        toast({ title: "Daily report deleted" });
      },
      onError: (err: any) => toast({ title: err?.message ?? "Failed to delete report", variant: "destructive" }),
    },
  });

  const updateDailyReport = useUpdateDailyReport({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListDailyReportsQueryKey(projectId) });
        setEditingReportId(null);
        toast({ title: "Daily report updated" });
      },
      onError: (err: any) => toast({ title: err?.message ?? "Failed to update report", variant: "destructive" }),
    },
  });

  return (
    <>
      <div className="flex justify-between items-center mb-4">
        <div>
          <h3 className="text-xl font-bold">Daily Reports</h3>
          {selectedMember && (
            <p className="text-sm text-muted-foreground mt-0.5">
              Showing reports submitted by <span className="font-medium text-foreground">{getMemberName(selectedMember)}</span>
            </p>
          )}
        </div>
        <Button onClick={() => setLocation(`/projects/${projectId}/reports/new`)}>
          <Plus className="mr-2 h-4 w-4" /> New Report
        </Button>
      </div>
      {filteredReports.length === 0 ? (
        <div className="text-center p-8 border rounded-md bg-card">
          <FileText className="mx-auto h-8 w-8 text-muted-foreground mb-3" />
          <p>{selectedMember ? `No reports submitted by ${getMemberName(selectedMember)}.` : "No daily reports yet."}</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {filteredReports.map((report: any) => {
            const photos: any[] = report.photos ?? [];
            const isExpanded = expandedReportId === report.id;
            return (
              <Card
                key={report.id}
                className="hover:border-primary/50 transition-colors cursor-pointer select-none"
                onClick={() => setExpandedReportId(isExpanded ? null : report.id)}
              >
                <CardContent className="p-4">
                  {/* Header row */}
                  <div className="flex justify-between items-start mb-2">
                    <span className="font-bold text-lg">{format(new Date(report.reportDate), "MMM d, yyyy")}</span>
                    <div className="flex items-center gap-2">
                      {report.submittedBy && (
                        <Badge variant="outline" className="gap-1">
                          <User className="h-3 w-3" />
                          {report.submittedBy.firstName} {report.submittedBy.lastName}
                        </Badge>
                      )}
                      {photos.length > 0 && (
                        <Badge variant="secondary" className="gap-1">
                          <span>📷</span> {photos.length}
                        </Badge>
                      )}
                      {isExpanded
                        ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                        : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                      {isOwnerOrForeman && (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 hover:bg-muted"
                            title="Edit report"
                            onClick={(e) => { e.stopPropagation(); setEditingReportId(report.id); }}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                            title="Delete report"
                            onClick={(e) => { e.stopPropagation(); deleteDailyReport.mutate({ projectId, reportId: report.id }); }}
                            disabled={deleteDailyReport.isPending}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>

                  {!selectedMember && report.submittedBy && (
                    <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                      <User className="h-3 w-3" />
                      {report.submittedBy.firstName} {report.submittedBy.lastName}
                    </p>
                  )}

                  {/* Work performed — truncated when collapsed */}
                  <p className={`text-sm text-muted-foreground mt-1 ${isExpanded ? "" : "line-clamp-2"}`}>
                    {report.workPerformed}
                  </p>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div className="mt-4 space-y-3 border-t border-border pt-3">
                      {/* Weather row */}
                      {(report.weather || report.temperature) && (
                        <div className="flex flex-wrap gap-3 text-sm">
                          {report.weather && (
                            <span className="flex items-center gap-1 text-muted-foreground">
                              <Cloud className="h-3.5 w-3.5" /> {report.weather}
                            </span>
                          )}
                          {report.temperature && (
                            <span className="flex items-center gap-1 text-muted-foreground">
                              <Thermometer className="h-3.5 w-3.5" /> {report.temperature}
                            </span>
                          )}
                        </div>
                      )}

                      {/* Materials */}
                      {report.materialsUsed && (
                        <div>
                          <p className="text-xs font-semibold text-foreground flex items-center gap-1 mb-0.5">
                            <Package className="h-3.5 w-3.5" /> Materials Used
                          </p>
                          <p className="text-sm text-muted-foreground">{report.materialsUsed}</p>
                        </div>
                      )}

                      {/* Equipment */}
                      {report.equipment && (
                        <div>
                          <p className="text-xs font-semibold text-foreground flex items-center gap-1 mb-0.5">
                            <Wrench className="h-3.5 w-3.5" /> Equipment
                          </p>
                          <p className="text-sm text-muted-foreground">{report.equipment}</p>
                        </div>
                      )}

                      {/* Voice / Streaming Notes */}
                      {report.notes && (
                        <div className="bg-blue-950/20 border border-blue-900/40 rounded-md p-3">
                          <p className="text-xs font-semibold text-blue-700 dark:text-blue-400 flex items-center gap-1 mb-0.5">
                            <Mic className="h-3.5 w-3.5" /> Voice Notes
                          </p>
                          <p className="text-sm text-blue-800 dark:text-blue-300">{report.notes}</p>
                        </div>
                      )}

                      {/* Issues */}
                      {report.issues && (
                        <div className="bg-amber-950/30 border border-amber-900/50 rounded-md p-3">
                          <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1 mb-0.5">
                            <TriangleAlert className="h-3.5 w-3.5" /> Issues / Delays
                          </p>
                          <p className="text-sm text-amber-800 dark:text-amber-300">{report.issues}</p>
                        </div>
                      )}

                      {/* Photos */}
                      {photos.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-foreground mb-2">Site Photos</p>
                          <div className="flex flex-wrap gap-2">
                            {photos.map((photo: any) => (
                              <PhotoThumbnail key={photo.id} photo={photo} />
                            ))}
                          </div>
                        </div>
                      )}

                      {/* AI Summary */}
                      {report.aiSummary && (
                        <div className="bg-muted/30 p-3 rounded border border-border/50">
                          <p className="text-xs font-semibold mb-1">AI Summary</p>
                          <p className="text-sm text-muted-foreground">{report.aiSummary}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Collapsed photo strip + AI summary hint */}
                  {!isExpanded && (
                    <>
                      {photos.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {photos.slice(0, 3).map((photo: any) => (
                            <PhotoThumbnail key={photo.id} photo={photo} compact />
                          ))}
                          {photos.length > 3 && (
                            <div className="h-16 w-16 rounded-md border border-border bg-muted flex items-center justify-center text-xs text-muted-foreground font-medium">
                              +{photos.length - 3}
                            </div>
                          )}
                        </div>
                      )}
                      {report.aiSummary && (
                        <div className="mt-3 text-xs bg-muted/30 p-2 rounded border border-border/50">
                          <span className="font-semibold block mb-1">AI Summary:</span>
                          <span className="line-clamp-2 text-muted-foreground">{report.aiSummary}</span>
                        </div>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Edit Daily Report Dialog */}
      {(() => {
        const report = filteredReports.find((r: any) => r.id === editingReportId);
        if (!report) return null;
        return (
          <Dialog open={!!editingReportId} onOpenChange={() => setEditingReportId(null)}>
            <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Edit Daily Report</DialogTitle></DialogHeader>
              <div className="space-y-3 py-2">
                <Label>Date</Label>
                <Input type="date" defaultValue={report.reportDate.split("T")[0]} id={`edit-report-date-${report.id}`} />
                <Label>Work Performed</Label>
                <CharCountedTextarea
                  value={editReportWork}
                  onChange={(e) => setEditReportWork(e.target.value.slice(0, REPORT_FIELD_MAX))}
                  rows={3}
                  maxLength={REPORT_FIELD_MAX}
                />
                <Label>Weather</Label>
                <Input defaultValue={report.weather ?? ""} id={`edit-report-weather-${report.id}`} />
                <Label>Temperature</Label>
                <Input defaultValue={report.temperature ?? ""} id={`edit-report-temp-${report.id}`} />
                <Label>Materials Used</Label>
                <CharCountedTextarea
                  value={editReportMaterials}
                  onChange={(e) => setEditReportMaterials(e.target.value.slice(0, REPORT_FIELD_MAX))}
                  rows={2}
                  maxLength={REPORT_FIELD_MAX}
                />
                <Label>Equipment</Label>
                <Input defaultValue={report.equipment ?? ""} id={`edit-report-equipment-${report.id}`} />
                <Label>Issues / Delays</Label>
                <CharCountedTextarea
                  value={editReportIssues}
                  onChange={(e) => setEditReportIssues(e.target.value.slice(0, REPORT_FIELD_MAX))}
                  rows={2}
                  maxLength={REPORT_FIELD_MAX}
                />
                <Label>Crew Count</Label>
                <Input type="number" defaultValue={report.crewCount ?? ""} id={`edit-report-crew-${report.id}`} />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setEditingReportId(null)}>Cancel</Button>
                <Button
                  onClick={() => {
                    const dateVal = (document.getElementById(`edit-report-date-${report.id}`) as HTMLInputElement)?.value;
                    const weatherVal = (document.getElementById(`edit-report-weather-${report.id}`) as HTMLInputElement)?.value;
                    const tempVal = (document.getElementById(`edit-report-temp-${report.id}`) as HTMLInputElement)?.value;
                    const equipmentVal = (document.getElementById(`edit-report-equipment-${report.id}`) as HTMLInputElement)?.value;
                    const crewVal = (document.getElementById(`edit-report-crew-${report.id}`) as HTMLInputElement)?.value;
                    updateDailyReport.mutate({
                      projectId,
                      reportId: report.id,
                      data: {
                        reportDate: dateVal ? new Date(dateVal).toISOString() : report.reportDate,
                        workPerformed: editReportWork,
                        weather: weatherVal || undefined,
                        temperature: tempVal || undefined,
                        materialsUsed: editReportMaterials || undefined,
                        equipment: equipmentVal || undefined,
                        issues: editReportIssues || undefined,
                        crewCount: crewVal ? Number(crewVal) : undefined,
                      } as any,
                    });
                  }}
                  disabled={updateDailyReport.isPending || editReportWork.length >= REPORT_FIELD_MAX || editReportMaterials.length >= REPORT_FIELD_MAX || editReportIssues.length >= REPORT_FIELD_MAX}
                >
                  {updateDailyReport.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Changes"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        );
      })()}
    </>
  );
}
