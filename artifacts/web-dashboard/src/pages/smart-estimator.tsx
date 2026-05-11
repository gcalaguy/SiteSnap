import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useApiError } from "@/hooks/useApiError";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Sparkles,
  Calculator,
  FileText,
  ChevronRight,
  Loader2,
  RotateCcw,
  Save,
  TrendingUp,
  TrendingDown,
  Minus,
  Check,
  Database,
  Edit3,
  AlertCircle,
  BookOpen,
  History,
  ChevronDown,
  ChevronUp,
  DollarSign,
  Upload,
  X,
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

const GOLD = "#C9A84C";
const BLACK = "#111111";

// ── Types ─────────────────────────────────────────────────────────────────────

type ParsedParams = {
  project_type: string;
  square_feet: number;
  finish_level: string;
  addons: string[];
  confidence: number;
  notes: string;
};

type LineItem = {
  id: string;
  description: string;
  category: "labour" | "materials" | "addon" | "overhead";
  quantity: number;
  unit: string;
  unitCost: number;
  total: number;
  editable: boolean;
};

type EstimateSummary = {
  laborTotal: number;
  materialsTotal: number;
  addonsTotal: number;
  overhead: number;
  overheadPct: number;
  subtotal: number;
  contingency: number;
  contingencyPct: number;
  totalLow: number;
  totalHigh: number;
  suggestedMarginPct: number;
  suggestedMarginAmount: number;
  priceToClient: number;
};

type EstimateResult = {
  lineItems: LineItem[];
  summary: EstimateSummary;
  costModelUsed: { id: number; name: string; projectType: string; finishLevel: string; notes: string | null };
  params: { projectType: string; squareFeet: number; finishLevel: string; addons: string[] };
};

type SavedEstimate = {
  id: number;
  title: string;
  scopeText: string | null;
  status: string;
  result: Record<string, unknown> | null;
  createdAt: string;
};

type AddonModel = { id: number; addonKey: string; name: string; description: string | null; costType: string; amount: string; applicableTypes: string | null };
type CostModel = { id: number; projectType: string; finishLevel: string; name: string; baseCostPerSqft: string; laborCostPerSqft: string; materialCostPerSqft: string; overheadPct: string; contingencyPct: string; notes: string | null };

// ── Constants ─────────────────────────────────────────────────────────────────

const PROJECT_TYPE_LABELS: Record<string, string> = {
  residential_new_build: "Residential New Build",
  commercial_new_build: "Commercial New Build",
  renovation_residential: "Residential Renovation",
  renovation_commercial: "Commercial Renovation",
  addition: "Home Addition",
  garage: "Garage",
  deck_patio: "Deck / Patio",
  basement_finish: "Basement Finish",
  roofing: "Roofing",
  concrete_flatwork: "Concrete Flatwork",
  framing_only: "Framing Only",
  landscaping: "Landscaping",
};

const FINISH_LEVEL_LABELS: Record<string, { label: string; desc: string; color: string }> = {
  basic:    { label: "Basic",    desc: "Builder-grade / functional",          color: "bg-gray-100 text-gray-700 border-gray-200" },
  standard: { label: "Standard", desc: "Mid-range / good quality",            color: "bg-blue-50 text-blue-700 border-blue-200" },
  premium:  { label: "Premium",  desc: "High-end finishes & fixtures",        color: "bg-purple-50 text-purple-700 border-purple-200" },
  luxury:   { label: "Luxury",   desc: "Bespoke / custom everything",         color: "bg-amber-50 text-amber-700 border-amber-200" },
};

const CATEGORY_COLORS: Record<string, string> = {
  labour:    "text-blue-600",
  materials: "text-green-600",
  addon:     "text-purple-600",
  overhead:  "text-amber-600",
};

function fmt(n: number | undefined | null) {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(n);
}

// ── Step Indicator ─────────────────────────────────────────────────────────────

function StepBadge({ step, current }: { step: number; current: number }) {
  const done = current > step;
  const active = current === step;
  return (
    <div className={cn(
      "h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all",
      done  && "bg-primary border-primary text-primary-foreground",
      active && "bg-primary/10 border-primary text-primary",
      !done && !active && "bg-muted border-border text-muted-foreground",
    )}>
      {done ? <Check className="h-3.5 w-3.5" /> : step}
    </div>
  );
}

// ── Addon Selector ────────────────────────────────────────────────────────────

