import { useEffect, useState } from "react";
import { useParams } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { ShieldCheck, Loader2, FileText, CheckCircle2, Ban, CreditCard } from "lucide-react";
import { format } from "date-fns";
import { SignaturePad } from "@/components/SignaturePad";
import { SignatureBadge } from "@/components/SignatureBadge";

interface PublicInvoice {
  id: number;
  invoiceNumber: string;
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
  dueDate?: string | null;
  createdAt: string;
  signedAt?: string | null;
  signerName?: string | null;
  signerIp?: string | null;
  signerUserAgent?: string | null;
  signatureData?: string | null;
  companyName?: string | null;
  terms?: string | null;
}

const fmtCAD = (v: string | number) =>
  new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(Number(v));

export default function PublicInvoicePage() {
  const params = useParams<{ token: string }>();
  const token = params.token!;
  const { toast } = useToast();

  const [invoice, setInvoice] = useState<PublicInvoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [signerName, setSignerName] = useState("");
  const [signature, setSignature] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/public/invoices/${token}`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error ?? "Invoice not found");
        return r.json();
      })
      .then((i: PublicInvoice) => {
        if (cancelled) return;
        setInvoice(i);
        setSignerName(i.clientName ?? "");
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

  async function reloadInvoice() {
    setRefreshing(true);
    try {
      const res = await fetch(`/api/public/invoices/${token}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Invoice not found");
      setInvoice(body);
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
      const res = await fetch(`/api/public/invoices/${token}/sign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signatureData: signature, signerName: signerName.trim() }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to submit signature");
      setInvoice(body);
      await reloadInvoice();
      toast({ title: "Invoice acknowledged", description: "Thank you — your signature has been recorded." });
    } catch (e: any) {
      toast({ title: e.message, variant: "destructive" });
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

  if (error || !invoice) {
    return (
      <div className="min-h-screen bg-muted/20 p-6 flex items-center justify-center">
        <Card className="max-w-md w-full">
          <CardContent className="p-8 text-center">
            <FileText className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <h2 className="text-lg font-semibold mb-1">Invoice not found</h2>
            <p className="text-sm text-muted-foreground">{error ?? "This signing link is invalid or has expired."}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isSigned = !!invoice.signedAt;

  return (
    <div className="min-h-screen bg-muted/20">
      <header className="bg-white border-b">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold">{invoice.companyName ?? "Site Snap"}</h1>
            <p className="text-xs text-muted-foreground">Invoice {invoice.invoiceNumber}</p>
          </div>
          {isSigned && <SignatureBadge meta={invoice} />}
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-6 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-2">
              <span>{invoice.title}</span>
              <span className="text-2xl font-bold text-primary">{fmtCAD(invoice.total)}</span>
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Billed to {invoice.clientName} · Issued {format(new Date(invoice.createdAt), "MMMM d, yyyy")}
              {invoice.dueDate ? ` · Due ${format(new Date(invoice.dueDate), "MMM d, yyyy")}` : ""}
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
                  {(invoice.lineItems ?? []).map((it, idx) => (
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
              <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{fmtCAD(invoice.subtotal)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">HST ({(parseFloat(invoice.taxRate) * 100).toFixed(0)}%)</span><span>{fmtCAD(invoice.taxAmount)}</span></div>
              <Separator />
              <div className="flex justify-between text-base font-bold"><span>Total</span><span className="text-primary">{fmtCAD(invoice.total)}</span></div>
            </div>

            {invoice.notes && (
              <div className="rounded-md bg-muted/40 p-3 text-sm">
                <p className="text-xs uppercase font-semibold text-muted-foreground mb-1">Notes</p>
                <p className="whitespace-pre-wrap">{invoice.notes}</p>
              </div>
            )}
            {invoice.terms && (
              <div className="rounded-md bg-muted/40 p-3 text-sm">
                <p className="text-xs uppercase font-semibold text-muted-foreground mb-1">Terms & Conditions</p>
                <p className="whitespace-pre-wrap">{invoice.terms}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {isSigned ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-green-700">
                <CheckCircle2 className="h-5 w-5" /> Acknowledged
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-lg border bg-white p-3 inline-block">
                {invoice.signatureData && (
                  <img src={invoice.signatureData} alt="signature" className="max-h-24" />
                )}
              </div>
              <div className="text-xs text-muted-foreground space-y-0.5">
                {invoice.signerName && <div>Signed by <strong>{invoice.signerName}</strong></div>}
                <div>UTC: <span className="font-mono">{new Date(invoice.signedAt!).toUTCString()}</span></div>
                {invoice.signerIp && <div>IP: <span className="font-mono">{invoice.signerIp}</span></div>}
              </div>
            </CardContent>
          </Card>
        ) : invoice.status === "paid" ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-green-700">
                <CreditCard className="h-5 w-5" /> Invoice Paid
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                This invoice has already been marked as paid. No signature is required.
              </p>
            </CardContent>
          </Card>
        ) : invoice.status === "cancelled" ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-muted-foreground">
                <Ban className="h-5 w-5" /> Invoice Cancelled
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                This invoice has been cancelled and is no longer available for signing.
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-primary" /> Sign to Acknowledge Receipt
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
              <Button onClick={submitSignature} disabled={submitting || refreshing} className="w-full">
                {submitting || refreshing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ShieldCheck className="h-4 w-4 mr-2" />}
                Acknowledge & Sign
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
