import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  customFetch,
  useUpdateCompanyQuoteTemplate,
  useUpdateCompanyInvoiceTemplate,
  type Company,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";

export type TemplateType = "quote" | "invoice";

export function useDocumentTemplates(company: Company) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [uploadingType, setUploadingType] = useState<TemplateType | null>(null);

  const updateQuoteTemplate = useUpdateCompanyQuoteTemplate();
  const updateInvoiceTemplate = useUpdateCompanyInvoiceTemplate();

  async function handleUpload(file: File, type: TemplateType) {
    setUploadingType(type);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const { objectPath } = await customFetch<{ objectPath: string }>("/api/storage/uploads/company-asset", {
        method: "POST",
        body: formData,
      });
      if (type === "quote") {
        await updateQuoteTemplate.mutateAsync({ companyId: company.id, data: { templatePath: objectPath } });
      } else {
        await updateInvoiceTemplate.mutateAsync({ companyId: company.id, data: { templatePath: objectPath } });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/users/me"] });
      toast({ title: `${type === "quote" ? "Quote" : "Invoice"} template uploaded`, description: "It will appear on all new PDFs." });
    } catch (e) {
      toast({ title: "Upload failed", description: e instanceof Error ? e.message : undefined, variant: "destructive" });
    } finally {
      setUploadingType(null);
    }
  }

  async function handleRemove(type: TemplateType) {
    try {
      if (type === "quote") {
        await updateQuoteTemplate.mutateAsync({ companyId: company.id, data: { templatePath: null } });
      } else {
        await updateInvoiceTemplate.mutateAsync({ companyId: company.id, data: { templatePath: null } });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/users/me"] });
      toast({ title: `${type === "quote" ? "Quote" : "Invoice"} template removed` });
    } catch {
      toast({ title: "Failed to remove template", variant: "destructive" });
    }
  }

  return { uploadingType, handleUpload, handleRemove };
}
