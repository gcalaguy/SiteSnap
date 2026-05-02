import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useGetProject, useCreateDailyReport, useGenerateDailyReportAI } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { getListDailyReportsQueryKey } from "@workspace/api-client-react";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { ChevronLeft, Loader2, Sparkles } from "lucide-react";

const reportSchema = z.object({
  reportDate: z.string(),
  weather: z.string().optional(),
  temperature: z.string().optional(),
  crewCount: z.coerce.number().min(0),
  workPerformed: z.string().min(2, "Required"),
  materialsUsed: z.string().optional(),
  equipment: z.string().optional(),
  issues: z.string().optional(),
  aiSummary: z.string().optional(),
});

export default function NewReport() {
  const params = useParams();
  const projectId = Number(params.id);
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const { data: project } = useGetProject(projectId, { query: { enabled: !!projectId } });
  const createReport = useCreateDailyReport();
  const generateAI = useGenerateDailyReportAI();

  const [rawInput, setRawInput] = useState("");

  const form = useForm<z.infer<typeof reportSchema>>({
    resolver: zodResolver(reportSchema),
    defaultValues: {
      reportDate: new Date().toISOString().split('T')[0],
      weather: "",
      temperature: "",
      crewCount: 0,
      workPerformed: "",
      materialsUsed: "",
      equipment: "",
      issues: "",
      aiSummary: "",
    },
  });

  async function handleAIGenerate() {
    if (!rawInput.trim() || !project) return;
    
    generateAI.mutate(
      { 
        data: { 
          projectName: project.name, 
          rawInput, 
          reportDate: form.getValues().reportDate,
          crewCount: form.getValues().crewCount
        } 
      },
      {
        onSuccess: (data) => {
          form.setValue("workPerformed", data.workPerformed);
          form.setValue("materialsUsed", data.materialsUsed || "");
          form.setValue("equipment", data.equipment || "");
          form.setValue("issues", data.issues || "");
          form.setValue("aiSummary", data.summary);
          toast({ title: "AI Generation Complete" });
        },
        onError: (err: any) => {
          toast({ title: "AI Generation Failed", description: err.message, variant: "destructive" });
        }
      }
    );
  }

  function onSubmit(values: z.infer<typeof reportSchema>) {
    createReport.mutate(
      { projectId, data: values },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListDailyReportsQueryKey(projectId) });
          toast({ title: "Report saved" });
          setLocation(`/projects/${projectId}`);
        },
        onError: (err: any) => {
          toast({ title: "Error saving report", description: err.message, variant: "destructive" });
        }
      }
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-4">
        <Button variant="outline" size="icon" onClick={() => setLocation(`/projects/${projectId}`)}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">New Daily Report</h1>
          <p className="text-muted-foreground">{project?.name}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-1 space-y-6">
          <Card className="bg-primary/5 border-primary/20">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                AI Assistant
              </CardTitle>
              <CardDescription>Paste your raw notes or voice transcript. AI will structure it into the report fields.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea 
                placeholder="e.g. 5 guys on site today. Finished framing the 2nd floor. Used 50 studs. Weather was sunny. Had an issue with the lift..." 
                className="min-h-[200px] bg-background"
                value={rawInput}
                onChange={(e) => setRawInput(e.target.value)}
              />
              <Button className="w-full" onClick={handleAIGenerate} disabled={!rawInput.trim() || generateAI.isPending}>
                {generateAI.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Generate Fields
              </Button>
            </CardContent>
          </Card>
        </div>

        <div className="md:col-span-2">
          <Card>
            <CardContent className="pt-6">
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <FormField control={form.control} name="reportDate" render={({ field }) => (
                      <FormItem><FormLabel>Date</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="crewCount" render={({ field }) => (
                      <FormItem><FormLabel>Crew Count</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="weather" render={({ field }) => (
                      <FormItem><FormLabel>Weather</FormLabel><FormControl><Input placeholder="Sunny, light rain..." {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="temperature" render={({ field }) => (
                      <FormItem><FormLabel>Temp</FormLabel><FormControl><Input placeholder="20C" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                  </div>

                  <FormField control={form.control} name="workPerformed" render={({ field }) => (
                    <FormItem><FormLabel>Work Performed *</FormLabel><FormControl><Textarea className="min-h-[100px]" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />

                  <FormField control={form.control} name="materialsUsed" render={({ field }) => (
                    <FormItem><FormLabel>Materials Used</FormLabel><FormControl><Textarea className="min-h-[60px]" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  
                  <FormField control={form.control} name="equipment" render={({ field }) => (
                    <FormItem><FormLabel>Equipment on Site</FormLabel><FormControl><Textarea className="min-h-[60px]" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />

                  <FormField control={form.control} name="issues" render={({ field }) => (
                    <FormItem><FormLabel>Issues / Delays</FormLabel><FormControl><Textarea className="min-h-[60px]" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />

                  {form.watch("aiSummary") && (
                    <div className="bg-muted/50 p-4 rounded-md border text-sm">
                      <p className="font-semibold mb-1">AI Generated Summary (saved with report):</p>
                      <p className="text-muted-foreground">{form.watch("aiSummary")}</p>
                    </div>
                  )}

                  <div className="flex justify-end gap-4">
                    <Button type="button" variant="outline" onClick={() => setLocation(`/projects/${projectId}`)}>Cancel</Button>
                    <Button type="submit" disabled={createReport.isPending}>
                      {createReport.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Save Report
                    </Button>
                  </div>
                </form>
              </Form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
