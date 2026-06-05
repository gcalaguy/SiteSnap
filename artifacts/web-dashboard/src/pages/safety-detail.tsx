import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch, useGetMe } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { useSignedUrl } from "@/hooks/useSignedUrl";
import { format } from "date-fns";
import {
  AlertTriangle,
  ArrowLeft,
  Bot,
  CheckCircle2,
  Clock,
  Download,
  Eye,
  FileText,
  Loader2,
  MessageSquare,
  RefreshCw,
  Send,
  ShieldAlert,
  User,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface FormField {
  id: string;
  label: string;
  type: string;
  options?: string[];
}

interface SubmissionDetail {
  id: number;
  templateId: number;
  userId: number;
  companyId: number;
  status: string;
  data: Record<string, any>;
  aiSummary: string | null;
  reviewNotes: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
  template: { id: number; name: string; category: string; schema: { fields: FormField[] } } | null;
  worker: { id: number; firstName: string; lastName: string; email: string } | null;
  reviewer: { id: number; firstName: string; lastName: string } | null;
  photos: Array<{ id: number; url: string; filename: string }>;
  comments: Array<{ id: number; comment: string; createdAt: string; user: { firstName: string; lastName: string } | null }>;
}

const statusConfig: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  draft: { label: "Draft", color: "bg-gray-100 text-gray-700", icon: Clock },
  submitted: { label: "Submitted", color: "bg-blue-100 text-blue-700", icon: FileText },
  reviewed: { label: "Reviewed", color: "bg-purple-100 text-purple-700", icon: Eye },
  approved: { label: "Approved", color: "bg-green-100 text-green-700", icon: CheckCircle2 },
};

const categoryColor: Record<string, string> = {
  injury: "bg-red-100 text-red-700",
  safety: "bg-blue-100 text-blue-700",
  hazard: "bg-orange-100 text-orange-700",
  toolbox: "bg-green-100 text-green-700",
};

function SignedPhotoLink({ photo }: { photo: { id: number; url: string; filename: string } }) {
  const { data: signedUrl, isLoading } = useSignedUrl(photo.url);
  if (isLoading) {
    return (
      <div className="rounded-lg aspect-square w-full bg-muted flex items-center justify-center">
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!signedUrl) {
    return (
      <div className="rounded-lg aspect-square w-full bg-muted flex items-center justify-center text-[10px] text-muted-foreground">
        No photo
      </div>
    );
  }
  return (
    <a href={signedUrl} target="_blank" rel="noreferrer">
      <img src={signedUrl} alt={photo.filename}
        className="rounded-lg object-cover aspect-square w-full hover:opacity-90 transition-opacity border" />
    </a>
  );
}

function renderFieldValue(field: FormField, value: any): string {
  if (value === undefined || value === null || value === "") return "—";
  if (Array.isArray(value)) return value.join(", ") || "—";
  return String(value);
}

// ── Incident Summary Renderer ──────────────────────────────────────────────────

type SummarySection = { title: string; bullets: string[] };

function parseIncidentSummary(text: string): SummarySection[] {
  const sections: SummarySection[] = [];
  let current: SummarySection | null = null;

  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;

    const sectionMatch = line.match(/^\d+\.\s+(.+?):\s*$/);
    if (sectionMatch) {
      if (current) sections.push(current);
      current = { title: sectionMatch[1], bullets: [] };
      continue;
    }

    if (current) {
      if (line.startsWith("- ") || line.startsWith("• ")) {
        current.bullets.push(line.slice(2).trim());
      } else if (!line.match(/^\d+\./)) {
        current.bullets.push(line);
      }
    }
  }
  if (current) sections.push(current);
  return sections;
}

