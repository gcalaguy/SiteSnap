import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch, useListProjects } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Receipt, Plus, Trash2, Paperclip, User, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { formatCurrency } from "@/lib/format";
import { useSignedDownload } from "@/hooks/useSignedUrl";

interface Expense {
  id: number;
  projectId: number;
  amount: string;
  description: string;
  receiptObjectPath: string | null;
  status: string;
  createdAt: string;
  submittedByName: string;
}

async function requestUploadUrl(name: string, size: number, contentType: string) {
  return customFetch("/api/storage/uploads/request-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, size, contentType }),
  }) as Promise<{ uploadURL: string; objectPath: string }>;
}

async function uploadToStorage(uploadURL: string, file: File) {
  const res = await fetch(uploadURL, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
  if (!res.ok) throw new Error("Receipt upload failed");
}

export default function ExpensesPage() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: projects = [] } = useListProjects();
  const [projectId, setProjectId] = useState<number | undefined>(undefined);
  const activeProjectId = projectId ?? projects[0]?.id;

  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const { data: expenses = [], isLoading } = useQuery<Expense[]>({
    queryKey: ["expenses", activeProjectId],
    queryFn: () => customFetch(`/api/projects/${activeProjectId}/expenses`),
    enabled: !!activeProjectId,
  });

  const createExpense = useMutation({
    mutationFn: async () => {
      let receiptObjectPath: string | undefined;
      if (receiptFile) {
        setUploading(true);
        const { uploadURL, objectPath } = await requestUploadUrl(receiptFile.name, receiptFile.size, receiptFile.type);
        await uploadToStorage(uploadURL, receiptFile);
        receiptObjectPath = objectPath;
      }
      return customFetch(`/api/projects/${activeProjectId}/expenses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: parseFloat(amount), description, receiptObjectPath }),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["expenses", activeProjectId] });
      toast({ title: "Expense submitted" });
      setOpen(false);
      setAmount("");
      setDescription("");
      setReceiptFile(null);
      setUploading(false);
    },
    onError: (e: any) => {
      setUploading(false);
      toast({ title: "Failed to submit expense", description: e?.message, variant: "destructive" });
    },
  });

  const deleteExpense = useMutation({
    mutationFn: (id: number) => customFetch(`/api/projects/${activeProjectId}/expenses/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["expenses", activeProjectId] });
      toast({ title: "Expense deleted" });
    },
    onError: (e: any) => toast({ title: "Failed to delete expense", description: e?.message, variant: "destructive" }),
  });

  const total = expenses.reduce((s, e) => s + parseFloat(e.amount), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-[#121212] flex items-center gap-2">
            <Receipt className="h-6 w-6" style={{ color: "#D4AF37" }} />
            Expenses
          </h1>
          <p className="text-sm text-[#121212]/60 font-medium">Submit and track project expenses with receipts.</p>
        </div>
        <Button
          className="bg-[#D4AF37] text-white hover:bg-[#b5922e]"
          onClick={() => setOpen(true)}
          disabled={!activeProjectId}
        >
          <Plus className="h-4 w-4 mr-2" />
          Submit Expense
        </Button>
      </div>

      <div className="flex items-center gap-3">
        <Label className="text-xs text-[#121212]/60 font-medium">Project</Label>
        <Select value={activeProjectId !== undefined ? String(activeProjectId) : undefined} onValueChange={(v) => setProjectId(Number(v))}>
          <SelectTrigger className="w-[220px] border-[#D4AF37]/20 focus:ring-[#D4AF37]">
            <SelectValue placeholder="Select a project" />
          </SelectTrigger>
          <SelectContent>
            {projects.map((p) => (
              <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="py-16 text-center text-[#121212]/60 animate-pulse font-medium">Loading expenses…</div>
      ) : !activeProjectId ? (
        <Card className="border-[#D4AF37]/20">
          <CardContent className="py-16 flex flex-col items-center gap-3 text-center">
            <Receipt className="h-10 w-10 text-[#D4AF37]/40" />
            <p className="text-[#121212]/60 font-medium">No assigned projects to submit expenses for.</p>
          </CardContent>
        </Card>
      ) : expenses.length === 0 ? (
        <Card className="border-[#D4AF37]/20">
          <CardContent className="py-16 flex flex-col items-center gap-3 text-center">
            <Receipt className="h-10 w-10 text-[#D4AF37]/40" />
            <p className="text-[#121212]/60 font-medium">No expenses submitted for this project yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          <p className="text-sm font-bold text-[#121212]">Total: {formatCurrency(total)}</p>
          {expenses.map((expense) => (
            <Card key={expense.id} className="border-[#D4AF37]/20">
              <CardContent className="py-4 px-5 flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1">
                    <p className="font-extrabold text-sm text-[#121212]">
                      {formatCurrency(parseFloat(expense.amount))}
                    </p>
                    <span className="flex items-center gap-1 text-xs text-[#121212]/60 font-medium">
                      <User className="h-3.5 w-3.5" style={{ color: "#D4AF37" }} />
                      {expense.submittedByName}
                    </span>
                    {expense.receiptObjectPath && (
                      <ReceiptLink objectPath={expense.receiptObjectPath} />
                    )}
                  </div>
                  <p className="text-sm text-[#121212]/80">{expense.description}</p>
                  <p className="text-xs text-[#121212]/60 mt-1 font-medium">
                    Submitted {format(new Date(expense.createdAt), "MMM d 'at' h:mm a")}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                  onClick={() => deleteExpense.mutate(expense.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Submit Expense</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-xs text-[#121212]/60 font-medium">Amount</Label>
              <Input type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
            </div>
            <div>
              <Label className="text-xs text-[#121212]/60 font-medium">Description</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="What was this expense for?" />
            </div>
            <div>
              <Label className="text-xs text-[#121212]/60 font-medium">Receipt (optional)</Label>
              <Input type="file" accept="image/*,application/pdf" onChange={(e) => setReceiptFile(e.target.files?.[0] ?? null)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              className="bg-[#D4AF37] text-white hover:bg-[#b5922e]"
              onClick={() => createExpense.mutate()}
              disabled={createExpense.isPending || uploading || !amount || !description.trim()}
            >
              {uploading ? "Uploading receipt…" : createExpense.isPending ? "Submitting…" : "Submit Expense"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ReceiptLink({ objectPath }: { objectPath: string }) {
  const { open, isFetching } = useSignedDownload(objectPath);
  return (
    <button
      type="button"
      onClick={open}
      disabled={isFetching}
      className="flex items-center gap-1 text-xs text-[#D4AF37] font-medium hover:underline disabled:opacity-50"
    >
      {isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5" />}
      View receipt
    </button>
  );
}
