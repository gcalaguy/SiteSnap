import { useEffect, useState } from "react";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import {
  useGetQuickBooksStatus,
  getGetQuickBooksStatusQueryKey,
  getQuickBooksAuthUrl,
  useDisconnectQuickBooks,
  useSyncQuickBooksInvoices,
  useSyncQuickBooksCosts,
} from "@workspace/api-client-react";
import { formatDateTime } from "@/lib/format";

interface SyncMessage {
  type: "ok" | "error";
  text: string;
}

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

export function useQuickBooks() {
  const qc = useQueryClient();
  const [syncMsg, setSyncMsg] = useState<SyncMessage | null>(null);

  const { data: qb, isLoading: qbLoading } = useGetQuickBooksStatus({
    query: { queryKey: getGetQuickBooksStatusQueryKey(), refetchOnWindowFocus: false },
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const qbParam = params.get("qb");
    if (qbParam === "connected") {
      qc.invalidateQueries({ queryKey: getGetQuickBooksStatusQueryKey() });
      setSyncMsg({ type: "ok", text: "QuickBooks connected successfully!" });
      window.history.replaceState({}, "", window.location.pathname);
    } else if (qbParam === "error") {
      const reason = params.get("reason") ?? "unknown error";
      setSyncMsg({ type: "error", text: `Connection failed: ${reason}` });
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [qc]);

  const connectMutation = useMutation({
    mutationFn: async () => {
      const data = await getQuickBooksAuthUrl();
      window.location.href = data.url;
    },
    onError: (err: unknown) => setSyncMsg({ type: "error", text: errorMessage(err, "Failed to get auth URL") }),
  });

  const disconnectMutation = useDisconnectQuickBooks({
    mutation: {
      onSuccess: () => { qc.invalidateQueries({ queryKey: getGetQuickBooksStatusQueryKey() }); setSyncMsg(null); },
      onError: (err: unknown) => setSyncMsg({ type: "error", text: errorMessage(err, "Disconnect failed") }),
    },
  });

  const syncInvoices = useSyncQuickBooksInvoices({
    mutation: {
      onSuccess: (data) => {
        qc.invalidateQueries({ queryKey: getGetQuickBooksStatusQueryKey() });
        const errText = data.errors.length ? ` (${data.errors.length} errors)` : "";
        setSyncMsg({ type: data.errors.length ? "error" : "ok", text: `Synced ${data.synced}/${data.total} invoices to QuickBooks${errText}` });
      },
      onError: (err: unknown) => setSyncMsg({ type: "error", text: errorMessage(err, "Invoice sync failed") }),
    },
  });

  const syncCosts = useSyncQuickBooksCosts({
    mutation: {
      onSuccess: (data) => {
        qc.invalidateQueries({ queryKey: getGetQuickBooksStatusQueryKey() });
        const errText = data.errors.length ? ` (${data.errors.length} errors)` : "";
        setSyncMsg({ type: data.errors.length ? "error" : "ok", text: `Synced ${data.synced}/${data.total} cost entries to QuickBooks${errText}` });
      },
      onError: (err: unknown) => setSyncMsg({ type: "error", text: errorMessage(err, "Cost sync failed") }),
    },
  });

  const fmtDate = (d: string | null | undefined) => d ? formatDateTime(d) : "Never";
  const isSyncing = syncInvoices.isPending || syncCosts.isPending;

  return {
    qb, qbLoading, syncMsg,
    connectMutation, disconnectMutation, syncInvoices, syncCosts,
    fmtDate, isSyncing,
  };
}
