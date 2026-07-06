import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { customFetch, useUpdateCompanyLogo, type Company } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { useSignedUrl } from "@/hooks/useSignedUrl";

export function useCompanyLogo(company: Company) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: logoUrl, isLoading: logoUrlLoading } = useSignedUrl(company.logoPath);
  const updateLogo = useUpdateCompanyLogo();

  async function handleLogoUpload(file: File) {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const { objectPath } = await customFetch<{ objectPath: string }>("/api/storage/uploads/company-asset", {
        method: "POST",
        body: formData,
      });
      await updateLogo.mutateAsync({ companyId: company.id, data: { logoPath: objectPath } });
      queryClient.invalidateQueries({ queryKey: ["/api/users/me"] });
      toast({ title: "Logo uploaded", description: "Your logo will appear on exported estimates." });
    } catch (e) {
      toast({ title: "Upload failed", description: e instanceof Error ? e.message : undefined, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  }

  async function handleRemoveLogo() {
    try {
      await updateLogo.mutateAsync({ companyId: company.id, data: { logoPath: "" } });
      queryClient.invalidateQueries({ queryKey: ["/api/users/me"] });
      toast({ title: "Logo removed" });
    } catch {
      toast({ title: "Failed to remove logo", variant: "destructive" });
    }
  }

  return { logoUrl, logoUrlLoading, uploading, fileInputRef, handleLogoUpload, handleRemoveLogo };
}
