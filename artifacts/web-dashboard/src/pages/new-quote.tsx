import { useState } from "react";
import { useLocation, useSearch } from "wouter";
import { useCreateQuote, useGetMe } from "@workspace/api-client-react";
import { createQuoteBodyNotesMax as NOTES_MAX } from "@workspace/api-zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, FileImage, Loader2, Settings } from "lucide-react";
import { useDraftRecovery } from "@/hooks/useDraftRecovery";
import { DraftBanner } from "@/components/DraftBanner";
import { useSignedUrl } from "@/hooks/useSignedUrl";

export default function NewQuote() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const projectIdParam = params.get("projectId");
  const projectId = projectIdParam ? parseInt(projectIdParam) : 0;

  const { toast } = useToast();
  const createQuote = useCreateQuote();
  const { data: me } = useGetMe();

  const [title, setTitle] = useState("");
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [clientCompanyName, setClientCompanyName] = useState("");
  const [clientAddress, setClientAddress] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [validUntil, setValidUntil] = useState("");

  const draft = useDraftRecovery(
    "new-quote",
    () => ({
      title,
      clientName,
      clientEmail,
      clientCompanyName,
      clientAddress,
      clientPhone,
      notes,
      validUntil,
    }),
    (state) => {
      setTitle((state.title as string) || "");
      setClientName((state.clientName as string) || "");
      setClientEmail((state.clientEmail as string) || "");
      setClientCompanyName((state.clientCompanyName as string) || "");
      setClientAddress((state.clientAddress as string) || "");
      setClientPhone((state.clientPhone as string) || "");
      setNotes((state.notes as string) || "");
      setValidUntil((state.validUntil as string) || "");
    }
  );

  const quoteTemplatePath: string | undefined = me?.company?.quoteTemplatePath ?? undefined;
  const logoPath: string | undefined = me?.company?.logoPath ?? undefined;
  const companyName: string = me?.company?.name ?? "Your Company";

  const { data: templatePreviewUrl, isLoading: templateLoading } = useSignedUrl(quoteTemplatePath);
  const { data: logoPreviewUrl, isLoading: logoLoading } = useSignedUrl(logoPath);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !clientName.trim()) {
      toast({ title: "Title and client name are required", variant: "destructive" });
      return;
    }
    try {
      const quote = await createQuote.mutateAsync({
        projectId,
        data: {
          title: title.trim(),
          clientName: clientName.trim(),
          clientEmail: clientEmail.trim() || undefined,
          clientCompanyName: clientCompanyName.trim() || undefined,
          clientAddress: clientAddress.trim() || undefined,
          clientPhone: clientPhone.trim() || undefined,
          notes: notes.trim() || undefined,
          validUntil: validUntil || undefined,
        },
      });
      toast({ title: "Quote created" });
      draft.clearDraft();
      setLocation(`/quotes/${quote.id}`);
    } catch {
      toast({ title: "Failed to create quote", variant: "destructive" });
    }
  }

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div>
        <button
          onClick={() => setLocation("/quotes")}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-3 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Quotes
        </button>
        <h1 className="text-2xl font-bold">New Quote</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Create a blank quote, then use AI fill to generate line items from a voice description.
        </p>
      </div>

      {/* PDF Template Preview */}
      <Card className="overflow-hidden">
        <CardHeader className="pb-3 pt-4 px-5">
          <CardTitle className="text-sm font-medium flex items-center gap-2 text-muted-foreground">
            <FileImage className="h-4 w-4" />
            PDF Template
          </CardTitle>
        </CardHeader>
        <CardContent className="px-5 pb-4">
          {templatePreviewUrl ? (
            <div className="space-y-3">
              <div className="rounded-lg overflow-hidden border border-border shadow-sm">
                <img
                  src={templatePreviewUrl}
                  alt="Quote template header"
                  className="w-full object-cover"
                  style={{ maxHeight: 120, objectPosition: "top" }}
                />
                <div className="bg-[#0a0a0a] flex items-center px-4 py-2 gap-6">
                  <span className="text-[11px] font-bold tracking-wide text-[#d4af37]">QUOTE</span>
                  <span className="text-[12px] text-white font-medium">QUO-XXXX</span>
                  <span className="ml-auto text-[10px] font-bold tracking-wide text-[#b4b4b4]">STATUS: DRAFT</span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Your uploaded template will appear as the header on every quote PDF.{" "}
                <button
                  type="button"
                  onClick={() => setLocation("/settings")}
                  className="text-primary underline-offset-2 hover:underline"
                >
                  Change in Settings
                </button>
              </p>
            </div>
          ) : templateLoading ? (
            <div className="space-y-3">
              <div className="rounded-lg border border-border shadow-sm h-32 flex items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
              <p className="text-xs text-muted-foreground">
                Loading template preview...
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Default gold header preview */}
              <div className="rounded-lg overflow-hidden border border-border shadow-sm">
                <div className="bg-black flex items-center justify-between px-4 py-3" style={{ minHeight: 52 }}>
                  {/* Logo or company name */}
                  {logoPreviewUrl ? (
                    <img
                      src={logoPreviewUrl}
                      alt="Company logo"
                      className="object-contain"
                      style={{ maxHeight: 40, maxWidth: 140 }}
                    />
                  ) : logoLoading ? (
                    <div className="w-10 h-10 flex items-center justify-center">
                      <Loader2 className="h-4 w-4 animate-spin text-white/60" />
                    </div>
                  ) : (
                    <span className="text-white font-bold text-base tracking-wide truncate max-w-[55%]">
                      {companyName}
                    </span>
                  )}
                  {/* Quote number placeholder */}
                  <div className="text-right shrink-0 ml-4">
                    <p className="text-[10px] font-semibold text-white/50 uppercase tracking-wider">Quote</p>
                    <p className="text-sm font-bold text-white leading-tight">QUO-XXXX</p>
                  </div>
                </div>
                <div className="bg-[#1a1a1a] flex items-center px-4 py-2 gap-6">
                  <span className="text-[11px] font-bold tracking-wide text-white">QUOTE</span>
                  <span className="text-[12px] text-white/80 font-medium">QUO-XXXX</span>
                  <span className="ml-auto text-[10px] font-bold tracking-wide text-white/50">STATUS: DRAFT</span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Default header using your company logo.{" "}
                <button
                  type="button"
                  onClick={() => setLocation("/settings")}
                  className="text-primary underline-offset-2 hover:underline"
                >
                  Upload a custom template in Settings
                </button>
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <DraftBanner show={draft.showBanner} onRestore={draft.restoreDraft} onDiscard={draft.discardDraft} />

      <Card>
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="title">Quote Title *</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Foundation Concrete Work — Phase 1"
                className="mt-1"
                required
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="clientName">Contact Name *</Label>
                <Input
                  id="clientName"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  placeholder="Primary contact name"
                  className="mt-1"
                  required
                />
              </div>
              <div>
                <Label htmlFor="clientCompanyName">Client Company Name</Label>
                <Input
                  id="clientCompanyName"
                  value={clientCompanyName}
                  onChange={(e) => setClientCompanyName(e.target.value)}
                  placeholder="Company or organization"
                  className="mt-1"
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="clientEmail">Client Email</Label>
                <Input
                  id="clientEmail"
                  type="email"
                  value={clientEmail}
                  onChange={(e) => setClientEmail(e.target.value)}
                  placeholder="client@example.com"
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="clientPhone">Client Phone</Label>
                <Input
                  id="clientPhone"
                  type="tel"
                  value={clientPhone}
                  onChange={(e) => setClientPhone(e.target.value)}
                  placeholder="(555) 000-0000"
                  className="mt-1"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="clientAddress">Client Address</Label>
              <Input
                id="clientAddress"
                value={clientAddress}
                onChange={(e) => setClientAddress(e.target.value)}
                placeholder="123 Main St, City, Province, Postal Code"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="validUntil">Valid Until</Label>
              <Input
                id="validUntil"
                type="date"
                value={validUntil}
                onChange={(e) => setValidUntil(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="notes">Notes / Scope</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value.slice(0, NOTES_MAX))}
                placeholder="Initial scope or any notes..."
                rows={3}
                maxLength={NOTES_MAX}
                className="resize-none mt-1"
              />
              <p className={`text-xs mt-1 text-right tabular-nums ${notes.length >= NOTES_MAX ? "text-destructive font-medium" : notes.length >= NOTES_MAX * 0.8 ? "text-amber-500" : "text-muted-foreground"}`}>
                {notes.length.toLocaleString()}/{NOTES_MAX.toLocaleString()}
              </p>
            </div>
            <div className="flex gap-3 pt-2">
              <Button
                type="submit"
                disabled={createQuote.isPending}
                className="bg-primary hover:bg-primary/90 text-primary-foreground"
              >
                {createQuote.isPending ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Creating...</>
                ) : (
                  "Create Quote"
                )}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setLocation("/quotes")}>
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
