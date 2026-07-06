import {
  useGetMe, useListCompanyMembers, getListCompanyMembersQueryKey, type UserWithCompany,
} from "@workspace/api-client-react";

/** Members of the current user's active company, for schedule/checkout assignment pickers. */
export function useActiveCompanyMembers(): { members: UserWithCompany[] } {
  const { data: me } = useGetMe();
  const companyId = me?.activeCompanyId ?? 0;
  const { data } = useListCompanyMembers(companyId, {
    query: {
      queryKey: getListCompanyMembersQueryKey(companyId),
      enabled: !!me?.activeCompanyId,
      staleTime: 60_000,
    },
  });
  return { members: data ?? [] };
}
