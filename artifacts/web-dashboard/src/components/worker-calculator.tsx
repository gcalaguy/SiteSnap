import { useState, useCallback } from "react";
import {
  Calculator, ArrowLeft, RotateCcw, ChevronRight, Star, Sparkles, Loader2
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { customFetch } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { CALCULATORS, CATEGORIES, categoryMeta, type CalcDef } from "@/lib/calculators-data";

export function WorkerCalculator() {
  const [category, setCategory] = useState("All");
  const [activeCalc, setActiveCalc] = useState<CalcDef | null>(null);
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [result, setResult] = useState<ReturnType<CalcDef["calculate"]>>(null);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [favorites, setFavorites] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem("calc-favorites") ?? "[]"); } catch { return []; }
  });
  const { toast } = useToast();

  const filtered = CALCULATORS.filter((c) => category === "All" || c.category === category);

  const openCalc = useCallback((calc: CalcDef) => {
    setActiveCalc(calc);
    const defaults: Record<string, string> = {};
    calc.fields.forEach((f) => {
      if (f.type === "select" && f.options) defaults[f.id] = f.options[0];
    });
    setInputs(defaults);
    setResult(null);
    setAiSummary(null);
  }, []);

  const runCalc = () => {
    if (!activeCalc) return;
    setResult(activeCalc.calculate(inputs));
    setAiSummary(null);
  };

  const resetCalc = () => {
    const defaults: Record<string, string> = {};
    activeCalc?.fields.forEach((f) => {
      if (f.type === "select" && f.options) defaults[f.id] = f.options[0];
    });
    setInputs(defaults);
    setResult(null);
    setAiSummary(null);
  };

  const toggleFavorite = (id: string) => {
    const updated = favorites.includes(id)
      ? favorites.filter((f) => f !== id)
      : [...favorites, id];
    setFavorites(updated);
    localStorage.setItem("calc-favorites", JSON.stringify(updated));
  };

  const getAiSummary = async () => {
    if (!result || !activeCalc) return;
    setAiLoading(true);
    try {
      const data = await customFetch<{ summary: string }>("/api/calculators/ai-summary", {
        method: "POST",
        body: JSON.stringify({ calculator: activeCalc.name, inputs, summary: result.summary, results: result.results }),
      });
      setAiSummary(data.summary);
    } catch {
      toast({ title: "AI unavailable", description: "Could not generate AI summary.", variant: "destructive" });
    } finally {
      setAiLoading(false);
    }
  };

  // ── Active calculator detail ───────────────────────────────────────────────
  if (activeCalc) {
    const meta = categoryMeta[activeCalc.category] ?? { icon: Calculator, color: "text-gray-700", bg: "bg-gray-100" };
    const Icon = meta.icon;
    const isFav = favorites.includes(activeCalc.id);

    return (
      <div>
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={() => setActiveCalc(null)}
            className="w-8 h-8 bg-white border border-gray-100 rounded-xl flex items-center justify-center shadow-sm"
          >
            <ArrowLeft className="h-4 w-4 text-gray-600" />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <div className={`w-6 h-6 rounded-lg flex items-center justify-center ${meta.bg} ${meta.color}`}>
                <Icon className="h-3.5 w-3.5" />
              </div>
              <p className="font-bold text-gray-900 text-base truncate">{activeCalc.name}</p>
            </div>
            <p className="text-xs text-gray-400 mt-0.5 truncate">{activeCalc.description}</p>
          </div>
          <button
            onClick={() => toggleFavorite(activeCalc.id)}
            className={`w-8 h-8 rounded-xl flex items-center justify-center transition-colors ${isFav ? "bg-yellow-50" : "bg-gray-50"}`}
          >
            <Star className={`h-4 w-4 ${isFav ? "text-yellow-500" : "text-gray-300"}`} fill={isFav ? "currentColor" : "none"} />
          </button>
        </div>

        {/* Input fields */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3 mb-3">
          {activeCalc.fields.map((field) => (
            <div key={field.id}>
              <label className="text-xs font-medium text-gray-500 mb-1 block">
                {field.label}{field.unit && <span className="text-gray-400 font-normal ml-1">({field.unit})</span>}
              </label>
              {field.type === "select" ? (
                <Select
                  value={inputs[field.id] ?? field.options?.[0]}
                  onValueChange={(v) => setInputs((p) => ({ ...p, [field.id]: v }))}
                >
                  <SelectTrigger className="h-10 text-sm rounded-xl border-gray-200">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {field.options?.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                  </SelectContent>
                </Select>
              ) : (
                <input
                  type="number"
                  step="any"
                  placeholder={field.placeholder}
                  value={inputs[field.id] ?? ""}
                  onChange={(e) => setInputs((p) => ({ ...p, [field.id]: e.target.value }))}
                  onKeyDown={(e) => e.key === "Enter" && runCalc()}
                  className="w-full h-10 px-3 rounded-xl border border-gray-200 text-sm text-gray-900 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                />
              )}
            </div>
          ))}
          <div className="flex gap-2 pt-1">
            <button
              onClick={runCalc}
              className="flex-1 h-10 bg-primary text-white rounded-xl font-semibold text-sm flex items-center justify-center gap-2 active:scale-95 transition-transform"
            >
              <Calculator className="h-4 w-4" />Calculate
            </button>
            <button
              onClick={resetCalc}
              className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center text-gray-500 active:scale-95 transition-transform"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Results */}
        {result && (
          <div className="space-y-3">
            <div className="bg-white rounded-2xl border border-primary/20 shadow-sm p-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Results</p>
              <div className="space-y-2">
                {result.results.map((r, i) => (
                  <div
                    key={i}
                    className={`flex items-center justify-between rounded-xl px-3 py-2 ${r.highlight ? "bg-primary/10" : "bg-gray-50"}`}
                  >
                    <span className="text-xs text-gray-500">{r.label}</span>
                    <span className={`font-bold text-sm ${r.highlight ? "text-primary" : "text-gray-800"}`}>{r.value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* AI Summary */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
              {aiSummary ? (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Sparkles className="h-3.5 w-3.5 text-primary" />
                    <span className="text-xs font-semibold text-gray-700">AI Field Note</span>
                  </div>
                  <p className="text-xs text-gray-600 leading-relaxed bg-primary/5 rounded-xl p-3">{aiSummary}</p>
                </div>
              ) : (
                <button
                  onClick={getAiSummary}
                  disabled={aiLoading}
                  className="w-full flex items-center justify-between text-left"
                >
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-3.5 w-3.5 text-gray-400" />
                    <span className="text-xs text-gray-500">Get AI field note</span>
                  </div>
                  {aiLoading
                    ? <Loader2 className="h-3.5 w-3.5 text-primary animate-spin" />
                    : <ChevronRight className="h-3.5 w-3.5 text-gray-300" />
                  }
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Grid view ──────────────────────────────────────────────────────────────
  return (
    <div>
      {/* Category tabs */}
      <div className="flex gap-1.5 overflow-x-auto pb-2 mb-4 scrollbar-hide">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setCategory(cat)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
              category === cat
                ? "bg-primary text-white"
                : "bg-gray-100 text-gray-500 hover:bg-gray-200"
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Calculator grid */}
      <div className="grid grid-cols-2 gap-2.5">
        {filtered.map((c) => {
          const meta = categoryMeta[c.category] ?? { icon: Calculator, color: "text-gray-700", bg: "bg-gray-100" };
          const Icon = meta.icon;
          const isFav = favorites.includes(c.id);
          return (
            <button
              key={c.id}
              onClick={() => openCalc(c)}
              className="relative text-left bg-white border border-gray-100 rounded-2xl p-3.5 shadow-sm hover:border-primary/30 hover:shadow-md transition-all active:scale-95"
            >
              {isFav && (
                <Star className="absolute top-2.5 right-2.5 h-3 w-3 text-yellow-400" fill="currentColor" />
              )}
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center mb-2 ${meta.bg} ${meta.color}`}>
                <Icon className="h-4 w-4" />
              </div>
              <p className="font-semibold text-xs text-gray-900 leading-tight">{c.name}</p>
              <p className="text-[11px] text-gray-400 mt-0.5 leading-snug line-clamp-2">{c.description}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
