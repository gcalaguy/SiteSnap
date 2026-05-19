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
};

export type PermissionKey = keyof typeof ALL_TRUE;

export function usePermissions(): Record<PermissionKey, boolean> {
  const { data: me } = useGetMe();
  // Owners always get full access (server also enforces this, guarding here
  // prevents flash-of-hidden-tab during initial load)
  if (!me || me.role === "owner") return ALL_TRUE;
  return { ...ALL_TRUE, ...(me.permissions ?? {}) };
}
