import { useRef, useState } from "react";
import {
  ChevronDown, ChevronRight, Loader2, FileText, Upload, Eye, RotateCcw, Variable,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { DocumentTemplateType, DocumentTemplateListItem } from "@workspace/api-client-react";
import { useCustomDocumentTemplates } from "@/hooks/settings/useCustomDocumentTemplates";

const DOCUMENT_TYPE_ORDER: DocumentTemplateType[] = ["quote", "invoice", "rfi", "proposal", "change_order"];

const DOCUMENT_TYPE_LABELS: Record<DocumentTemplateType, string> = {
  quote: "Quotes",
  invoice: "Invoices",
  rfi: "RFIs",
  proposal: "Proposals",
  change_order: "Change Orders",
};

const FILE_TYPE_LABELS: Record<string, string> = {
  docx: "DOCX",
  html: "HTML",
  pdf: "PDF",
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function DocumentTemplateRow({
  item,
  isOwner,
  isUploading,
  isPreviewing,
  isResetting,
  onUpload,
  onPreview,
  onRequestReset,
}: {
  item: DocumentTemplateListItem;
  isOwner: boolean;
  isUploading: boolean;
  isPreviewing: boolean;
  isResetting: boolean;
  onUpload: (file: File) => void;
  onPreview: () => void;
  onRequestReset: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { documentType, hasCustomTemplate, template } = item;

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3 py-4">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-medium text-foreground">{DOCUMENT_TYPE_LABELS[documentType]}</p>
          {hasCustomTemplate && template ? (
            <Badge variant="secondary">{FILE_TYPE_LABELS[template.fileType] ?? template.fileType}</Badge>
          ) : (
            <Badge variant="outline" className="text-muted-foreground">Default theme</Badge>
          )}
        </div>
        {hasCustomTemplate && template ? (
          <p className="text-xs text-muted-foreground truncate">
            {template.originalFilename} · {formatBytes(template.fileSizeBytes)} · updated {formatDate(template.updatedAt)}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">Uses the built-in branded PDF theme</p>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Button variant="outline" size="sm" className="gap-2" disabled={isPreviewing} onClick={onPreview}>
          {isPreviewing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
          Preview
        </Button>
        {isOwner && (
          <>
            <input
              ref={inputRef}
              type="file"
              className="hidden"
              accept=".docx,.html,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/html"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(f); e.target.value = ""; }}
            />
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              disabled={isUploading}
              onClick={() => inputRef.current?.click()}
            >
              {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {hasCustomTemplate ? "Replace" : "Upload"}
            </Button>
            {hasCustomTemplate && (
              <Button
                variant="ghost"
                size="sm"
                className="gap-2 text-muted-foreground hover:text-destructive"
                disabled={isResetting}
                onClick={onRequestReset}
              >
                {isResetting ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                Reset
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function MergeTagReferenceCard({ mergeTagCatalog }: { mergeTagCatalog: Record<string, { tag: string; label: string; description: string }[]> }) {
  const [collapsed, setCollapsed] = useState(true);
  const types = DOCUMENT_TYPE_ORDER.filter((t) => mergeTagCatalog[t]?.length);

  return (
    <Card>
      <button onClick={() => setCollapsed((c) => !c)} className="w-full text-left">
        <CardHeader className="flex flex-row items-center justify-between py-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Variable className="h-5 w-5 text-primary" />
              Available Dynamic Variables
            </CardTitle>
            <CardDescription>
              Use these <code className="text-xs">{"{{merge_tags}}"}</code> in your .docx or .html templates — they're replaced with real data when a document is generated.
            </CardDescription>
          </div>
          {collapsed
            ? <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0 ml-4" />
            : <ChevronDown className="h-5 w-5 text-muted-foreground shrink-0 ml-4" />}
        </CardHeader>
      </button>
      {!collapsed && (
        <CardContent className="space-y-5">
          {types.map((type) => (
            <div key={type} className="space-y-2">
              <p className="text-sm font-medium text-foreground">{DOCUMENT_TYPE_LABELS[type]}</p>
              <div className="grid sm:grid-cols-2 gap-x-4 gap-y-1.5">
                {mergeTagCatalog[type].map((mt) => (
                  <div key={mt.tag} className="flex items-baseline gap-2 min-w-0">
                    <code className="text-xs shrink-0 rounded bg-muted px-1.5 py-0.5 text-foreground">{`{{${mt.tag}}}`}</code>
                    <span className="text-xs text-muted-foreground truncate" title={mt.description}>{mt.label}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </CardContent>
      )}
    </Card>
  );
}

export function CustomDocumentTemplatesTab({ isOwner }: { isOwner: boolean }) {
  const {
    templates, isLoading, mergeTagCatalog,
    uploadingType, previewingType, resettingType,
    handleUpload, handleReset, handlePreview,
  } = useCustomDocumentTemplates();
  const [resetTarget, setResetTarget] = useState<DocumentTemplateType | null>(null);

  const ordered = DOCUMENT_TYPE_ORDER
    .map((t) => templates.find((item) => item.documentType === t))
    .filter((item): item is NonNullable<typeof item> => !!item);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Custom Document Templates
          </CardTitle>
          <CardDescription>
            Upload your own .docx, .html, or .pdf template for each document type. If none is uploaded, documents use the default branded theme.
            {!isOwner && " Only the account owner can upload or reset templates."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground py-4">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading...
            </div>
          ) : (
            <div className="divide-y divide-border">
              {ordered.map((item) => (
                <DocumentTemplateRow
                  key={item.documentType}
                  item={item}
                  isOwner={isOwner}
                  isUploading={uploadingType === item.documentType}
                  isPreviewing={previewingType === item.documentType}
                  isResetting={resettingType === item.documentType}
                  onUpload={(file) => handleUpload(file, item.documentType)}
                  onPreview={() => handlePreview(item.documentType)}
                  onRequestReset={() => setResetTarget(item.documentType)}
                />
              ))}
            </div>
          )}
          <Separator className="my-2" />
          <p className="text-xs text-muted-foreground pt-2">Accepted: .docx, .html, or .pdf · max 10MB</p>
        </CardContent>
      </Card>

      <MergeTagReferenceCard mergeTagCatalog={mergeTagCatalog} />

      <AlertDialog open={resetTarget !== null} onOpenChange={(o) => { if (!o) setResetTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset to default theme?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes your custom {resetTarget ? DOCUMENT_TYPE_LABELS[resetTarget].toLowerCase() : ""} template.
              New documents of this type will use the default branded theme until you upload another one.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (resetTarget) { const t = resetTarget; setResetTarget(null); handleReset(t); } }}
            >
              Reset
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
