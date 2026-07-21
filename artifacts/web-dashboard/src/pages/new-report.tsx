import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useGetProject, useCreateDailyReport, useGenerateDailyReportAI, useAddReportPhoto } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { getListDailyReportsQueryKey } from "@workspace/api-client-react";
import { getAiErrorMessage } from "@/hooks/useApiError";
import { useDraftRecovery } from "@/hooks/useDraftRecovery";
import { DraftBanner } from "@/components/DraftBanner";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, Loader2, Sparkles, Camera, X, Upload, Cloud, HardHat, Package, TriangleAlert } from "lucide-react";

import {
  createDailyReportBodyWorkPerformedMax as WORK_MAX,
  createDailyReportBodyMaterialsUsedMax as MATERIALS_MAX,
  createDailyReportBodyEquipmentMax as EQUIPMENT_MAX,
  createDailyReportBodyIssuesMax as ISSUES_MAX,
  generateDailyReportAIBodyRawInputMax as RAW_INPUT_MAX,
} from "@workspace/api-zod";

const reportSchema = z.object({
  reportDate: z.string(),
  weather: z.string().optional(),
  temperature: z.string().optional(),
  crewCount: z.coerce.number().min(0),
  workPerformed: z.string().min(2, "Required"),
  materialsUsed: z.string().optional(),
  equipment: z.string().optional(),
  issues: z.string().optional(),
  notes: z.string().optional(),
  aiSummary: z.string().optional(),
});

type PhotoCategory = "progress" | "issue" | "site_condition";

type PhotoUpload = {
  file: File;
  previewUrl: string;
  objectPath?: string;
  uploaded: boolean;
  uploading: boolean;
  error?: string;
  category: PhotoCategory;
};

