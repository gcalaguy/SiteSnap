import { useState } from "react";
import {
  useListDailyLogs,
  useListSitePhotos,
  useListSafetySignoffs,
  useListProjects,
  useGetMe,
  getListDailyLogsQueryKey,
  getListSitePhotosQueryKey,
  getListSafetySignoffsQueryKey,
} from "@workspace/api-client-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
  User,
} from "lucide-react";
import { format } from "date-fns";

export default function FieldLogsPage() {
  const { data: user } = useGetMe();
  const { data: projects = [] } = useListProjects();
  const [search, setSearch] = useState("");
  const [activeProjectId, setActiveProjectId] = useState<number | null>(null);

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

  const filteredLogs = logs.filter((l) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (l.notes ?? "").toLowerCase().includes(q) ||
      (l.weatherCondition ?? "").toLowerCase().includes(q)
    );
  });

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

      {/* Project selector + search */}
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
          <TabsTrigger value="logs" className="data-[state=active]:bg-[#D4AF37]/10 data-[state=active]:text-[#121212]">
            <FileText className="h-4 w-4 mr-1.5" /> Daily Logs ({logs.length})
          </TabsTrigger>
          <TabsTrigger value="photos" className="data-[state=active]:bg-[#D4AF37]/10 data-[state=active]:text-[#121212]">
            <Camera className="h-4 w-4 mr-1.5" /> Photos ({photos.length})
          </TabsTrigger>
          <TabsTrigger value="safety" className="data-[state=active]:bg-[#D4AF37]/10 data-[state=active]:text-[#121212]">
            <ShieldCheck className="h-4 w-4 mr-1.5" /> Safety ({signoffs.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="logs" className="mt-4">
          {logsLoading ? (
            <div className="text-sm text-muted-foreground">Loading logs...</div>
          ) : filteredLogs.length === 0 ? (
            <div className="text-sm text-muted-foreground">No daily logs yet.</div>
          ) : (
            <div className="space-y-3">
              {filteredLogs.map((log) => (
                <Card key={log.id} className="border-[#D4AF37]/10">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-1">
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
                      <Badge variant="outline" className="shrink-0 text-[10px]">
                        Foreman #{log.foremanId}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="photos" className="mt-4">
          {photosLoading ? (
            <div className="text-sm text-muted-foreground">Loading photos...</div>
          ) : photos.length === 0 ? (
            <div className="text-sm text-muted-foreground">No site photos yet.</div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {photos.map((photo) => (
                <Card key={photo.id} className="border-[#D4AF37]/10 overflow-hidden">
                  <div className="aspect-square bg-gray-100 relative">
                    <img
                      src={photo.imageUrl}
                      alt="Site photo"
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                    {photo.markupData && (
                      <Badge className="absolute top-2 right-2 bg-[#D4AF37] text-white text-[10px]">
                        Marked up
                      </Badge>
                    )}
                  </div>
                  <CardContent className="p-3">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <MapPin className="h-3 w-3" />
                      {photo.roomLocation || "No location"}
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {format(new Date(photo.createdAt), "MMM d, h:mm a")}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="safety" className="mt-4">
          {signoffsLoading ? (
            <div className="text-sm text-muted-foreground">Loading signoffs...</div>
          ) : signoffs.length === 0 ? (
            <div className="text-sm text-muted-foreground">No safety signoffs yet.</div>
          ) : (
            <div className="space-y-3">
              {signoffs.map((s) => (
                <Card key={s.id} className="border-[#D4AF37]/10">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <ShieldCheck className="h-4 w-4 text-green-600" />
                          <span className="text-sm font-semibold text-[#121212]">
                            Safety Check — Worker #{s.workerId}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground space-y-1">
                          {Object.entries(s.responses as Record<string, string>).map(
                            ([question, answer]) => (
                              <div key={question} className="flex items-center gap-2">
                                <span className="font-medium">{question}:</span>
                                <Badge
                                  variant={answer === "yes" ? "default" : "secondary"}
                                  className="text-[10px] h-5"
                                >
                                  {answer}
                                </Badge>
                              </div>
                            ),
                          )}
                        </div>
                        <p className="text-[10px] text-muted-foreground">
                          <Clock className="h-3 w-3 inline mr-1" />
                          {format(new Date(s.createdAt), "MMM d, h:mm a")}
                        </p>
                      </div>
                      {s.signatureUrl && (
                        <img
                          src={s.signatureUrl}
                          alt="Signature"
                          className="h-16 w-32 object-contain border rounded"
                        />
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