function AddonSelector({
  addons,
  selected,
  onChange,
}: {
  addons: AddonModel[];
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  const toggle = (key: string) =>
    onChange(selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key]);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {addons.map((a) => {
        const on = selected.includes(a.addonKey);
        return (
          <button
            key={a.addonKey}
            onClick={() => toggle(a.addonKey)}
            className={cn(
              "flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-all",
              on
                ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                : "border-border hover:border-muted-foreground/30 hover:bg-muted/30",
            )}
          >
            <div className={cn(
              "mt-0.5 h-4 w-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all",
              on ? "bg-primary border-primary" : "border-muted-foreground/40",
            )}>
              {on && <Check className="h-2.5 w-2.5 text-primary-foreground" />}
            </div>
            <div>
              <div className="text-xs font-medium leading-tight">{a.name}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">
                {a.costType === "per_sqft" ? `$${a.amount}/sqft` : fmt(parseFloat(a.amount))} flat
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ── Editable Line Items Table ─────────────────────────────────────────────────

function LineItemsTable({
  items,
  onChange,
}: {
  items: LineItem[];
  onChange: (items: LineItem[]) => void;
}) {
  const updateItem = (id: string, field: keyof LineItem, value: number) => {
    onChange(
      items.map((item) => {
        if (item.id !== id) return item;
        const updated = { ...item, [field]: value };
        if (field === "quantity" || field === "unitCost") {
          updated.total = Math.round(updated.quantity * updated.unitCost);
        } else if (field === "total") {
          updated.total = value;
        }
        return updated;
      }),
    );
  };

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 border-b border-border">
          <tr>
            <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">Description</th>
            <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground w-20">Qty</th>
            <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground w-16">Unit</th>
            <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground w-28">Unit Cost</th>
            <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground w-28">Total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/40">
          {items.map((item) => (
            <tr key={item.id} className="hover:bg-muted/20 group">
              <td className="px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className={cn("text-[10px] font-bold uppercase tracking-wider", CATEGORY_COLORS[item.category])}>
                    {item.category}
                  </span>
                  <span className="text-sm font-medium">{item.description}</span>
                </div>
              </td>
              <td className="px-3 py-2 text-right">
                {item.editable ? (
                  <input
                    type="number"
                    value={item.quantity}
                    onChange={(e) => updateItem(item.id, "quantity", parseFloat(e.target.value) || 0)}
                    className="w-20 text-right bg-transparent border-0 border-b border-transparent group-hover:border-border focus:border-primary outline-none text-sm py-0.5 transition-colors"
                  />
                ) : (
                  <span className="text-muted-foreground">{item.quantity.toLocaleString()}</span>
                )}
              </td>
              <td className="px-3 py-2 text-right text-xs text-muted-foreground">{item.unit}</td>
              <td className="px-3 py-2 text-right">
                {item.editable ? (
                  <input
                    type="number"
                    value={item.unitCost}
                    onChange={(e) => updateItem(item.id, "unitCost", parseFloat(e.target.value) || 0)}
                    className="w-24 text-right bg-transparent border-0 border-b border-transparent group-hover:border-border focus:border-primary outline-none text-sm py-0.5 transition-colors"
                  />
                ) : (
                  <span className="text-muted-foreground">{fmt(item.unitCost)}</span>
                )}
              </td>
              <td className="px-3 py-2 text-right">
                {item.editable ? (
                  <input
                    type="number"
                    value={item.total}
                    onChange={(e) => updateItem(item.id, "total", parseFloat(e.target.value) || 0)}
                    className="w-24 text-right bg-transparent border-0 border-b border-transparent group-hover:border-border focus:border-primary outline-none font-semibold text-sm py-0.5 transition-colors"
                  />
                ) : (
                  <span className="font-semibold">{fmt(item.total)}</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot className="bg-muted/30 border-t border-border">
          <tr>
            <td colSpan={4} className="px-3 py-2 text-xs font-semibold text-muted-foreground text-right">
              Line Items Total
            </td>
            <td className="px-3 py-2 text-right font-bold">
              {fmt(items.reduce((s, i) => s + i.total, 0))}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// ── Cost Breakdown Panel ───────────────────────────────────────────────────────

function BreakdownPanel({
  summary,
  lineItems,
  marginPct,
  onMarginChange,
}: {
  summary: EstimateSummary;
  lineItems: LineItem[];
  marginPct: number;
  onMarginChange: (v: number) => void;
}) {
  const liveSubtotal = lineItems.reduce((s, i) => s + i.total, 0);
  const liveContingency = Math.round(liveSubtotal * (summary.contingencyPct / 100));
  const liveMargin = Math.round((liveSubtotal + liveContingency) * (marginPct / 100));
  const priceToClient = liveSubtotal + liveContingency + liveMargin;

  return (
    <div className="space-y-4">
      {/* Cost cards */}
      <div className="grid grid-cols-2 gap-2">
        {[
          { label: "Labour",     value: lineItems.filter(i => i.category === "labour").reduce((s,i) => s+i.total,0),    color: "text-blue-600" },
          { label: "Materials",  value: lineItems.filter(i => i.category === "materials").reduce((s,i) => s+i.total,0), color: "text-green-600" },
          { label: "Add-ons",    value: lineItems.filter(i => i.category === "addon").reduce((s,i) => s+i.total,0),     color: "text-purple-600" },
          { label: "Overhead",   value: lineItems.filter(i => i.category === "overhead").reduce((s,i) => s+i.total,0),  color: "text-amber-600" },
        ].map(({ label, value, color }) => (
          <div key={label} className="rounded-lg bg-muted/30 border border-border p-3">
            <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
            <p className={cn("text-base font-bold", color)}>{fmt(value)}</p>
          </div>
        ))}
      </div>

      <Separator />

      {/* Contingency */}
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Subtotal</span>
        <span className="font-semibold">{fmt(liveSubtotal)}</span>
      </div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Contingency ({summary.contingencyPct}%)</span>
        <span className="font-semibold text-amber-600">+{fmt(liveContingency)}</span>
      </div>

      <Separator />

      {/* Margin slider */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <label className="font-medium">Profit Margin</label>
          <Badge variant="outline" className="text-xs font-bold">{marginPct}%</Badge>
        </div>
        <Slider
          min={0}
          max={50}
          step={1}
          value={[marginPct]}
          onValueChange={([v]) => onMarginChange(v!)}
          className="w-full"
        />
        <div className="flex justify-between text-[10px] text-muted-foreground">
          <span>0% (cost recovery)</span>
          <span>50% (high margin)</span>
        </div>
      </div>

      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Margin ({marginPct}%)</span>
        <span className="font-semibold text-primary">+{fmt(liveMargin)}</span>
      </div>

      {/* Total */}
      <div className="rounded-xl bg-[#0A0A0A] text-white p-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-white/50 mb-0.5">Price to Client (CAD)</p>
          <p className="text-2xl font-black text-[#C9A84C]">{fmt(priceToClient)}</p>
          <p className="text-[10px] text-white/40 mt-0.5">excl. HST/GST</p>
        </div>
        <div className="text-right text-xs text-white/50 space-y-0.5">
          <p>Cost: {fmt(liveSubtotal)}</p>
          <p>+Cont: {fmt(liveContingency)}</p>
          <p>+Margin: {fmt(liveMargin)}</p>
        </div>
      </div>

      <p className="text-[10px] text-muted-foreground flex items-center gap-1">
        <Database className="h-3 w-3 inline" />
        All pricing sourced from database models — not AI-generated
      </p>
    </div>
  );
}

// ── Learning History Card ─────────────────────────────────────────────────────

function ActualCard({ actual }: { actual: { estimatedCost: string; actualCost: string; variancePct: string | null; notes: string | null; recordedAt: string } }) {
  const variance = parseFloat(actual.variancePct ?? "0");
  const overBudget = variance > 5;
  const underBudget = variance < -5;
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/20">
      <div className={cn("h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0",
        overBudget ? "bg-red-50" : underBudget ? "bg-green-50" : "bg-muted/40")}>
        {overBudget ? <TrendingUp className="h-4 w-4 text-red-500" /> :
         underBudget ? <TrendingDown className="h-4 w-4 text-green-600" /> :
         <Minus className="h-4 w-4 text-muted-foreground" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-medium">{fmt(parseFloat(actual.actualCost))}</span>
          <span className="text-muted-foreground text-xs">actual vs {fmt(parseFloat(actual.estimatedCost))} est.</span>
        </div>
        {actual.notes && <p className="text-xs text-muted-foreground truncate mt-0.5">{actual.notes}</p>}
        <p className="text-[10px] text-muted-foreground">{format(new Date(actual.recordedAt), "MMM d, yyyy")}</p>
      </div>
      <Badge
        variant="outline"
        className={cn("text-xs font-bold shrink-0",
          overBudget ? "text-red-600 border-red-200" :
          underBudget ? "text-green-600 border-green-200" :
          "text-muted-foreground")}
      >
        {variance > 0 ? "+" : ""}{variance.toFixed(1)}%
      </Badge>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function SmartEstimatorPage() {
  const { toast } = useToast();
  const handleError = useApiError();

  // Step: 1=input, 2=params, 3=results
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [inputMode, setInputMode] = useState<"text" | "file" | "form">("text");

  // Step 1 — Input
  const [freeText, setFreeText] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadHint, setUploadHint] = useState("");
  const [uploadDragActive, setUploadDragActive] = useState(false);
  const uploadFileInputRef = useRef<HTMLInputElement>(null);

  // Step 2 — Parsed / Editable Params
  const [params, setParams] = useState<ParsedParams>({
    project_type: "renovation_residential",
    square_feet: 1000,
    finish_level: "standard",
    addons: [],
    confidence: 100,
    notes: "",
  });

  // Step 3 — Results
  const [estimateResult, setEstimateResult] = useState<EstimateResult | null>(null);
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [marginPct, setMarginPct] = useState(15);

  // Dialogs
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveTitle, setSaveTitle] = useState("");
  const [showActualDialog, setShowActualDialog] = useState(false);
  const [actualCost, setActualCost] = useState("");
  const [actualNotes, setActualNotes] = useState("");
  const [savedEstimateId, setSavedEstimateId] = useState<number | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [showCostModels, setShowCostModels] = useState(false);

  // Send to Quotes
  const [showToQuoteDialog, setShowToQuoteDialog] = useState(false);
  const [quoteClientName, setQuoteClientName] = useState("");
  const [quoteClientEmail, setQuoteClientEmail] = useState("");
  const [quoteNotes, setQuoteNotes] = useState("");
  const [createdQuoteNumber, setCreatedQuoteNumber] = useState<string | null>(null);

  // Data
  const { data: modelsData } = useQuery<{ models: CostModel[]; addons: AddonModel[] }>({
    queryKey: ["estimator-cost-models"],
    queryFn: () => customFetch("/api/estimator/cost-models"),
  });

  const { data: savedEstimates = [] } = useQuery<SavedEstimate[]>({
    queryKey: ["smart-estimates"],
    queryFn: () => customFetch("/api/estimator/smart-estimates"),
  });

  const { data: actuals = [] } = useQuery<{ id: number; estimatedCost: string; actualCost: string; variancePct: string | null; notes: string | null; recordedAt: string }[]>({
    queryKey: ["estimator-actuals"],
    queryFn: () => customFetch("/api/estimator/actuals"),
  });

  // Mutations
  const parseMutation = useMutation({
    mutationFn: (prompt: string) =>
      customFetch<ParsedParams>("/api/estimator/parse", {
        method: "POST",
        body: JSON.stringify({ prompt }),
      }),
    onSuccess: (data) => {
      setParams(data);
      setStep(2);
    },
    onError: (err) => handleError(err, "Failed to parse project description"),
  });

  const parseFromFileMutation = useMutation({
    mutationFn: async ({ file, hint }: { file: File; hint?: string }) => {
      const formData = new FormData();
      formData.append("file", file);
      if (hint?.trim()) formData.append("hint", hint.trim());
      return customFetch<ParsedParams>("/api/estimator/parse-from-file", {
        method: "POST",
        body: formData,
      });
    },
    onSuccess: (data) => {
      setParams(data);
      setStep(2);
    },
    onError: (err) => handleError(err, "Failed to extract parameters from file"),
  });

  const calculateMutation = useMutation({
    mutationFn: (p: typeof params & { margin_pct: number }) =>
      customFetch<EstimateResult>("/api/estimator/calculate", {
        method: "POST",
        body: JSON.stringify({
          project_type: p.project_type,
          square_feet: p.square_feet,
          finish_level: p.finish_level,
          addons: p.addons,
          margin_pct: p.margin_pct,
        }),
      }),
    onSuccess: (data) => {
      setEstimateResult(data);
      setLineItems(data.lineItems);
      setMarginPct(data.summary.suggestedMarginPct);
      setStep(3);
    },
    onError: (err) => handleError(err, "Failed to calculate estimate"),
  });

  const saveMutation = useMutation({
    mutationFn: (body: { title: string; params: object; result: object; sourcePrompt?: string }) =>
      customFetch<{ id: number }>("/api/estimator/smart-estimates", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: (saved) => {
      setSavedEstimateId(saved.id);
      setShowSaveDialog(false);
      queryClient.invalidateQueries({ queryKey: ["smart-estimates"] });
      toast({ title: "Estimate saved", description: "You can now record the actual cost when the project is complete." });
    },
    onError: (err) => handleError(err, "Failed to save estimate"),
  });

  const toQuoteMutation = useMutation({
    mutationFn: (body: {
      title: string;
      clientName: string;
      clientEmail?: string;
      notes?: string;
      sourcePrompt?: string;
      lineItems: { description: string; quantity: number; unit: string; unitPrice: number; total: number }[];
    }) =>
      customFetch<{ id: number; quoteNumber: string }>("/api/estimator/to-quote", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: (data) => {
      setCreatedQuoteNumber(data.quoteNumber);
      setShowToQuoteDialog(false);
      queryClient.invalidateQueries({ queryKey: ["quotes"] });
      toast({
        title: "Quote created!",
        description: `${data.quoteNumber} has been added to your Quotes section as a draft.`,
      });
    },
    onError: (err) => handleError(err, "Failed to create quote"),
  });

  const recordActualMutation = useMutation({
    mutationFn: (body: { estimate_id: number; estimated_cost: number; actual_cost: number; notes?: string }) =>
      customFetch("/api/estimator/actuals", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      setShowActualDialog(false);
      setActualCost("");
      setActualNotes("");
      queryClient.invalidateQueries({ queryKey: ["estimator-actuals"] });
      toast({ title: "Actual cost recorded", description: "This will help improve future estimates." });
    },
    onError: (err) => handleError(err, "Failed to record actual cost"),
  });

  const handleParseAndNext = () => {
    if (inputMode === "text") {
      if (freeText.trim().length < 10) {
        toast({ title: "Please describe your project", description: "Enter at least 10 characters.", variant: "destructive" });
        return;
      }
      parseMutation.mutate(freeText.trim());
    } else if (inputMode === "file") {
      if (!uploadFile) {
        toast({ title: "Please select a file", description: "Upload a PDF, image, or document.", variant: "destructive" });
        return;
      }
      parseFromFileMutation.mutate({ file: uploadFile, hint: uploadHint });
    } else {
      setStep(2);
    }
  };

  const handleCalculate = () => {
    calculateMutation.mutate({ ...params, margin_pct: marginPct });
  };

  const handleSave = () => {
    if (!estimateResult) return;
    const liveSubtotal = lineItems.reduce((s, i) => s + i.total, 0);
    const liveContingency = Math.round(liveSubtotal * (estimateResult.summary.contingencyPct / 100));
    const liveMargin = Math.round((liveSubtotal + liveContingency) * (marginPct / 100));
    saveMutation.mutate({
      title: saveTitle || `${PROJECT_TYPE_LABELS[params.project_type] ?? params.project_type} — ${params.square_feet} sqft`,
      sourcePrompt: freeText || undefined,
      params: { ...params, margin_pct: marginPct },
      result: {
        lineItems,
        summary: {
          ...estimateResult.summary,
          priceToClient: liveSubtotal + liveContingency + liveMargin,
          suggestedMarginPct: marginPct,
          suggestedMarginAmount: liveMargin,
        },
        costModelUsed: estimateResult.costModelUsed,
      },
    });
  };

  const handleRecordActual = () => {
    if (!savedEstimateId || !actualCost) return;
    const liveSubtotal = lineItems.reduce((s, i) => s + i.total, 0);
    const liveContingency = Math.round(liveSubtotal * ((estimateResult?.summary.contingencyPct ?? 10) / 100));
    const liveMargin = Math.round((liveSubtotal + liveContingency) * (marginPct / 100));
    const estimatedTotal = liveSubtotal + liveContingency + liveMargin;
    recordActualMutation.mutate({
      estimate_id: savedEstimateId,
      estimated_cost: estimatedTotal,
      actual_cost: parseFloat(actualCost),
      notes: actualNotes || undefined,
    });
  };

  const resetAll = () => {
    setStep(1);
    setFreeText("");
    setUploadFile(null);
    setUploadHint("");
    setEstimateResult(null);
    setLineItems([]);
    setSavedEstimateId(null);
    setParams({ project_type: "renovation_residential", square_feet: 1000, finish_level: "standard", addons: [], confidence: 100, notes: "" });
  };

  const addons = modelsData?.addons ?? [];
  const isLoading = parseMutation.isPending || calculateMutation.isPending || parseFromFileMutation.isPending;

  // Average variance from learning data
  const avgVariance = actuals.length > 0
    ? actuals.reduce((s, a) => s + parseFloat(a.variancePct ?? "0"), 0) / actuals.length
    : null;

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Calculator className="h-6 w-6 text-primary" />
            Estimator
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            AI-powered parsing · DB-driven pricing · fully editable output
          </p>
        </div>
        <div className="flex items-center gap-2">
          {actuals.length > 0 && (
            <Badge
              variant="outline"
              className={cn("gap-1.5 text-xs",
                avgVariance === null ? "" :
                avgVariance > 10 ? "text-red-600 border-red-200" :
                avgVariance < -10 ? "text-green-600 border-green-200" :
                "text-muted-foreground")}
            >
              <TrendingUp className="h-3 w-3" />
              {actuals.length} actuals recorded
              {avgVariance !== null && ` · avg ${avgVariance > 0 ? "+" : ""}${avgVariance.toFixed(1)}%`}
            </Badge>
          )}
          <Button variant="outline" size="sm" onClick={() => setShowHistory(!showHistory)} className="gap-1.5">
            <History className="h-3.5 w-3.5" />
            History
            {savedEstimates.length > 0 && (
              <Badge variant="secondary" className="text-[10px] h-4 px-1">{savedEstimates.length}</Badge>
            )}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setShowCostModels(!showCostModels)} className="gap-1.5 text-muted-foreground">
            <Database className="h-3.5 w-3.5" />
            Pricing DB
          </Button>
        </div>
      </div>

      {/* Pricing DB Panel */}
      {showCostModels && (
        <Card className="border-dashed">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Database className="h-4 w-4 text-primary" />
              Pricing Database — Cost Models
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground mb-3">
              All estimates use these DB-sourced rates. AI only parses text — it never invents pricing.
            </p>
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-xs">
                <thead className="bg-muted/40 border-b border-border">
                  <tr>
                    {["Project Type", "Finish", "Labour/sqft", "Materials/sqft", "Overhead", "Contingency", "Notes"].map((h) => (
                      <th key={h} className="px-3 py-2 text-left font-semibold text-muted-foreground">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  {(modelsData?.models ?? []).map((m) => (
                    <tr key={m.id} className="hover:bg-muted/20">
                      <td className="px-3 py-1.5 font-medium">{PROJECT_TYPE_LABELS[m.projectType] ?? m.projectType}</td>
                      <td className="px-3 py-1.5">
                        <Badge variant="outline" className="text-[10px]">{m.finishLevel}</Badge>
                      </td>
                      <td className="px-3 py-1.5 text-blue-600 font-mono">${m.laborCostPerSqft}</td>
                      <td className="px-3 py-1.5 text-green-600 font-mono">${m.materialCostPerSqft}</td>
                      <td className="px-3 py-1.5 text-amber-600 font-mono">{m.overheadPct}%</td>
                      <td className="px-3 py-1.5 text-purple-600 font-mono">{m.contingencyPct}%</td>
                      <td className="px-3 py-1.5 text-muted-foreground max-w-[200px] truncate">{m.notes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* History Panel */}
      {showHistory && (
        <Card className="border-dashed">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <History className="h-4 w-4 text-primary" />
              Saved Estimates
            </CardTitle>
          </CardHeader>
          <CardContent>
            {savedEstimates.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No saved estimates yet.</p>
            ) : (
              <div className="space-y-2">
                {savedEstimates.map((e) => {
                  const result = e.result as any;
                  const price = result?.summary?.priceToClient;
                  return (
                    <div key={e.id} className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-muted/20">
                      <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{e.title}</p>
                        <p className="text-xs text-muted-foreground">{format(new Date(e.createdAt), "MMM d, yyyy")}</p>
                      </div>
                      {price && <span className="text-sm font-bold text-primary">{fmt(price)}</span>}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Learning Insights */}
      {actuals.length > 0 && (
        <div
          className="rounded-xl overflow-hidden"
          style={{ background: BLACK, border: "1px solid rgba(201,168,76,0.25)", boxShadow: "0 4px 16px rgba(0,0,0,0.18)" }}
        >
          <div className="flex items-center gap-2 px-4 py-3 border-b" style={{ borderColor: "rgba(201,168,76,0.15)" }}>
            <BookOpen className="h-4 w-4" style={{ color: GOLD }} />
            <span className="text-sm font-semibold" style={{ color: GOLD }}>Estimating Accuracy — Learning Data</span>
          </div>
          <div className="p-4 space-y-2">
            {actuals.slice(0, 3).map((a, i) => <ActualCard key={i} actual={a} />)}
          </div>
        </div>
      )}

      {/* Step Progress */}
      <div className="flex items-center gap-2">
        {[
          { n: 1, label: "Describe Project" },
          { n: 2, label: "Review Inputs" },
          { n: 3, label: "Estimate" },
        ].map(({ n, label }, idx, arr) => (
          <div key={n} className="flex items-center gap-2">
            <div className="flex items-center gap-2">
              <StepBadge step={n} current={step} />
              <span className={cn("text-sm font-medium", step === n ? "text-foreground" : "text-muted-foreground")}>{label}</span>
            </div>
            {idx < arr.length - 1 && <ChevronRight className="h-4 w-4 text-muted-foreground/40 mx-1" />}
          </div>
        ))}
        {step > 1 && (
          <Button variant="ghost" size="sm" onClick={resetAll} className="ml-auto gap-1.5 text-muted-foreground text-xs">
            <RotateCcw className="h-3 w-3" /> Start over
          </Button>
        )}
      </div>

      {/* Step 1 — Input */}
      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Describe your project</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Mode toggle */}
            <div className="flex gap-1 p-1 rounded-lg bg-muted/40 border border-border w-fit flex-wrap">
              {([
                { key: "text", label: "Free Text" },
                { key: "file", label: "Upload Plans" },
                { key: "form", label: "Structured Form" },
              ] as const).map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setInputMode(key)}
                  className={cn(
                    "px-4 py-1.5 rounded-md text-sm font-medium transition-all",
                    inputMode === key ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            {inputMode === "text" ? (
              <div className="space-y-2">
                <Label>Project description</Label>
                <Textarea
                  placeholder="e.g. I need to finish a 1,200 sqft basement with a bedroom, bathroom, and small bar area. Mid-range finishes — LVP flooring, standard tile in the bathroom. Include a permit and I want spray foam insulation."
                  value={freeText}
                  onChange={(e) => setFreeText(e.target.value)}
                  className="min-h-[120px] resize-none"
                />
                <p className="text-xs text-muted-foreground">
                  Describe the project scope, size, finish quality, and any specific requirements.
                  The AI will extract the parameters — pricing comes from our database.
                </p>
              </div>
            ) : inputMode === "file" ? (
              <div className="space-y-3">
                <div
                  className={cn(
                    "relative border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors",
                    uploadDragActive ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/30",
                  )}
                  onClick={() => uploadFileInputRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); setUploadDragActive(true); }}
                  onDragLeave={() => setUploadDragActive(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setUploadDragActive(false);
                    const f = e.dataTransfer.files[0];
                    if (f) setUploadFile(f);
                  }}
                >
                  <input
                    ref={uploadFileInputRef}
                    type="file"
                    className="hidden"
                    accept=".pdf,.docx,.doc,.txt,.png,.jpg,.jpeg,.webp,.heic"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) setUploadFile(f); }}
                  />
                  {uploadFile ? (
                    <div className="flex items-center justify-center gap-3">
                      <FileText className="h-8 w-8 text-primary" />
                      <div className="text-left">
                        <p className="text-sm font-semibold">{uploadFile.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {(uploadFile.size / 1024 / 1024).toFixed(2)} MB · Click to change
                        </p>
                      </div>
                      <button
                        className="ml-2 p-1 hover:bg-destructive/10 rounded text-muted-foreground hover:text-destructive"
                        onClick={(e) => { e.stopPropagation(); setUploadFile(null); }}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2">
                      <Upload className="h-10 w-10 text-slate-300" />
                      <p className="text-sm font-medium text-muted-foreground">
                        Drop plans here or <span className="text-primary">browse</span>
                      </p>
                      <p className="text-xs text-muted-foreground/70">PDF, Word, images (PNG/JPG/HEIC), or text — max 20 MB</p>
                    </div>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label>Additional context (optional)</Label>
                  <Textarea
                    placeholder="e.g. This is for a Toronto property, mid-range finishes preferred"
                    value={uploadHint}
                    onChange={(e) => setUploadHint(e.target.value)}
                    className="min-h-[72px] resize-none text-sm"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  AI reads the file and extracts the project scope — pricing always comes from our database.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Project type</Label>
                  <Select
                    value={params.project_type}
                    onValueChange={(v) => setParams((p) => ({ ...p, project_type: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(PROJECT_TYPE_LABELS).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Square footage</Label>
                  <Input
                    type="number"
                    min={1}
                    value={params.square_feet}
                    onChange={(e) => setParams((p) => ({ ...p, square_feet: parseFloat(e.target.value) || 0 }))}
                    placeholder="e.g. 1500"
                  />
                </div>

                <div className="sm:col-span-2 space-y-2">
                  <Label>Finish level</Label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {Object.entries(FINISH_LEVEL_LABELS).map(([k, v]) => (
                      <button
                        key={k}
                        onClick={() => setParams((p) => ({ ...p, finish_level: k }))}
                        className={cn(
                          "rounded-lg border px-3 py-2.5 text-left transition-all",
                          params.finish_level === k
                            ? "ring-2 ring-primary border-primary"
                            : "border-border hover:border-muted-foreground/30",
                        )}
                      >
                        <div className="text-sm font-semibold">{v.label}</div>
                        <div className="text-[10px] text-muted-foreground mt-0.5">{v.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <Button
              onClick={handleParseAndNext}
              disabled={isLoading}
              className="w-full gap-2"
              size="lg"
            >
              {(parseMutation.isPending || parseFromFileMutation.isPending) ? (
                <><Loader2 className="h-4 w-4 animate-spin" />
                  {parseFromFileMutation.isPending ? "Reading file with AI…" : "Parsing with AI…"}
                </>
              ) : (
                <><Sparkles className="h-4 w-4" />
                  {inputMode === "text" ? "Extract Parameters with AI" : inputMode === "file" ? "Extract Parameters from File" : "Continue to Review"}
                  <ChevronRight className="h-4 w-4" /></>
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Step 2 — Review Params */}
      {step === 2 && (
        <div className="space-y-4">
          {params.confidence < 70 && (
            <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
              <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-amber-800">
                <strong>Low confidence ({params.confidence}%)</strong> — The AI wasn't sure about some parameters. Please review and adjust below.
                {params.notes && <p className="mt-0.5 text-amber-700">{params.notes}</p>}
              </div>
            </div>
          )}

          {params.confidence >= 70 && params.notes && (
            <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-3">
              <AlertCircle className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-blue-800">{params.notes}</p>
            </div>
          )}

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Edit3 className="h-4 w-4 text-primary" />
                Review & Adjust Parameters
                {params.confidence > 0 && (
                  <Badge variant="outline" className="ml-auto text-xs">
                    AI confidence: {params.confidence}%
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Project type</Label>
                  <Select
                    value={params.project_type}
                    onValueChange={(v) => setParams((p) => ({ ...p, project_type: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(PROJECT_TYPE_LABELS).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Square footage</Label>
                  <Input
                    type="number"
                    min={1}
                    value={params.square_feet}
                    onChange={(e) => setParams((p) => ({ ...p, square_feet: parseFloat(e.target.value) || 0 }))}
                  />
                </div>

                <div className="sm:col-span-2 space-y-2">
                  <Label>Finish level</Label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {Object.entries(FINISH_LEVEL_LABELS).map(([k, v]) => (
                      <button
                        key={k}
                        onClick={() => setParams((p) => ({ ...p, finish_level: k }))}
                        className={cn(
                          "rounded-lg border px-3 py-2.5 text-left transition-all",
                          params.finish_level === k
                            ? "ring-2 ring-primary border-primary"
                            : "border-border hover:border-muted-foreground/30",
                        )}
                      >
                        <div className="text-sm font-semibold">{v.label}</div>
                        <div className="text-[10px] text-muted-foreground mt-0.5">{v.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Profit margin</Label>
                  <div className="flex items-center gap-3">
                    <Slider
                      min={0}
                      max={50}
                      step={1}
                      value={[marginPct]}
                      onValueChange={([v]) => setMarginPct(v!)}
                      className="flex-1"
                    />
                    <Badge variant="outline" className="w-14 justify-center font-bold">{marginPct}%</Badge>
                  </div>
                </div>
              </div>

              {addons.length > 0 && (
                <div className="space-y-2">
                  <Label>Add-ons & Upgrades</Label>
                  <AddonSelector
                    addons={addons}
                    selected={params.addons}
                    onChange={(v) => setParams((p) => ({ ...p, addons: v }))}
                  />
                </div>
              )}

              <div className="rounded-lg bg-muted/30 border border-border p-3 flex items-start gap-2 text-xs text-muted-foreground">
                <Database className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-primary" />
                <span>
                  Pricing will be looked up from the <strong>database cost models</strong> based on project type and finish level.
                  The AI only identified the parameters — it cannot change the rates.
                </span>
              </div>

              <Button
                onClick={handleCalculate}
                disabled={calculateMutation.isPending || params.square_feet <= 0}
                className="w-full gap-2"
                size="lg"
              >
                {calculateMutation.isPending ? (
                  <><Loader2 className="h-4 w-4 animate-spin" />Calculating…</>
                ) : (
                  <><Calculator className="h-4 w-4" />Generate Estimate from DB Rates<ChevronRight className="h-4 w-4" /></>
                )}
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Step 3 — Results */}
      {step === 3 && estimateResult && (
        <div className="space-y-5">
          {/* Model info banner */}
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 flex items-start gap-3">
            <Database className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
            <div className="text-sm">
              <span className="font-semibold">Pricing model: </span>
              <span>{estimateResult.costModelUsed.name}</span>
              {estimateResult.costModelUsed.notes && (
                <p className="text-xs text-muted-foreground mt-0.5">{estimateResult.costModelUsed.notes}</p>
              )}
            </div>
            <Badge variant="outline" className="ml-auto text-xs shrink-0">
              {params.square_feet.toLocaleString()} sqft
            </Badge>
          </div>

          {/* Main content */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
            {/* Left — Line Items */}
            <div className="lg:col-span-3 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-sm flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" />
                  Line Items
                  <Badge variant="outline" className="text-[10px]">click cells to edit</Badge>
                </h3>
              </div>
              <LineItemsTable items={lineItems} onChange={setLineItems} />
            </div>

            {/* Right — Breakdown */}
            <div className="lg:col-span-2">
              <h3 className="font-semibold text-sm flex items-center gap-2 mb-4">
                <DollarSign className="h-4 w-4 text-primary" />
                Cost Breakdown
              </h3>
              <BreakdownPanel
                summary={estimateResult.summary}
                lineItems={lineItems}
                marginPct={marginPct}
                onMarginChange={setMarginPct}
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap gap-3">
            <Button
              className="gap-2"
              onClick={() => {
                setSaveTitle(`${PROJECT_TYPE_LABELS[params.project_type] ?? params.project_type} — ${params.square_feet} sqft`);
                setShowSaveDialog(true);
              }}
              disabled={saveMutation.isPending}
            >
              <Save className="h-4 w-4" />
              Save Estimate
            </Button>

            <Button
              variant="outline"
              className="gap-2 border-primary/40 text-primary hover:bg-primary/5"
              onClick={() => setShowToQuoteDialog(true)}
              disabled={toQuoteMutation.isPending}
            >
              <FileText className="h-4 w-4" />
              Send to Quotes
            </Button>

            {savedEstimateId && (
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => setShowActualDialog(true)}
              >
                <TrendingUp className="h-4 w-4" />
                Record Actual Cost
              </Button>
            )}

            <Button variant="outline" onClick={() => setStep(2)} className="gap-2">
              <Edit3 className="h-4 w-4" />
              Adjust Inputs
            </Button>
          </div>

          {savedEstimateId && (
            <div className="rounded-lg border border-green-200 bg-green-50 p-3 flex items-center gap-3 text-sm text-green-800">
              <Check className="h-4 w-4 text-green-600 flex-shrink-0" />
              <span>Estimate saved! When the project is complete, click <strong>Record Actual Cost</strong> to improve future estimates.</span>
            </div>
          )}

          {createdQuoteNumber && (
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 flex items-center gap-3 text-sm">
              <Check className="h-4 w-4 text-primary flex-shrink-0" />
              <span className="text-foreground">
                Quote <strong>{createdQuoteNumber}</strong> created as a draft.{" "}
                <a href="/quotes" className="underline text-primary font-medium">View in Quotes →</a>
              </span>
            </div>
          )}
        </div>
      )}

      {/* Send to Quotes Dialog */}
      <Dialog open={showToQuoteDialog} onOpenChange={setShowToQuoteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send Estimate to Quotes</DialogTitle>
            <DialogDescription>
              This will create a draft quote in the Quotes section using the current line items and pricing.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Client Name *</Label>
              <Input
                value={quoteClientName}
                onChange={(e) => setQuoteClientName(e.target.value)}
                placeholder="e.g. John Smith or Acme Construction"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label>Client Email (optional)</Label>
              <Input
                type="email"
                value={quoteClientEmail}
                onChange={(e) => setQuoteClientEmail(e.target.value)}
                placeholder="client@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label>Notes (optional)</Label>
              <Input
                value={quoteNotes}
                onChange={(e) => setQuoteNotes(e.target.value)}
                placeholder="Any additional notes for this quote…"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowToQuoteDialog(false)}>Cancel</Button>
            <Button
              onClick={() => {
                if (!estimateResult) return;
                const title = `${PROJECT_TYPE_LABELS[params.project_type] ?? params.project_type} — ${params.square_feet} sqft`;
                toQuoteMutation.mutate({
                  title,
                  clientName: quoteClientName.trim(),
                  clientEmail: quoteClientEmail.trim() || undefined,
                  notes: quoteNotes.trim() || undefined,
                  sourcePrompt: freeText || undefined,
                  lineItems: lineItems.map((li) => ({
                    description: li.description,
                    quantity: li.quantity,
                    unit: li.unit,
                    unitPrice: li.unitCost,
                    total: li.total,
                  })),
                });
              }}
              disabled={toQuoteMutation.isPending || !quoteClientName.trim()}
            >
              {toQuoteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <FileText className="h-4 w-4 mr-2" />}
              Create Quote
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Save Dialog */}
      <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save Estimate</DialogTitle>
            <DialogDescription>Give your estimate a name so you can find it later.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label>Estimate name</Label>
            <Input
              value={saveTitle}
              onChange={(e) => setSaveTitle(e.target.value)}
              placeholder="e.g. Smith Basement Renovation"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSaveDialog(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saveMutation.isPending || !saveTitle.trim()}>
              {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Record Actual Dialog */}
      <Dialog open={showActualDialog} onOpenChange={setShowActualDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Actual Project Cost</DialogTitle>
            <DialogDescription>
              This helps improve future estimate accuracy by tracking how estimates compare to real costs.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Actual total cost (CAD, excl. HST)</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                <Input
                  type="number"
                  className="pl-7"
                  value={actualCost}
                  onChange={(e) => setActualCost(e.target.value)}
                  placeholder="e.g. 48000"
                  autoFocus
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notes (optional)</Label>
              <Textarea
                value={actualNotes}
                onChange={(e) => setActualNotes(e.target.value)}
                placeholder="Any factors that affected the final cost…"
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowActualDialog(false)}>Cancel</Button>
            <Button onClick={handleRecordActual} disabled={recordActualMutation.isPending || !actualCost}>
              {recordActualMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-2" />}
              Record
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
