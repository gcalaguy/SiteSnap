import { useState } from "react";
import { useLocation, useSearch } from "wouter";
import { useCreateQuote, useGetMe } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, FileImage, Loader2, Settings } from "lucide-react";

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

  const quoteTemplatePath: string | undefined = (me as any)?.company?.quoteTemplatePath ?? undefined;
  const templatePreviewUrl = quoteTemplatePath
    ? quoteTemplatePath.replace(/^\/objects\//, "/api/storage/objects/")
    : undefined;

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
          ) : (
            <div className="flex items-center justify-between rounded-lg border border-dashed border-border p-4">
              <div>
                <p className="text-sm font-medium">No template uploaded</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Your PDF will use the default gold header with your company logo.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setLocation("/settings")}
                className="shrink-0 ml-4"
              >
                <Settings className="h-3.5 w-3.5 mr-1.5" />
                Upload Template
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

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
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Initial scope or any notes..."
                rows={3}
                className="resize-none mt-1"
              />
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
