import { useEffect, useState } from "react";
import { useParams } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { ShieldCheck, Loader2, FileText, CheckCircle2 } from "lucide-react";
import { format } from "date-fns";
import { SignaturePad } from "@/components/SignaturePad";
import { SignatureBadge } from "@/components/SignatureBadge";
import { formatCurrency as fmtCAD } from "@/lib/format";

interface PublicQuote {
  id: number;
  quoteNumber: string;
  title: string;
  clientName: string;
  clientEmail?: string | null;
  status: string;
  lineItems: Array<{ description: string; quantity: number; unit: string; unitPrice: number; total: number }>;
  subtotal: string;
  taxRate: string;
  taxAmount: string;
  total: string;
  notes?: string | null;
  validUntil?: string | null;
  createdAt: string;
  signedAt?: string | null;
  signerName?: string | null;
  signerIp?: string | null;
  signerUserAgent?: string | null;
  signatureData?: string | null;
  companyName?: string | null;
  terms?: string | null;
}

const safeDateFmt = (value: string | Date | null | undefined, pattern: string): string => {
  if (!value) return "";
  try {
    const d = typeof value === "string" ? new Date(value) : value;
    if (isNaN(d.getTime())) return "";
    return format(d, pattern);
  } catch {
    return "";
  }
};

export default function PublicQuotePage() {
  const params = useParams<{ token: string }>();
  const token = params.token!;
  const { toast } = useToast();

  const [quote, setQuote] = useState<PublicQuote | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [signerName, setSignerName] = useState("");
  const [signature, setSignature] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/public/quotes/${token}`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error ?? "Quote not found");
        return r.json();
      })
      .then((q: PublicQuote) => {
        if (cancelled) return;
        setQuote(q);
        setSignerName(q.clientName ?? "");
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function reloadQuote() {
    setRefreshing(true);
    try {
      const res = await fetch(`/api/public/quotes/${token}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Quote not found");
      setQuote(body);
    } finally {
      setRefreshing(false);
    }
  }

  async function submitSignature() {
    if (!signature) {
      toast({ title: "Please draw your signature", variant: "destructive" });
      return;
    }
    if (!signerName.trim()) {
      toast({ title: "Please enter your full legal name", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/public/quotes/${token}/sign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signatureData: signature, signerName: signerName.trim() }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to submit signature");
      setQuote(body);
      await reloadQuote();
      toast({ title: "Quote signed", description: "Thank you — your signature has been recorded." });
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "Failed to submit signature", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-muted/20 p-6">
        <div className="max-w-3xl mx-auto space-y-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  if (error || !quote) {
    return (
      <div className="min-h-screen bg-muted/20 p-6 flex items-center justify-center">
        <Card className="max-w-md w-full">
          <CardContent className="p-8 text-center">
            <FileText className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <h2 className="text-lg font-semibold mb-1">Quote not found</h2>
            <p className="text-sm text-muted-foreground">{error ?? "This signing link is invalid or has expired."}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isSigned = !!quote.signedAt;

  return (
    <div className="min-h-screen bg-muted/20">
      <header className="bg-white border-b">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold">{quote.companyName ?? "Site Snap"}</h1>
            <p className="text-xs text-muted-foreground">Quote {quote.quoteNumber}</p>
          </div>
          {isSigned && <SignatureBadge meta={quote} />}
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-6 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-2">
              <span>{quote.title}</span>
              <span className="text-2xl font-bold text-primary">{fmtCAD(quote.total)}</span>
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              For {quote.clientName}
              {quote.createdAt ? ` · Issued ${safeDateFmt(quote.createdAt, "MMMM d, yyyy")}` : ""}
              {quote.validUntil ? ` · Valid until ${safeDateFmt(quote.validUntil, "MMM d, yyyy")}` : ""}
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="text-left px-3 py-2 font-semibold">Description</th>
                    <th className="text-right px-3 py-2 font-semibold w-16">Qty</th>
                    <th className="text-right px-3 py-2 font-semibold w-24">Unit Price</th>
                    <th className="text-right px-3 py-2 font-semibold w-24">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {(quote.lineItems ?? []).map((it, idx) => (
                    <tr key={idx} className="border-t">
                      <td className="px-3 py-2">{it.description}</td>
                      <td className="px-3 py-2 text-right">{it.quantity} {it.unit}</td>
                      <td className="px-3 py-2 text-right">{fmtCAD(it.unitPrice)}</td>
                      <td className="px-3 py-2 text-right font-semibold">{fmtCAD(it.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="ml-auto max-w-xs space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{fmtCAD(quote.subtotal)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">HST ({(parseFloat(quote.taxRate) * 100).toFixed(0)}%)</span><span>{fmtCAD(quote.taxAmount)}</span></div>
              <Separator />
              <div className="flex justify-between text-base font-bold"><span>Total</span><span className="text-primary">{fmtCAD(quote.total)}</span></div>
            </div>

            {quote.notes && (
              <div className="rounded-md bg-muted/40 p-3 text-sm">
                <p className="text-xs uppercase font-semibold text-muted-foreground mb-1">Notes</p>
                <p className="whitespace-pre-wrap">{quote.notes}</p>
              </div>
            )}
            {quote.terms && (
              <div className="rounded-md bg-muted/40 p-3 text-sm">
                <p className="text-xs uppercase font-semibold text-muted-foreground mb-1">Terms & Conditions</p>
                <p className="whitespace-pre-wrap">{quote.terms}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {isSigned ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-green-700">
                <CheckCircle2 className="h-5 w-5" /> Signed & Approved
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-lg border bg-white p-3 inline-block">
                {quote.signatureData && (
                  <img src={quote.signatureData} alt="signature" className="max-h-24" />
                )}
              </div>
              <div className="text-xs text-muted-foreground space-y-0.5">
                {quote.signerName && <div>Signed by <strong>{quote.signerName}</strong></div>}
                <div>UTC: <span className="font-mono">{new Date(quote.signedAt!).toUTCString()}</span></div>
                {quote.signerIp && <div>IP: <span className="font-mono">{quote.signerIp}</span></div>}
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-primary" /> Sign to Approve
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="signerName" className="text-xs">Full legal name</Label>
                <Input
                  id="signerName"
                  value={signerName}
                  onChange={(e) => setSignerName(e.target.value)}
                  placeholder="Your full name"
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">Signature</Label>
                <SignaturePad onChange={setSignature} />
              </div>
              <Button onClick={submitSignature} disabled={submitting} className="w-full">
                {submitting || refreshing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ShieldCheck className="h-4 w-4 mr-2" />}
                Approve & Sign
              </Button>
              <p className="text-[11px] text-muted-foreground">
                Your IP address, browser, and a UTC timestamp will be recorded for audit purposes.
              </p>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
