import { useParams, useLocation } from "wouter";
import { useGetInvoice, useMarkInvoiceSent, useMarkInvoicePaid } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, SendHorizonal, CheckCircle2, Receipt } from "lucide-react";
import { format } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { getGetInvoiceQueryKey, getListAllInvoicesQueryKey } from "@workspace/api-client-react";

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  sent: "Sent",
  paid: "Paid",
  overdue: "Overdue",
  cancelled: "Cancelled",
};
const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700 border-gray-200",
  sent: "bg-blue-50 text-blue-700 border-blue-200",
  paid: "bg-green-50 text-green-700 border-green-200",
  overdue: "bg-red-50 text-red-700 border-red-200",
  cancelled: "bg-gray-100 text-gray-400 border-gray-200",
};

export default function InvoiceDetail() {
  const { id } = useParams<{ id: string }>();
  const invoiceId = parseInt(id);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: invoice, isLoading } = useGetInvoice(invoiceId);
  const markSent = useMarkInvoiceSent();
  const markPaid = useMarkInvoicePaid();

  const fmtCAD = (v: string | number) =>
    new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(Number(v));

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: getGetInvoiceQueryKey(invoiceId) });
    queryClient.invalidateQueries({ queryKey: getListAllInvoicesQueryKey({}) });
  }

  function handleMarkSent() {
    markSent.mutate({ invoiceId }, {
      onSuccess: () => { toast({ title: "Invoice marked as sent" }); invalidate(); },
      onError: () => toast({ title: "Failed to update invoice", variant: "destructive" }),
    });
  }

  function handleMarkPaid() {
    markPaid.mutate({ invoiceId }, {
      onSuccess: () => { toast({ title: "Invoice marked as paid!" }); invalidate(); },
      onError: () => toast({ title: "Failed to update invoice", variant: "destructive" }),
    });
  }

  if (isLoading) {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="p-6 max-w-4xl mx-auto text-center py-20">
        <Receipt className="h-12 w-12 text-muted-foreground/40 mx-auto mb-4" />
        <p className="text-lg font-medium">Invoice not found</p>
        <Button variant="ghost" className="mt-4" onClick={() => setLocation("/invoices")}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Invoices
        </Button>
      </div>
    );
  }

  const lineItems = (invoice.lineItems ?? []) as {
    description: string; quantity: number; unit: string; unitPrice: number; total: number;
  }[];

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <button
            onClick={() => setLocation("/invoices")}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-3 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" /> Invoices
          </button>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-foreground">{invoice.title}</h1>
            <Badge variant="outline" className={STATUS_COLORS[invoice.status]}>
              {STATUS_LABELS[invoice.status]}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {invoice.invoiceNumber} · {invoice.clientName}
            {invoice.clientEmail && ` · ${invoice.clientEmail}`}
          </p>
        </div>

        <div className="flex gap-2 flex-wrap">
          {invoice.status === "draft" && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" disabled={markSent.isPending}>
                  <SendHorizonal className="h-4 w-4 mr-2" />
                  Mark Sent
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Mark invoice as sent?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This confirms you have sent {invoice.invoiceNumber} to {invoice.clientName}. You can still mark it as paid afterward.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleMarkSent}>Mark Sent</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          {(invoice.status === "sent" || invoice.status === "overdue") && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button className="bg-green-600 hover:bg-green-700 text-white" disabled={markPaid.isPending}>
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Mark Paid
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Mark invoice as paid?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This confirms payment of {fmtCAD(invoice.total)} CAD has been received from {invoice.clientName}.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-green-600 hover:bg-green-700"
                    onClick={handleMarkPaid}
                  >
                    Confirm Payment
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          {invoice.status === "paid" && (
            <div className="flex items-center gap-2 text-green-600 font-semibold text-sm">
              <CheckCircle2 className="h-5 w-5" />
              Paid {invoice.paidAt ? format(new Date(invoice.paidAt), "MMM d, yyyy") : ""}
            </div>
          )}
        </div>
      </div>

      {/* Invoice card */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex justify-between items-start flex-wrap gap-4">
            <div>
              <CardTitle className="text-lg">Invoice Details</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Issued {format(new Date(invoice.createdAt), "MMMM d, yyyy")}
              </p>
              {invoice.dueDate && (
                <p className="text-sm text-muted-foreground">
                  Due {format(new Date(invoice.dueDate), "MMMM d, yyyy")}
                </p>
              )}
            </div>
            <div className="text-right">
              {invoice.sentAt && (
                <p className="text-xs text-muted-foreground">
                  Sent {format(new Date(invoice.sentAt), "MMM d, yyyy")}
                </p>
              )}
              {invoice.paidAt && (
                <p className="text-xs text-green-600 font-medium">
                  Paid {format(new Date(invoice.paidAt), "MMM d, yyyy")}
                </p>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Separator className="mb-4" />

          {/* Line items table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wide text-muted-foreground border-b">
                  <th className="text-left pb-3 font-medium">Description</th>
                  <th className="text-right pb-3 font-medium">Qty</th>
                  <th className="text-right pb-3 font-medium">Unit</th>
                  <th className="text-right pb-3 font-medium">Unit Price</th>
                  <th className="text-right pb-3 font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {lineItems.map((item, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="py-3 pr-4">{item.description}</td>
                    <td className="py-3 text-right">{item.quantity}</td>
                    <td className="py-3 text-right text-muted-foreground">{item.unit}</td>
                    <td className="py-3 text-right">{fmtCAD(item.unitPrice)}</td>
                    <td className="py-3 text-right font-medium">{fmtCAD(item.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Separator className="my-4" />

          {/* Totals */}
          <div className="flex flex-col items-end gap-1.5 text-sm">
            <div className="flex w-52 justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span>{fmtCAD(invoice.subtotal)}</span>
            </div>
            <div className="flex w-52 justify-between">
              <span className="text-muted-foreground">HST ({(parseFloat(invoice.taxRate) * 100).toFixed(0)}%)</span>
              <span>{fmtCAD(invoice.taxAmount)}</span>
            </div>
            <Separator className="w-52 my-1" />
            <div className="flex w-52 justify-between font-bold text-base">
              <span>Total</span>
              <span>{fmtCAD(invoice.total)}</span>
            </div>
          </div>

          {invoice.notes && (
            <>
              <Separator className="my-4" />
              <div>
                <p className="text-xs uppercase tracking-wide font-medium text-muted-foreground mb-1">Notes</p>
                <p className="text-sm text-foreground whitespace-pre-wrap">{invoice.notes}</p>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
