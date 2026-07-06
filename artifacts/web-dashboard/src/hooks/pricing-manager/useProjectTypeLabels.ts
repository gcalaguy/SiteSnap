import { useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch, getListCostModelsQueryKey, getGetCompanyQueryKey } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";

function buildCustomLabels(projectTypes: Record<string, string>, isDefault: (k: string) => boolean) {
  const custom: Record<string, string> = {};
  for (const [k, v] of Object.entries(projectTypes)) {
    if (!isDefault(k)) custom[k] = v;
  }
  return custom;
}

/** Creates or renames a custom project type label via a company config PATCH. */
export function useUpdateProjectTypeLabel(
  companyId: number,
  projectTypes: Record<string, string>,
  isDefault: (k: string) => boolean,
  onSuccess?: () => void,
) {
  const { toast } = useToast();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (payload: { key: string; label: string; isEdit: boolean }) => {
      const custom = buildCustomLabels(projectTypes, isDefault);
      return customFetch(`/api/companies/${companyId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estimatorConfig: { projectTypeLabels: { ...custom, [payload.key]: payload.label } } }),
      });
    },
    onSuccess: (_data, variables) => {
      void qc.invalidateQueries({ queryKey: getListCostModelsQueryKey() });
      void qc.invalidateQueries({ queryKey: getGetCompanyQueryKey(companyId) });
      toast({ title: variables.isEdit ? "Label updated" : "Label created" });
      onSuccess?.();
    },
    onError: () => toast({ title: "Failed to save", variant: "destructive" }),
  });
}

/** Removes a custom project type label via a company config PATCH. */
export function useDeleteProjectTypeLabel(
  companyId: number,
  projectTypes: Record<string, string>,
  isDefault: (k: string) => boolean,
  onSuccess?: () => void,
) {
  const { toast } = useToast();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (key: string) => {
      const custom = buildCustomLabels(projectTypes, isDefault);
      delete custom[key];
      return customFetch(`/api/companies/${companyId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estimatorConfig: { projectTypeLabels: custom } }),
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: getListCostModelsQueryKey() });
      void qc.invalidateQueries({ queryKey: getGetCompanyQueryKey(companyId) });
      toast({ title: "Label deleted" });
      onSuccess?.();
    },
    onError: () => toast({ title: "Failed to delete", variant: "destructive" }),
  });
}
