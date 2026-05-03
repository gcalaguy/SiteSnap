import { useEffect, useRef, useState } from "react";
import { useParams } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  FileText,
  Calendar,
  MapPin,
  Upload,
  CheckCircle2,
  Clock,
  AlertCircle,
  ArrowDownToLine,
  X,
  Loader2,
  Building2,
  ClipboardList,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type PortalData = {
  project: {
    name: string;
    status: string;
    address: string;
    city: string;
    province: string;
    startDate: string | null;
    endDate: string | null;
    budget: string | null;
  };
  progress: { totalTasks: number; doneTasks: number; progressPct: number };
  reports: Array<{
    id: number;
    reportDate: string;
    workPerformed: string;
    aiSummary: string | null;
  }>;
  documents: Array<{
    id: number;
    filename: string;
    fileType: string;
    fileSize: number | null;
    aiSummary: string | null;
    createdAt: string;
  }>;
  clientUploads: Array<{
    id: number;
    filename: string;
    fileType: string;
    fileSize: number | null;
    objectPath: string;
    createdAt: string;
  }>;
};

function formatFileSize(bytes: number | null) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-CA", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: typeof CheckCircle2 }> = {
  active: { label: "Active", color: "bg-green-100 text-green-800 border-green-200", icon: CheckCircle2 },
  planning: { label: "Planning", color: "bg-blue-100 text-blue-800 border-blue-200", icon: Clock },
  on_hold: { label: "On Hold", color: "bg-amber-100 text-amber-800 border-amber-200", icon: AlertCircle },
  completed: { label: "Completed", color: "bg-slate-100 text-slate-800 border-slate-200", icon: CheckCircle2 },
  cancelled: { label: "Cancelled", color: "bg-red-100 text-red-800 border-red-200", icon: X },
};

function FileIcon({ fileType }: { fileType: string }) {
  const t = fileType.toLowerCase();
  if (t.includes("pdf")) return <span className="text-red-500 font-bold text-xs">PDF</span>;
  if (t.includes("image") || t.includes("png") || t.includes("jpg") || t.includes("jpeg"))
    return <span className="text-purple-500 font-bold text-xs">IMG</span>;
  if (t.includes("word") || t.includes("doc"))
    return <span className="text-blue-500 font-bold text-xs">DOC</span>;
  if (t.includes("sheet") || t.includes("xlsx") || t.includes("csv"))
    return <span className="text-green-500 font-bold text-xs">XLS</span>;
  return <span className="text-slate-500 font-bold text-xs">FILE</span>;
}

