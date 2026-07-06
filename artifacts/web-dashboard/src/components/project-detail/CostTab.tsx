import { useState } from "react";
import { useLocation } from "wouter";
import {
  useListCostAnalyses,
  useDeleteCostAnalysis,
  useUpdateCostAnalysis,
  getListCostAnalysesQueryKey,
  ApiError,
} from "@workspace/api-client-react";
import type { CreateCostAnalysisBody } from "@workspace/api-client-react";
import { queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, ChevronDown, ChevronUp, DollarSign, Pencil, Trash2, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";

export function CostTab({
  projectId,
  isOwnerOrForeman,
}: {
  projectId: number;
  isOwnerOrForeman: boolean;
}) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const { data: costAnalyses } = useListCostAnalyses(projectId);

  const [expandedCostId, setExpandedCostId] = useState<number | null>(null);
  const [editingCostId, setEditingCostId] = useState<number | null>(null);

  const deleteCostAnalysis = useDeleteCostAnalysis({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListCostAnalysesQueryKey(projectId) });
        toast({ title: "Cost analysis deleted" });
      },
      onError: (err: ApiError) => toast({ title: err?.message ?? "Failed to delete cost record", variant: "destructive" }),
    },
  });

  const updateCostAnalysis = useUpdateCostAnalysis({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListCostAnalysesQueryKey(projectId) });
        setEditingCostId(null);
        toast({ title: "Cost analysis updated" });
      },
      onError: (err: ApiError) => toast({ title: err?.message ?? "Failed to update cost record", variant: "destructive" }),
    },
  });

  return (
    <>
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-xl font-bold">Cost Analysis</h3>
        <Button onClick={() => setLocation(`/projects/${projectId}/cost/new`)}>
          <Plus className="mr-2 h-4 w-4" /> Add Cost Record
        </Button>
      </div>
      {costAnalyses && costAnalyses.length > 0 && (
        <Card className="mb-6">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Spend by Period</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart
                data={costAnalyses.map((c) => ({
                  name: c.periodLabel,
                  Labour: Number(c.labourCost),
                  Materials: Number(c.materialsCost),
                  Equipment: Number(c.equipmentCost),
                  Other: Number(c.otherCost),
                }))}
                margin={{ top: 4, right: 16, left: 0, bottom: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number) => [`$${v.toLocaleString()}`, undefined]} />
                <Legend />
                <Bar dataKey="Labour" stackId="a" fill="#3b82f6" radius={[0, 0, 0, 0]} />
                <Bar dataKey="Materials" stackId="a" fill="#f59e0b" />
                <Bar dataKey="Equipment" stackId="a" fill="#D4AF37" />
                <Bar dataKey="Other" stackId="a" fill="#94a3b8" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
      {costAnalyses?.length === 0 ? (
        <div className="text-center p-8 border rounded-md bg-card">
          <DollarSign className="mx-auto h-8 w-8 text-muted-foreground mb-3" />
          <p>No cost records yet.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {costAnalyses?.map(cost => {
            const isCostExpanded = expandedCostId === cost.id;
            return (
              <Card
                key={cost.id}
                className="hover:border-primary/50 transition-colors cursor-pointer select-none"
                onClick={() => setExpandedCostId(isCostExpanded ? null : cost.id)}
              >
                <CardHeader className="pb-2">
                  <div className="flex justify-between items-center">
                    <CardTitle className="text-lg">{cost.periodLabel}</CardTitle>
                    <div className="flex items-center gap-3">
                      <span className="font-bold text-lg text-destructive">${cost.totalCost.toLocaleString()}</span>
                      {isCostExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                      {isOwnerOrForeman && (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 hover:bg-muted"
                            title="Edit cost record"
                            onClick={(e) => { e.stopPropagation(); setEditingCostId(cost.id); }}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                            title="Delete cost record"
                            onClick={(e) => { e.stopPropagation(); deleteCostAnalysis.mutate({ projectId, analysisId: cost.id }); }}
                            disabled={deleteCostAnalysis.isPending}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </CardHeader>
                {isCostExpanded && (
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
                )}
                {!isCostExpanded && (
                  <CardContent className="pb-3 pt-0">
                    <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                      <span>Labour: <span className="font-medium text-foreground">${cost.labourCost.toLocaleString()}</span></span>
                      <span>Materials: <span className="font-medium text-foreground">${cost.materialsCost.toLocaleString()}</span></span>
                      <span>Equipment: <span className="font-medium text-foreground">${cost.equipmentCost.toLocaleString()}</span></span>
                      <span>Other: <span className="font-medium text-foreground">${cost.otherCost.toLocaleString()}</span></span>
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Edit Cost Analysis Dialog */}
      {(() => {
        const cost = costAnalyses?.find((c) => c.id === editingCostId);
        if (!cost) return null;
        return (
          <Dialog open={!!editingCostId} onOpenChange={() => setEditingCostId(null)}>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader><DialogTitle>Edit Cost Record</DialogTitle></DialogHeader>
              <div className="space-y-3 py-2">
                <Label>Period Label</Label>
                <Input defaultValue={cost.periodLabel} id={`edit-cost-label-${cost.id}`} />
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Labour</Label><Input type="number" defaultValue={cost.labourCost} id={`edit-cost-labour-${cost.id}`} /></div>
                  <div><Label>Materials</Label><Input type="number" defaultValue={cost.materialsCost} id={`edit-cost-materials-${cost.id}`} /></div>
                  <div><Label>Equipment</Label><Input type="number" defaultValue={cost.equipmentCost} id={`edit-cost-equipment-${cost.id}`} /></div>
                  <div><Label>Other</Label><Input type="number" defaultValue={cost.otherCost} id={`edit-cost-other-${cost.id}`} /></div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setEditingCostId(null)}>Cancel</Button>
                <Button
                  onClick={() => {
                    const label = (document.getElementById(`edit-cost-label-${cost.id}`) as HTMLInputElement)?.value;
                    const labour = Number((document.getElementById(`edit-cost-labour-${cost.id}`) as HTMLInputElement)?.value);
                    const materials = Number((document.getElementById(`edit-cost-materials-${cost.id}`) as HTMLInputElement)?.value);
                    const equipment = Number((document.getElementById(`edit-cost-equipment-${cost.id}`) as HTMLInputElement)?.value);
                    const other = Number((document.getElementById(`edit-cost-other-${cost.id}`) as HTMLInputElement)?.value);
                    updateCostAnalysis.mutate({
                      projectId,
                      analysisId: cost.id,
                      data: {
                        periodLabel: label ?? cost.periodLabel,
                        labourCost: isNaN(labour) ? cost.labourCost : labour,
                        materialsCost: isNaN(materials) ? cost.materialsCost : materials,
                        equipmentCost: isNaN(equipment) ? cost.equipmentCost : equipment,
                        otherCost: isNaN(other) ? cost.otherCost : other,
                      } satisfies CreateCostAnalysisBody,
                    });
                  }}
                  disabled={updateCostAnalysis.isPending}
                >
                  {updateCostAnalysis.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Changes"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        );
      })()}
    </>
  );
}
