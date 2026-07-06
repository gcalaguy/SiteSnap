import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";

interface ElementScore {
  ihsaElement: string;
  ihsaElementName: string;
  averageScore: number;
  entryCount: number;
  failCount: number;
}

interface CorFinding {
  id: number;
  ihsaElement: string;
  ihsaElementName: string;
  sourceType: string;
  findingType: "pass" | "fail";
  findingDescription: string;
  complianceScore: number;
  createdAt: string;
}

export interface CorDashboard {
  project: { id: number; name: string };
  overallScore: number;
  totalEntries: number;
  scoreByElement: ElementScore[];
  recentFindings: CorFinding[];
}

export function useProjectDashboard(projectId: string, enabled: boolean) {
  return useQuery<CorDashboard>({
    queryKey: ["cor-dashboard", projectId],
    queryFn: () => customFetch(`/api/cor/projects/${projectId}/dashboard`),
    enabled: enabled && !!projectId,
    retry: 1,
  });
}
