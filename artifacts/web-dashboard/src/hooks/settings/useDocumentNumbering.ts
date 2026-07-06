import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import {
  useGetCompanySettings,
  getGetCompanySettingsQueryKey,
  useUpdateCompanyDocumentSettings,
  type Company,
} from "@workspace/api-client-react";
import { UpdateCompanyDocumentSettingsBody } from "@workspace/api-zod";
import { useToast } from "@/hooks/use-toast";

export const docSettingsSchema = UpdateCompanyDocumentSettingsBody.extend({
  quoteNumberPrefix: z
    .string()
    .min(1, "Quote prefix is required")
    .max(10, "Max 10 characters")
    .regex(/^\S+$/, "No spaces allowed"),
  invoiceNumberPrefix: z
    .string()
    .min(1, "Invoice prefix is required")
    .max(10, "Max 10 characters")
    .regex(/^\S+$/, "No spaces allowed"),
  quoteStartNumber: z
    .number()
    .int("Must be a whole number")
    .min(1, "Must be at least 1"),
  invoiceStartNumber: z
    .number()
    .int("Must be a whole number")
    .min(1, "Must be at least 1"),
});

export function useDocumentNumbering(company: Company | undefined | null) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const companyId = company?.id;

  const { data: settings, isLoading } = useGetCompanySettings(companyId ?? 0, {
    query: { queryKey: getGetCompanySettingsQueryKey(companyId ?? 0), enabled: !!companyId },
  });

  const [quotePrefix, setQuotePrefix] = useState("");
  const [invoicePrefix, setInvoicePrefix] = useState("");
  const [quoteStart, setQuoteStart] = useState(1);
  const [invoiceStart, setInvoiceStart] = useState(1);
  const [quoteTerms, setQuoteTerms] = useState("");
  const [invoiceNotes, setInvoiceNotes] = useState("");

  const saveDocSettings = useUpdateCompanyDocumentSettings();

  const errors = useMemo(() => {
    const result = docSettingsSchema.safeParse({
      quoteNumberPrefix: quotePrefix.trim(),
      invoiceNumberPrefix: invoicePrefix.trim(),
      quoteStartNumber: quoteStart,
      invoiceStartNumber: invoiceStart,
    });
    if (result.success) return {} as Record<string, string>;
    return Object.fromEntries(
      result.error.issues.map((e) => [String(e.path[0]), e.message])
    );
  }, [quotePrefix, invoicePrefix, quoteStart, invoiceStart]);

  const hasErrors = Object.keys(errors).length > 0;

  useEffect(() => {
    if (settings) {
      setQuotePrefix(settings.quoteNumberPrefix ?? "QUO");
      setInvoicePrefix(settings.invoiceNumberPrefix ?? "INV");
      setQuoteStart(settings.quoteStartNumber ?? 1);
      setInvoiceStart(settings.invoiceStartNumber ?? 1);
      setQuoteTerms(settings.defaultQuoteTerms ?? "");
      setInvoiceNotes(settings.defaultInvoiceNotes ?? "");
    }
  }, [settings]);

  async function handleSave() {
    if (!companyId) return;
    const payload = {
      quoteNumberPrefix: quotePrefix.trim(),
      invoiceNumberPrefix: invoicePrefix.trim(),
      quoteStartNumber: Math.max(1, Number(quoteStart) || 1),
      invoiceStartNumber: Math.max(1, Number(invoiceStart) || 1),
      defaultQuoteTerms: quoteTerms.trim() || null,
      defaultInvoiceNotes: invoiceNotes.trim() || null,
    };
    const validation = docSettingsSchema.safeParse(payload);
    if (!validation.success) {
      toast({ title: "Please fix the highlighted errors before saving", variant: "destructive" });
      return;
    }
    try {
      await saveDocSettings.mutateAsync({ companyId, data: payload });
      queryClient.invalidateQueries({ queryKey: getGetCompanySettingsQueryKey(companyId) });
      toast({ title: "Document settings saved" });
    } catch (e) {
      toast({ title: "Failed to save settings", description: e instanceof Error ? e.message : undefined, variant: "destructive" });
    }
  }

  return {
    isLoading,
    quotePrefix, setQuotePrefix,
    invoicePrefix, setInvoicePrefix,
    quoteStart, setQuoteStart,
    invoiceStart, setInvoiceStart,
    quoteTerms, setQuoteTerms,
    invoiceNotes, setInvoiceNotes,
    errors, hasErrors,
    handleSave,
    isSaving: saveDocSettings.isPending,
  };
}