const SECTION_STYLE: Record<string, { border: string; bg: string; titleColor: string; icon: React.ElementType }> = {
  // Incident / injury / safety sections
  "Incident Overview":    { border: "#3b82f6", bg: "#eff6ff", titleColor: "#1d4ed8", icon: FileText },
  "Key Details":          { border: "#8b5cf6", bg: "#f5f3ff", titleColor: "#6d28d9", icon: Eye },
  "Severity Assessment":  { border: "#f97316", bg: "#fff7ed", titleColor: "#c2410c", icon: AlertTriangle },
  "Root Cause":           { border: "#ef4444", bg: "#fef2f2", titleColor: "#b91c1c", icon: Zap },
  "Recommended Actions":  { border: "#16a34a", bg: "#f0fdf4", titleColor: "#15803d", icon: ShieldAlert },
  "Follow-Up Required":   { border: "#ca8a04", bg: "#fefce8", titleColor: "#a16207", icon: Clock },
  // Hazard assessment sections
  "Hazard Summary":           { border: "#3b82f6", bg: "#eff6ff", titleColor: "#1d4ed8", icon: ShieldAlert },
  "Risk Evaluation":          { border: "#f97316", bg: "#fff7ed", titleColor: "#c2410c", icon: AlertTriangle },
  "Affected Area / Workers":  { border: "#8b5cf6", bg: "#f5f3ff", titleColor: "#6d28d9", icon: User },
  "Recommended Controls":     { border: "#16a34a", bg: "#f0fdf4", titleColor: "#15803d", icon: CheckCircle2 },
  "Priority Level":           { border: "#ca8a04", bg: "#fefce8", titleColor: "#a16207", icon: Zap },
  "Compliance Notes":         { border: "#64748b", bg: "#f8fafc", titleColor: "#334155", icon: FileText },
  // Injury report sections
  "Injury Summary":           { border: "#3b82f6", bg: "#eff6ff", titleColor: "#1d4ed8", icon: FileText },
  "Injured Worker Details":   { border: "#8b5cf6", bg: "#f5f3ff", titleColor: "#6d28d9", icon: User },
  "Injury Details":           { border: "#f97316", bg: "#fff7ed", titleColor: "#c2410c", icon: AlertTriangle },
  "Incident Description":     { border: "#64748b", bg: "#f8fafc", titleColor: "#334155", icon: Eye },
  "Immediate Response":       { border: "#16a34a", bg: "#f0fdf4", titleColor: "#15803d", icon: CheckCircle2 },
  "Work Impact":              { border: "#ca8a04", bg: "#fefce8", titleColor: "#a16207", icon: Clock },
  "Recommended Next Steps":   { border: "#0891b2", bg: "#ecfeff", titleColor: "#0e7490", icon: ShieldAlert },
  "Compliance Note":          { border: "#dc2626", bg: "#fff1f2", titleColor: "#991b1b", icon: AlertTriangle },
};

const CHIP_SECTIONS = new Set(["Severity Assessment", "Risk Evaluation", "Priority Level", "Injury Details"]);

function getStatusChip(sectionTitle: string, bullets: string[]) {
  if (!CHIP_SECTIONS.has(sectionTitle)) return null;

  const allText = bullets.join(" ").toLowerCase();

  if (sectionTitle === "Priority Level") {
    if (allText.includes("urgent")) return { label: "Urgent",  bg: "#fee2e2", color: "#991b1b" };
    if (allText.includes("medium")) return { label: "Medium",  bg: "#ffedd5", color: "#9a3412" };
    if (allText.includes("low"))    return { label: "Low",     bg: "#dcfce7", color: "#166534" };
    return null;
  }

  if (sectionTitle === "Injury Details") {
    const severityLine = bullets.find((b) => b.toLowerCase().startsWith("severity"));
    const src = (severityLine ?? allText).toLowerCase();
    if (src.includes("severe"))   return { label: "Severe",   bg: "#fee2e2", color: "#991b1b" };
    if (src.includes("moderate")) return { label: "Moderate", bg: "#ffedd5", color: "#9a3412" };
    if (src.includes("minor"))    return { label: "Minor",    bg: "#dcfce7", color: "#166534" };
    return null;
  }

  const isRisk = sectionTitle === "Risk Evaluation";
  const matchLine = bullets.find((b) =>
    b.toLowerCase().startsWith("classify as") ||
    b.toLowerCase().startsWith("risk level")
  );
  const source = matchLine ?? allText;
  const label = isRisk ? "Risk" : "Severity";

  if (source.includes("high"))   return { label: `High ${label}`,   bg: "#fee2e2", color: "#991b1b" };
  if (source.includes("medium")) return { label: `Medium ${label}`, bg: "#ffedd5", color: "#9a3412" };
  if (source.includes("low"))    return { label: `Low ${label}`,    bg: "#dcfce7", color: "#166534" };
  return null;
}

