import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListCompanyMembers,
  useGetMemberPermissions,
  useSetMemberPermissions,
  getListCompanyMembersQueryKey,
  getGetMemberPermissionsQueryKey,
  type MemberPermissions,
  type UserWithCompany,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";

// Worker defaults — must stay in sync with WORKER_DEFAULTS in api-server/src/lib/permissionGate.ts
export const DEFAULT_PERMISSIONS: MemberPermissions = {
  viewQuotes: false,
  viewTimesheets: true,
  viewFinancials: false,
  viewDocuments: true,
  viewSchedules: true,
  viewClientMessages: true,
  viewRiskTab: true,
  viewSafetyTab: true,
  viewInspectTab: true,
  manageQuotes: false,
  submitExpenses: true,
  viewAllProjects: false,
  viewDailyLog: true,
  viewReports: true,
  viewRFIs: false,
  viewPhotos: true,
  viewVault: false,
  viewEstimator: false,
  viewTradeHub: false,
  viewAskAI: true,
};

export const ALL_TRUE_PERMISSIONS: MemberPermissions = {
  viewQuotes: true, viewTimesheets: true, viewFinancials: true, viewDocuments: true,
  viewSchedules: true, viewClientMessages: true, viewRiskTab: true, viewSafetyTab: true,
  viewInspectTab: true, manageQuotes: true, submitExpenses: true, viewAllProjects: true,
  viewDailyLog: true, viewReports: true, viewRFIs: true, viewPhotos: true, viewVault: true,
  viewEstimator: true, viewTradeHub: true, viewAskAI: true,
};

export function useMemberPermissions(companyId: number, ownerId: number, enabled: boolean) {
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: members = [] } = useListCompanyMembers(companyId, {
    query: { queryKey: getListCompanyMembersQueryKey(companyId), enabled },
  });

  const editableMembers = members.filter(
    (m: UserWithCompany) => m.id !== ownerId
  );

  const { data: rawPerms, isLoading: permsLoading } = useGetMemberPermissions(
    companyId,
    selectedUserId ?? 0,
    {
      query: {
        queryKey: getGetMemberPermissionsQueryKey(companyId, selectedUserId ?? 0),
        enabled: !!selectedUserId && enabled,
      },
    }
  );

  const setPerms = useSetMemberPermissions({
    mutation: {
      onMutate: async ({ data }) => {
        if (!selectedUserId) return;
        const queryKey = getGetMemberPermissionsQueryKey(companyId, selectedUserId);
        await queryClient.cancelQueries({ queryKey });
        const previous = queryClient.getQueryData<MemberPermissions>(queryKey);
        queryClient.setQueryData<MemberPermissions>(queryKey, data);
        return { previous, queryKey };
      },
      onError: (_err, _vars, context) => {
        if (context?.previous && context.queryKey) {
          queryClient.setQueryData(context.queryKey, context.previous);
        }
        toast({ title: "Error", description: "Failed to save permissions.", variant: "destructive" });
      },
      onSuccess: () => {
        toast({ title: "Permissions saved", description: "Changes take effect on next app refresh." });
      },
      onSettled: (_data, _err, _vars, context) => {
        if (context?.queryKey) {
          queryClient.invalidateQueries({ queryKey: context.queryKey });
        }
      },
    },
  });

  const selectedMember = editableMembers.find((m) => m.id === selectedUserId);
  const selectedRole = selectedMember?.role ?? "worker";

  const hasCustomPerms = rawPerms != null && Object.keys(rawPerms).length > 0;
  const roleDefaults = selectedRole === "worker" ? DEFAULT_PERMISSIONS : ALL_TRUE_PERMISSIONS;
  const resolved = (hasCustomPerms ? rawPerms : roleDefaults) as MemberPermissions;

  function toggle(key: keyof MemberPermissions) {
    if (!selectedUserId) return;
    const next: MemberPermissions = { ...resolved, [key]: !resolved[key] };
    setPerms.mutate({ companyId, userId: selectedUserId, data: next });
  }

  function resetToDefaults() {
    if (!selectedUserId) return;
    setPerms.mutate({ companyId, userId: selectedUserId, data: roleDefaults });
  }

  return {
    selectedUserId, setSelectedUserId,
    editableMembers, permsLoading, resolved,
    toggle, resetToDefaults,
    isSaving: setPerms.isPending,
  };
}
