import { useState } from "react";
import { format } from "date-fns";
import {
  AlertTriangle, Brain, CheckCircle2, ChevronDown, ChevronUp, Clock, Info, Loader2, RefreshCw, TrendingDown, Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GOLD, BLACK, scoreColor, ErrorState, ScoreGauge } from "./shared";
import { useShadowAuditor } from "@/hooks/cor-compliance/useShadowAuditor";

type GapSeverity = "critical" | "high" | "medium" | "low";
type ConfidenceLevel = "high" | "medium" | "low";

const GAP_SEVERITY_CFG: Record<GapSeverity, { label: string; bg: string; text: string; border: string }> = {
  critical: { label: "Critical", bg: "#1a0000",    text: "#f87171", border: "#7f1d1d66" },
  high:     { label: "High",     bg: "#1a0d00",    text: "#fb923c", border: "#9a3412aa" },
  medium:   { label: "Medium",   bg: "#1a1500",    text: "#fbbf24", border: "#854d0e88" },
  low:      { label: "Low",      bg: "#001a08",    text: "#4ade80", border: "#14532d88" },
};

const CONFIDENCE_CFG: Record<ConfidenceLevel, { label: string; color: string }> = {
  high:   { label: "High confidence",   color: "#22c55e" },
  medium: { label: "Medium confidence", color: "#f59e0b" },
  low:    { label: "Low confidence",    color: "#94a3b8" },
};

