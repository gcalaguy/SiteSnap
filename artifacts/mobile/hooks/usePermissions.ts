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
  viewRFIs: true,
  viewPhotos: true,
  viewVault: true,
  viewEstimator: true,
  viewSiteScan: true,
  viewTradeHub: true,
  viewAskAI: true,
};

export type PermissionKey = keyof typeof ALL_TRUE;

export function usePermissions(): Record<PermissionKey, boolean> {
  const { data: me } = useGetMe();
  // Loading state — show everything to prevent flash-of-hidden-tab
  if (!me) return ALL_TRUE;
  // Owners always see everything
  if (me.role === "owner") return ALL_TRUE;
  // Server-resolved permissions for workers & foremen (all true for foremen by default)
  if (me.permissions) return { ...ALL_TRUE, ...me.permissions };
  // Fallback: no permissions from server yet — show everything (foremen) or let tab bar handle
  return ALL_TRUE;
}
