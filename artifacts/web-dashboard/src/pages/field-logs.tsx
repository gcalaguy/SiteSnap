import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  useListDailyLogs,
  useListSitePhotos,
  useListSafetySignoffs,
  useListProjects,
  useGetMe,
  getListDailyLogsQueryKey,
  getListSitePhotosQueryKey,
  getListSafetySignoffsQueryKey,
  customFetch,
} from "@workspace/api-client-react";
import { queryClient } from "@/lib/queryClient";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { CharCountedTextarea } from "@/components/ui/char-counted-textarea";
import { createDailyLogBodyNotesMax as NOTES_MAX } from "@workspace/api-zod";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  FileText,
  Search,
  Camera,
  ShieldCheck,
  Cloud,
  Thermometer,
  MapPin,
  Clock,
  CheckCircle2,
  PenLine,
  X,
  Pencil,
  Trash2,
} from "lucide-react";
import { format } from "date-fns";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function storageViewUrl(raw: string | null | undefined): string {
  if (!raw) return "";
  if (raw.startsWith("/objects/")) {
    return `${BASE}${raw.replace(/^\/objects\//, "/api/storage/objects/")}`;
  }
  return raw;
}

function isLegacySignature(url: string | null | undefined): boolean {
  return !url || url === "signed://digital" || url.startsWith("file://");
}

/** Convert an imageUrl or filePath into a signed-url endpoint path. */
function getSignedUrlPath(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const normalized = raw.replace(/^\//, "");
  if (normalized.startsWith("objects/")) {
    const rest = normalized.replace(/^objects\//, "");
    return `/api/storage/objects/${rest}/signed-url`;
  }
  if (normalized.startsWith("api/storage/objects/")) {
    const rest = normalized.replace(/^api\/storage\/objects\//, "");
    return `/api/storage/objects/${rest}/signed-url`;
  }
  return null;
}

/** Fetch a signed GCS URL for a private storage object. Caches for 10 min. */
function useSignedPhotoUrl(imageUrl: string | undefined | null) {
  const signedPath = getSignedUrlPath(imageUrl);
  return useQuery({
    queryKey: ["signed-photo-url", imageUrl],
    queryFn: async () => {
      if (!signedPath) return null;
      const { url } = (await customFetch(signedPath)) as { url: string };
      return url;
    },
    enabled: !!signedPath,
    staleTime: 10 * 60 * 1000, // 10 minutes
    gcTime: 15 * 60 * 1000,    // 15 minutes
  });
}

/** Single photo card with signed URL fetching. */
function PhotoCard({
  photo,
  isOwner,
  editingPhotoId,
  setEditingPhotoId,
  setLightboxUrl,
  handleDelete,
  handleUpdatePhoto,
}: {
  photo: any;
  isOwner: boolean;
  editingPhotoId: number | null;
  setEditingPhotoId: (id: number | null) => void;
  setLightboxUrl: (url: string | null) => void;
  handleDelete: (type: string, id: number) => void;
  handleUpdatePhoto: (id: number, data: any) => void;
}) {
  const { data: signedUrl, isLoading } = useSignedPhotoUrl(photo.imageUrl);
  const imgUrl = signedUrl || storageViewUrl(photo.imageUrl);

  const onClick = async () => {
    if (!imgUrl) return;
    if (photo.imageUrl) {
      const sp = getSignedUrlPath(photo.imageUrl);
      if (sp) {
        try {
          const { url } = (await customFetch(sp)) as { url: string };
          setLightboxUrl(url);
          return;
        } catch {
          // fall back to direct URL
        }
      }
    }
    setLightboxUrl(imgUrl);
  };

  return (
    <Card
      className="border-[#D4AF37]/10 overflow-hidden cursor-pointer group"
      onClick={onClick}
    >
      <div className="aspect-square bg-gray-100 relative overflow-hidden">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-full w-full text-muted-foreground text-xs gap-1">
            <div className="w-6 h-6 border-2 border-[#D4AF37] border-t-transparent rounded-full animate-spin" />
            <span>Loading...</span>
          </div>
        ) : imgUrl ? (
          <img
            src={imgUrl}
            alt="Site photo"
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
              const parent = (e.target as HTMLImageElement).parentElement;
              if (parent) {
                parent.innerHTML = `
                  <div class="flex flex-col items-center justify-center h-full w-full text-muted-foreground text-xs gap-1">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>
                    Photo unavailable
                  </div>`;
              }
            }}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full w-full text-muted-foreground text-xs gap-1">
            <Camera className="h-6 w-6" />
            <span>No image URL</span>
          </div>
        )}
        {photo.markupData && (
          <Badge className="absolute top-2 right-2 bg-[#D4AF37] text-white text-[10px]">
            Marked up
          </Badge>
        )}
        {isOwner && (
          <div className="absolute top-2 left-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setEditingPhotoId(photo.id);
              }}
              className="p-1 rounded bg-white/90 hover:bg-white shadow text-[#D4AF37]"
              title="Edit"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleDelete("photo", photo.id);
              }}
              className="p-1 rounded bg-white/90 hover:bg-white shadow text-red-500"
              title="Delete"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
      <CardContent className="p-3">
        {editingPhotoId === photo.id ? (
          <div className="space-y-2">
            <Input
              defaultValue={photo.roomLocation || ""}
              placeholder="Room / Location"
              className="text-xs border-[#D4AF37]/20 focus-visible:ring-[#D4AF37]"
              data-photo-id={photo.id}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const val = (e.target as HTMLInputElement).value;
                  handleUpdatePhoto(photo.id, { roomLocation: val });
                }
              }}
            />
            <div className="flex gap-2">
              <button
                onClick={() => {
                  const el = document.querySelector(
                    `[data-photo-id="${photo.id}"]`
                  ) as HTMLInputElement;
                  if (el) handleUpdatePhoto(photo.id, { roomLocation: el.value });
                }}
                className="px-2 py-1 text-[10px] rounded bg-[#D4AF37] text-white hover:bg-[#C9A02F]"
              >
                Save
              </button>
              <button
                onClick={() => setEditingPhotoId(null)}
                className="px-2 py-1 text-[10px] rounded bg-gray-100 text-gray-600 hover:bg-gray-200"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-0.5">
            <p className="text-xs font-medium text-[#0A0A0A]">
              {photo.roomLocation || "Untitled"}
            </p>
            <p className="text-[10px] text-[#0A0A0A]/50">
              {format(new Date(photo.createdAt), "MMM d, h:mm a")}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Owner-only inline edit form for a daily log. */
