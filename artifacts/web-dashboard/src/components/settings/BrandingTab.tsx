import { useRef, useState } from "react";
import type { RefObject } from "react";
import {
  ChevronDown, ChevronRight, Loader2, ImageIcon, Upload, X, FileText,
  AlertCircle, Hash, Save,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Company } from "@workspace/api-client-react";
import { useSignedUrl } from "@/hooks/useSignedUrl";
import { useCompanyLogo } from "@/hooks/settings/useCompanyLogo";
import { useDocumentTemplates, type TemplateType } from "@/hooks/settings/useDocumentTemplates";
import { useDocumentNumbering } from "@/hooks/settings/useDocumentNumbering";

// ── Company Logo Card ──────────────────────────────────────────────────────────

function CompanyLogoCard({ company }: { company: Company }) {
  const { logoUrl, logoUrlLoading, uploading, fileInputRef, handleLogoUpload, handleRemoveLogo } = useCompanyLogo(company);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ImageIcon className="h-5 w-5 text-primary" />
          Company Logo
        </CardTitle>
        <CardDescription>
          Your logo appears on exported estimates (PDF, Word) and email headers.
          Recommended: landscape format, PNG or JPG.
        </CardDescription>
      </CardHeader>
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
    </Card>
  );
}

// ── Document Templates Card ────────────────────────────────────────────────────

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

function DocumentTemplatesCard({ company }: { company: Company }) {
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
              Document Templates
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

// ── Document Numbering & Terms Card ──────────────────────────────────────────

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

export function BrandingTab({ company, isOwner }: { company: Company; isOwner: boolean }) {
  return (
    <div className="space-y-6">
      <CompanyLogoCard company={company} />
      <DocumentTemplatesCard company={company} />
      {isOwner && <DocumentNumberingCard company={company} />}
    </div>
  );
}
