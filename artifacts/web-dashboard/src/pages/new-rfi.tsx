import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useGetProject, useCreateRFI, useGenerateRFIAI } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { getListRFIsQueryKey, getGetProjectSummaryQueryKey } from "@workspace/api-client-react";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ChevronLeft, Loader2, Sparkles } from "lucide-react";

const rfiSchema = z.object({
  subject: z.string().min(2, "Required"),
  description: z.string().min(10, "Description needs more detail"),
  priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
  dueDate: z.string().optional(),
  aiDraftResponse: z.string().optional(),
});

export default function NewRFI() {
  const params = useParams();
  const projectId = Number(params.id);
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const { data: project } = useGetProject(projectId, { query: { enabled: !!projectId } });
  const createRFI = useCreateRFI();
  const generateAI = useGenerateRFIAI();

  const form = useForm<z.infer<typeof rfiSchema>>({
    resolver: zodResolver(rfiSchema),
    defaultValues: {
      subject: "",
      description: "",
      priority: "medium",
      dueDate: "",
      aiDraftResponse: "",
    },
  });

  async function handleAIGenerate() {
    if (!form.getValues().subject || !form.getValues().description || !project) return;
    
    generateAI.mutate(
      { 
        data: { 
          projectName: project.name, 
          subject: form.getValues().subject,
          description: form.getValues().description
        } 
      },
      {
        onSuccess: (data) => {
          form.setValue("subject", data.formalSubject);
          form.setValue("description", data.formalDescription);
          form.setValue("aiDraftResponse", data.suggestedResponse);
          toast({ title: "AI Polished RFI" });
        },
        onError: (err: any) => {
          toast({ title: "AI Enhancement Failed", description: err.message, variant: "destructive" });
        }
      }
    );
  }

  function onSubmit(values: z.infer<typeof rfiSchema>) {
    createRFI.mutate(
      { projectId, data: values },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListRFIsQueryKey(projectId) });
          queryClient.invalidateQueries({ queryKey: getGetProjectSummaryQueryKey(projectId) });
          toast({ title: "RFI created" });
          setLocation(`/projects/${projectId}`);
        },
        onError: (err: any) => {
          toast({ title: "Error creating RFI", description: err.message, variant: "destructive" });
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
          <h1 className="text-3xl font-bold tracking-tight">Create RFI</h1>
          <p className="text-muted-foreground">{project?.name}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2">
          <Card>
            <CardContent className="pt-6">
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  
                  <FormField control={form.control} name="subject" render={({ field }) => (
                    <FormItem><FormLabel>Subject</FormLabel><FormControl><Input placeholder="e.g. Dimensions of elevator shaft" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />

                  <FormField control={form.control} name="description" render={({ field }) => (
                    <FormItem><FormLabel>Description / Question</FormLabel><FormControl><Textarea className="min-h-[150px]" placeholder="Explain the issue clearly..." {...field} /></FormControl><FormMessage /></FormItem>
                  )} />

                  <div className="grid grid-cols-2 gap-4">
                    <FormField control={form.control} name="priority" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Priority</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger><SelectValue placeholder="Select priority" /></SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="low">Low</SelectItem>
                            <SelectItem value="medium">Medium</SelectItem>
                            <SelectItem value="high">High</SelectItem>
                            <SelectItem value="urgent">Urgent</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="dueDate" render={({ field }) => (
                      <FormItem><FormLabel>Due Date (Optional)</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                  </div>

                  {form.watch("aiDraftResponse") && (
                    <div className="bg-muted/30 p-4 rounded-md border text-sm">
                      <p className="font-semibold mb-1">AI Suggested Resolution / Draft:</p>
                      <p className="text-muted-foreground whitespace-pre-wrap">{form.watch("aiDraftResponse")}</p>
                    </div>
                  )}

                  <div className="flex justify-end gap-4">
                    <Button type="button" variant="outline" onClick={() => setLocation(`/projects/${projectId}`)}>Cancel</Button>
                    <Button type="submit" disabled={createRFI.isPending}>
                      {createRFI.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Submit RFI
                    </Button>
                  </div>
                </form>
              </Form>
            </CardContent>
          </Card>
        </div>

        <div className="md:col-span-1 space-y-6">
          <Card className="bg-primary/5 border-primary/20">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                AI RFI Polisher
              </CardTitle>
              <CardDescription>Write a rough draft of your question. AI will re-write it formally and suggest a potential resolution.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button 
                variant="secondary" 
                className="w-full" 
                onClick={handleAIGenerate} 
                disabled={!form.watch("subject") || !form.watch("description") || generateAI.isPending}
              >
                {generateAI.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Polish & Enhance RFI
              </Button>
            </CardContent>
          </Card>
        </div>

      </div>
    </div>
  );
}