function LogEditForm({
  log,
  onCancel,
  onSave,
  isSaving,
}: {
  log: any;
  onCancel: () => void;
  onSave: (data: { notes?: string; weatherTemp?: string; weatherCondition?: string }) => void;
  isSaving: boolean;
}) {
  const [notes, setNotes] = useState(log.notes || "");
  const [weatherTemp, setWeatherTemp] = useState(log.weatherTemp || "");
  const [weatherCondition, setWeatherCondition] = useState(log.weatherCondition || "");

  return (
    <div className="space-y-3">
      <CharCountedTextarea
        value={notes}
        onChange={(e) => setNotes(e.target.value.slice(0, NOTES_MAX))}
        placeholder="Notes"
        maxLength={NOTES_MAX}
        rows={3}
        className="border-[#D4AF37]/20 focus-visible:ring-[#D4AF37]"
      />
      <div className="flex gap-2">
        <Input
          value={weatherTemp}
          onChange={(e) => setWeatherTemp(e.target.value)}
          placeholder="Temp"
          className="border-[#D4AF37]/20 focus-visible:ring-[#D4AF37] w-28"
        />
        <Input
          value={weatherCondition}
          onChange={(e) => setWeatherCondition(e.target.value)}
          placeholder="Condition"
          className="border-[#D4AF37]/20 focus-visible:ring-[#D4AF37] flex-1"
        />
      </div>
      <div className="flex gap-2 justify-end">
        <button
          onClick={onCancel}
          className="px-3 py-1.5 text-xs font-medium rounded-md border border-[#D4AF37]/20 hover:bg-[#D4AF37]/5"
          disabled={isSaving}
        >
          Cancel
        </button>
        <button
          onClick={() => onSave({ notes, weatherTemp, weatherCondition })}
          className="px-3 py-1.5 text-xs font-medium rounded-md bg-[#D4AF37] text-white hover:bg-[#C9A02F]"
          disabled={isSaving}
        >
          {isSaving ? "Saving..." : "Save"}
        </button>
      </div>
    </div>
  );
}

