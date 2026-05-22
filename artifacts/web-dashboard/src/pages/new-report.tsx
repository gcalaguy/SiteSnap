import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useGetProject, useCreateDailyReport, useGenerateDailyReportAI, useAddReportPhoto } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { getListDailyReportsQueryKey } from "@workspace/api-client-react";
import { useVoiceRecorder } from "@/hooks/useVoiceRecorder";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { ChevronLeft, Loader2, Sparkles, Camera, X, Upload, Mic, MicOff } from "lucide-react";

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

type PhotoUpload = {
  file: File;
  previewUrl: string;
  objectPath?: string;
  uploaded: boolean;
  uploading: boolean;
  error?: string;
};

export default function NewReport() {
  const params = useParams();
  const projectId = Number(params.id);
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const { data: project } = useGetProject(projectId);
  const createReport = useCreateDailyReport();
  const generateAI = useGenerateDailyReportAI();
  const addPhoto = useAddReportPhoto();

  const [rawInput, setRawInput] = useState("");
  const [photos, setPhotos] = useState<PhotoUpload[]>([]);

  const voice = useVoiceRecorder((transcript) => {
    setRawInput((prev) => (prev ? `${prev.trimEnd()} ${transcript}` : transcript));
  });

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
          toast({ title: "AI Generation Complete", description: "Fields populated from your notes." });
        },
        onError: (err: unknown) => {
          toast({ title: "AI Generation Failed", description: String(err), variant: "destructive" });
        }
      }
    );
  }

  function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    const newPhotos: PhotoUpload[] = files.map(file => ({
      file,
      previewUrl: URL.createObjectURL(file),
      uploaded: false,
      uploading: false,
    }));
    setPhotos(prev => [...prev, ...newPhotos]);
    e.target.value = "";
  }

  function removePhoto(index: number) {
    setPhotos(prev => {
      URL.revokeObjectURL(prev[index].previewUrl);
      return prev.filter((_, i) => i !== index);
    });
  }

  async function fetchWithTimeout(url: string, init: RequestInit & { timeout?: number } = {}): Promise<Response> {
    const { timeout = 30000, ...rest } = init;
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
      const res = await fetch(url, { ...rest, signal: controller.signal });
      return res;
    } finally {
      clearTimeout(id);
    }
  }

  async function uploadPhoto(photo: PhotoUpload, index: number): Promise<string | null> {
    setPhotos(prev => prev.map((p, i) => i === index ? { ...p, uploading: true, error: undefined } : p));
    const maxRetries = 2;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          await new Promise(r => setTimeout(r, 1000 * attempt));
        }
        const urlRes = await fetchWithTimeout("/api/storage/uploads/request-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: photo.file.name, size: photo.file.size, contentType: photo.file.type }),
          credentials: "include",
          timeout: 15000,
        });
        if (!urlRes.ok) throw new Error("Failed to get upload URL");
        const { uploadURL, objectPath } = await urlRes.json();

        const putRes = await fetchWithTimeout(uploadURL, {
          method: "PUT",
          headers: { "Content-Type": photo.file.type },
          body: photo.file,
          timeout: 60000,
        });
        if (!putRes.ok) throw new Error("Failed to upload file");

        setPhotos(prev => prev.map((p, i) => i === index ? { ...p, uploading: false, uploaded: true, objectPath } : p));
        return objectPath as string;
      } catch (err) {
        const isLast = attempt === maxRetries;
        const msg = err instanceof Error ? err.message : "Upload failed";
        if (isLast) {
          setPhotos(prev => prev.map((p, i) => i === index ? { ...p, uploading: false, error: msg } : p));
          return null;
        }
      }
    }
    return null;
  }

  async function onSubmit(values: z.infer<typeof reportSchema>) {
    createReport.mutate(
      { projectId, data: values },
      {
        onSuccess: async (report) => {
          queryClient.invalidateQueries({ queryKey: getListDailyReportsQueryKey(projectId) });

          if (photos.length > 0) {
            const uploadPromises = photos.map((photo, i) =>
              photo.uploaded ? Promise.resolve(photo.objectPath!) : uploadPhoto(photo, i)
            );
            const paths = await Promise.all(uploadPromises);

            for (const objectPath of paths) {
              if (objectPath) {
                await addPhoto.mutateAsync({
                  projectId,
                  reportId: report.id,
                  data: { objectPath },
                });
              }
            }
          }

          toast({ title: "Report saved", description: photos.length > 0 ? `${photos.filter(Boolean).length} photo(s) attached.` : undefined });
          setLocation(`/projects/${projectId}`);
        },
        onError: (err: unknown) => {
          toast({ title: "Error saving report", description: String(err), variant: "destructive" });
        }
      }
    );
  }

  const isSubmitting = createReport.isPending || addPhoto.isPending;

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
              <div className="relative">
                <Textarea 
                  placeholder="e.g. 5 guys on site today. Finished framing the 2nd floor. Used 50 studs. Weather was sunny. Had an issue with the lift..." 
                  className="min-h-[180px] bg-background pr-12"
                  value={rawInput}
                  onChange={(e) => setRawInput(e.target.value)}
                />
                <button
                  type="button"
                  title={voice.state === "recording" ? "Stop recording" : "Dictate notes"}
                  onClick={voice.toggle}
                  disabled={voice.state === "transcribing"}
                  className={[
                    "absolute top-2 right-2 p-2 rounded-full transition-colors",
                    voice.state === "recording"
                      ? "bg-red-500 text-white animate-pulse"
                      : voice.state === "transcribing"
                        ? "bg-muted text-muted-foreground"
                        : "bg-muted hover:bg-primary/10 text-muted-foreground hover:text-primary",
                  ].join(" ")}
                >
                  {voice.state === "transcribing"
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : voice.state === "recording"
                      ? <MicOff className="h-4 w-4" />
                      : <Mic className="h-4 w-4" />}
                </button>
              </div>
              {voice.state === "recording" && (
                <p className="text-xs text-red-500 flex items-center gap-1.5">
                  <span className="inline-block h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                  Recording… tap the mic to stop and transcribe
                </p>
              )}
              {voice.error && (
                <p className="text-xs text-destructive">{voice.error}</p>
              )}
              <Button className="w-full" onClick={handleAIGenerate} disabled={!rawInput.trim() || generateAI.isPending}>
                {generateAI.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Generate Fields
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Camera className="h-5 w-5 text-muted-foreground" />
                Site Photos
              </CardTitle>
              <CardDescription>Attach photos to this report. They'll be saved when you submit.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {photos.length > 0 && (
                <div className="grid grid-cols-2 gap-2">
                  {photos.map((photo, i) => (
                    <div key={i} className="relative group rounded-md overflow-hidden border bg-muted aspect-square">
                      <img src={photo.previewUrl} alt="preview" className="w-full h-full object-cover" />
                      {photo.uploading && (
                        <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                          <Loader2 className="h-5 w-5 text-white animate-spin" />
                        </div>
                      )}
                      {photo.uploaded && (
                        <div className="absolute bottom-1 right-1 bg-green-500 rounded-full p-0.5">
                          <Upload className="h-3 w-3 text-white" />
                        </div>
                      )}
                      {photo.error && (
                        <div className="absolute inset-0 bg-red-500/80 flex items-center justify-center p-1">
                          <p className="text-white text-xs text-center">{photo.error}</p>
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => removePhoto(i)}
                        className="absolute top-1 right-1 bg-black/60 rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="h-3 w-3 text-white" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <label className="flex flex-col items-center justify-center w-full h-20 border-2 border-dashed border-border rounded-md cursor-pointer hover:border-primary/50 hover:bg-muted/20 transition-colors">
                <Camera className="h-5 w-5 text-muted-foreground mb-1" />
                <span className="text-xs text-muted-foreground">Click to add photos</span>
                <input
                  type="file"
                  multiple
                  accept="image/*"
                  className="hidden"
                  onChange={handlePhotoSelect}
                />
              </label>
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
                    <div className="bg-primary/5 border border-primary/20 p-4 rounded-md text-sm">
                      <p className="font-semibold mb-1 flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-primary" />
                        AI Generated Summary
                      </p>
                      <p className="text-muted-foreground">{form.watch("aiSummary")}</p>
                    </div>
                  )}

                  <div className="flex justify-end gap-4">
                    <Button type="button" variant="outline" onClick={() => setLocation(`/projects/${projectId}`)}>Cancel</Button>
                    <Button type="submit" disabled={isSubmitting}>
                      {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Save Report{photos.length > 0 ? ` + ${photos.length} Photo${photos.length > 1 ? 's' : ''}` : ''}
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
