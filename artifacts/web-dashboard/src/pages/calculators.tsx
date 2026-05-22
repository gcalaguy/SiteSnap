import { useState, useCallback } from "react";
import {
  ChevronRight, Star, Clock, ArrowLeft, Info, RotateCcw, Sparkles, Loader2, Mic,
  BookmarkPlus, CheckCircle2, Calculator
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Link } from "wouter";
import { customFetch } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { getAiErrorMessage } from "@/hooks/useApiError";
import { CALCULATORS, CATEGORIES, categoryMeta, type CalcDef } from "@/lib/calculators-data";

const GOLD = "#C9A84C";
const BLACK = "#111111";

// ── Main component ────────────────────────────────────────────────────────────
export default function CalculatorsPage() {
  const [category, setCategory] = useState("All");
  const [activeCalc, setActiveCalc] = useState<CalcDef | null>(null);
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [result, setResult] = useState<ReturnType<CalcDef["calculate"]>>(null);
  const [showSteps, setShowSteps] = useState(false);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [recent, setRecent] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem("calc-recent") ?? "[]"); } catch { return []; }
  });
  const [favorites, setFavorites] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem("calc-favorites") ?? "[]"); } catch { return []; }
  });
  const { toast } = useToast();

  const filtered = CALCULATORS.filter((c) => category === "All" || c.category === category);
  const recentCalcs = recent.map((id) => CALCULATORS.find((c) => c.id === id)).filter(Boolean) as CalcDef[];
  const favCalcs = favorites.map((id) => CALCULATORS.find((c) => c.id === id)).filter(Boolean) as CalcDef[];

  const saveToProfile = async () => {
    if (!activeCalc || !result) return;
    setSaving(true);
    try {
      await customFetch("/api/tradehub/profile/calculations", {
        method: "POST",
        body: JSON.stringify({
          calculatorId: activeCalc.id,
          calculatorName: activeCalc.name,
          category: activeCalc.category,
          inputs,
          results: result.results,
          summary: result.summary,
          aiSummary: aiSummary ?? null,
        }),
      });
      setSaved(true);
      toast({ title: "Saved to your TradeHub profile!" });
      setTimeout(() => setSaved(false), 3000);
    } catch {
      toast({ title: "Error", description: "Could not save to profile", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const openCalc = useCallback((calc: CalcDef) => {
    setActiveCalc(calc);
    const defaults: Record<string, string> = {};
    calc.fields.forEach((f) => {
      if (f.type === "select" && f.options) defaults[f.id] = f.options[0];
    });
    setInputs(defaults);
    setResult(null);
    setShowSteps(false);
    setAiSummary(null);
    setSaved(false);
    const updated = [calc.id, ...recent.filter((r) => r !== calc.id)].slice(0, 5);
    setRecent(updated);
    localStorage.setItem("calc-recent", JSON.stringify(updated));
  }, [recent]);

  const runCalc = useCallback(() => {
    if (!activeCalc) return;
    const r = activeCalc.calculate(inputs);
    setResult(r);
    setAiSummary(null);
  }, [activeCalc, inputs]);

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
      const data = await customFetch("/api/calculators/ai-summary", {
        method: "POST",
        body: JSON.stringify({ calculator: activeCalc.name, inputs, summary: result.summary, results: result.results }),
      }) as any;
      setAiSummary(data.summary);
    } catch (err) {
      toast({ title: "AI unavailable", description: getAiErrorMessage(err), variant: "destructive" });
    } finally {
      setAiLoading(false);
    }
  };

  // ── Calculator detail view ─────────────────────────────────────────────────
  if (activeCalc) {
    const meta = categoryMeta[activeCalc.category];
    const isFav = favorites.includes(activeCalc.id);

    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => setActiveCalc(null)}><ArrowLeft className="h-4 w-4" /></Button>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold">{activeCalc.name}</h1>
              <Badge variant="secondary" className={`${meta.bg} ${meta.color} border-0`}>{activeCalc.category}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">{activeCalc.description}</p>
          </div>
          <button
            onClick={() => toggleFavorite(activeCalc.id)}
            className={`p-2 rounded-lg transition-colors ${isFav ? "text-yellow-500 bg-yellow-50" : "text-muted-foreground hover:text-yellow-500"}`}
          >
            <Star className="h-5 w-5" fill={isFav ? "currentColor" : "none"} />
          </button>
        </div>

        <Card>
          <CardContent className="pt-6 space-y-4">
            {activeCalc.fields.map((field) => (
              <div key={field.id} className="space-y-1.5">
                <Label className="text-sm font-medium">
                  {field.label}{field.unit && <span className="text-muted-foreground font-normal ml-1">({field.unit})</span>}
                </Label>
                {field.type === "select" ? (
                  <Select
                    value={inputs[field.id] ?? field.options?.[0]}
                    onValueChange={(v) => setInputs((p) => ({ ...p, [field.id]: v }))}
                  >
                    <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {field.options?.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    type="number"
                    step={field.step ?? "any"}
                    placeholder={field.placeholder}
                    value={inputs[field.id] ?? ""}
                    onChange={(e) => setInputs((p) => ({ ...p, [field.id]: e.target.value }))}
                    className="h-11 text-base"
                    onKeyDown={(e) => e.key === "Enter" && runCalc()}
                  />
                )}
              </div>
            ))}
            <div className="flex gap-2 pt-2">
              <Button onClick={runCalc} className="flex-1 h-11 text-base gap-2">
                <Calculator className="h-4 w-4" />Calculate
              </Button>
              <Button variant="outline" size="icon" className="h-11 w-11" onClick={resetCalc}>
                <RotateCcw className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>

        {result && (
          <div className="space-y-4">
            <Card className="border-primary/20 bg-primary/3">
              <CardHeader className="pb-2 flex-row items-center justify-between">
                <CardTitle className="text-base">Results</CardTitle>
                <Button
                  size="sm"
                  variant={saved ? "secondary" : "outline"}
                  onClick={saveToProfile}
                  disabled={saving || saved}
                  className="gap-1.5 h-8 text-xs"
                >
                  {saving ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : saved ? (
                    <><CheckCircle2 className="h-3.5 w-3.5 text-green-600" />Saved!</>
                  ) : (
                    <><BookmarkPlus className="h-3.5 w-3.5" />Save to Profile</>
                  )}
                </Button>
              </CardHeader>
              <CardContent className="space-y-2">
                {result.results.map((r, i) => (
                  <div
                    key={i}
                    className={`flex items-center justify-between rounded-lg px-3 py-2 ${r.highlight ? "bg-primary/10 border border-primary/20" : "bg-muted/40"}`}
                  >
                    <span className="text-sm text-muted-foreground">{r.label}</span>
                    <span className={`font-semibold text-sm ${r.highlight ? "text-primary" : "text-foreground"}`}>{r.value}</span>
                  </div>
                ))}
              </CardContent>
            </Card>

            {result.steps.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <button
                    className="flex items-center justify-between w-full text-left"
                    onClick={() => setShowSteps(!showSteps)}
                  >
                    <CardTitle className="text-base flex items-center gap-2">
                      <Info className="h-4 w-4 text-muted-foreground" />Step-by-step breakdown
                    </CardTitle>
                    <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${showSteps ? "rotate-90" : ""}`} />
                  </button>
                </CardHeader>
                {showSteps && (
                  <CardContent className="space-y-2">
                    {result.steps.map((s, i) => (
                      <div key={i} className="flex items-center gap-3 text-sm">
                        <span className="w-5 h-5 rounded-full bg-muted text-muted-foreground flex items-center justify-center text-xs flex-shrink-0">{i + 1}</span>
                        <span className="text-muted-foreground flex-1">{s.label}</span>
                        <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{s.formula}</code>
                        {s.result && <span className="font-medium text-foreground">{s.result}</span>}
                      </div>
                    ))}
                  </CardContent>
                )}
              </Card>
            )}

            <Card>
              <CardContent className="pt-4">
                {aiSummary ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Sparkles className="h-4 w-4 text-primary" />
                      <span className="text-sm font-semibold">AI Field Summary</span>
                    </div>
                    <p className="text-sm text-foreground leading-relaxed bg-primary/5 rounded-xl p-3">{aiSummary}</p>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" className="gap-1.5" onClick={getAiSummary}>
                        <RotateCcw className="h-3.5 w-3.5" />Regenerate
                      </Button>
                      <Link href="/tradehub/profile/me">
                        <Button size="sm" className="gap-1.5">
                          <Mic className="h-3.5 w-3.5" />Add to Voice Profile
                        </Button>
                      </Link>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">Get an AI-powered field summary</span>
                    </div>
                    <Button size="sm" variant="outline" onClick={getAiSummary} disabled={aiLoading} className="gap-1.5">
                      {aiLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                      {aiLoading ? "Generating…" : "AI Summary"}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    );
  }

  // ── Hub / list view ────────────────────────────────────────────────────────
  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Calculators</h1>
          <p className="text-muted-foreground mt-1">Trade calculators for the field — accurate, fast, offline-ready</p>
        </div>
        <Badge variant="secondary" className="text-xs">{CALCULATORS.length} calculators</Badge>
      </div>
      {favCalcs.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
            <Star className="h-3.5 w-3.5 text-yellow-500" />Favorites
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {favCalcs.map((c) => <CalcCard key={c.id} calc={c} onOpen={openCalc} isFav />)}
          </div>
        </div>
      )}
      {recentCalcs.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
            <Clock className="h-3.5 w-3.5" />Recently Used
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {recentCalcs.slice(0, 4).map((c) => <CalcCard key={c.id} calc={c} onOpen={openCalc} />)}
          </div>
        </div>
      )}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">All Calculators</h2>
        <div className="flex flex-wrap gap-2 mb-5">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className="px-3 py-1.5 rounded-full text-sm font-medium transition-all text-[#ffffff8c]"
              style={
                category === cat
                  ? { background: GOLD, color: BLACK }
                  : { background: BLACK, color: "rgba(255,255,255,0.55)", border: "1px solid rgba(201,168,76,0.18)" }
              }
            >
              {cat}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {filtered.map((c) => (
            <CalcCard key={c.id} calc={c} onOpen={openCalc} isFav={favorites.includes(c.id)} />
          ))}
        </div>
      </div>
    </div>
  );
}

function CalcCard({ calc, onOpen, isFav }: { calc: CalcDef; onOpen: (c: CalcDef) => void; isFav?: boolean }) {
  const meta = categoryMeta[calc.category] ?? { icon: Calculator, color: "text-gray-700", bg: "bg-gray-100" };
  const Icon = meta.icon;
  return (
    <button
      onClick={() => onOpen(calc)}
      className="group relative text-left rounded-2xl transition-all p-4 space-y-2 border-t-[3px] border-r-[3px] border-b-[3px] border-l-[3px] bg-[#111111] border-[#D4AF37]/20 hover:border-[#D4AF37] shadow-[0_4px_16px_rgba(0,0,0,0.18)] text-[#fff5f5]"
    >
      {isFav && (
        <Star className="absolute top-3 right-3 h-3.5 w-3.5 text-yellow-400" fill="currentColor" />
      )}
      <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-[#c9a84c85]" style={{ background: "rgba(201,168,76,0.12)" }}>
        <Icon className="h-4 w-4" style={{ color: GOLD }} />
      </div>
      <div>
        <p className="text-sm leading-tight font-extrabold text-[#fff5f5]">{calc.name}</p>
        <p className="text-xs mt-0.5 leading-snug line-clamp-2 text-[#121212]" style={{ color: "rgba(255,255,255,0.45)" }}>{calc.description}</p>
      </div>
      <Badge variant="outline" className="text-xs border-0 px-2 py-0.5 text-[#d4af37] font-extrabold" style={{ background: "rgba(201,168,76,0.12)" }}>
        {calc.category}
      </Badge>
    </button>
  );
}
