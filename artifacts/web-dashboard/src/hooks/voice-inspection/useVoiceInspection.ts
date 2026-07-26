import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";

export interface VoiceInspection {
  id: number;
  companyId: number;
  projectId: number;
  status: "complete" | "failed";
  audioObjectPath: string;
  audioDurationSeconds: number | null;
  transcript: string;
  gpsLat: string;
  gpsLng: string;
  gpsAltitude: string | null;
  gpsAccuracyM: string | null;
  gpsCapturedAt: string;
  gpsTimezone: string | null;
  siteAddress: string | null;
  equipmentOrArea: string | null;
  inspectionType: string | null;
  passStatus: "pass" | "fail" | "conditional" | null;
  hazardSummary: string | null;
  severityLevel: "low" | "medium" | "high" | "critical" | null;
  locationDetails: string | null;
  immediateActionRequired: boolean;
  recommendedActions: string[];
  capaTicketId: number | null;
  createdAt: string;
  submitterName: string | null;
  projectName: string | null;
}

export interface VoiceInspectionListItem
  extends Omit<VoiceInspection, "transcript" | "aiRawResponse"> {}

export interface VoiceInspectionFilters {
  projectId?: number;
  severityLevel?: string;
  submittedByUserId?: number;
  dateFrom?: string;
  dateTo?: string;
}

function invalidate(queryClient: ReturnType<typeof useQueryClient>, id?: number) {
  queryClient.invalidateQueries({ queryKey: ["voice-inspections"] });
  if (id != null) queryClient.invalidateQueries({ queryKey: ["voice-inspection", id] });
}

function buildParams(filters: VoiceInspectionFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.projectId) params.set("projectId", String(filters.projectId));
  if (filters.severityLevel) params.set("severityLevel", filters.severityLevel);
  if (filters.submittedByUserId) params.set("submittedByUserId", String(filters.submittedByUserId));
  if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) params.set("dateTo", filters.dateTo);
  return params;
}

export function useVoiceInspectionList(filters: VoiceInspectionFilters = {}) {
  const params = buildParams(filters);
  return useQuery<{ data: VoiceInspectionListItem[]; total: number }>({
    queryKey: ["voice-inspections", filters],
    queryFn: () => customFetch(`/api/voice-inspections${params.toString() ? `?${params}` : ""}`),
    retry: 1,
  });
}

export function useVoiceInspection(id: number | null) {
  return useQuery<VoiceInspection>({
    queryKey: ["voice-inspection", id],
    queryFn: () => customFetch(`/api/voice-inspections/${id}`),
    enabled: id != null,
    retry: 1,
  });
}

export function useCreateVoiceInspectionAction(inspectionId: number, onDone?: () => void) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body?: object) =>
      customFetch(`/api/voice-inspections/${inspectionId}/action`, {
        method: "POST",
        body: JSON.stringify(body ?? {}),
      }),
    onSuccess: () => {
      toast({ title: "Corrective action created" });
      invalidate(queryClient, inspectionId);
      onDone?.();
    },
    onError: () => toast({ title: "Could not create action", variant: "destructive" }),
  });
}

export function useUpdateVoiceInspectionProject(inspectionId: number) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (projectId: number) =>
      customFetch(`/api/voice-inspections/${inspectionId}`, {
        method: "PATCH",
        body: JSON.stringify({ projectId }),
      }),
    onSuccess: () => {
      toast({ title: "Project updated" });
      invalidate(queryClient, inspectionId);
    },
    onError: () => toast({ title: "Could not update project", variant: "destructive" }),
  });
}
