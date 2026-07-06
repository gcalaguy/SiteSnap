import { useState } from "react";
import { useParams } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { useSignedUrl } from "@/hooks/useSignedUrl";
import { format } from "date-fns";
import {
  Bot,
  CheckCircle2,
  Clock,
  Eye,
  FileText,
  Loader2,
  MessageSquare,
  Send,
  User,
  Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { WorkerLayout } from "@/components/worker-layout";

interface FormField {
  id: string;
  label: string;
  type: string;
  options?: string[];
}

interface SubmissionDetail {
  id: number;
  status: string;
  data: Record<string, unknown>;
  aiSummary: string | null;
  reviewNotes: string | null;
  reviewedAt: string | null;
  createdAt: string;
  template: { id: number; name: string; category: string; schema: { fields: FormField[] } } | null;
  worker: { id: number; firstName: string; lastName: string; email: string } | null;
  reviewer: { id: number; firstName: string; lastName: string } | null;
  photos: Array<{ id: number; url: string; filename: string }>;
  comments: Array<{ id: number; comment: string; createdAt: string; user: { firstName: string; lastName: string } | null }>;
}

const statusConfig: Record<string, { label: string; color: string; bg: string; icon: React.ElementType; message: string }> = {
  draft:     { label: "Draft",     color: "text-gray-600",   bg: "bg-gray-100",   icon: Clock,        message: "This form is saved as a draft." },
  submitted: { label: "Submitted", color: "text-blue-700",   bg: "bg-blue-50",    icon: FileText,     message: "Submitted — waiting for foreman review." },
  reviewed:  { label: "Reviewed",  color: "text-purple-700", bg: "bg-purple-50",  icon: Eye,          message: "Your foreman has reviewed this submission." },
  approved:  { label: "Approved",  color: "text-green-700",  bg: "bg-green-50",   icon: CheckCircle2, message: "This submission has been approved. ✓" },
};

const categoryEmoji: Record<string, string> = {
  injury: "🩹", safety: "⚠️", hazard: "🔶", toolbox: "🛠️",
};

function renderValue(field: FormField, val: unknown): string {
  if (val === undefined || val === null || val === "") return "—";
  if (Array.isArray(val)) return val.join(", ") || "—";
  return String(val);
}

function SignedPhotoLink({ photo }: { photo: { id: number; url: string; filename: string } }) {
  const { data: signedUrl, isLoading } = useSignedUrl(photo.url);
  if (isLoading) {
    return (
      <div className="rounded-xl aspect-square w-full bg-gray-100 flex items-center justify-center">
        <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
      </div>
    );
  }
  if (!signedUrl) {
    return (
      <div className="rounded-xl aspect-square w-full bg-gray-100 flex items-center justify-center text-[10px] text-gray-400">
        No photo
      </div>
    );
  }
  return (
    <a href={signedUrl} target="_blank" rel="noreferrer">
      <img
        src={signedUrl}
        alt={photo.filename}
        className="rounded-xl object-cover aspect-square w-full border border-gray-100"
      />
    </a>
  );
}

export default function WorkerPortalDetailPage() {
  const { id } = useParams<{ id: string }>();

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [comment, setComment] = useState("");

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
      toast({ title: "Comment sent" });
    },
    onError: () => toast({ title: "Error", description: "Could not send comment.", variant: "destructive" }),
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
    doc.text(`Date: ${format(new Date(submission.createdAt), "MMMM d, yyyy h:mm a")}`, lm, y);
    y += 6;
    doc.text(`Status: ${submission.status.toUpperCase()}`, lm, y);
    y += 12;

    if (submission.aiSummary) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(180, 80, 0);
      doc.text("AI Summary", lm, y);
      y += 5;
      doc.setFont("helvetica", "normal");
      doc.setTextColor(80, 40, 0);
      const lines = doc.splitTextToSize(submission.aiSummary, pw);
      doc.text(lines, lm, y);
      y += lines.length * 5 + 8;
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(23, 32, 52);
    doc.text("Form Details", lm, y);
    y += 8;

    for (const field of fields) {
      const val = renderValue(field, submission.data[field.id]);
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

    const pdfFilename = `${submission.template?.name ?? "safety"}-${id}.pdf`;
    doc.save(pdfFilename);
    toast({ title: "PDF saved" });

    const { mirrorArrayBuffer } = await import("@/lib/driveSyncPipeline");
    await mirrorArrayBuffer(pdfFilename, doc.output("arraybuffer"), "application/pdf");
  };

  if (isLoading) {
    return (
      <WorkerLayout breadcrumbs={[{ label: "Loading…" }]}>
        <div className="flex items-center justify-center h-48">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </WorkerLayout>
    );
  }

  if (!submission) {
    return (
      <WorkerLayout breadcrumbs={[{ label: "Not Found" }]}>
        <p className="text-center text-gray-500 py-12">Submission not found.</p>
      </WorkerLayout>
    );
  }

  const sc = statusConfig[submission.status] ?? statusConfig.draft;
  const StatusIcon = sc.icon;
  const fields = submission.template?.schema?.fields ?? [];

  return (
    <WorkerLayout
      breadcrumbs={[
        { label: "My Forms" },
        { label: submission.template?.name ?? "Form" },
      ]}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-2xl">{categoryEmoji[submission.template?.category ?? ""] ?? "📋"}</span>
            <h1 className="text-lg font-bold text-gray-900">
              {submission.template?.name ?? "Safety Form"}
            </h1>
          </div>
          <p className="text-xs text-gray-400 mt-1">
            {format(new Date(submission.createdAt), "MMMM d, yyyy · h:mm a")}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={exportPDF} className="gap-1.5 flex-shrink-0">
          <Download className="h-3.5 w-3.5" />
          PDF
        </Button>
      </div>

      {/* Status Banner */}
      <div className={`rounded-2xl border px-4 py-3 flex items-center gap-3 mb-5 ${sc.bg} border-transparent`}>
        <StatusIcon className={`h-5 w-5 flex-shrink-0 ${sc.color}`} />
        <p className={`text-sm font-medium ${sc.color}`}>{sc.message}</p>
      </div>

      {/* Review notes from foreman */}
      {submission.reviewNotes && (
        <div className="rounded-2xl bg-purple-50 border border-purple-100 px-4 py-3 mb-5">
          <p className="text-xs font-semibold text-purple-700 mb-1">Foreman Review Notes</p>
          <p className="text-sm text-purple-900">{submission.reviewNotes}</p>
          {submission.reviewedAt && (
            <p className="text-xs text-purple-500 mt-1">
              — {submission.reviewer ? `${submission.reviewer.firstName} ${submission.reviewer.lastName}` : "Reviewer"},{" "}
              {format(new Date(submission.reviewedAt), "MMM d")}
            </p>
          )}
        </div>
      )}

      {/* AI Summary */}
      {submission.aiSummary ? (
        <div className="rounded-2xl bg-amber-50 border border-amber-100 px-4 py-4 mb-5">
          <div className="flex items-center gap-2 mb-2">
            <Bot className="h-4 w-4 text-amber-700" />
            <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide">AI Summary</p>
          </div>
          <p className="text-sm text-amber-900 leading-relaxed">{submission.aiSummary}</p>
        </div>
      ) : submission.status === "submitted" ? (
        <div className="rounded-2xl bg-gray-50 border border-dashed border-gray-200 px-4 py-4 mb-5 text-center">
          <Bot className="h-5 w-5 text-gray-300 mx-auto mb-1" />
          <p className="text-xs text-gray-400">AI summary is being generated…</p>
        </div>
      ) : null}

      {/* Form Data */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm mb-5 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-50">
          <p className="text-sm font-semibold text-gray-700">Your Answers</p>
        </div>
        <div className="divide-y divide-gray-50">
          {fields.map((field) => (
            <div key={field.id} className="px-4 py-3">
              <p className="text-xs font-medium text-gray-400 mb-0.5">{field.label}</p>
              <p className="text-sm text-gray-900">
                {renderValue(field, submission.data[field.id])}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Photos */}
      {submission.photos.length > 0 && (
        <div className="mb-5">
          <p className="text-sm font-semibold text-gray-700 mb-2">Photos</p>
          <div className="grid grid-cols-3 gap-2">
            {submission.photos.map((p) => (
              <SignedPhotoLink key={p.id} photo={p} />
            ))}
          </div>
        </div>
      )}

      {/* Comments */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm mb-6 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-50 flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-gray-400" />
          <p className="text-sm font-semibold text-gray-700">
            Comments
            {submission.comments.length > 0 && (
              <span className="ml-1.5 text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">
                {submission.comments.length}
              </span>
            )}
          </p>
        </div>

        <div className="px-4">
          {submission.comments.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-4">No comments yet.</p>
          ) : (
            <div className="space-y-3 py-3">
              {submission.comments.map((c) => (
                <div key={c.id} className="flex gap-2.5">
                  <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <User className="h-3.5 w-3.5 text-gray-400" />
                  </div>
                  <div className="flex-1 bg-gray-50 rounded-xl px-3 py-2">
                    <p className="text-xs font-medium text-gray-800">
                      {c.user ? `${c.user.firstName} ${c.user.lastName}` : "Unknown"}
                      <span className="text-gray-400 font-normal ml-1.5">
                        {format(new Date(c.createdAt), "MMM d, h:mm a")}
                      </span>
                    </p>
                    <p className="text-sm text-gray-700 mt-0.5">{c.comment}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-2 py-3 border-t border-gray-50">
            <Textarea
              placeholder="Add a comment…"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={2}
              className="flex-1 resize-none text-sm"
            />
            <Button
              size="icon"
              onClick={() => commentMutation.mutate()}
              disabled={!comment.trim() || commentMutation.isPending}
              className="self-end"
            >
              {commentMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </div>
    </WorkerLayout>
  );
}
