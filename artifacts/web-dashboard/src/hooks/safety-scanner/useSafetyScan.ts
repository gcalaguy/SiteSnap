import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";

export interface PpeItem { item: string; present: boolean }

export interface ScanHazard {
  id: number;
  title: string;
  severity: "low" | "medium" | "high" | "critical";
  description: string;
  remediation: string | null;
  boundingArea: string | null;
  sourcePhotoObjectPath: string | null;
  capaTicketId: number | null;
  capaStatus: string | null;
}

export interface SafetyScan {
  id: number;
  companyId: number;
  projectId: number;
  status: "complete" | "failed";
  photoObjectPaths: string[];
  gpsLat: string | null;
  gpsLng: string | null;
  gpsAltitude: string | null;
  gpsAccuracyM: string | null;
  gpsCapturedAt: string;
  gpsTimezone: string | null;
  siteAddress: string | null;
  summary: string | null;
  complianceScore: number | null;
  riskLevel: "low" | "medium" | "high" | "critical" | null;
  ppeDetected: PpeItem[];
  reportObjectPath: string | null;
  inspectorSignatureData: string | null;
  inspectorSignedAt: string | null;
  foremanUserId: number | null;
  foremanSignatureData: string | null;
  foremanSignedAt: string | null;
  createdAt: string;
  hazards: ScanHazard[];
}

export interface SafetyScanListItem
  extends Omit<SafetyScan, "hazards" | "aiRawResponse"> {}

function invalidate(queryClient: ReturnType<typeof useQueryClient>, id?: number) {
  queryClient.invalidateQueries({ queryKey: ["safety-scans"] });
  if (id != null) queryClient.invalidateQueries({ queryKey: ["safety-scan", id] });
}

export function useSafetyScanList(projectId?: number) {
  const params = new URLSearchParams();
  if (projectId) params.set("projectId", String(projectId));
  return useQuery<{ data: SafetyScanListItem[]; total: number }>({
    queryKey: ["safety-scans", projectId ?? "all"],
    queryFn: () => customFetch(`/api/safety/scans${params.toString() ? `?${params}` : ""}`),
    retry: 1,
  });
}

export function useSafetyScan(id: number | null) {
  return useQuery<SafetyScan>({
    queryKey: ["safety-scan", id],
    queryFn: () => customFetch(`/api/safety/scans/${id}`),
    enabled: id != null,
    retry: 1,
  });
}

export function useCreateSafetyScan(onDone?: (scan: SafetyScan) => void) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: object) =>
      customFetch<SafetyScan>("/api/safety/scans", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: (scan) => {
      toast({ title: "Scan complete", description: `Compliance score: ${scan.complianceScore ?? 0}%` });
      invalidate(queryClient);
      onDone?.(scan);
    },
    onError: () => toast({ title: "Scan failed", variant: "destructive" }),
  });
}

export function useCreateScanAction(scanId: number, onDone?: () => void) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ hazardId, body }: { hazardId: number; body?: object }) =>
      customFetch(`/api/safety/scans/${scanId}/hazards/${hazardId}/action`, {
        method: "POST",
        body: JSON.stringify(body ?? {}),
      }),
    onSuccess: () => {
      toast({ title: "Corrective action created" });
      invalidate(queryClient, scanId);
      onDone?.();
    },
    onError: () => toast({ title: "Could not create action", variant: "destructive" }),
  });
}

export function useSignSafetyScan(scanId: number) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { role: "inspector" | "foreman"; signatureData: string }) =>
      customFetch(`/api/safety/scans/${scanId}/sign`, { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      toast({ title: "Signed" });
      invalidate(queryClient, scanId);
    },
    onError: () => toast({ title: "Sign-off failed", variant: "destructive" }),
  });
}