export default function ClientPortal() {
  const { token } = useParams<{ token: string }>();
  const { toast } = useToast();
  const [data, setData] = useState<PortalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!token) return;
    fetch(`${BASE}/api/portal/${token}`)
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          throw new Error(body.error ?? "Failed to load portal");
        }
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  async function handleUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        // 1. Request presigned URL
        const urlRes = await fetch(`${BASE}/api/portal/${token}/upload-url`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
        });
        if (!urlRes.ok) throw new Error("Failed to get upload URL");
        const { uploadURL, objectPath } = await urlRes.json();

        // 2. Upload file to storage
        const uploadRes = await fetch(uploadURL, {
          method: "PUT",
          body: file,
          headers: { "Content-Type": file.type },
        });
        if (!uploadRes.ok) throw new Error("Failed to upload file");

        // 3. Register upload
        const regRes = await fetch(`${BASE}/api/portal/${token}/uploads`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            filename: file.name,
            fileType: file.type,
            objectPath,
            fileSize: file.size,
          }),
        });
        if (!regRes.ok) throw new Error("Failed to register upload");
        const newUpload = await regRes.json();

        setData((prev) =>
          prev ? { ...prev, clientUploads: [newUpload, ...prev.clientUploads] } : prev,
        );
      }
      toast({ title: "File(s) uploaded successfully" });
    } catch (e: any) {
      toast({ title: e.message ?? "Upload failed", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="h-8 w-8 animate-spin text-[#FF6600]" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 gap-4 p-6">
        <AlertCircle className="h-12 w-12 text-red-400" />
        <h1 className="text-xl font-bold text-slate-800">Portal Unavailable</h1>
        <p className="text-slate-500 text-center max-w-sm">
          {error ?? "This portal link is invalid or has been revoked."}
        </p>
      </div>
    );
  }

  const { project, progress, reports, documents, clientUploads } = data;
  const statusCfg = STATUS_CONFIG[project.status] ?? STATUS_CONFIG.planning;
  const StatusIcon = statusCfg.icon;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-[#172034] text-white">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center gap-3">
          <Building2 className="h-7 w-7 text-[#FF6600]" />
          <div>
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Client Portal</p>
            <p className="text-sm font-semibold text-white leading-tight">Powered by Site Snap</p>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        {/* Project hero card */}
        <Card className="border-0 shadow-sm overflow-hidden">
          <div className="h-2 bg-[#FF6600]" />
          <CardContent className="pt-6 pb-6">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <h1 className="text-2xl font-bold text-slate-900 mb-1">{project.name}</h1>
                <div className="flex items-center gap-1.5 text-sm text-slate-500 mb-3">
                  <MapPin className="h-4 w-4" />
                  <span>{project.address}, {project.city}, {project.province}</span>
                </div>
                <span
                  className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border ${statusCfg.color}`}
                >
                  <StatusIcon className="h-3.5 w-3.5" />
                  {statusCfg.label}
                </span>
              </div>
              {(project.startDate || project.endDate) && (
                <div className="text-sm text-slate-500 shrink-0 space-y-1">
                  {project.startDate && (
                    <div className="flex items-center gap-1.5">
                      <Calendar className="h-4 w-4" />
                      <span>Started: {formatDate(project.startDate)}</span>
                    </div>
                  )}
                  {project.endDate && (
                    <div className="flex items-center gap-1.5">
                      <Calendar className="h-4 w-4" />
                      <span>Due: {formatDate(project.endDate)}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Progress */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold text-slate-800 flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-[#FF6600]" />
              Project Progress
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3 mb-2">
              <Progress value={progress.progressPct} className="flex-1 h-3" />
              <span className="text-sm font-bold text-[#FF6600] shrink-0">{progress.progressPct}%</span>
            </div>
            <p className="text-xs text-slate-500">
              {progress.doneTasks} of {progress.totalTasks} task{progress.totalTasks !== 1 ? "s" : ""} completed
              {progress.totalTasks === 0 && " — tasks will appear here once added"}
            </p>
          </CardContent>
        </Card>

        {/* Recent Updates */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold text-slate-800 flex items-center gap-2">
              <Calendar className="h-4 w-4 text-[#FF6600]" />
              Recent Site Updates
            </CardTitle>
          </CardHeader>
          <CardContent>
            {reports.length === 0 ? (
              <p className="text-sm text-slate-400 py-4 text-center">No updates posted yet.</p>
            ) : (
              <div className="space-y-4">
                {reports.map((r) => (
                  <div key={r.id} className="border-l-2 border-[#FF6600]/30 pl-4 pb-4 last:pb-0">
                    <p className="text-xs font-medium text-[#FF6600] mb-1">{formatDate(r.reportDate)}</p>
                    <p className="text-sm text-slate-700 leading-relaxed">
                      {r.aiSummary ?? r.workPerformed}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Documents from contractor */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold text-slate-800 flex items-center gap-2">
              <FileText className="h-4 w-4 text-[#FF6600]" />
              Project Documents
            </CardTitle>
          </CardHeader>
          <CardContent>
            {documents.length === 0 ? (
              <p className="text-sm text-slate-400 py-4 text-center">No documents shared yet.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {documents.map((doc) => (
                  <div key={doc.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                    <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-slate-100 shrink-0">
                      <FileIcon fileType={doc.fileType} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{doc.filename}</p>
                      {doc.aiSummary && (
                        <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{doc.aiSummary}</p>
                      )}
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-slate-400">{formatDate(doc.createdAt)}</span>
                        {doc.fileSize && (
                          <span className="text-xs text-slate-400">· {formatFileSize(doc.fileSize)}</span>
                        )}
                      </div>
                    </div>
                    <a
                      href={`${BASE}/api/storage/objects/uploads/${doc.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 p-1.5 rounded-md text-slate-400 hover:text-[#FF6600] hover:bg-orange-50 transition-colors"
                      title="Download"
                    >
                      <ArrowDownToLine className="h-4 w-4" />
                    </a>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Client Uploads */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold text-slate-800 flex items-center gap-2">
              <Upload className="h-4 w-4 text-[#FF6600]" />
              Your Documents
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Upload drop zone */}
            <div
              className={`relative border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer ${
                dragActive
                  ? "border-[#FF6600] bg-orange-50"
                  : "border-slate-200 hover:border-[#FF6600]/50 hover:bg-slate-50"
              }`}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
              onDragLeave={() => setDragActive(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragActive(false);
                handleUpload(e.dataTransfer.files);
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => handleUpload(e.target.files)}
              />
              {uploading ? (
                <div className="flex flex-col items-center gap-2">
                  <Loader2 className="h-8 w-8 animate-spin text-[#FF6600]" />
                  <p className="text-sm text-slate-500">Uploading...</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <Upload className="h-8 w-8 text-slate-300" />
                  <p className="text-sm font-medium text-slate-600">
                    Drop files here or <span className="text-[#FF6600]">browse</span>
                  </p>
                  <p className="text-xs text-slate-400">PDF, images, Word, Excel — any file type accepted</p>
                </div>
              )}
            </div>

            {/* Uploaded files list */}
            {clientUploads.length > 0 && (
              <div className="divide-y divide-slate-100">
                {clientUploads.map((upload) => (
                  <div key={upload.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                    <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-slate-100 shrink-0">
                      <FileIcon fileType={upload.fileType} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{upload.filename}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-slate-400">{formatDate(upload.createdAt)}</span>
                        {upload.fileSize && (
                          <span className="text-xs text-slate-400">· {formatFileSize(upload.fileSize)}</span>
                        )}
                      </div>
                    </div>
                    <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      <footer className="border-t border-slate-200 mt-8">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-center gap-2 text-xs text-slate-400">
          <Building2 className="h-3.5 w-3.5" />
          <span>Powered by <strong className="text-slate-600">Site Snap</strong> — Construction AI Platform</span>
        </div>
      </footer>
    </div>
  );
}
