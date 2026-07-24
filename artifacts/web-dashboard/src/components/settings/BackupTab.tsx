import { useState } from "react";
import { format } from "date-fns";
import {
  DatabaseBackup,
  ChevronDown,
  ChevronRight,
  Loader2,
  Download,
  CheckCircle,
  XCircle,
  Clock,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  useBackup,
  type BackupDestinationType,
  type BackupFrequency,
  type BackupLog,
  type BackupStatus,
} from "@/hooks/settings/useBackup";

const RETENTION_OPTIONS = [30, 60, 90, 365] as const;

function formatBytes(bytes: number | null): string {
  if (bytes === null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = -1;
  do {
    value /= 1024;
    unitIndex++;
  } while (value >= 1024 && unitIndex < units.length - 1);
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

function destinationLabel(type: BackupDestinationType): string {
  if (type === "platform_storage") return "SiteSnap Cloud Storage";
  if (type === "custom_cloud_storage") return "Custom Cloud Storage";
  return "Network / Local Drive";
}

function StatusBadge({ status }: { status: BackupStatus }) {
  if (status === "completed") {
    return (
      <Badge className="bg-green-600 text-white gap-1">
        <CheckCircle className="h-3 w-3" /> Completed
      </Badge>
    );
  }
  if (status === "failed") {
    return (
      <Badge className="bg-red-600 text-white gap-1">
        <XCircle className="h-3 w-3" /> Failed
      </Badge>
    );
  }
  return (
    <Badge className="bg-blue-600 text-white gap-1">
      <Loader2 className="h-3 w-3 animate-spin" /> In Progress
    </Badge>
  );
}

export function BackupTab({ companyId }: { companyId: number }) {
  const [collapsed, setCollapsed] = useState(false);
  const { schedule, availableMounts, logs, isLoading, saving, running, saveSchedule, runNow, downloadHref } =
    useBackup(companyId);

  const [frequency, setFrequency] = useState<BackupFrequency>(schedule?.frequency ?? "weekly");
  const [enabled, setEnabled] = useState(schedule?.enabled ?? true);
  const [retentionDays, setRetentionDays] = useState<number>(schedule?.retentionDays ?? 90);
  const [destinationType, setDestinationType] = useState<BackupDestinationType>(
    schedule?.destinationType ?? "platform_storage",
  );
  const [mountKey, setMountKey] = useState(schedule?.destinationMountKey ?? "");
  const [subpath, setSubpath] = useState(schedule?.destinationSubpath ?? "");
  const [bucketName, setBucketName] = useState("");
  const [serviceAccountKeyJson, setServiceAccountKeyJson] = useState("");
  const [initialized, setInitialized] = useState(false);

  if (!initialized && schedule) {
    setFrequency(schedule.frequency);
    setEnabled(schedule.enabled);
    setRetentionDays(schedule.retentionDays);
    setDestinationType(schedule.destinationType);
    setMountKey(schedule.destinationMountKey ?? "");
    setSubpath(schedule.destinationSubpath ?? "");
    setInitialized(true);
  }

  async function handleSave() {
    await saveSchedule({
      frequency,
      enabled,
      retentionDays,
      destinationType,
      destinationMountKey: destinationType === "network_drive" ? mountKey : undefined,
      destinationSubpath: destinationType === "network_drive" ? subpath : undefined,
      customCloudConfig:
        destinationType === "custom_cloud_storage" && bucketName && serviceAccountKeyJson
          ? { bucketName, serviceAccountKeyJson }
          : undefined,
    });
  }

  return (
    <Card>
      <button onClick={() => setCollapsed((c) => !c)} className="w-full text-left">
        <CardHeader className="flex flex-row items-center justify-between py-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <DatabaseBackup className="h-5 w-5 text-primary" />
              Backups &amp; System Recovery
            </CardTitle>
            <CardDescription>
              Configure recurring backups of your projects, reports, expenses, quotes, and uploaded files.
            </CardDescription>
          </div>
          {collapsed ? (
            <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0 ml-4" />
          ) : (
            <ChevronDown className="h-5 w-5 text-muted-foreground shrink-0 ml-4" />
          )}
        </CardHeader>
      </button>

      {!collapsed && (
        <CardContent className="space-y-6">
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
            </div>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Frequency</Label>
                  <Select value={frequency} onValueChange={(v) => setFrequency(v as BackupFrequency)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="daily">Daily</SelectItem>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label>Retention Period</Label>
                  <Select
                    value={String(retentionDays)}
                    onValueChange={(v) => setRetentionDays(Number(v))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {RETENTION_OPTIONS.map((days) => (
                        <SelectItem key={days} value={String(days)}>
                          {days} Days
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex items-center justify-between rounded-md border border-border bg-muted/30 p-3">
                <div className="space-y-0.5">
                  <p className="text-sm font-medium">Enable automated backups</p>
                  <p className="text-xs text-muted-foreground">
                    Runs automatically on the schedule above. You can still export on demand below.
                  </p>
                </div>
                <button
                  onClick={() => setEnabled((e) => !e)}
                  className={cn(
                    "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                    enabled ? "bg-primary" : "bg-input",
                  )}
                  role="switch"
                  aria-checked={enabled}
                >
                  <span
                    className={cn(
                      "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-background shadow ring-0 transition duration-200 ease-in-out",
                      enabled ? "translate-x-5" : "translate-x-0",
                    )}
                  />
                </button>
              </div>

              <div className="space-y-3">
                <Label>Destination</Label>
                <RadioGroup
                  value={destinationType}
                  onValueChange={(v) => setDestinationType(v as BackupDestinationType)}
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="platform_storage" id="dest-platform" />
                    <Label htmlFor="dest-platform" className="font-normal cursor-pointer">
                      SiteSnap Cloud Storage (default)
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="custom_cloud_storage" id="dest-custom-cloud" />
                    <Label htmlFor="dest-custom-cloud" className="font-normal cursor-pointer">
                      Your Own Cloud Storage Bucket
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="network_drive" id="dest-network" disabled={availableMounts.length === 0} />
                    <Label
                      htmlFor="dest-network"
                      className={cn("font-normal cursor-pointer", availableMounts.length === 0 && "opacity-50")}
                    >
                      Network / Local Drive{availableMounts.length === 0 ? " (not configured)" : ""}
                    </Label>
                  </div>
                </RadioGroup>

                {destinationType === "custom_cloud_storage" && (
                  <div className="grid gap-3 pl-6 pt-1">
                    <div className="space-y-1.5">
                      <Label htmlFor="bucket-name">Bucket Name</Label>
                      <Input
                        id="bucket-name"
                        placeholder="my-company-backups"
                        value={bucketName}
                        onChange={(e) => setBucketName(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="service-account-key">Service Account Key (JSON)</Label>
                      <Textarea
                        id="service-account-key"
                        rows={4}
                        placeholder={
                          schedule?.hasCustomCloudConfig
                            ? "Already configured — paste a new key to replace it"
                            : '{ "type": "service_account", ... }'
                        }
                        value={serviceAccountKeyJson}
                        onChange={(e) => setServiceAccountKeyJson(e.target.value)}
                        className="font-mono text-xs"
                      />
                    </div>
                  </div>
                )}

                {destinationType === "network_drive" && (
                  <div className="grid gap-3 pl-6 pt-1">
                    <div className="space-y-1.5">
                      <Label>Mount</Label>
                      <Select value={mountKey} onValueChange={setMountKey}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a configured mount" />
                        </SelectTrigger>
                        <SelectContent>
                          {availableMounts.map((key) => (
                            <SelectItem key={key} value={key}>
                              {key}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="subpath">Subdirectory (optional)</Label>
                      <Input
                        id="subpath"
                        placeholder="company-backups"
                        value={subpath}
                        onChange={(e) => setSubpath(e.target.value)}
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-border">
                <Button onClick={handleSave} disabled={saving}>
                  {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Save Backup Settings
                </Button>
                <Button variant="outline" onClick={runNow} disabled={running}>
                  {running ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <DatabaseBackup className="h-4 w-4 mr-2" />
                  )}
                  {running ? "Backup in progress…" : "Export & Backup All Data Now"}
                </Button>
              </div>
            </>
          )}

          <div className="space-y-2 pt-2">
            <p className="text-sm font-medium">Backup History</p>
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left font-medium text-muted-foreground py-2.5 px-3">
                      <span className="inline-flex items-center gap-1.5">
                        <Clock size={13} /> Date
                      </span>
                    </th>
                    <th className="text-left font-medium text-muted-foreground py-2.5 px-3">Status</th>
                    <th className="text-left font-medium text-muted-foreground py-2.5 px-3">Destination</th>
                    <th className="text-left font-medium text-muted-foreground py-2.5 px-3">Size</th>
                    <th className="text-left font-medium text-muted-foreground py-2.5 px-3">Download</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.length === 0 && !isLoading && (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-muted-foreground text-sm">
                        No backups yet.
                      </td>
                    </tr>
                  )}
                  {logs.map((log: BackupLog) => (
                    <tr key={log.id} className="border-b border-border last:border-0 hover:bg-muted/40 transition-colors">
                      <td className="py-2.5 px-3 text-xs text-muted-foreground whitespace-nowrap">
                        {format(new Date(log.startedAt), "MMM d, yyyy h:mm a")}
                      </td>
                      <td className="py-2.5 px-3">
                        <StatusBadge status={log.status} />
                      </td>
                      <td className="py-2.5 px-3 text-xs text-foreground">{destinationLabel(log.destinationType)}</td>
                      <td className="py-2.5 px-3 text-xs text-foreground">{formatBytes(log.fileSizeBytes)}</td>
                      <td className="py-2.5 px-3">
                        {log.status === "completed" && log.destinationType !== "custom_cloud_storage" ? (
                          <a
                            href={downloadHref(log.id)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                          >
                            <Download className="h-3.5 w-3.5" /> Download
                          </a>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
