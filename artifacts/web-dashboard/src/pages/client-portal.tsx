import { useEffect, useRef, useState } from "react";
import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
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
  Camera,
  CreditCard,
  MessageCircle,
  Send,
  ChevronLeft,
  ChevronRight,
  DollarSign,
  BadgeCheck,
  Hourglass,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type PortalMessage = {
  id: number;
  senderRole: "client" | "contractor";
  senderName: string | null;
  message: string;
  createdAt: string;
};

type PaymentRequest = {
  id: number;
  invoiceNumber: string;
  title: string;
  total: string;
  status: string;
  dueDate: string | null;
  sentAt: string | null;
  paidAt: string | null;
};

type Photo = {
  id: number;
  url: string;
  caption: string | null;
  uploadedAt: string;
  reportDate: string;
};

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
  photos: Photo[];
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
  paymentRequests: PaymentRequest[];
  messages: PortalMessage[];
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

function formatDateTime(dateStr: string) {
  return new Date(dateStr).toLocaleString("en-CA", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatCurrency(amount: string | null) {
  if (!amount) return "—";
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(parseFloat(amount));
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: typeof CheckCircle2 }> = {
  active: { label: "Active", color: "bg-green-100 text-green-800 border-green-200", icon: CheckCircle2 },
  planning: { label: "Active", color: "bg-green-100 text-green-800 border-green-200", icon: CheckCircle2 },
  on_hold: { label: "On Hold", color: "bg-amber-100 text-amber-800 border-amber-200", icon: AlertCircle },
  completed: { label: "Completed", color: "bg-slate-100 text-slate-800 border-slate-200", icon: CheckCircle2 },
  cancelled: { label: "Cancelled", color: "bg-red-100 text-red-800 border-red-200", icon: X },
};

const INVOICE_STATUS: Record<string, { label: string; color: string; icon: typeof CheckCircle2 }> = {
  sent: { label: "Awaiting Payment", color: "bg-amber-100 text-amber-800 border-amber-200", icon: Hourglass },
  overdue: { label: "Overdue", color: "bg-red-100 text-red-800 border-red-200", icon: AlertCircle },
  paid: { label: "Paid", color: "bg-green-100 text-green-800 border-green-200", icon: BadgeCheck },
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

// ── Photo Lightbox ─────────────────────────────────────────────────────────────

function PhotoLightbox({ photos, index, onClose, onNav }: {
  photos: Photo[];
  index: number;
  onClose: () => void;
  onNav: (i: number) => void;
}) {
  const photo = photos[index];
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && index > 0) onNav(index - 1);
      if (e.key === "ArrowRight" && index < photos.length - 1) onNav(index + 1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, photos.length, onClose, onNav]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <button
        className="absolute top-4 right-4 text-white/70 hover:text-white p-2"
        onClick={onClose}
      >
        <X className="h-6 w-6" />
      </button>
      {index > 0 && (
        <button
          className="absolute left-4 top-1/2 -translate-y-1/2 text-white/70 hover:text-white p-2"
          onClick={(e) => { e.stopPropagation(); onNav(index - 1); }}
        >
          <ChevronLeft className="h-8 w-8" />
        </button>
      )}
      {index < photos.length - 1 && (
        <button
          className="absolute right-4 top-1/2 -translate-y-1/2 text-white/70 hover:text-white p-2"
          onClick={(e) => { e.stopPropagation(); onNav(index + 1); }}
        >
          <ChevronRight className="h-8 w-8" />
        </button>
      )}
      <div
        className="max-w-4xl max-h-[85vh] flex flex-col items-center gap-3"
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={`${BASE}${photo.url}`}
          alt={photo.caption ?? "Site photo"}
          className="max-h-[75vh] max-w-full object-contain rounded-lg"
        />
        <div className="text-center">
          {photo.caption && <p className="text-white text-sm mb-1">{photo.caption}</p>}
          <p className="text-white/50 text-xs">{formatDate(photo.reportDate)} · {index + 1} of {photos.length}</p>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

async function fetchPortal(token: string): Promise<PortalData> {
  const res = await fetch(`/api/portal/${token}`);
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? "Failed to load portal");
  return body;
}

export default function ClientPortal() {
  const { token } = useParams<{ token: string }>();
  const { toast } = useToast();

  const {
    data,
    isLoading: loading,
    error: queryError,
  } = useQuery({
    queryKey: ["client-portal", token],
    queryFn: () => fetchPortal(token!),
    enabled: !!token,
  });

  const error = queryError ? (queryError as Error).message : null;

  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Photo lightbox
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  // Messaging
  const [messageText, setMessageText] = useState("");
  const [senderName, setSenderName] = useState(() => localStorage.getItem("portalSenderName") ?? "");
  const [sendingMessage, setSendingMessage] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  async function handleUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setUploadProgress(0);
    try {
      const allFiles = Array.from(files);
      for (let i = 0; i < allFiles.length; i++) {
        const file = allFiles[i];
        const baseProgress = Math.round((i / allFiles.length) * 100);
        setUploadProgress(baseProgress + 5);

        const urlRes = await fetch(`${BASE}/api/portal/${token}/upload-url`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
        });
        if (!urlRes.ok) throw new Error("Failed to get upload URL");
        const { uploadURL, objectPath } = await urlRes.json();

        setUploadProgress(baseProgress + 40);
        const uploadRes = await fetch(uploadURL, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
        if (!uploadRes.ok) throw new Error("Failed to upload file");

        setUploadProgress(baseProgress + 70);
        const regRes = await fetch(`${BASE}/api/portal/${token}/uploads`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filename: file.name, fileType: file.type, objectPath, fileSize: file.size }),
        });
        if (!regRes.ok) throw new Error("Failed to register upload");
        setUploadProgress(baseProgress + 100);
      }
      toast({ title: "File(s) uploaded successfully" });
    } catch (e: any) {
      toast({ title: e.message ?? "Upload failed", variant: "destructive" });
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  }

  async function handleSendMessage() {
    if (!messageText.trim()) return;
    setSendingMessage(true);
    try {
      const name = senderName.trim() || "Client";
      localStorage.setItem("portalSenderName", name);
      const res = await fetch(`${BASE}/api/portal/${token}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: messageText.trim(), senderName: name }),
      });
      if (!res.ok) throw new Error("Failed to send message");
      const newMsg = await res.json();
      setMessageText("");
    } catch (e: any) {
      toast({ title: e.message ?? "Failed to send", variant: "destructive" });
    } finally {
      setSendingMessage(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="h-8 w-8 animate-spin text-[#D4AF37]" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 gap-4 p-6">
        <AlertCircle className="h-12 w-12 text-red-400" />
        <h1 className="text-xl font-bold text-slate-800">Portal Unavailable</h1>
        <p className="text-slate-500 text-center max-w-sm">{error ?? "This portal link is invalid or has been revoked."}</p>
      </div>
    );
  }

  const { project, progress, reports, photos, documents, clientUploads, paymentRequests, messages } = data;
  const statusCfg = STATUS_CONFIG[project.status] ?? STATUS_CONFIG.planning;
  const StatusIcon = statusCfg.icon;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Lightbox */}
      {lightboxIndex !== null && (
        <PhotoLightbox
          photos={photos}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onNav={setLightboxIndex}
        />
      )}

      {/* Header */}
      <header className="bg-[#0A0A0A] text-white sticky top-0 z-10 shadow-md">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center gap-3">
          <Building2 className="h-7 w-7 text-[#D4AF37]" />
          <div>
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Client Portal</p>
            <p className="text-sm font-semibold text-white leading-tight">Powered by Site Snap</p>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        {/* Project hero */}
        <Card className="border-0 shadow-sm overflow-hidden">
          <div className="h-2 bg-[#D4AF37]" />
          <CardContent className="pt-6 pb-6">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <h1 className="text-2xl font-bold text-slate-900 mb-1">{project.name}</h1>
                <div className="flex items-center gap-1.5 text-sm text-slate-500 mb-3">
                  <MapPin className="h-4 w-4" />
                  <span>{project.address}, {project.city}, {project.province}</span>
                </div>
                <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border ${statusCfg.color}`}>
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

        {/* ── Live Job Progress ─────────────────────────────────────────────── */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold text-slate-800 flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-[#D4AF37]" />
              Live Job Progress
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3 mb-2">
              <Progress value={progress.progressPct} className="flex-1 h-3" />
              <span className="text-lg font-bold text-[#D4AF37] shrink-0">{progress.progressPct}%</span>
            </div>
            <p className="text-xs text-slate-500">
              {progress.doneTasks} of {progress.totalTasks} task{progress.totalTasks !== 1 ? "s" : ""} completed
              {progress.totalTasks === 0 && " — tasks will appear here once added by your contractor"}
            </p>
            {/* Recent updates under progress */}
            {reports.length > 0 && (
              <div className="mt-4 pt-4 border-t border-slate-100 space-y-3">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Recent Site Updates</p>
                {reports.slice(0, 3).map((r) => (
                  <div key={r.id} className="border-l-2 border-[#D4AF37]/30 pl-3">
                    <p className="text-xs font-medium text-[#D4AF37] mb-0.5">{formatDate(r.reportDate)}</p>
                    <p className="text-sm text-slate-700 leading-relaxed">{r.aiSummary ?? r.workPerformed}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Photo Updates ─────────────────────────────────────────────────── */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold text-slate-800 flex items-center gap-2">
              <Camera className="h-4 w-4 text-[#D4AF37]" />
              Photo Updates
              {photos.length > 0 && (
                <span className="ml-auto text-xs font-normal text-slate-400">{photos.length} photo{photos.length !== 1 ? "s" : ""}</span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {photos.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-8 text-center">
                <Camera className="h-10 w-10 text-slate-200" />
                <p className="text-sm text-slate-400">No site photos yet.</p>
                <p className="text-xs text-slate-400">Photos from daily reports will appear here.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                {photos.map((photo, i) => (
                  <button
                    key={photo.id}
                    className="group relative aspect-square rounded-lg overflow-hidden bg-slate-100 hover:ring-2 hover:ring-[#D4AF37] transition-all"
                    onClick={() => setLightboxIndex(i)}
                  >
                    <img
                      src={`${BASE}${photo.url}`}
                      alt={photo.caption ?? "Site photo"}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
                    {photo.caption && (
                      <div className="absolute bottom-0 inset-x-0 bg-black/50 text-white text-xs p-1.5 truncate opacity-0 group-hover:opacity-100 transition-opacity">
                        {photo.caption}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Payment Requests ──────────────────────────────────────────────── */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold text-slate-800 flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-[#D4AF37]" />
              Payment Requests
              {paymentRequests.length > 0 && (
                <span className="ml-auto text-xs font-normal text-slate-400">{paymentRequests.length} invoice{paymentRequests.length !== 1 ? "s" : ""}</span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {paymentRequests.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-8 text-center">
                <DollarSign className="h-10 w-10 text-slate-200" />
                <p className="text-sm text-slate-400">No payment requests yet.</p>
                <p className="text-xs text-slate-400">Invoices sent by your contractor will appear here.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {paymentRequests.map((inv) => {
                  const cfg = INVOICE_STATUS[inv.status] ?? INVOICE_STATUS.sent;
                  const InvIcon = cfg.icon;
                  return (
                    <div key={inv.id} className="py-4 first:pt-0 last:pb-0">
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="text-xs font-mono text-slate-400">{inv.invoiceNumber}</span>
                            <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border ${cfg.color}`}>
                              <InvIcon className="h-3 w-3" />
                              {cfg.label}
                            </span>
                          </div>
                          <p className="text-sm font-semibold text-slate-800">{inv.title}</p>
                          <div className="flex items-center gap-3 mt-1 text-xs text-slate-500 flex-wrap">
                            {inv.sentAt && <span>Sent {formatDate(inv.sentAt)}</span>}
                            {inv.dueDate && <span>· Due {formatDate(inv.dueDate)}</span>}
                            {inv.paidAt && <span className="text-green-600">· Paid {formatDate(inv.paidAt)}</span>}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-xl font-bold text-slate-900">{formatCurrency(inv.total)}</p>
                          <p className="text-xs text-slate-400">CAD incl. tax</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Messaging ─────────────────────────────────────────────────────── */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold text-slate-800 flex items-center gap-2">
              <MessageCircle className="h-4 w-4 text-[#D4AF37]" />
              Messages
              {messages.length > 0 && (
                <span className="ml-auto text-xs font-normal text-slate-400">{messages.length} message{messages.length !== 1 ? "s" : ""}</span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Thread */}
            <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
              {messages.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-8 text-center">
                  <MessageCircle className="h-10 w-10 text-slate-200" />
                  <p className="text-sm text-slate-400">No messages yet.</p>
                  <p className="text-xs text-slate-400">Send a message to your contractor below.</p>
                </div>
              ) : (
                messages.map((msg) => {
                  const isClient = msg.senderRole === "client";
                  return (
                    <div key={msg.id} className={`flex gap-2 ${isClient ? "justify-end" : "justify-start"}`}>
                      {!isClient && (
                        <div className="flex-shrink-0 w-7 h-7 rounded-full bg-[#0A0A0A] flex items-center justify-center mt-0.5">
                          <Building2 className="h-3.5 w-3.5 text-white" />
                        </div>
                      )}
                      <div className={`max-w-[78%] ${isClient ? "items-end" : "items-start"} flex flex-col gap-0.5`}>
                        <div className="flex items-center gap-1.5 text-xs text-slate-400">
                          {!isClient && <span className="font-medium text-slate-600">{msg.senderName ?? "Contractor"}</span>}
                          <span>{formatDateTime(msg.createdAt)}</span>
                          {isClient && <span className="font-medium text-slate-600">{msg.senderName ?? "You"}</span>}
                        </div>
                        <div className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                          isClient
                            ? "bg-[#D4AF37] text-white rounded-tr-sm"
                            : "bg-white border border-slate-200 text-slate-800 rounded-tl-sm shadow-sm"
                        }`}>
                          {msg.message}
                        </div>
                      </div>
                      {isClient && (
                        <div className="flex-shrink-0 w-7 h-7 rounded-full bg-[#D4AF37]/20 flex items-center justify-center mt-0.5">
                          <span className="text-xs font-bold text-[#D4AF37]">
                            {(msg.senderName ?? "C")[0].toUpperCase()}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Compose */}
            <div className="border-t border-slate-100 pt-4 space-y-2">
              <Input
                placeholder="Your name (optional)"
                value={senderName}
                onChange={(e) => setSenderName(e.target.value)}
                className="text-sm h-8 border-slate-200"
              />
              <div className="flex gap-2">
                <Textarea
                  placeholder="Type a message to your contractor..."
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  className="flex-1 min-h-[72px] resize-none text-sm border-slate-200"
                />
                <Button
                  className="self-end bg-[#D4AF37] hover:bg-[#e55c00] text-white h-10 px-4"
                  onClick={handleSendMessage}
                  disabled={!messageText.trim() || sendingMessage}
                >
                  {sendingMessage ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-xs text-slate-400">Press Enter to send · Shift+Enter for new line</p>
            </div>
          </CardContent>
        </Card>

        {/* ── Project Documents ─────────────────────────────────────────────── */}
        {documents.length > 0 && (
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold text-slate-800 flex items-center gap-2">
                <FileText className="h-4 w-4 text-[#D4AF37]" />
                Project Documents
              </CardTitle>
            </CardHeader>
            <CardContent>
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
                      className="shrink-0 p-1.5 rounded-md text-slate-400 hover:text-[#D4AF37] hover:bg-orange-50 transition-colors"
                      title="Download"
                    >
                      <ArrowDownToLine className="h-4 w-4" />
                    </a>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Your Documents (client uploads) ──────────────────────────────── */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold text-slate-800 flex items-center gap-2">
              <Upload className="h-4 w-4 text-[#D4AF37]" />
              Your Documents
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div
              className={`relative border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer ${
                dragActive ? "border-[#D4AF37] bg-orange-50" : "border-slate-200 hover:border-[#D4AF37]/50 hover:bg-slate-50"
              }`}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
              onDragLeave={() => setDragActive(false)}
              onDrop={(e) => { e.preventDefault(); setDragActive(false); handleUpload(e.dataTransfer.files); }}
            >
              <input ref={fileInputRef} type="file" multiple className="hidden" onChange={(e) => handleUpload(e.target.files)} />
              {uploading ? (
                <div className="flex flex-col items-center gap-3 w-full max-w-xs">
                  <Loader2 className="h-8 w-8 animate-spin text-[#D4AF37]" />
                  <div className="w-full space-y-1">
                    <Progress value={uploadProgress} className="h-2" />
                    <p className="text-xs text-slate-500 text-center">{uploadProgress}%</p>
                  </div>
                  <p className="text-sm text-slate-500">Uploading to secure storage…</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <Upload className="h-8 w-8 text-slate-300" />
                  <p className="text-sm font-medium text-slate-600">
                    Drop files here or <span className="text-[#D4AF37]">browse</span>
                  </p>
                  <p className="text-xs text-slate-400">PDF, images, Word, Excel — any file type accepted</p>
                </div>
              )}
            </div>

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
