import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import type { CompanyMember } from "@/components/cor-compliance/shared";

export function useCompanyMembers() {
  return useQuery<{ members: CompanyMember[] }>({
    queryKey: ["cor-members"],
    queryFn: () => customFetch("/api/cor/members"),
    retry: 1,
    staleTime: 60000,
  });
}
