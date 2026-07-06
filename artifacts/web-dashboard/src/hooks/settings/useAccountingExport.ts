import { useState } from "react";
import {
  useGetMe,
  useGetBillingSeats,
  useGetAccountingExportData,
  getGetAccountingExportDataQueryKey,
  getAccountingExportData,
} from "@workspace/api-client-react";
import { useCompanyFeatures } from "@/components/FeatureGuard";
import { mirrorBlob } from "@/lib/driveSyncPipeline";

export function useAccountingExport(collapsed: boolean) {
  const { data: user } = useGetMe();
  const company = user?.company;
  const companyId = company?.id;
  const [exporting, setExporting] = useState(false);
  const { data: seatInfo } = useGetBillingSeats();
  const { data: featureData } = useCompanyFeatures(companyId);

  const hasVaultAccess =
    featureData?.features?.includes("AUDIT_VAULT") ||
    seatInfo?.planName?.toLowerCase() === "enterprise";

  const { data: exportBlob, isLoading: exportLoading } = useGetAccountingExportData(companyId ?? 0, {
    query: { queryKey: getGetAccountingExportDataQueryKey(companyId ?? 0), enabled: !!companyId && !collapsed },
  });

  async function handleExport() {
    setExporting(true);
    try {
      const blob = exportBlob ?? await getAccountingExportData(companyId!);
      const url = URL.createObjectURL(blob);
      const filename = `site-snap-accountant-export-${new Date().toISOString().split("T")[0]}.zip`;
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      await mirrorBlob(filename, blob);
    } finally {
      setExporting(false);
    }
  }

  return { hasVaultAccess, exportBlob, exportLoading, exporting, handleExport };
}
