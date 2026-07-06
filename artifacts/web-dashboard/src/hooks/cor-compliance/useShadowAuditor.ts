import { useQuery, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";

type GapSeverity = "critical" | "high" | "medium" | "low";
type ConfidenceLevel = "high" | "medium" | "low";

export interface ElementAnalysis {
  element: string;
  name: string;
  predictedScore: number;
  baseScore: number;
  entryCount: number;
  failCount: number;
  voiceLogCount: number;
  daysSinceLastEntry: number | null;
  openCapaCount: number;
  overdueCapaCount: number;
  signoffCompliance: number;
}

export interface GapWarning {
  element: string;
  elementName: string;
  severity: GapSeverity;
  description: string;
  scoreImpact: number;
  actionRequired: string;
}

export interface ShadowAuditorReport {
  predictedScore: number;
  confidenceLevel: ConfidenceLevel;
  elementAnalysis: ElementAnalysis[];
  gapWarnings: GapWarning[];
  aiNarrative: string;
  expiringCredentialCount: number;
  flaggedSubcontractorCount: number;
  generatedAt: string;
  lookbackDays: number;
}

export function useShadowAuditor(lookbackDays: number) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const query = useQuery<ShadowAuditorReport>({
    queryKey: ["cor-shadow-auditor", lookbackDays],
    queryFn: () => customFetch(`/api/cor/shadow-auditor?lookbackDays=${lookbackDays}`),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["cor-shadow-auditor"] });
    toast({ title: "Re-running Shadow Auditor…", description: "AI analysis may take a few seconds." });
  }

  return { query, refresh };
}
