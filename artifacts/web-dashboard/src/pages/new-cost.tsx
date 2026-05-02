import { useParams, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useGetProject, useCreateCostAnalysis, useGenerateCostAnalysisAI } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { getListCostAnalysesQueryKey, getGetProjectSummaryQueryKey } from "@workspace/api-client-react";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { ChevronLeft, Loader2, Sparkles, DollarSign } from "lucide-react";

const costSchema = z.object({
  periodLabel: z.string().min(2, "Required"),
  labourCost: z.coerce.number().min(0),
  materialsCost: z.coerce.number().min(0),
  equipmentCost: z.coerce.number().min(0),
  otherCost: z.coerce.number().min(0),
  notes: z.string().optional(),
  aiAnalysis: z.string().optional(),
});

export default function NewCost() {
  const params = useParams();
  const projectId = Number(params.id);
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const { data: project } = useGetProject(projectId, { query: { enabled: !!projectId } });
  const createCost = useCreateCostAnalysis();
  const generateAI = useGenerateCostAnalysisAI();

  const form = useForm<z.infer<typeof costSchema>>({
    resolver: zodResolver(costSchema),
    defaultValues: {
      periodLabel: "Week of " + new Date().toISOString().split('T')[0],
      labourCost: 0,
      materialsCost: 0,
      equipmentCost: 0,
      otherCost: 0,
      notes: "",
      aiAnalysis: "",
    },
  });

  const watchCosts = form.watch(["labourCost", "materialsCost", "equipmentCost", "otherCost"]);
  const totalCost = watchCosts.reduce((a, b) => (Number(a) || 0) + (Number(b) || 0), 0);

  async function handleAIGenerate() {
    if (!project) return;
    
    generateAI.mutate(
      { 
        data: { 
          projectName: project.name, 
          labourCost: form.getValues().labourCost,
          materialsCost: form.getValues().materialsCost,
          equipmentCost: form.getValues().equipmentCost,
          otherCost: form.getValues().otherCost,
          budget: project.budget,
          notes: form.getValues().notes
        } 
      },
      {
        onSuccess: (data) => {
          form.setValue("aiAnalysis", data.analysis);
          toast({ title: "AI Analysis Complete" });
        },
        onError: (err: any) => {
          toast({ title: "AI Analysis Failed", description: err.message, variant: "destructive" });
        }
      }
    );
  }

  function onSubmit(values: z.infer<typeof costSchema>) {
    createCost.mutate(
      { projectId, data: values },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListCostAnalysesQueryKey(projectId) });
          queryClient.invalidateQueries({ queryKey: getGetProjectSummaryQueryKey(projectId) });
          toast({ title: "Cost record saved" });
          setLocation(`/projects/${projectId}`);
        },
        onError: (err: any) => {
          toast({ title: "Error saving record", description: err.message, variant: "destructive" });
        }
      }
    );
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-4">
        <Button variant="outline" size="icon" onClick={() => setLocation(`/projects/${projectId}`)}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">New Cost Record</h1>
          <p className="text-muted-foreground">{project?.name}</p>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField control={form.control} name="periodLabel" render={({ field }) => (
                <FormItem><FormLabel>Period Label</FormLabel><FormControl><Input placeholder="Week 3 / Oct 2023" {...field} /></FormControl><FormMessage /></FormItem>
              )} />

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 border rounded-md bg-muted/10">
                <FormField control={form.control} name="labourCost" render={({ field }) => (
                  <FormItem><FormLabel>Labour ($)</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="materialsCost" render={({ field }) => (
                  <FormItem><FormLabel>Materials ($)</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="equipmentCost" render={({ field }) => (
                  <FormItem><FormLabel>Equipment ($)</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="otherCost" render={({ field }) => (
                  <FormItem><FormLabel>Other ($)</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
              </div>

              <div className="flex items-center justify-between p-4 bg-muted/30 rounded-md border font-bold text-lg">
                <span>Total for Period:</span>
                <span className="text-destructive">${totalCost.toLocaleString()}</span>
              </div>

              <FormField control={form.control} name="notes" render={({ field }) => (
                <FormItem><FormLabel>Notes / Details</FormLabel><FormControl><Textarea className="min-h-[100px]" placeholder="Explain any unexpected costs..." {...field} /></FormControl><FormMessage /></FormItem>
              )} />

              <div className="space-y-3">
                <Button type="button" variant="secondary" className="w-full" onClick={handleAIGenerate} disabled={totalCost === 0 || generateAI.isPending}>
                  {generateAI.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4 text-primary" />}
                  Generate AI Cost Analysis
                </Button>
                
                {form.watch("aiAnalysis") && (
                  <FormField control={form.control} name="aiAnalysis" render={({ field }) => (
                    <FormItem>
                      <FormLabel>AI Analysis</FormLabel>
                      <FormControl>
                        <Textarea className="min-h-[150px] bg-blue-50/30 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800 text-sm" {...field} />
                      </FormControl>
                    </FormItem>
                  )} />
                )}
              </div>

              <div className="flex justify-end gap-4">
                <Button type="button" variant="outline" onClick={() => setLocation(`/projects/${projectId}`)}>Cancel</Button>
                <Button type="submit" disabled={createCost.isPending}>
                  {createCost.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save Record
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
