import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  customFetch,
  useListDocumentTemplates,
  useListDocumentTemplateMergeTags,
  usePreviewDocumentTemplate,
  useResetDocumentTemplate,
  getListDocumentTemplatesQueryKey,
  type DocumentTemplateType,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";

const TEMPLATE_ACCEPT =
  ".docx,.html,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/html";

export function useCustomDocumentTemplates() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [uploadingType, setUploadingType] = useState<DocumentTemplateType | null>(null);
  const [previewingType, setPreviewingType] = useState<DocumentTemplateType | null>(null);
  const [resettingType, setResettingType] = useState<DocumentTemplateType | null>(null);

  const { data, isLoading } = useListDocumentTemplates();
  const { data: mergeTagData } = useListDocumentTemplateMergeTags();
  const resetTemplate = useResetDocumentTemplate();
  const previewTemplate = usePreviewDocumentTemplate();

  async function handleUpload(file: File, documentType: DocumentTemplateType) {
    setUploadingType(documentType);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("documentType", documentType);
      await customFetch("/api/templates/upload", { method: "POST", body: formData });
      await queryClient.invalidateQueries({ queryKey: getListDocumentTemplatesQueryKey() });
      toast({ title: "Template uploaded", description: "It will be used on new documents of this type." });
    } catch (e) {
      toast({ title: "Upload failed", description: e instanceof Error ? e.message : undefined, variant: "destructive" });
    } finally {
      setUploadingType(null);
    }
  }

  async function handleReset(documentType: DocumentTemplateType) {
    setResettingType(documentType);
    try {
      await resetTemplate.mutateAsync({ documentType });
      await queryClient.invalidateQueries({ queryKey: getListDocumentTemplatesQueryKey() });
      toast({ title: "Reverted to default theme" });
    } catch (e) {
      toast({ title: "Failed to reset template", description: e instanceof Error ? e.message : undefined, variant: "destructive" });
    } finally {
      setResettingType(null);
    }
  }

  async function handlePreview(documentType: DocumentTemplateType) {
    setPreviewingType(documentType);
    try {
      const blob = await previewTemplate.mutateAsync({ data: { documentType } });
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      toast({ title: "Preview failed", description: e instanceof Error ? e.message : undefined, variant: "destructive" });
    } finally {
      setPreviewingType(null);
    }
  }

  return {
    templates: data?.templates ?? [],
    isLoading,
    mergeTagCatalog: mergeTagData?.catalog ?? {},
    uploadingType,
    previewingType,
    resettingType,
    handleUpload,
    handleReset,
    handlePreview,
    TEMPLATE_ACCEPT,
  };
}
