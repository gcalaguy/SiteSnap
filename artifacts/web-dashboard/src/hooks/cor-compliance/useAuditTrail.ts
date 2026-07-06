import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";

export interface AuditTrailEntry {
  id: number;
  sourceType: string;
  sourceRecordId: number;
  ihsaElement: string;
  ihsaElementName: string;
  findingType: "pass" | "fail";
  findingDescription: string;
  complianceScore: number;
  createdAt: string;
}

export interface AuditTrailResponse { data: AuditTrailEntry[]; total: number }

export function useAuditTrail(opts: {
  projectId: string;
  element: string;
  findingType: string;
  page: number;
  limit: number;
}) {
  const { projectId, element, findingType, page, limit } = opts;
  const params = new URLSearchParams({ limit: String(limit), offset: String(page * limit) });
  if (element !== "all") params.set("element", element);
  if (findingType !== "all") params.set("findingType", findingType);

  return useQuery<AuditTrailResponse>({
    queryKey: ["cor-audit-trail", projectId, element, findingType, page],
    queryFn: () => customFetch(`/api/cor/projects/${projectId}/audit-trail?${params}`),
    enabled: !!projectId,
    retry: 1,
  });
}