export function ShadowAuditorTab() {
  const [lookbackDays, setLookbackDays] = useState(90);
  const [showAllElements, setShowAllElements] = useState(false);
  const [expandedGap, setExpandedGap] = useState<string | null>(null);

  const { query, refresh } = useShadowAuditor(lookbackDays);

  if (query.isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3 py-4">
          <Brain className="h-5 w-5 animate-pulse" style={{ color: GOLD }} />
          <span className="text-sm text-zinc-400">Shadow Auditor is scanning your evidence…</span>
        </div>
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-28 rounded-xl" style={{ background: "#1a1a1a" }} />)}
      </div>
    );
  }

  if (query.isError) {
    return <ErrorState message="Shadow Auditor could not complete analysis. Check that you have evidence data and try again." />;
  }

  const report = query.data;
  if (!report) return null;

  const { elementAnalysis, gapWarnings } = report;
  const criticalGaps = gapWarnings.filter((g) => g.severity === "critical");
  const highGaps = gapWarnings.filter((g) => g.severity === "high");
  const coveredElements = elementAnalysis.filter((e) => e.entryCount > 0).length;
  const displayElements = showAllElements
    ? elementAnalysis
    : [...elementAnalysis].sort((a, b) => a.predictedScore - b.predictedScore).slice(0, 10);

  return (
    <div className="space-y-5">
      {/* Header controls */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <select
            value={lookbackDays}
            onChange={(e) => setLookbackDays(parseInt(e.target.value))}
            className="text-xs rounded-md px-3 py-1.5"
            style={{ background: "#1a1a1a", border: "1px solid #333", color: "#e5e5e5" }}
          >
            <option value={30}>Last 30 days</option>
            <option value={60}>Last 60 days</option>
            <option value={90}>Last 90 days</option>
            <option value={180}>Last 180 days</option>
          </select>
          <span className="text-xs text-zinc-600">
            Analyzed {format(new Date(report.generatedAt), "MMM d, yyyy · h:mm a")}
          </span>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={refresh}
          disabled={query.isFetching}
          style={{ borderColor: "#333", color: "#a1a1aa", height: 30, fontSize: 12 }}
        >
          {query.isFetching
            ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Analyzing…</>
            : <><RefreshCw className="h-3.5 w-3.5 mr-1.5" />Refresh Analysis</>}
        </Button>
      </div>

      {/* Predicted score hero */}
      <Card style={{ background: BLACK, border: `1px solid ${GOLD}22`, boxShadow: `0 4px 24px rgba(0,0,0,0.4)` }}>
        <CardContent className="p-6">
          <div className="flex items-center gap-6 flex-wrap">
            <div className="relative">
              <ScoreGauge score={report.predictedScore} size={120} />
              <div
                className="absolute -bottom-1 left-1/2 -translate-x-1/2 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full whitespace-nowrap"
                style={{ background: "#1a1a1a", color: GOLD, border: `1px solid ${GOLD}40` }}
              >
                AI Score
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: GOLD }}>
                  Predicted COR Audit Score
                </p>
                <span
                  className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                  style={{ background: "#ffffff0a", color: CONFIDENCE_CFG[report.confidenceLevel].color }}
                >
                  {CONFIDENCE_CFG[report.confidenceLevel].label}
                </span>
              </div>
              <p className="text-2xl font-bold mb-1" style={{ color: scoreColor(report.predictedScore) }}>
                {report.predictedScore >= 80 ? "Audit Ready" : report.predictedScore >= 60 ? "Needs Attention" : "High Risk"}
                <span className="text-base font-normal text-zinc-500 ml-2">— {report.predictedScore}%</span>
              </p>
              <p className="text-sm text-zinc-400 leading-relaxed italic">{report.aiNarrative}</p>
              <div className="flex items-center gap-4 mt-3 flex-wrap">
                <span className="text-xs text-zinc-500 flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-zinc-600" />
                  {coveredElements}/19 elements covered
                </span>
                {criticalGaps.length > 0 && (
                  <span className="text-xs font-semibold flex items-center gap-1.5" style={{ color: "#f87171" }}>
                    <AlertTriangle className="h-3.5 w-3.5" />
                    {criticalGaps.length} critical gap{criticalGaps.length !== 1 ? "s" : ""}
                  </span>
                )}
                {report.expiringCredentialCount > 0 && (
                  <span className="text-xs font-semibold flex items-center gap-1.5" style={{ color: "#fbbf24" }}>
                    <Clock className="h-3.5 w-3.5" />
                    {report.expiringCredentialCount} credential{report.expiringCredentialCount !== 1 ? "s" : ""} expiring
                  </span>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Gap warnings */}
      {gapWarnings.length > 0 && (
        <Card style={{ background: BLACK, border: "none", boxShadow: "0 2px 12px rgba(0,0,0,0.2)" }}>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <TrendingDown className="h-4 w-4" style={{ color: GOLD }} />
              <CardTitle className="text-xs font-semibold uppercase tracking-wider" style={{ color: GOLD }}>
                Gap Detection — {gapWarnings.length} vulnerabilit{gapWarnings.length !== 1 ? "ies" : "y"} identified
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {gapWarnings.map((gap, idx) => {
              const cfg = GAP_SEVERITY_CFG[gap.severity];
              const key = `${gap.element}-${idx}`;
              const isExpanded = expandedGap === key;
              return (
                <div
                  key={key}
                  style={{ background: cfg.bg, border: `1px solid ${cfg.border}`, borderRadius: 8, overflow: "hidden" }}
                >
                  <button
                    className="w-full flex items-start gap-3 px-4 py-3 text-left hover:opacity-80 transition-opacity"
                    onClick={() => setExpandedGap(isExpanded ? null : key)}
                  >
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" style={{ color: cfg.text }} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-0.5">
                        <span
                          className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
                          style={{ background: `${cfg.text}22`, color: cfg.text }}
                        >
                          {cfg.label}
                        </span>
                        <span className="text-xs font-medium text-zinc-400">{gap.elementName}</span>
                        <span className="text-xs ml-auto shrink-0 tabular-nums" style={{ color: "#ef4444" }}>
                          {gap.scoreImpact}%
                        </span>
                      </div>
                      <p className="text-sm leading-relaxed" style={{ color: cfg.text }}>{gap.description}</p>
                    </div>
                    {isExpanded ? <ChevronUp className="h-4 w-4 shrink-0 text-zinc-600 mt-0.5" /> : <ChevronDown className="h-4 w-4 shrink-0 text-zinc-600 mt-0.5" />}
                  </button>
                  {isExpanded && (
                    <div
                      className="px-4 pb-3 pt-2 flex items-start gap-2"
                      style={{ borderTop: `1px solid ${cfg.border}` }}
                    >
                      <Zap className="h-3.5 w-3.5 shrink-0 mt-0.5" style={{ color: GOLD }} />
                      <p className="text-xs text-zinc-300 leading-relaxed">{gap.actionRequired}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Element breakdown */}
      <Card style={{ background: BLACK, border: "none", boxShadow: "0 2px 12px rgba(0,0,0,0.2)" }}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider" style={{ color: GOLD }}>
              Predicted Score — All 19 IHSA Elements
            </CardTitle>
            <button
              className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
              onClick={() => setShowAllElements((v) => !v)}
            >
              {showAllElements ? "Show worst 10" : "Show all 19"}
            </button>
          </div>
          {!showAllElements && (
            <p className="text-xs text-zinc-600 mt-0.5">Showing bottom 10 by predicted score</p>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {displayElements.map((el) => {
            const color = scoreColor(el.predictedScore);
            const hasEntries = el.entryCount > 0;
            return (
              <div key={el.element} className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span className="text-sm font-medium text-zinc-200 truncate">{el.name}</span>
                    {!hasEntries && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0" style={{ background: "#7f1d1d30", color: "#f87171" }}>
                        No evidence
                      </span>
                    )}
                    {el.openCapaCount > 0 && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0" style={{ background: "#9a341220", color: "#fb923c" }}>
                        {el.openCapaCount} CAPA
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {el.daysSinceLastEntry !== null && (
                      <span className="text-xs text-zinc-600 hidden sm:block">
                        last {el.daysSinceLastEntry}d ago
                      </span>
                    )}
                    <span className="text-sm font-bold tabular-nums w-10 text-right" style={{ color }}>
                      {el.predictedScore}%
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: "#1f1f1f" }}>
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${el.predictedScore}%`, background: color }}
                    />
                  </div>
                  {el.entryCount > 0 && (
                    <span className="text-[10px] text-zinc-700 w-12 text-right shrink-0">
                      {el.entryCount} entries
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Stats footer */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Critical Gaps",       value: criticalGaps.length,               color: "#f87171" },
          { label: "High Risk Gaps",       value: highGaps.length,                   color: "#fb923c" },
          { label: "Expiring Credentials", value: report.expiringCredentialCount,    color: "#fbbf24" },
          { label: "Flagged Subcontractors", value: report.flaggedSubcontractorCount, color: "#ef4444" },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-lg p-4 text-center"
            style={{ background: "#0f0f0f", border: "1px solid #1f1f1f" }}
          >
            <p className="text-2xl font-bold" style={{ color: stat.value > 0 ? stat.color : "#374151" }}>
              {stat.value}
            </p>
            <p className="text-xs text-zinc-500 mt-1">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Confidence note */}
      <div className="flex items-start gap-2 text-xs text-zinc-600">
        <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
        <p>
          Predicted score is calculated from {report.lookbackDays}-day evidence history across audit entries,
          inspections, voice observations, CAPA tickets, policy sign-offs, and subcontractor compliance.
          {report.confidenceLevel === "low" && " Submit more evidence across elements to improve prediction accuracy."}
        </p>
      </div>
    </div>
  );
}
