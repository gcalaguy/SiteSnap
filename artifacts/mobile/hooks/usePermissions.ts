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
  viewDailyLog: true,
  viewReports: true,
  viewRFIs: false,
  viewPhotos: true,
  viewVault: false,
  viewEstimator: false,
  viewSiteScan: false,
  viewTradeHub: false,
  viewAskAI: true,
};

export type PermissionKey = keyof typeof ALL_TRUE;

export function usePermissions(): Record<PermissionKey, boolean> {
  const { data: me } = useGetMe();
  // Loading state — show everything to prevent flash-of-hidden-tab
  if (!me) return ALL_TRUE;
  // Server resolves permissions for all non-owners (workers + foremen)
  if (me.role === "owner" || !me.permissions) return ALL_TRUE;
  return { ...ALL_TRUE, ...me.permissions };
}
