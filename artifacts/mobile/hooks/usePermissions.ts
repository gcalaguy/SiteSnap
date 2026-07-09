import { useGetMe } from "@workspace/api-client-react";

const ALL_TRUE = {
  viewQuotes: true,
  viewTimesheets: true,
  viewFinancials: true,
  viewDocuments: true,
  viewSchedules: true,
  viewClientMessages: true,
  viewRiskTab: true,
  viewSafetyTab: true,
  viewInspectTab: true,
  manageQuotes: true,
  submitExpenses: true,
  viewAllProjects: true,
  viewReports: true,
  viewRFIs: true,
  viewPhotos: true,
  viewVault: true,
  viewEstimator: true,
  viewTradeHub: true,
  viewAskAI: true,
};

// P1 fix: deny all permissions during loading / unauthenticated state.
// Previously returned ALL_TRUE which exposed financials, RFIs, and vault to
// workers during the load window. UI should show a skeleton/loading state.
const ALL_FALSE: Record<PermissionKey, boolean> = Object.fromEntries(
  Object.keys(ALL_TRUE).map((k) => [k, false])
) as Record<PermissionKey, boolean>;

export type PermissionKey = keyof typeof ALL_TRUE;

export function usePermissions(): Record<PermissionKey, boolean> & { isLoading: boolean } {
  const { data: me, isLoading } = useGetMe();

  // While loading or unauthenticated, deny everything (fail-closed)
  if (isLoading || !me) return { ...ALL_FALSE, isLoading: isLoading ?? true };

  // Owners always see everything
  if (me.role === "owner") return { ...ALL_TRUE, isLoading: false };

  // Server-resolved permissions for workers & foremen
  if (me.permissions) return { ...ALL_TRUE, ...me.permissions, isLoading: false };

  // Foremen with no explicit permissions: grant all by default
  if (me.role === "foreman") return { ...ALL_TRUE, isLoading: false };

  // Workers with no resolved permissions: deny sensitive tabs.
  // Kept in sync with WORKER_DEFAULTS in api-server/src/lib/permissionGate.ts.
  return {
    ...ALL_FALSE,
    viewTimesheets: true,
    viewDocuments: true,
    viewSchedules: true,
    viewSafetyTab: true,
    viewPhotos: true,
    submitExpenses: true,
    viewTradeHub: false,
    viewAskAI: true,
    viewVault: true,
    viewClientMessages: true,
    viewRiskTab: true,
    viewInspectTab: true,
    isLoading: false,
  };
}
