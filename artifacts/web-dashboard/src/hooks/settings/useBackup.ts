import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";

export type BackupFrequency = "daily" | "weekly" | "monthly";
export type BackupDestinationType = "platform_storage" | "custom_cloud_storage" | "network_drive";
export type BackupStatus = "in_progress" | "completed" | "failed";

export interface BackupSchedule {
  frequency: BackupFrequency;
  enabled: boolean;
  retentionDays: number;
  destinationType: BackupDestinationType;
  destinationMountKey: string | null;
  destinationSubpath: string | null;
  hasCustomCloudConfig: boolean;
}

export interface BackupLog {
  id: number;
  status: BackupStatus;
  fileSizeBytes: number | null;
  destinationType: BackupDestinationType;
  destinationPath: string | null;
  errorMessage: string | null;
  startedAt: string;
  completedAt: string | null;
}

interface BackupScheduleResponse {
  schedule: BackupSchedule | null;
  availableMounts: string[];
  logs: BackupLog[];
}

export interface MountDirEntry {
  name: string;
  subpath: string;
}

export interface MountDirListing {
  subpath: string;
  entries: MountDirEntry[];
  exists: boolean;
  error?: string;
}

export interface SaveBackupSchedulePayload {
  frequency: BackupFrequency;
  enabled: boolean;
  retentionDays: number;
  destinationType: BackupDestinationType;
  destinationMountKey?: string;
  destinationSubpath?: string;
  customCloudConfig?: { bucketName: string; serviceAccountKeyJson: string };
}

export function useBackup(companyId: number | undefined) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);

  const queryKey = ["backup-schedule", companyId];

  const { data, isLoading } = useQuery<BackupScheduleResponse>({
    queryKey,
    queryFn: () => customFetch(`/api/companies/${companyId}/backup-schedule`),
    enabled: !!companyId,
    // Poll while a run is in progress so the history table / run-now button
    // pick up completion without the owner needing to refresh the page.
    refetchInterval: (query) =>
      (query.state.data?.logs ?? []).some((l) => l.status === "in_progress") ? 4000 : false,
  });

  async function saveSchedule(payload: SaveBackupSchedulePayload) {
    if (!companyId) return;
    setSaving(true);
    try {
      await customFetch(`/api/companies/${companyId}/backup-schedule`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      await qc.invalidateQueries({ queryKey });
      toast({ title: "Backup schedule saved" });
    } catch (e) {
      toast({
        title: "Failed to save backup schedule",
        description: e instanceof Error ? e.message : undefined,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  async function runNow() {
    if (!companyId) return;
    setRunning(true);
    try {
      await customFetch(`/api/companies/${companyId}/backups/run-now`, { method: "POST" });
      await qc.invalidateQueries({ queryKey });
      toast({ title: "Backup started" });
    } catch (e) {
      toast({
        title: "Failed to start backup",
        description: e instanceof Error ? e.message : undefined,
        variant: "destructive",
      });
    } finally {
      setRunning(false);
    }
  }

  function downloadHref(logId: number): string {
    return `/api/companies/${companyId}/backups/${logId}/download`;
  }

  async function browseMount(mountKey: string, subpath: string): Promise<MountDirListing> {
    if (!companyId) throw new Error("No active company");
    const qs = subpath ? `?subpath=${encodeURIComponent(subpath)}` : "";
    return customFetch(
      `/api/companies/${companyId}/backup-mounts/${encodeURIComponent(mountKey)}/browse${qs}`,
    );
  }

  const hasRunInProgress = (data?.logs ?? []).some((l) => l.status === "in_progress");

  return {
    schedule: data?.schedule ?? null,
    availableMounts: data?.availableMounts ?? [],
    logs: data?.logs ?? [],
    isLoading,
    saving,
    running: running || hasRunInProgress,
    saveSchedule,
    runNow,
    downloadHref,
    browseMount,
  };
}