const PANEL_META: Record<string, { title: string; subtitle: string }> = {
  hazard:  { title: "AI Hazard Risk Assessment",  subtitle: "Structured risk analysis by AI Safety Expert" },
  injury:  { title: "AI Workplace Injury Summary", subtitle: "Internal report · does not replace WSIB filing" },
  safety:  { title: "AI Safety Report Summary",   subtitle: "Structured analysis by AI Safety Officer" },
  toolbox: { title: "AI Toolbox Talk Summary",    subtitle: "Structured summary by AI Safety Officer" },
};

function IncidentSummaryPanel({
  summary,
  category,
  isGenerating,
  canGenerate,
  onGenerate,
}: {
  summary: string | null;
  category: string;
  isGenerating: boolean;
  canGenerate: boolean;
  onGenerate: () => void;
}) {
  const sections = summary ? parseIncidentSummary(summary) : [];
  const meta = PANEL_META[category] ?? PANEL_META.safety;
  const emptyHint = category === "hazard"
    ? "Generate a structured hazard risk assessment with risk level, affected workers, and recommended controls."
    : "Generate a structured incident summary with severity assessment, root cause analysis, and recommended actions.";

  return (
    <Card className="overflow-hidden border-0 shadow-md">
      <CardHeader className="pb-3 bg-gradient-to-r from-slate-800 to-slate-900">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-white/10 flex items-center justify-center">
              <Bot className="h-4 w-4 text-white" />
            </div>
            <div>
              <CardTitle className="text-sm font-semibold text-white">{meta.title}</CardTitle>
              <p className="text-[11px] text-slate-400 mt-0.5">{meta.subtitle}</p>
            </div>
          </div>
          {canGenerate && (
            <Button
              size="sm"
              variant="ghost"
              className="h-8 text-xs gap-1.5 bg-white/10 hover:bg-white/20 text-white border-0"
              onClick={onGenerate}
              disabled={isGenerating}
            >
              {isGenerating ? (
                <><Loader2 className="h-3.5 w-3.5 animate-spin" />Analyzing…</>
              ) : (
                <><RefreshCw className="h-3.5 w-3.5" />{summary ? "Regenerate" : "Generate Summary"}</>
              )}
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {isGenerating && (
          <div className="flex flex-col items-center justify-center py-10 gap-3 bg-slate-50">
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
            <p className="text-sm text-slate-500">Analyzing {category === "hazard" ? "hazard" : "incident"} data…</p>
          </div>
        )}

        {!isGenerating && !summary && (
          <div className="flex flex-col items-center py-8 text-center bg-slate-50 px-6">
            <Bot className="h-8 w-8 text-slate-300 mb-2" />
            <p className="text-sm font-medium text-slate-600 mb-1">No AI analysis yet</p>
            <p className="text-xs text-slate-400 max-w-xs">
              {canGenerate ? emptyHint : "AI analysis will be available once the form is submitted."}
            </p>
          </div>
        )}

        {!isGenerating && summary && sections.length > 0 && (
          <div className="divide-y divide-gray-100">
            {sections.map((section, i) => {
              const style = SECTION_STYLE[section.title] ?? {
                border: "#6b7280", bg: "#f9fafb", titleColor: "#374151", icon: FileText,
              };
              const Icon = style.icon;
              const chip = getStatusChip(section.title, section.bullets);

              return (
                <div key={i} className="px-5 py-4" style={{ borderLeft: `3px solid ${style.border}`, background: style.bg }}>
                  <div className="flex items-center gap-2 mb-2">
                    <Icon className="h-3.5 w-3.5 flex-shrink-0" style={{ color: style.border }} />
                    <h4 className="text-[11px] font-bold uppercase tracking-wider" style={{ color: style.titleColor }}>
                      {section.title}
                    </h4>
                    {chip && (
                      <span
                        className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded"
                        style={{ background: chip.bg, color: chip.color }}
                      >
                        {chip.label}
                      </span>
                    )}
                  </div>
                  <ul className="space-y-1">
                    {section.bullets.map((bullet, j) => (
                      <li key={j} className="flex items-start gap-2">
                        <span className="mt-1.5 h-1 w-1 rounded-full flex-shrink-0" style={{ background: style.border }} />
                        <p className="text-sm leading-relaxed" style={{ color: style.titleColor.replace("800", "900") }}>
                          {bullet}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
            <div className="px-5 py-2.5 bg-gray-50">
              <p className="text-[10px] text-gray-400">
                AI-generated · For official records, verify all details with site personnel
              </p>
            </div>
          </div>
        )}

        {!isGenerating && summary && sections.length === 0 && (
          <div className="p-5">
            <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{summary}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function SafetyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: me } = useGetMe();

  const [comment, setComment] = useState("");
  const [reviewStatus, setReviewStatus] = useState<"reviewed" | "approved">("reviewed");
  const [reviewNotes, setReviewNotes] = useState("");
  const [showReviewForm, setShowReviewForm] = useState(false);

  const isOwnerOrForeman = me?.role === "owner" || me?.role === "foreman";

  const { data: submission, isLoading } = useQuery<SubmissionDetail>({
    queryKey: ["safety-submission", id],
    queryFn: () => customFetch(`/api/safety/submissions/${id}`),
  });

  const incidentSummaryMutation = useMutation({
    mutationFn: (): Promise<{ summary: string }> =>
      customFetch(`/api/safety/submissions/${id}/incident-summary`, { method: "POST" }),
    onSuccess: (data) => {
      queryClient.setQueryData<SubmissionDetail>(["safety-submission", id], (old) =>
        old ? { ...old, aiSummary: data.summary } : old
      );
      toast({ title: "Incident summary generated" });
    },
    onError: () => toast({ title: "Error", description: "Failed to generate summary.", variant: "destructive" }),
  });

  const commentMutation = useMutation({
    mutationFn: () =>
      customFetch(`/api/safety/submissions/${id}/comments`, {
        method: "POST",
        body: JSON.stringify({ comment }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["safety-submission", id] });
      setComment("");
      toast({ title: "Comment added" });
    },
    onError: () => toast({ title: "Error", description: "Failed to add comment.", variant: "destructive" }),
  });

  const reviewMutation = useMutation({
    mutationFn: () =>
      customFetch(`/api/safety/submissions/${id}/review`, {
        method: "POST",
        body: JSON.stringify({ status: reviewStatus, notes: reviewNotes || undefined }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["safety-submission", id] });
      queryClient.invalidateQueries({ queryKey: ["safety-submissions"] });
      setShowReviewForm(false);
      toast({ title: "Submission reviewed", description: `Marked as ${reviewStatus}.` });
    },
    onError: () => toast({ title: "Error", description: "Failed to submit review.", variant: "destructive" }),
  });

  const exportPDF = async () => {
    if (!submission) return;
    const { default: jsPDF } = await import("jspdf");
    const doc = new jsPDF();
    const fields = submission.template?.schema?.fields ?? [];
    let y = 20;
    const lm = 20;
    const pw = 170;

    doc.setFillColor(23, 32, 52);
    doc.rect(0, 0, 210, 35, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text("Site Snap", lm, 15);
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.text(submission.template?.name ?? "Safety Form", lm, 26);
    y = 50;

    doc.setTextColor(60, 60, 60);
    doc.setFontSize(9);
    doc.text(`Worker: ${submission.worker ? `${submission.worker.firstName} ${submission.worker.lastName}` : "—"}`, lm, y);
    y += 6;
    doc.text(`Date: ${format(new Date(submission.createdAt), "MMMM d, yyyy h:mm a")}`, lm, y);
    y += 6;
    doc.text(`Status: ${submission.status.toUpperCase()}`, lm, y);
    y += 12;

    if (submission.aiSummary) {
      doc.setFillColor(255, 245, 230);
      doc.roundedRect(lm - 2, y - 4, pw + 4, 6 + doc.splitTextToSize(submission.aiSummary, pw).length * 5, 2, 2, "F");
      doc.setTextColor(180, 80, 0);
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.text("AI Incident Summary", lm, y);
      y += 5;
      doc.setFont("helvetica", "normal");
      doc.setTextColor(80, 40, 0);
      const summaryLines = doc.splitTextToSize(submission.aiSummary, pw);
      doc.text(summaryLines, lm, y);
      y += summaryLines.length * 5 + 8;
    }

    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(23, 32, 52);
    doc.text("Form Details", lm, y);
    y += 6;
    doc.setLineWidth(0.5);
    doc.setDrawColor(200, 200, 200);
    doc.line(lm, y, lm + pw, y);
    y += 6;

    for (const field of fields) {
      const rawVal = submission.data[field.id];
      const val = renderFieldValue(field, rawVal);
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(80, 80, 80);
      doc.text(field.label, lm, y);
      y += 5;
      doc.setFont("helvetica", "normal");
      doc.setTextColor(30, 30, 30);
      const lines = doc.splitTextToSize(val, pw);
      if (y + lines.length * 5 > 270) { doc.addPage(); y = 20; }
      doc.text(lines, lm, y);
      y += lines.length * 5 + 4;
    }

    if (submission.reviewNotes) {
      y += 4;
      doc.setFont("helvetica", "bold");
      doc.setTextColor(80, 80, 80);
      doc.setFontSize(8);
      doc.text("Review Notes:", lm, y);
      y += 5;
      doc.setFont("helvetica", "normal");
      const rLines = doc.splitTextToSize(submission.reviewNotes, pw);
      doc.text(rLines, lm, y);
    }

    const pdfFilename = `${submission.template?.name ?? "safety-form"}-${id}.pdf`;
    doc.save(pdfFilename);
    toast({ title: "PDF exported" });

    const { mirrorArrayBuffer } = await import("@/lib/driveSyncPipeline");
    await mirrorArrayBuffer(pdfFilename, doc.output("arraybuffer"), "application/pdf");
  };

  const exportDOCX = async () => {
    if (!submission) return;
    try {
      const { Document, Packer, Paragraph, TextRun, HeadingLevel } = await import("docx");
      const fields = submission.template?.schema?.fields ?? [];
      const children: any[] = [
        new Paragraph({ text: submission.template?.name ?? "Safety Form", heading: HeadingLevel.HEADING_1 }),
        new Paragraph({ children: [new TextRun({ text: "Worker: ", bold: true }), new TextRun(submission.worker ? `${submission.worker.firstName} ${submission.worker.lastName}` : "—")] }),
        new Paragraph({ children: [new TextRun({ text: "Date: ", bold: true }), new TextRun(format(new Date(submission.createdAt), "MMMM d, yyyy h:mm a"))] }),
        new Paragraph({ children: [new TextRun({ text: "Status: ", bold: true }), new TextRun(submission.status.toUpperCase())] }),
        new Paragraph({ text: "" }),
      ];

      if (submission.aiSummary) {
        children.push(
          new Paragraph({ text: "AI Incident Summary", heading: HeadingLevel.HEADING_2 }),
          new Paragraph({ text: submission.aiSummary }),
          new Paragraph({ text: "" })
        );
      }

      children.push(new Paragraph({ text: "Form Details", heading: HeadingLevel.HEADING_2 }));
      for (const field of fields) {
        const val = renderFieldValue(field, submission.data[field.id]);
        children.push(new Paragraph({ children: [new TextRun({ text: field.label + ": ", bold: true }), new TextRun(val)] }));
      }

      if (submission.reviewNotes) {
        children.push(
          new Paragraph({ text: "" }),
          new Paragraph({ text: "Review Notes", heading: HeadingLevel.HEADING_2 }),
          new Paragraph({ text: submission.reviewNotes })
        );
      }

      const doc = new Document({ sections: [{ children }] });
      const blob = await Packer.toBlob(doc);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const docxFilename = `${submission.template?.name ?? "safety-form"}-${id}.docx`;
      a.href = url;
      a.download = docxFilename;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "DOCX exported" });

      const { mirrorToLocalDrive } = await import("@/lib/driveSyncPipeline");
      await mirrorToLocalDrive(docxFilename, blob);
    } catch {
      toast({ title: "Error", description: "Failed to export DOCX.", variant: "destructive" });
    }
  };

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!submission) {
    return <div className="p-6 text-center text-muted-foreground">Submission not found.</div>;
  }

  const sc = statusConfig[submission.status] ?? statusConfig.draft;
  const StatusIcon = sc.icon;
  const fields = submission.template?.schema?.fields ?? [];
  const canReview = isOwnerOrForeman && submission.status === "submitted";

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/safety")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold text-foreground">
                {submission.template?.name ?? "Safety Form"}
              </h1>
              {submission.template?.category && (
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${categoryColor[submission.template.category] ?? "bg-gray-100 text-gray-600"}`}>
                  {submission.template.category}
                </span>
              )}
              <span className={`text-xs px-2 py-1 rounded-full font-medium flex items-center gap-1 ${sc.color}`}>
                <StatusIcon className="h-3 w-3" />
                {sc.label}
              </span>
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              {format(new Date(submission.createdAt), "MMMM d, yyyy 'at' h:mm a")}
              {submission.worker && ` · ${submission.worker.firstName} ${submission.worker.lastName}`}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportPDF} className="gap-1.5">
            <Download className="h-3.5 w-3.5" /> PDF
          </Button>
          <Button variant="outline" size="sm" onClick={exportDOCX} className="gap-1.5">
            <FileText className="h-3.5 w-3.5" /> DOCX
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* AI Incident Summary */}
          <IncidentSummaryPanel
            summary={submission.aiSummary}
            category={submission.template?.category ?? "safety"}
            isGenerating={incidentSummaryMutation.isPending}
            canGenerate={isOwnerOrForeman}
            onGenerate={() => incidentSummaryMutation.mutate()}
          />

          {/* Form Data */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-primary" />
                Form Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {fields.map((field, i) => (
                <div key={field.id}>
                  {i > 0 && <Separator className="mb-4" />}
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      {field.label}
                    </p>
                    <p className="text-sm text-foreground">
                      {renderFieldValue(field, submission.data[field.id])}
                    </p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Photos */}
          {submission.photos.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base">Photos</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-3">
                  {submission.photos.map((photo) => (
                    <SignedPhotoLink key={photo.id} photo={photo} />
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Comments */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                Comments
                {submission.comments.length > 0 && (
                  <Badge variant="secondary" className="ml-1">{submission.comments.length}</Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {submission.comments.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No comments yet.</p>
              ) : (
                <div className="space-y-3">
                  {submission.comments.map((c) => (
                    <div key={c.id} className="flex gap-3">
                      <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                        <User className="h-3.5 w-3.5 text-muted-foreground" />
                      </div>
                      <div className="flex-1 bg-muted/40 rounded-lg px-3 py-2">
                        <p className="text-xs font-medium text-foreground">
                          {c.user ? `${c.user.firstName} ${c.user.lastName}` : "Unknown"}
                          <span className="text-muted-foreground font-normal ml-2">
                            {format(new Date(c.createdAt), "MMM d, h:mm a")}
                          </span>
                        </p>
                        <p className="text-sm text-foreground mt-0.5">{c.comment}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-2 pt-2">
                <Textarea
                  placeholder="Add a comment…"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  rows={2}
                  className="flex-1 resize-none"
                />
                <Button
                  size="icon"
                  onClick={() => commentMutation.mutate()}
                  disabled={!comment.trim() || commentMutation.isPending}
                >
                  {commentMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Review Panel */}
          {canReview && (
            <Card className="border-primary/30">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm text-primary">Review This Submission</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {!showReviewForm ? (
                  <Button className="w-full" onClick={() => setShowReviewForm(true)}>
                    Start Review
                  </Button>
                ) : (
                  <>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground">Decision</label>
                      <Select value={reviewStatus} onValueChange={(v: any) => setReviewStatus(v)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="reviewed">Reviewed</SelectItem>
                          <SelectItem value="approved">Approved</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground">Notes (optional)</label>
                      <Textarea
                        value={reviewNotes}
                        onChange={(e) => setReviewNotes(e.target.value)}
                        placeholder="Add review notes…"
                        rows={3}
                        className="resize-none"
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" className="flex-1" onClick={() => setShowReviewForm(false)}>
                        Cancel
                      </Button>
                      <Button size="sm" className="flex-1" onClick={() => reviewMutation.mutate()} disabled={reviewMutation.isPending}>
                        {reviewMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Submit Review"}
                      </Button>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {/* Submission Info */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Submission Info</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Submitted by</p>
                <p className="font-medium">
                  {submission.worker ? `${submission.worker.firstName} ${submission.worker.lastName}` : "—"}
                </p>
                {submission.worker?.email && (
                  <p className="text-xs text-muted-foreground">{submission.worker.email}</p>
                )}
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Created</p>
                <p className="font-medium">{format(new Date(submission.createdAt), "MMM d, yyyy")}</p>
              </div>
              {submission.reviewedAt && (
                <div>
                  <p className="text-xs text-muted-foreground">Reviewed</p>
                  <p className="font-medium">{format(new Date(submission.reviewedAt), "MMM d, yyyy")}</p>
                  {submission.reviewer && (
                    <p className="text-xs text-muted-foreground">
                      by {submission.reviewer.firstName} {submission.reviewer.lastName}
                    </p>
                  )}
                </div>
              )}
              {submission.reviewNotes && (
                <div>
                  <p className="text-xs text-muted-foreground">Review Notes</p>
                  <p className="text-sm">{submission.reviewNotes}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