const PHOTO_CATEGORY_OPTIONS: { value: PhotoCategory; label: string }[] = [
  { value: "progress", label: "Progress Photo" },
  { value: "issue", label: "Issue / Defect" },
  { value: "site_condition", label: "Site Condition" },
];

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
      notes: "",
      aiSummary: "",
    },
  });

  const draft = useDraftRecovery(
    `new-report:${projectId}`,
    () => {
      const vals = form.getValues();
      return {
        ...vals,
        rawInput,
      };
    },
    (state) => {
      form.reset(state as z.infer<typeof reportSchema>);
      if (typeof state.rawInput === "string") setRawInput(state.rawInput);
    }
  );

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
          toast({ title: "AI Generation Failed", description: getAiErrorMessage(err), variant: "destructive" });
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
      category: "progress",
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

  function setPhotoCategory(index: number, category: PhotoCategory) {
    setPhotos(prev => prev.map((p, i) => (i === index ? { ...p, category } : p)));
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

            for (let i = 0; i < paths.length; i++) {
              const objectPath = paths[i];
              if (objectPath) {
                await addPhoto.mutateAsync({
                  projectId,
                  reportId: report.id,
                  data: { objectPath, category: photos[i].category },
                });
              }
            }
          }

          toast({ title: "Report saved", description: photos.length > 0 ? `${photos.filter(Boolean).length} photo(s) attached.` : undefined });
          draft.clearDraft();
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

      <DraftBanner show={draft.showBanner} onRestore={draft.restoreDraft} onDiscard={draft.discardDraft} />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-1 space-y-6">
          <Card className="bg-primary/5 border-primary/20">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                AI Assistant
              </CardTitle>
              <CardDescription>Paste your raw notes. AI will structure it into the report fields.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="relative">
                <Textarea
                  placeholder="e.g. 5 guys on site today. Finished framing the 2nd floor. Used 50 studs. Weather was sunny. Had an issue with the lift..."
                  className="min-h-[180px] bg-background"
                  value={rawInput}
                  onChange={(e) => setRawInput(e.target.value.slice(0, RAW_INPUT_MAX))}
                  maxLength={RAW_INPUT_MAX}
                />
              </div>
              <div className="flex items-center justify-end gap-2">
                <p className={`text-xs shrink-0 tabular-nums ${rawInput.length >= RAW_INPUT_MAX ? "text-destructive font-medium" : rawInput.length >= RAW_INPUT_MAX * 0.8 ? "text-amber-500" : "text-muted-foreground"}`}>
                  {rawInput.length.toLocaleString()}/{RAW_INPUT_MAX.toLocaleString()}
                </p>
              </div>
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
                    <div key={i} className="space-y-1">
                      <div className="relative group rounded-md overflow-hidden border bg-muted aspect-square">
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
                      <Select value={photo.category} onValueChange={(v) => setPhotoCategory(i, v as PhotoCategory)}>
                        <SelectTrigger className="h-7 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {PHOTO_CATEGORY_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value} className="text-xs">
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
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
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5 mb-2">
                      <Cloud className="h-3.5 w-3.5" /> Site Conditions
                    </p>
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
                  </div>

                  <div className="border-t border-border pt-6">
                    <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5 mb-2">
                      <HardHat className="h-3.5 w-3.5" /> Work Summary
                    </p>
                  </div>

                  <FormField control={form.control} name="workPerformed" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Work Performed *</FormLabel>
                      <FormControl>
                        <Textarea
                          className="min-h-[100px]"
                          maxLength={WORK_MAX}
                          {...field}
                          onChange={(e) => field.onChange(e.target.value.slice(0, WORK_MAX))}
                        />
                      </FormControl>
                      <div className="flex justify-end">
                        <p className={`text-xs tabular-nums ${field.value.length >= WORK_MAX ? "text-destructive font-medium" : field.value.length >= WORK_MAX * 0.8 ? "text-amber-500" : "text-muted-foreground"}`}>
                          {field.value.length.toLocaleString()}/{WORK_MAX.toLocaleString()}
                        </p>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <div className="border-t border-border pt-6">
                    <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5 mb-2">
                      <Package className="h-3.5 w-3.5" /> Materials & Equipment
                    </p>
                  </div>

                  <FormField control={form.control} name="materialsUsed" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Materials Used</FormLabel>
                      <FormControl>
                        <Textarea
                          className="min-h-[60px]"
                          maxLength={MATERIALS_MAX}
                          {...field}
                          onChange={(e) => field.onChange(e.target.value.slice(0, MATERIALS_MAX))}
                        />
                      </FormControl>
                      <div className="flex justify-end">
                        <p className={`text-xs tabular-nums ${(field.value?.length ?? 0) >= MATERIALS_MAX ? "text-destructive font-medium" : (field.value?.length ?? 0) >= MATERIALS_MAX * 0.8 ? "text-amber-500" : "text-muted-foreground"}`}>
                          {(field.value?.length ?? 0).toLocaleString()}/{MATERIALS_MAX.toLocaleString()}
                        </p>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )} />
                  
                  <FormField control={form.control} name="equipment" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Equipment on Site</FormLabel>
                      <FormControl>
                        <Textarea
                          className="min-h-[60px]"
                          maxLength={EQUIPMENT_MAX}
                          {...field}
                          onChange={(e) => field.onChange(e.target.value.slice(0, EQUIPMENT_MAX))}
                        />
                      </FormControl>
                      <div className="flex justify-end">
                        <p className={`text-xs tabular-nums ${(field.value?.length ?? 0) >= EQUIPMENT_MAX ? "text-destructive font-medium" : (field.value?.length ?? 0) >= EQUIPMENT_MAX * 0.8 ? "text-amber-500" : "text-muted-foreground"}`}>
                          {(field.value?.length ?? 0).toLocaleString()}/{EQUIPMENT_MAX.toLocaleString()}
                        </p>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <div className="border-t border-border pt-6">
                    <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5 mb-2">
                      <TriangleAlert className="h-3.5 w-3.5" /> Issues & Next Steps
                    </p>
                  </div>

                  <FormField control={form.control} name="issues" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Issues / Delays</FormLabel>
                      <FormControl>
                        <Textarea
                          className="min-h-[60px]"
                          maxLength={ISSUES_MAX}
                          {...field}
                          onChange={(e) => field.onChange(e.target.value.slice(0, ISSUES_MAX))}
                        />
                      </FormControl>
                      <div className="flex justify-end">
                        <p className={`text-xs tabular-nums ${(field.value?.length ?? 0) >= ISSUES_MAX ? "text-destructive font-medium" : (field.value?.length ?? 0) >= ISSUES_MAX * 0.8 ? "text-amber-500" : "text-muted-foreground"}`}>
                          {(field.value?.length ?? 0).toLocaleString()}/{ISSUES_MAX.toLocaleString()}
                        </p>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <FormField control={form.control} name="notes" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Notes / Next Steps</FormLabel>
                      <FormControl>
                        <Textarea
                          className="min-h-[60px]"
                          placeholder="What's planned next..."
                          maxLength={ISSUES_MAX}
                          {...field}
                          onChange={(e) => field.onChange(e.target.value.slice(0, ISSUES_MAX))}
                        />
                      </FormControl>
                      <div className="flex justify-end">
                        <p className={`text-xs tabular-nums ${(field.value?.length ?? 0) >= ISSUES_MAX ? "text-destructive font-medium" : (field.value?.length ?? 0) >= ISSUES_MAX * 0.8 ? "text-amber-500" : "text-muted-foreground"}`}>
                          {(field.value?.length ?? 0).toLocaleString()}/{ISSUES_MAX.toLocaleString()}
                        </p>
                      </div>
                      <FormMessage />
                    </FormItem>
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
                    <Button type="submit" disabled={isSubmitting || form.watch("workPerformed").length >= WORK_MAX || (form.watch("materialsUsed")?.length ?? 0) >= MATERIALS_MAX || (form.watch("equipment")?.length ?? 0) >= EQUIPMENT_MAX || (form.watch("issues")?.length ?? 0) >= ISSUES_MAX}>
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