export default function FieldLogsPage() {
  const { data: user } = useGetMe();
  const isOwner = user?.role === "owner";
  const { data: projects = [] } = useListProjects();
  const [search, setSearch] = useState("");
  const [activeProjectId, setActiveProjectId] = useState<number | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const projectId = activeProjectId ?? (projects[0]?.id ?? null);

  const dailyLogParams = projectId ? { projectId } : { projectId: 0 };
  const photoParams = projectId ? { projectId } : { projectId: 0 };
  const safetyParams = projectId ? { projectId } : { projectId: 0 };

  const { data: logs = [], isLoading: logsLoading } = useListDailyLogs(
    dailyLogParams,
    { query: { queryKey: getListDailyLogsQueryKey(dailyLogParams), enabled: !!projectId } },
  );
  const { data: photos = [], isLoading: photosLoading } = useListSitePhotos(
    photoParams,
    { query: { queryKey: getListSitePhotosQueryKey(photoParams), enabled: !!projectId } },
  );
  const { data: signoffs = [], isLoading: signoffsLoading } = useListSafetySignoffs(
    safetyParams,
    { query: { queryKey: getListSafetySignoffsQueryKey(safetyParams), enabled: !!projectId } },
  );

  const [editingLogId, setEditingLogId] = useState<number | null>(null);
  const [editingPhotoId, setEditingPhotoId] = useState<number | null>(null);
  const [editingSafetyId, setEditingSafetyId] = useState<number | null>(null);
  const [savingId, setSavingId] = useState<number | null>(null);

  const filteredLogs = logs.filter((l) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (l.notes ?? "").toLowerCase().includes(q) ||
      (l.weatherCondition ?? "").toLowerCase().includes(q)
    );
  });

  async function handleDelete(type: "log" | "photo" | "safety", id: number) {
    if (!confirm("Delete this item? This cannot be undone.")) return;
    const url =
      type === "log"
        ? `${BASE}/api/field/daily-log/${id}`
        : type === "photo"
          ? `${BASE}/api/field/photo-upload/${id}`
          : `${BASE}/api/field/safety-check/${id}`;
    try {
      const res = await fetch(url, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("Delete failed");
      if (type === "log") queryClient.invalidateQueries({ queryKey: getListDailyLogsQueryKey(dailyLogParams) });
      if (type === "photo") queryClient.invalidateQueries({ queryKey: getListSitePhotosQueryKey(photoParams) });
      if (type === "safety") queryClient.invalidateQueries({ queryKey: getListSafetySignoffsQueryKey(safetyParams) });
    } catch {
      alert("Failed to delete. Only owners can remove items.");
    }
  }

  async function handleUpdateLog(id: number, data: { notes?: string; weatherTemp?: string; weatherCondition?: string }) {
    setSavingId(id);
    try {
      const res = await fetch(`${BASE}/api/field/daily-log/${id}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Update failed");
      setEditingLogId(null);
      queryClient.invalidateQueries({ queryKey: getListDailyLogsQueryKey(dailyLogParams) });
    } catch {
      alert("Failed to update. Only owners can edit items.");
    } finally {
      setSavingId(null);
    }
  }

  async function handleUpdatePhoto(id: number, data: { roomLocation?: string }) {
    setSavingId(id);
    try {
      const res = await fetch(`${BASE}/api/field/photo-upload/${id}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Update failed");
      setEditingPhotoId(null);
      queryClient.invalidateQueries({ queryKey: getListSitePhotosQueryKey(photoParams) });
    } catch {
      alert("Failed to update. Only owners can edit items.");
    } finally {
      setSavingId(null);
    }
  }

  async function handleUpdateSafety(id: number, data: { responses?: Record<string, string>; signatureUrl?: string | null }) {
    setSavingId(id);
    try {
      const res = await fetch(`${BASE}/api/field/safety-check/${id}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Update failed");
      setEditingSafetyId(null);
      queryClient.invalidateQueries({ queryKey: getListSafetySignoffsQueryKey(safetyParams) });
    } catch {
      alert("Failed to update. Only owners can edit items.");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-[#121212] flex items-center gap-2">
          <FileText className="h-6 w-6" style={{ color: "#D4AF37" }} />
          Field Logs
        </h1>
        <p className="text-sm text-[#121212]/60 font-medium">
          Daily notes, site photos, and safety signoffs from the field.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#D4AF37]" />
          <Input
            className="pl-9 border-[#D4AF37]/20 focus-visible:ring-[#D4AF37]"
            placeholder="Search logs..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className="h-9 px-3 rounded-md border border-[#D4AF37]/20 bg-white text-sm focus-visible:ring-[#D4AF37] outline-none"
          value={projectId ?? ""}
          onChange={(e) => setActiveProjectId(Number(e.target.value) || null)}
        >
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      <Tabs defaultValue="logs">
        <TabsList className="bg-white border border-[#D4AF37]/20">
          <TabsTrigger
            value="logs"
            className="data-[state=active]:bg-[#D4AF37]/10 data-[state=active]:text-[#121212]"
          >
            <FileText className="h-4 w-4 mr-1.5" /> Daily Logs ({logs.length})
          </TabsTrigger>
          <TabsTrigger
            value="photos"
            className="data-[state=active]:bg-[#D4AF37]/10 data-[state=active]:text-[#121212]"
          >
            <Camera className="h-4 w-4 mr-1.5" /> Photos ({photos.length})
          </TabsTrigger>
          <TabsTrigger
            value="safety"
            className="data-[state=active]:bg-[#D4AF37]/10 data-[state=active]:text-[#121212]"
          >
            <ShieldCheck className="h-4 w-4 mr-1.5" /> Safety (
            {signoffs.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="logs" className="mt-4">
          {logsLoading ? (
            <div className="text-sm text-muted-foreground">
              Loading logs...
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              No daily logs yet.
            </div>
          ) : (
            <div className="space-y-3">
              {filteredLogs.map((log) => (
                <Card key={log.id} className="border-[#D4AF37]/10">
                  <CardContent className="p-4">
                    {editingLogId === log.id ? (
                      <LogEditForm
                        log={log}
                        onCancel={() => setEditingLogId(null)}
                        onSave={(data) => handleUpdateLog(log.id, data)}
                        isSaving={savingId === log.id}
                      />
                    ) : (
                      <div className="flex items-start justify-between gap-4">
                        <div className="space-y-1 flex-1 min-w-0">
                          <p className="text-sm font-medium text-[#121212]">
                            {log.notes || "No notes"}
                          </p>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {format(new Date(log.createdAt), "MMM d, h:mm a")}
                            </span>
                            {log.weatherTemp && (
                              <span className="flex items-center gap-1">
                                <Thermometer className="h-3 w-3" />
                                {log.weatherTemp}
                              </span>
                            )}
                            {log.weatherCondition && (
                              <span className="flex items-center gap-1">
                                <Cloud className="h-3 w-3" />
                                {log.weatherCondition}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="shrink-0 flex items-center gap-2">
                          <Badge
                            variant="outline"
                            className="text-[10px]"
                          >
                            {log.createdByName ?? `User #${log.foremanId}`}
                          </Badge>
                          {isOwner && (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => setEditingLogId(log.id)}
                                className="p-1 rounded hover:bg-[#D4AF37]/10 text-[#D4AF37]"
                                title="Edit"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => handleDelete("log", log.id)}
                                className="p-1 rounded hover:bg-red-50 text-red-500"
                                title="Delete"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="photos" className="mt-4">
          {photosLoading ? (
            <div className="text-sm text-muted-foreground">
              Loading photos...
            </div>
          ) : photos.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              No site photos yet.
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {photos.map((photo) => (
                <PhotoCard
                  key={photo.id}
                  photo={photo}
                  isOwner={isOwner}
                  editingPhotoId={editingPhotoId}
                  setEditingPhotoId={setEditingPhotoId}
                  setLightboxUrl={setLightboxUrl}
                  handleDelete={handleDelete}
                  handleUpdatePhoto={handleUpdatePhoto}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="safety" className="mt-4">
          {signoffsLoading ? (
            <div className="text-sm text-muted-foreground">
              Loading signoffs...
            </div>
          ) : signoffs.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              No safety signoffs yet.
            </div>
          ) : (
            <div className="space-y-3">
              {signoffs.map((s) => (
                <Card key={s.id} className="border-[#D4AF37]/10">
                  <CardContent className="p-4">
                    {editingSafetyId === s.id ? (
                      <div className="space-y-3">
                        <div className="text-xs text-muted-foreground space-y-1">
                          {Object.entries(s.responses as Record<string, string>).map(([question, answer]) => (
                            <div key={question} className="flex items-center gap-2">
                              <span className="font-medium">{question}:</span>
                              <select
                                className="text-xs rounded border border-[#D4AF37]/20 px-1 py-0.5"
                                defaultValue={answer}
                                data-question={question}
                                data-safety-id={s.id}
                              >
                                <option value="yes">yes</option>
                                <option value="no">no</option>
                              </select>
                            </div>
                          ))}
                        </div>
                        <div className="flex gap-2 justify-end">
                          <button
                            onClick={() => setEditingSafetyId(null)}
                            className="px-3 py-1.5 text-xs font-medium rounded-md border border-[#D4AF37]/20"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => {
                              const selects = document.querySelectorAll(`[data-safety-id="${s.id}"]`) as NodeListOf<HTMLSelectElement>;
                              const responses: Record<string, string> = {};
                              selects.forEach((sel) => {
                                responses[sel.dataset.question!] = sel.value;
                              });
                              handleUpdateSafety(s.id, { responses });
                            }}
                            className="px-3 py-1.5 text-xs font-medium rounded-md bg-[#D4AF37] text-white"
                            disabled={savingId === s.id}
                          >
                            {savingId === s.id ? "Saving..." : "Save"}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start justify-between gap-4">
                        <div className="space-y-2 flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <ShieldCheck className="h-4 w-4 text-green-600" />
                            <span className="text-sm font-semibold text-[#121212]">
                              Safety Check — Worker #{s.workerId}
                            </span>
                          </div>
                          <div className="text-xs text-muted-foreground space-y-1">
                            {Object.entries(
                              s.responses as Record<string, string>,
                            ).map(([question, answer]) => (
                              <div
                                key={question}
                                className="flex items-center gap-2"
                              >
                                <span className="font-medium">
                                  {question}:
                                </span>
                                <Badge
                                  variant={answer === "yes" ? "default" : "secondary"}
                                  className="text-[10px] h-5"
                                >
                                  {answer}
                                </Badge>
                              </div>
                            ))}
                          </div>
                          <p className="text-[10px] text-muted-foreground">
                            <Clock className="h-3 w-3 inline mr-1" />
                            {format(new Date(s.createdAt), "MMM d, h:mm a")}
                          </p>
                        </div>
                        <div className="shrink-0 flex flex-col items-end gap-2">
                          {isLegacySignature(s.signatureUrl) ? (
                            <div className="flex flex-col items-center justify-center gap-1 h-20 w-28 border rounded-md bg-green-50">
                              <CheckCircle2 className="h-6 w-6 text-green-600" />
                              <span className="text-[10px] text-green-700 font-medium">
                                Signed
                              </span>
                            </div>
                          ) : s.signatureUrl && s.signatureUrl.endsWith(".svg") ? (
                            <div
                              className="h-20 w-28 border rounded-md bg-white flex items-center justify-center overflow-hidden"
                              dangerouslySetInnerHTML={{
                                __html: `<img src="${storageViewUrl(s.signatureUrl)}" alt="Signature" style="max-height:100%;max-width:100%;object-fit:contain;" onerror="this.parentElement.innerHTML='<div class=\\'flex flex-col items-center justify-center gap-1 h-full w-full text-green-700\\'><svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'24\\' height=\\'24\\' viewBox=\\'0 0 24 24\\' fill=\\'none\\' stroke=\\'currentColor\\' stroke-width=\\'2\\' stroke-linecap=\\'round\\' stroke-linejoin=\\'round\\' class=\\'text-green-600\\'><path d=\\'M22 11.08V12a10 10 0 1 1-5.93-9.14\\'/><polyline points=\\'22 4 12 14.01 9 11.01\\'/></svg><span class=\\'text-[10px] font-medium\\'>Signed</span></div>';this.style.display='none'"/>`,
                              }}
                            />
                          ) : s.signatureUrl ? (
                            <img
                              src={storageViewUrl(s.signatureUrl)}
                              alt="Signature"
                              className="h-20 w-28 object-contain border rounded-md bg-white"
                              onError={(e) => {
                                const el = e.target as HTMLImageElement;
                                el.style.display = "none";
                                const parent = el.parentElement;
                                if (parent) {
                                  parent.innerHTML = `
                                    <div class="flex flex-col items-center justify-center gap-1 h-20 w-28 text-green-700">
                                      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-green-600"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                                      <span class="text-[10px] font-medium">Signed</span>
                                    </div>`;
                                }
                              }}
                            />
                          ) : null}
                          {isOwner && (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => setEditingSafetyId(s.id)}
                                className="p-1 rounded hover:bg-[#D4AF37]/10 text-[#D4AF37]"
                                title="Edit"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => handleDelete("safety", s.id)}
                                className="p-1 rounded hover:bg-red-50 text-red-500"
                                title="Delete"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={!!lightboxUrl} onOpenChange={() => setLightboxUrl(null)}>
        <DialogContent className="max-w-3xl p-0 overflow-hidden bg-black border-none">
          <DialogTitle className="sr-only">Photo preview</DialogTitle>
          <div className="relative">
            <button
              onClick={() => setLightboxUrl(null)}
              className="absolute top-3 right-3 z-10 p-1.5 rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
            {lightboxUrl && (
              <img
                src={lightboxUrl}
                alt="Full size preview"
                className="w-full max-h-[80vh] object-contain"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
