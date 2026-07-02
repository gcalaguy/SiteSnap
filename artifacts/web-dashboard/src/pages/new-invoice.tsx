import { useState } from "react";
import { useLocation } from "wouter";
import { useCreateInvoice, useListChangeOrders } from "@workspace/api-client-react";
import { createInvoiceBodyNotesMax } from "@workspace/api-zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Plus, Trash2, Loader2, ClipboardList, CheckCircle2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { getListAllInvoicesQueryKey } from "@workspace/api-client-react";
import { useDraftRecovery } from "@/hooks/useDraftRecovery";
import { DraftBanner } from "@/components/DraftBanner";
import { formatCurrency as fmtCAD } from "@/lib/format";

const GOLD = "#C9A84C";
const BLACK = "#111111";

interface LineItem {
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  total: number;
}

const TAX_RATE = 0.13;

function calcTotals(items: LineItem[]) {
  const subtotal = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  const taxAmount = Math.round(subtotal * TAX_RATE * 100) / 100;
  const total = Math.round((subtotal + taxAmount) * 100) / 100;
  return { subtotal, taxAmount, total };
}

export default function NewInvoice() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createInvoice = useCreateInvoice();

  const [title, setTitle] = useState("");
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [lineItems, setLineItems] = useState<LineItem[]>([
    { description: "", quantity: 1, unit: "ea", unitPrice: 0, total: 0 },
  ]);

  const [selectedCOIds, setSelectedCOIds] = useState<Set<number>>(new Set());

  const draft = useDraftRecovery(
    "new-invoice",
    () => ({
      title,
      clientName,
      clientEmail,
      notes,
      dueDate,
      lineItems,
      selectedCOIds: Array.from(selectedCOIds),
    }),
    (state) => {
      setTitle((state.title as string) || "");
      setClientName((state.clientName as string) || "");
      setClientEmail((state.clientEmail as string) || "");
      setNotes((state.notes as string) || "");
      setDueDate((state.dueDate as string) || "");
      if (Array.isArray(state.lineItems)) setLineItems(state.lineItems as LineItem[]);
      if (Array.isArray(state.selectedCOIds)) setSelectedCOIds(new Set(state.selectedCOIds as number[]));
    }
  );

  const { data: changeOrders = [] } = useListChangeOrders();
  const approvedCOs = changeOrders.filter((co) => co.status === "approved");

  function toggleCO(id: number) {
    setSelectedCOIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function importSelectedCOs() {
    const toImport = approvedCOs.filter((co) => selectedCOIds.has(co.id));
    if (toImport.length === 0) return;
    const newItems: LineItem[] = toImport.map((co) => ({
      description: co.title + (co.description ? ` — ${co.description}` : ""),
      quantity: 1,
      unit: "ea",
      unitPrice: Number(co.amount),
      total: Number(co.amount),
    }));
    setLineItems((prev) => [...prev, ...newItems]);
    setSelectedCOIds(new Set());
    toast({ title: `${toImport.length} change order(s) added to invoice` });
  }


  const { subtotal, taxAmount, total } = calcTotals(lineItems);

  function updateItem(idx: number, field: keyof LineItem, value: string | number) {
    const items = [...lineItems];
    (items[idx] as unknown as Record<string, unknown>)[field] = value;
    items[idx].total = Math.round(items[idx].quantity * items[idx].unitPrice * 100) / 100;
    setLineItems(items);
  }

  function addItem() {
    setLineItems([...lineItems, { description: "", quantity: 1, unit: "ea", unitPrice: 0, total: 0 }]);
  }

  function removeItem(idx: number) {
    setLineItems(lineItems.filter((_, i) => i !== idx));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !clientName.trim()) {
      toast({ title: "Title and client name are required", variant: "destructive" });
      return;
    }
    try {
      const invoice = await createInvoice.mutateAsync({
        data: {
          title: title.trim(),
          clientName: clientName.trim(),
          clientEmail: clientEmail.trim() || undefined,
          lineItems,
          notes: notes.trim() || undefined,
          dueDate: dueDate || undefined,
        },
      });
      queryClient.invalidateQueries({ queryKey: getListAllInvoicesQueryKey({}) });
      toast({ title: "Invoice created", description: `${invoice.invoiceNumber} saved as draft` });
      draft.clearDraft();
      setLocation(`/invoices/${invoice.id}`);
    } catch {
      toast({ title: "Failed to create invoice", variant: "destructive" });
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/invoices")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">New Invoice</h1>
          <p className="text-sm text-muted-foreground">Create a standalone invoice</p>
        </div>
      </div>

      <DraftBanner show={draft.showBanner} onRestore={draft.restoreDraft} onDiscard={draft.discardDraft} />

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Client info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Invoice Details</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2 space-y-1.5">
              <Label htmlFor="title">Invoice Title *</Label>
              <Input
                id="title"
                placeholder="e.g. Kitchen Renovation – Phase 1"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="clientName">Client Name *</Label>
              <Input
                id="clientName"
                placeholder="John Smith"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="clientEmail">Client Email</Label>
              <Input
                id="clientEmail"
                type="email"
                placeholder="client@example.com"
                value={clientEmail}
                onChange={(e) => setClientEmail(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dueDate">Due Date</Label>
              <Input
                id="dueDate"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
            <div className="sm:col-span-2 space-y-1.5">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                placeholder="Payment terms, additional info…"
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value.slice(0, createInvoiceBodyNotesMax))}
                maxLength={createInvoiceBodyNotesMax}
              />
              <p className={`text-xs text-right tabular-nums ${notes.length >= createInvoiceBodyNotesMax ? "text-destructive font-medium" : notes.length >= createInvoiceBodyNotesMax * 0.8 ? "text-amber-500" : "text-muted-foreground"}`}>
                {notes.length.toLocaleString()}/{createInvoiceBodyNotesMax.toLocaleString()}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Line items */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Line Items</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {lineItems.map((item, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2 items-start">
                <div className="col-span-12 sm:col-span-5">
                  <Input
                    placeholder="Description"
                    value={item.description}
                    onChange={(e) => updateItem(idx, "description", e.target.value)}
                  />
                </div>
                <div className="col-span-3 sm:col-span-1">
                  <Input
                    type="number"
                    min={0}
                    step="any"
                    placeholder="Qty"
                    value={item.quantity}
                    onChange={(e) => updateItem(idx, "quantity", parseFloat(e.target.value) || 0)}
                  />
                </div>
                <div className="col-span-3 sm:col-span-2">
                  <Input
                    placeholder="Unit"
                    value={item.unit}
                    onChange={(e) => updateItem(idx, "unit", e.target.value)}
                  />
                </div>
                <div className="col-span-4 sm:col-span-2">
                  <Input
                    type="number"
                    min={0}
                    step="any"
                    placeholder="Unit $"
                    value={item.unitPrice}
                    onChange={(e) => updateItem(idx, "unitPrice", parseFloat(e.target.value) || 0)}
                  />
                </div>
                <div className="col-span-3 sm:col-span-1 pt-2 text-right text-sm font-medium text-muted-foreground">
                  {fmtCAD(item.total)}
                </div>
                <div className="col-span-1 flex justify-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 text-destructive hover:text-destructive"
                    onClick={() => removeItem(idx)}
                    disabled={lineItems.length === 1}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}

            {/* Import from Approved Change Orders */}
            {approvedCOs.length > 0 && (
              <div className="rounded-lg border border-dashed border-[#D4AF37]/40 bg-[#FFFBEB]/50 p-4 mt-2">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <ClipboardList className="h-4 w-4" style={{ color: GOLD }} />
                    <p className="text-sm font-semibold" style={{ color: GOLD }}>Approved Change Orders</p>
                  </div>
                  {selectedCOIds.size > 0 && (
                    <Button type="button" size="sm" className="h-7 text-xs" style={{ background: GOLD, color: BLACK }} onClick={importSelectedCOs}>
                      <CheckCircle2 className="h-3 w-3 mr-1" /> Add {selectedCOIds.size} to invoice
                    </Button>
                  )}
                </div>
                <div className="space-y-1.5">
                  {approvedCOs.map((co) => {
                    const selected = selectedCOIds.has(co.id);
                    return (
                      <label key={co.id} className={`flex items-center gap-2 p-2 rounded-md cursor-pointer transition-colors ${selected ? "bg-[#D4AF37]/10" : "hover:bg-muted/50"}`}>
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => toggleCO(co.id)}
                          className="h-4 w-4 accent-[#D4AF37]"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{co.title}</p>
                          {co.description && <p className="text-xs text-muted-foreground truncate">{co.description}</p>}
                        </div>
                        <span className="text-sm font-semibold" style={{ color: GOLD }}>{fmtCAD(Number(co.amount))}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            <Button type="button" variant="outline" size="sm" onClick={addItem} className="gap-2 mt-2">
              <Plus className="h-4 w-4" />
              Add Line Item
            </Button>

            {/* Totals */}
            <div className="mt-4 rounded-xl p-4 space-y-2" style={{ background: BLACK }}>
              <div className="flex justify-between text-sm" style={{ color: "#a1a1aa" }}>
                <span>Subtotal</span>
                <span className="text-white">{fmtCAD(subtotal)}</span>
              </div>
              <div className="flex justify-between text-sm" style={{ color: "#a1a1aa" }}>
                <span>HST (13%)</span>
                <span className="text-white">{fmtCAD(taxAmount)}</span>
              </div>
              <div className="flex justify-between font-bold text-lg border-t border-white/10 pt-2 mt-2">
                <span style={{ color: GOLD }}>Total</span>
                <span className="text-white">{fmtCAD(total)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={() => setLocation("/invoices")}>
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={createInvoice.isPending}
            style={{ background: GOLD, color: BLACK }}
          >
            {createInvoice.isPending ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Creating…</>
            ) : (
              "Create Invoice"
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
