import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";

export interface PackageElementSummary {
  element: string;
  name: string;
  score: number;
  totalEntries: number;
  failCount: number;
  passCount: number;
}

export interface AuditPackage {
  id: number;
  label: string;
  status: "generating" | "ready" | "failed";
  periodStart: string | null;
  periodEnd: string | null;
  fileSizeBytes: number | null;
  totalEntries: number;
  totalInspections: number;
  totalWorkers: number;
  checksum: string | null;
  elementSummary: PackageElementSummary[] | null;
  generatedAt: string | null;
  createdAt: string;
  generatedByFirst: string | null;
  generatedByLast: string | null;
}

export function useAuditPackages() {
  return useQuery<AuditPackage[]>({
    queryKey: ["cor-audit-packages"],
    queryFn: () => customFetch("/api/cor/audit-packages"),
    retry: 1,
  });
}

function extractErrorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === "object" && "message" in err && typeof (err as { message?: unknown }).message === "string") {
    return (err as { message: string }).message;
  }
  return fallback;
}

export async function downloadAuditPackage(body: {
  label?: string;
  periodStart?: string;
  periodEnd?: string;
}): Promise<void> {
  const response = await fetch("/api/cor/audit-package/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const err: unknown = await response.json().catch(() => null);
    throw new Error(extractErrorMessage(err, `Generation failed (${response.status})`));
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const dateStr = new Date().toISOString().slice(0, 10);
  a.download = `COR_Audit_Package_${dateStr}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function downloadPackageById(packageId: number): Promise<void> {
  const response = await fetch(`/api/cor/audit-package/${packageId}/download`, {
    method: "GET",
    credentials: "include",
  });
  if (!response.ok) {
    const err: unknown = await response.json().catch(() => null);
    throw new Error(extractErrorMessage(err, `Download failed (${response.status})`));
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const dateStr = new Date().toISOString().slice(0, 10);
  a.download = `COR_Audit_Package_${dateStr}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
