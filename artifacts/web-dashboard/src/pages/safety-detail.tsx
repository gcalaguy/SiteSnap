import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch, useGetMe } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import {
  ArrowLeft,
  Bot,
  CheckCircle2,
  Clock,
  Download,
  Eye,
  FileText,
  Loader2,
  MessageSquare,
  Send,
  ShieldAlert,
  User,
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

function renderFieldValue(field: FormField, value: any): string {
  if (value === undefined || value === null || value === "") return "—";
  if (Array.isArray(value)) return value.join(", ") || "—";
  return String(value);
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

  const exportPDF = () => {
    if (!submission) return;
    import("jspdf").then(({ default: jsPDF }) => {
      const doc = new jsPDF();
      const fields = submission.template?.schema?.fields ?? [];
      let y = 20;
      const lm = 20;
      const pw = 170;

      // Header
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

      // Meta
      doc.setTextColor(60, 60, 60);
      doc.setFontSize(9);
      doc.text(`Worker: ${submission.worker ? `${submission.worker.firstName} ${submission.worker.lastName}` : "—"}`, lm, y);
      y += 6;
      doc.text(`Date: ${format(new Date(submission.createdAt), "MMMM d, yyyy h:mm a")}`, lm, y);
      y += 6;
      doc.text(`Status: ${submission.status.toUpperCase()}`, lm, y);
      y += 12;

      // AI Summary
      if (submission.aiSummary) {
        doc.setFillColor(255, 245, 230);
        doc.roundedRect(lm - 2, y - 4, pw + 4, 6 + doc.splitTextToSize(submission.aiSummary, pw).length * 5, 2, 2, "F");
        doc.setTextColor(180, 80, 0);
        doc.setFontSize(9);
        doc.setFont("helvetica", "bold");
        doc.text("AI Summary", lm, y);
        y += 5;
        doc.setFont("helvetica", "normal");
        doc.setTextColor(80, 40, 0);
        const summaryLines = doc.splitTextToSize(submission.aiSummary, pw);
        doc.text(summaryLines, lm, y);
        y += summaryLines.length * 5 + 8;
      }

      // Fields
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
        if (y + lines.length * 5 > 270) {
          doc.addPage();
          y = 20;
        }
        doc.text(lines, lm, y);
        y += lines.length * 5 + 4;
      }

      // Review notes
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

      doc.save(`${submission.template?.name ?? "safety-form"}-${id}.pdf`);
      toast({ title: "PDF exported" });
    });
  };

  const exportDOCX = async () => {
    if (!submission) return;
    try {
      const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } = await import("docx");
      const fields = submission.template?.schema?.fields ?? [];
      const children: any[] = [
        new Paragraph({
          text: submission.template?.name ?? "Safety Form",
          heading: HeadingLevel.HEADING_1,
        }),
        new Paragraph({
          children: [
            new TextRun({ text: "Worker: ", bold: true }),
            new TextRun(submission.worker ? `${submission.worker.firstName} ${submission.worker.lastName}` : "—"),
          ],
        }),
        new Paragraph({
          children: [
            new TextRun({ text: "Date: ", bold: true }),
            new TextRun(format(new Date(submission.createdAt), "MMMM d, yyyy h:mm a")),
          ],
        }),
        new Paragraph({
          children: [
            new TextRun({ text: "Status: ", bold: true }),
            new TextRun(submission.status.toUpperCase()),
          ],
        }),
        new Paragraph({ text: "" }),
      ];

      if (submission.aiSummary) {
        children.push(
          new Paragraph({ text: "AI Summary", heading: HeadingLevel.HEADING_2 }),
          new Paragraph({ text: submission.aiSummary }),
          new Paragraph({ text: "" })
        );
      }

      children.push(new Paragraph({ text: "Form Details", heading: HeadingLevel.HEADING_2 }));

      for (const field of fields) {
        const rawVal = submission.data[field.id];
        const val = renderFieldValue(field, rawVal);
        children.push(
          new Paragraph({
            children: [
              new TextRun({ text: field.label + ": ", bold: true }),
              new TextRun(val),
            ],
          })
        );
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
      a.href = url;
      a.download = `${submission.template?.name ?? "safety-form"}-${id}.docx`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Word document exported" });
    } catch (err) {
      toast({ title: "Export failed", description: "Could not generate Word document.", variant: "destructive" });
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
    return (
      <div className="p-6 text-center text-muted-foreground">
        Submission not found.
      </div>
    );
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
                <span
                  className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    categoryColor[submission.template.category] ?? "bg-gray-100 text-gray-600"
                  }`}
                >
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
            <Download className="h-3.5 w-3.5" />
            PDF
          </Button>
          <Button variant="outline" size="sm" onClick={exportDOCX} className="gap-1.5">
            <FileText className="h-3.5 w-3.5" />
            DOCX
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* AI Summary */}
          {submission.aiSummary && (
            <Card className="border-orange-200 bg-orange-50/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2 text-orange-800">
                  <Bot className="h-4 w-4" />
                  AI Summary
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-orange-900 leading-relaxed">{submission.aiSummary}</p>
              </CardContent>
            </Card>
          )}

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
              <CardHeader>
                <CardTitle className="text-base">Photos</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-3">
                  {submission.photos.map((photo) => (
                    <a key={photo.id} href={photo.url} target="_blank" rel="noreferrer">
                      <img
                        src={photo.url}
                        alt={photo.filename}
                        className="rounded-lg object-cover aspect-square w-full hover:opacity-90 transition-opacity border"
                      />
                    </a>
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
                  {commentMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
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
                  <Button
                    className="w-full"
                    onClick={() => setShowReviewForm(true)}
                  >
                    Start Review
                  </Button>
                ) : (
                  <>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground">Decision</label>
                      <Select value={reviewStatus} onValueChange={(v: any) => setReviewStatus(v)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
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
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={() => setShowReviewForm(false)}
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        className="flex-1"
                        onClick={() => reviewMutation.mutate()}
                        disabled={reviewMutation.isPending}
                      >
                        {reviewMutation.isPending ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          "Submit Review"
                        )}
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
                  {submission.worker
                    ? `${submission.worker.firstName} ${submission.worker.lastName}`
                    : "—"}
                </p>
                {submission.worker?.email && (
                  <p className="text-xs text-muted-foreground">{submission.worker.email}</p>
                )}
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Created</p>
                <p className="font-medium">
                  {format(new Date(submission.createdAt), "MMM d, yyyy")}
                </p>
              </div>
              {submission.reviewedAt && (
                <div>
                  <p className="text-xs text-muted-foreground">Reviewed</p>
                  <p className="font-medium">
                    {format(new Date(submission.reviewedAt), "MMM d, yyyy")}
                  </p>
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

          {/* AI Summary if not shown above (no data yet) */}
          {!submission.aiSummary && submission.status === "submitted" && (
            <Card className="border-dashed">
              <CardContent className="pt-4 text-center">
                <Bot className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
                <p className="text-xs text-muted-foreground">AI summary is being generated…</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
