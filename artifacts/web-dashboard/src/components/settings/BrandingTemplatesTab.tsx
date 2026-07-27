import { useRef, useState } from "react";
import type { RefObject } from "react";
import {
  ChevronDown, ChevronRight, Loader2, ImageIcon, Upload, X, FileText,
  AlertCircle, Hash, Save, Eye, RotateCcw, Variable,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import type { Company, DocumentTemplateType, DocumentTemplateListItem } from "@workspace/api-client-react";
import { useSignedUrl } from "@/hooks/useSignedUrl";
import { useCompanyLogo } from "@/hooks/settings/useCompanyLogo";
import { useDocumentTemplates, type TemplateType } from "@/hooks/settings/useDocumentTemplates";
import { useDocumentNumbering } from "@/hooks/settings/useDocumentNumbering";
import { useCustomDocumentTemplates } from "@/hooks/settings/useCustomDocumentTemplates";

// ── Section Header ──────────────────────────────────────────────────────────

function SectionHeader({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

// ── Company Logo Card ──────────────────────────────────────────────────────────

function CompanyLogoCard({ company }: { company: Company }) {
  const { logoUrl, logoUrlLoading, uploading, fileInputRef, handleLogoUpload, handleRemoveLogo } = useCompanyLogo(company);
  const [collapsed, setCollapsed] = useState(true);

  return (
    <Card>
      <button onClick={() => setCollapsed((c) => !c)} className="w-full text-left">
        <CardHeader className="flex flex-row items-center justify-between py-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ImageIcon className="h-5 w-5 text-primary" />
              Company Logo
            </CardTitle>
            <CardDescription>
              Your logo appears on exported estimates (PDF, Word) and email headers.
              Recommended: landscape format, PNG or JPG.
            </CardDescription>
          </div>
          {collapsed
            ? <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0 ml-4" />
            : <ChevronDown className="h-5 w-5 text-muted-foreground shrink-0 ml-4" />}
        </CardHeader>
      </button>
      {!collapsed && (
        <CardContent className="space-y-4">
          {logoUrlLoading ? (
            <div className="rounded-lg border border-border bg-muted/30 p-4 flex items-center justify-center h-28">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : logoUrl ? (
            <div className="relative rounded-lg border border-border bg-muted/30 p-4 flex items-center justify-center h-28">
              <img src={logoUrl} alt="Company logo" className="max-h-20 max-w-full object-contain" />
              <button
                onClick={handleRemoveLogo}
                className="absolute top-2 right-2 p-1 rounded-full bg-background border border-border hover:bg-destructive/10 hover:text-destructive text-muted-foreground transition-colors"
                title="Remove logo"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <div className="rounded-lg border-2 border-dashed border-border bg-muted/20 p-6 flex items-center justify-center h-28">
              <div className="text-center">
                <ImageIcon className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-xs text-muted-foreground">No logo uploaded</p>
              </div>
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept="image/png,image/jpeg,image/webp"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleLogoUpload(f); e.target.value = ""; }}
          />
          <Button
            variant="outline"
            className="gap-2"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {company.logoPath ? "Replace Logo" : "Upload Logo"}
          </Button>
          <p className="text-xs text-muted-foreground">PNG, JPG, or WebP · max 20 MB · landscape format works best</p>
        </CardContent>
      )}
    </Card>
  );
}

// ── Header Image Templates Card ────────────────────────────────────────────────

function TemplateSection({
  type,
  templatePath,
  inputRef,
  isUploading,
  onUpload,
  onRemove,
}: {
  type: TemplateType;
  templatePath: string | null | undefined;
  inputRef: RefObject<HTMLInputElement | null>;
  isUploading: boolean;
  onUpload: (file: File) => void;
  onRemove: () => void;
}) {
  const label = type === "quote" ? "Quote Template" : "Invoice Template";
  const { data: currentUrl, isLoading: currentUrlLoading } = useSignedUrl(templatePath);
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-foreground">{label}</p>
          <p className="text-xs text-muted-foreground">Header image placed at the top of every {type} PDF</p>
        </div>
        {currentUrl && (
          <button
            onClick={onRemove}
            className="p-1 rounded-full bg-background border border-border hover:bg-destructive/10 hover:text-destructive text-muted-foreground transition-colors"
            title={`Remove ${type} template`}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {currentUrlLoading ? (
        <div className="rounded-lg border border-border bg-muted/20 p-5 flex items-center justify-center h-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : currentUrl ? (
        <div className="rounded-lg border border-border bg-muted/20 overflow-hidden">
          <img src={currentUrl} alt={`${label} preview`} className="w-full max-h-28 object-cover object-top" />
        </div>
      ) : (
        <div className="rounded-lg border-2 border-dashed border-border bg-muted/20 p-5 flex items-center justify-center h-20 border-t-[1px] border-r-[1px] border-b-[1px] border-l-[1px]">
          <div className="text-center">
            <FileText className="h-6 w-6 text-muted-foreground/30 mx-auto mb-1" />
            <p className="text-xs text-muted-foreground">No template uploaded</p>
          </div>
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept="image/png,image/jpeg,image/webp"
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
        {currentUrl ? "Replace Template" : "Upload Template"}
      </Button>
    </div>
  );
}

function HeaderImageTemplatesCard({ company }: { company: Company }) {
  const [collapsed, setCollapsed] = useState(true);
  const quoteInputRef = useRef<HTMLInputElement>(null);
  const invoiceInputRef = useRef<HTMLInputElement>(null);
  const { uploadingType, handleUpload, handleRemove } = useDocumentTemplates(company);

  return (
    <Card>
      <button onClick={() => setCollapsed((c) => !c)} className="w-full text-left">
        <CardHeader className="flex flex-row items-center justify-between py-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              Header Images
            </CardTitle>
            <CardDescription>
              Upload a custom header image for your quotes and invoices.
            </CardDescription>
          </div>
          {collapsed
            ? <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0 ml-4" />
            : <ChevronDown className="h-5 w-5 text-muted-foreground shrink-0 ml-4" />}
        </CardHeader>
      </button>
      {!collapsed && (
        <CardContent className="space-y-6">
          <TemplateSection
            type="quote"
            templatePath={company.quoteTemplatePath}
            inputRef={quoteInputRef}
            isUploading={uploadingType === "quote"}
            onUpload={(f) => handleUpload(f, "quote")}
            onRemove={() => handleRemove("quote")}
          />
          <Separator />
          <TemplateSection
            type="invoice"
            templatePath={company.invoiceTemplatePath}
            inputRef={invoiceInputRef}
            isUploading={uploadingType === "invoice"}
            onUpload={(f) => handleUpload(f, "invoice")}
            onRemove={() => handleRemove("invoice")}
          />
          <p className="text-xs text-muted-foreground">PNG, JPG, or WebP · max 20 MB</p>
        </CardContent>
      )}
    </Card>
  );
}

// ── Custom Document Templates & Merge Tags ─────────────────────────────────────

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

function CustomDocumentTemplatesSection({ isOwner }: { isOwner: boolean }) {
  const {
    templates, isLoading, mergeTagCatalog,
    uploadingType, previewingType, resettingType,
    handleUpload, handleReset, handlePreview,
  } = useCustomDocumentTemplates();
  const [resetTarget, setResetTarget] = useState<DocumentTemplateType | null>(null);
  const [collapsed, setCollapsed] = useState(true);

  const ordered = DOCUMENT_TYPE_ORDER
    .map((t) => templates.find((item) => item.documentType === t))
    .filter((item): item is NonNullable<typeof item> => !!item);

  return (
    <div className="space-y-6">
      <Card>
        <button onClick={() => setCollapsed((c) => !c)} className="w-full text-left">
          <CardHeader className="flex flex-row items-center justify-between py-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                Custom Document Templates
              </CardTitle>
              <CardDescription>
                Upload your own .docx, .html, or .pdf template for each document type. If none is uploaded, documents use the default branded theme.
                {!isOwner && " Only the account owner can upload or reset templates."}
              </CardDescription>
            </div>
            {collapsed
              ? <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0 ml-4" />
              : <ChevronDown className="h-5 w-5 text-muted-foreground shrink-0 ml-4" />}
          </CardHeader>
        </button>
        {!collapsed && (
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
        )}
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

// ── Numbering & Boilerplate Terms ──────────────────────────────────────────────

function DocumentNumberingCard({ company }: { company: Company }) {
  const [collapsed, setCollapsed] = useState(true);
  const {
    isLoading,
    quotePrefix, setQuotePrefix,
    invoicePrefix, setInvoicePrefix,
    quoteStart, setQuoteStart,
    invoiceStart, setInvoiceStart,
    quoteTerms, setQuoteTerms,
    invoiceNotes, setInvoiceNotes,
    errors, hasErrors,
    handleSave, isSaving,
  } = useDocumentNumbering(company);

  return (
    <Card>
      <button onClick={() => setCollapsed((c) => !c)} className="w-full text-left">
        <CardHeader className="flex flex-row items-center justify-between py-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Hash className="h-5 w-5 text-primary" />
              Document Numbering & Terms
            </CardTitle>
            <CardDescription>
              Customize quote/invoice prefixes, starting numbers, and default boilerplate text.
            </CardDescription>
          </div>
          {collapsed
            ? <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0 ml-4" />
            : <ChevronDown className="h-5 w-5 text-muted-foreground shrink-0 ml-4" />}
        </CardHeader>
      </button>
      {!collapsed && (
        <CardContent className="space-y-6">
          {isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading...
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Quote Prefix</Label>
                  <Input
                    value={quotePrefix}
                    onChange={(e) => setQuotePrefix(e.target.value)}
                    placeholder="QUO"
                    className={cn(errors.quoteNumberPrefix && "border-destructive focus-visible:ring-destructive")}
                  />
                  {errors.quoteNumberPrefix ? (
                    <p className="text-xs text-destructive flex items-center gap-1">
                      <AlertCircle className="h-3 w-3 shrink-0" />
                      {errors.quoteNumberPrefix}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">e.g., QUO, ABC, 2026-Q</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Quote Start Number</Label>
                  <Input
                    type="number"
                    min={1}
                    value={quoteStart}
                    onChange={(e) => setQuoteStart(Number(e.target.value))}
                    className={cn(errors.quoteStartNumber && "border-destructive focus-visible:ring-destructive")}
                  />
                  {errors.quoteStartNumber ? (
                    <p className="text-xs text-destructive flex items-center gap-1">
                      <AlertCircle className="h-3 w-3 shrink-0" />
                      {errors.quoteStartNumber}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">First quote will be {quotePrefix || "QUO"}-{String(quoteStart).padStart(4, "0")}</p>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Invoice Prefix</Label>
                  <Input
                    value={invoicePrefix}
                    onChange={(e) => setInvoicePrefix(e.target.value)}
                    placeholder="INV"
                    className={cn(errors.invoiceNumberPrefix && "border-destructive focus-visible:ring-destructive")}
                  />
                  {errors.invoiceNumberPrefix ? (
                    <p className="text-xs text-destructive flex items-center gap-1">
                      <AlertCircle className="h-3 w-3 shrink-0" />
                      {errors.invoiceNumberPrefix}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">e.g., INV, 2026-INV</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Invoice Start Number</Label>
                  <Input
                    type="number"
                    min={1}
                    value={invoiceStart}
                    onChange={(e) => setInvoiceStart(Number(e.target.value))}
                    className={cn(errors.invoiceStartNumber && "border-destructive focus-visible:ring-destructive")}
                  />
                  {errors.invoiceStartNumber ? (
                    <p className="text-xs text-destructive flex items-center gap-1">
                      <AlertCircle className="h-3 w-3 shrink-0" />
                      {errors.invoiceStartNumber}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">First invoice will be {invoicePrefix || "INV"}-{String(invoiceStart).padStart(4, "0")}</p>
                  )}
                </div>
              </div>
              <Separator />
              <div className="space-y-2">
                <Label>Default Quote Terms & Conditions</Label>
                <textarea
                  className="w-full min-h-[100px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  value={quoteTerms}
                  onChange={(e) => setQuoteTerms(e.target.value)}
                  placeholder="e.g., Payment terms: Net 30. Warranty: 1 year workmanship."
                />
                <p className="text-xs text-muted-foreground">Appears at the bottom of every quote PDF.</p>
              </div>
              <div className="space-y-2">
                <Label>Default Invoice Notes / Terms</Label>
                <textarea
                  className="w-full min-h-[100px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  value={invoiceNotes}
                  onChange={(e) => setInvoiceNotes(e.target.value)}
                  placeholder="e.g., EFT remittance: Transit 12345 · Account 987654321. Late fees apply after 30 days."
                />
                <p className="text-xs text-muted-foreground">Appears in the Notes / Terms section of every invoice PDF.</p>
              </div>
              {hasErrors && (
                <p className="text-sm text-destructive flex items-center gap-1.5">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  Fix the errors above before saving.
                </p>
              )}
              <Button onClick={handleSave} disabled={hasErrors || isSaving} className="gap-2">
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save Document Settings
              </Button>
            </>
          )}
        </CardContent>
      )}
    </Card>
  );
}

// ── Combined Tab ────────────────────────────────────────────────────────────────

export function BrandingTemplatesTab({ company, isOwner }: { company: Company; isOwner: boolean }) {
  return (
    <div className="space-y-10">
      <div className="space-y-4">
        <SectionHeader
          title="Visual Branding"
          description="Your logo and header images, used across exported documents."
        />
        <CompanyLogoCard company={company} />
        <HeaderImageTemplatesCard company={company} />
      </div>

      <div className="space-y-4">
        <SectionHeader
          title="Document Templates & Merge Tags"
          description="Bring your own .docx, .html, or .pdf templates, and reference the merge tags available to them."
        />
        <CustomDocumentTemplatesSection isOwner={isOwner} />
      </div>

      {isOwner && (
        <div className="space-y-4">
          <SectionHeader
            title="Numbering & Boilerplate Terms"
            description="Quote/invoice prefixes, starting numbers, and default terms text."
          />
          <DocumentNumberingCard company={company} />
        </div>
      )}
    </div>
  );
}
