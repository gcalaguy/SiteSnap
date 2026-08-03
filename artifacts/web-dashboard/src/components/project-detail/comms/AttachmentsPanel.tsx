import { useState } from "react";
import {
  useListProjectCommunicationAttachments,
  getProjectCommunicationAttachmentUrl,
  type ProjectAttachment,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  FileText,
  Grid,
  Image,
  Layers,
  DollarSign,
  Clipboard,
  Shield,
  Paperclip,
  ExternalLink,
  Folder,
  RefreshCw,
  AlertCircle,
} from "lucide-react";

const CATEGORY_ICON: Record<string, typeof FileText> = {
  pdf: FileText,
  word: FileText,
  excel: Grid,
  image: Image,
  cad: Layers,
  blueprint: Layers,
  quote: FileText,
  invoice: DollarSign,
  inspection_report: Clipboard,
  permit: Shield,
  other: Paperclip,
};

const CATEGORY_LABEL: Record<string, string> = {
  pdf: "PDF",
  word: "Word",
  excel: "Excel",
  image: "Image",
  cad: "CAD",
  blueprint: "Blueprint",
  quote: "Quote",
  invoice: "Invoice",
  inspection_report: "Inspection Report",
  permit: "Permit",
  other: "Other",
};

function AttachmentRow({ projectId, attachment }: { projectId: number; attachment: ProjectAttachment }) {
  const { toast } = useToast();
  const [opening, setOpening] = useState(false);
  const category = attachment.category ?? "other";
  const Icon = CATEGORY_ICON[category] ?? Paperclip;

  async function handleOpen() {
    setOpening(true);
    try {
      const result = await getProjectCommunicationAttachmentUrl(projectId, attachment.id);
      window.open(result.url, "_blank", "noopener,noreferrer");
    } catch {
      toast({ title: "Failed", description: "Could not open this attachment. Please try again.", variant: "destructive" });
    } finally {
      setOpening(false);
    }
  }

  return (
    <button onClick={handleOpen} disabled={opening} className="w-full text-left">
      <Card className="hover:border-primary/40 transition-colors">
        <CardContent className="p-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            {opening ? <RefreshCw className="w-3.5 h-3.5 animate-spin text-foreground/40" /> : <Icon className="w-3.5 h-3.5 text-primary" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{attachment.filename}</p>
            <div className="flex items-center gap-1.5 mt-1">
              <Badge variant="outline" className="text-[10px] text-muted-foreground">{CATEGORY_LABEL[category] ?? category}</Badge>
              {attachment.documentId != null && (
                <Badge variant="outline" className="text-[10px] gap-1 text-primary border-primary/30">
                  <Folder className="w-2.5 h-2.5" /> In Documents
                </Badge>
              )}
            </div>
          </div>
          <ExternalLink className="w-3.5 h-3.5 text-foreground/40 shrink-0" />
        </CardContent>
      </Card>
    </button>
  );
}

export function AttachmentsPanel({ projectId }: { projectId: number }) {
  const { data, isLoading, isError, refetch } = useListProjectCommunicationAttachments(projectId);
  const attachments = data?.data ?? [];

  if (isLoading) return <div className="py-8 text-center text-foreground/60 animate-pulse text-sm">Loading…</div>;

  if (isError) {
    return (
      <div className="py-10 flex flex-col items-center text-center gap-2">
        <AlertCircle className="w-6 h-6 text-foreground/30" />
        <p className="text-sm text-foreground/60">Failed to load attachments</p>
        <button onClick={() => refetch()} className="text-xs text-primary hover:underline">Retry</button>
      </div>
    );
  }

  if (attachments.length === 0) {
    return (
      <div className="py-10 flex flex-col items-center text-center gap-2 border border-dashed border-border rounded-lg">
        <Paperclip className="w-6 h-6 text-foreground/30" />
        <p className="text-sm font-medium">No attachments yet</p>
        <p className="text-xs text-foreground/40 max-w-xs">
          Attachments from emails assigned to this project will show up here, automatically categorized.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {attachments.map((a) => (
        <AttachmentRow key={a.id} projectId={projectId} attachment={a} />
      ))}
    </div>
  );
}
