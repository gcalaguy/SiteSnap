import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch, useListContacts, useListProjects } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Save, Send, Loader2, ShieldAlert, User, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CharCountedTextarea } from "@/components/ui/char-counted-textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useDraftRecovery } from "@/hooks/useDraftRecovery";
import { DraftBanner } from "@/components/DraftBanner";

const GOLD = "#C9A84C";
const BLACK = "#111111";
const TEXTAREA_FIELD_MAX = 2_000;

interface FormField {
  id: string;
  label: string;
  type: "text" | "textarea" | "select" | "radio" | "checkbox" | "date" | "datetime-local" | "number";
  required: boolean;
  options?: string[];
}

interface FormTemplate {
  id: number;
  name: string;
  category: string;
  schema: { fields: FormField[] };
}

const categoryColor: Record<string, string> = {
  injury: "bg-red-100 text-red-700",
  safety: "bg-blue-100 text-blue-700",
  hazard: "bg-orange-100 text-orange-700",
  toolbox: "bg-green-100 text-green-700",
};

function FormFieldRenderer({
  field,
  value,
  onChange,
}: {
  field: FormField;
  value: any;
  onChange: (val: any) => void;
}) {
  const id = `field-${field.id}`;

  switch (field.type) {
    case "text":
    case "date":
    case "datetime-local":
    case "number":
      return (
        <Input
          id={id}
          type={field.type}
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          required={field.required}
          placeholder={field.required ? "Required" : "Optional"}
        />
      );

    case "textarea":
      return (
        <CharCountedTextarea
          id={id}
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value.slice(0, TEXTAREA_FIELD_MAX))}
          required={field.required}
          placeholder={field.required ? "Required" : "Optional"}
          rows={3}
          maxLength={TEXTAREA_FIELD_MAX}
        />
      );

    case "select":
      return (
        <Select value={value ?? ""} onValueChange={onChange}>
          <SelectTrigger id={id}>
            <SelectValue placeholder="Select an option…" />
          </SelectTrigger>
          <SelectContent>
            {field.options?.map((opt) => (
              <SelectItem key={opt} value={opt}>
                {opt}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );

    case "radio":
      return (
        <RadioGroup value={value ?? ""} onValueChange={onChange}>
          {field.options?.map((opt) => (
            <div key={opt} className="flex items-center space-x-2">
              <RadioGroupItem value={opt} id={`${id}-${opt}`} />
              <Label htmlFor={`${id}-${opt}`} className="font-normal cursor-pointer">
                {opt}
              </Label>
            </div>
          ))}
        </RadioGroup>
      );

    case "checkbox": {
      const selected: string[] = Array.isArray(value) ? value : [];
      return (
        <div className="space-y-2">
          {field.options?.map((opt) => (
            <div key={opt} className="flex items-center gap-2">
              <Checkbox
                id={`${id}-${opt}`}
                checked={selected.includes(opt)}
                onCheckedChange={(checked) => {
                  if (checked) {
                    onChange([...selected, opt]);
                  } else {
                    onChange(selected.filter((v) => v !== opt));
                  }
                }}
              />
              <Label htmlFor={`${id}-${opt}`} className="font-normal cursor-pointer">
                {opt}
              </Label>
            </div>
          ))}
        </div>
      );
    }

    default:
      return (
        <Input
          id={id}
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.required ? "Required" : "Optional"}
        />
      );
  }
}

export default function SafetySubmitPage() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const searchParams = new URLSearchParams(search);
  const templateParam = searchParams.get("template");

  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(
    templateParam ? parseInt(templateParam) : null
  );
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [selectedContactId, setSelectedContactId] = useState<number | null>(null);

  const draft = useDraftRecovery(
    `safety-submit:${templateParam ?? "none"}`,
    () => ({
      formData,
      selectedProjectId,
      selectedContactId,
    }),
    (state) => {
      if (state.formData && typeof state.formData === "object") setFormData(state.formData as Record<string, unknown>);
      if (typeof state.selectedProjectId === "number" || state.selectedProjectId === null) setSelectedProjectId(state.selectedProjectId as number | null);
      if (typeof state.selectedContactId === "number" || state.selectedContactId === null) setSelectedContactId(state.selectedContactId as number | null);
    }
  );

  const { data: templates = [], isLoading: loadingTemplates } = useQuery<FormTemplate[]>({
    queryKey: ["safety-templates"],
    queryFn: () => customFetch("/api/safety/templates"),
  });

  const { data: projects = [] } = useListProjects();
  const { data: contacts = [] } = useListContacts();

  useEffect(() => {
    if (templateParam && !isNaN(parseInt(templateParam))) {
      setSelectedTemplateId(parseInt(templateParam));
    }
  }, [templateParam]);

  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId);

  const saveMutation = useMutation({
    mutationFn: (payload: { status: "draft" | "submitted" }) =>
      customFetch("/api/safety/submissions", {
        method: "POST",
        body: JSON.stringify({
          templateId: selectedTemplateId,
          data: formData,
          status: payload.status,
          projectId: selectedProjectId,
          contactId: selectedContactId,
        }),
      }),
    onSuccess: (data: any, vars) => {
      queryClient.invalidateQueries({ queryKey: ["safety-submissions"] });
      draft.clearDraft();
      if (vars.status === "submitted") {
        toast({
          title: "Form Submitted",
          description: "Your safety form has been submitted. An AI summary is being generated.",
        });
      } else {
        toast({ title: "Draft Saved", description: "Your progress has been saved." });
      }
      setLocation(`/safety/submissions/${data.id}`);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save form.", variant: "destructive" });
    },
  });

  const handleFieldChange = (fieldId: string, value: any) => {
    setFormData((prev) => ({ ...prev, [fieldId]: value }));
  };

  const validateRequired = () => {
    if (!selectedTemplate) return false;
    const fields = selectedTemplate.schema?.fields ?? [];
    return fields.every((f) => {
      if (!f.required) return true;
      const v = formData[f.id];
      if (Array.isArray(v)) return v.length > 0;
      return v !== undefined && v !== null && v !== "";
    });
  };

  const hasTextareaAtLimit = () => {
    if (!selectedTemplate) return false;
    const fields = selectedTemplate.schema?.fields ?? [];
    return fields.some((f) => f.type === "textarea" && typeof formData[f.id] === "string" && (formData[f.id] as string).length >= TEXTAREA_FIELD_MAX);
  };

  if (loadingTemplates) {
    return (
      <div className="p-6 flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/safety")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-foreground">New Safety Form</h1>
          <p className="text-sm text-muted-foreground">Fill out and submit a safety or incident form</p>
        </div>
      </div>

      <DraftBanner show={draft.showBanner} onRestore={draft.restoreDraft} onDiscard={draft.discardDraft} />

      {/* Template Selection */}
      {!selectedTemplateId ? (
        <div className="space-y-4">
          <h2 className="text-base font-semibold text-foreground">Select a Form Type</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {templates.map((t) => (
              <Card
                key={t.id}
                className="cursor-pointer hover:shadow-md hover:border-primary/40 transition-all"
                onClick={() => setSelectedTemplateId(t.id)}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-base">{t.name}</CardTitle>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        categoryColor[t.category] ?? "bg-muted text-muted-foreground"
                      }`}
                    >
                      {t.category}
                    </span>
                  </div>
                  <CardDescription className="text-xs">
                    {(t.schema?.fields ?? []).length} fields
                  </CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </div>
      ) : (
        /* Form */
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold">{selectedTemplate?.name}</h2>
              {selectedTemplate?.category && (
                <span
                  className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    categoryColor[selectedTemplate.category] ?? "bg-muted text-muted-foreground"
                  }`}
                >
                  {selectedTemplate.category}
                </span>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSelectedTemplateId(null);
                setFormData({});
                setSelectedProjectId(null);
                setSelectedContactId(null);
              }}
            >
              Change Form
            </Button>
          </div>

          {/* Context selectors */}
          <Card>
            <CardContent className="pt-5 pb-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                Link to Project & Contact (optional)
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5 text-sm">
                    <FolderOpen className="h-3.5 w-3.5" />
                    Project
                  </Label>
                  <Select
                    value={selectedProjectId ? String(selectedProjectId) : "none"}
                    onValueChange={(v) => setSelectedProjectId(v === "none" ? null : parseInt(v))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select project…" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {(projects as any[]).map((p) => (
                        <SelectItem key={p.id} value={String(p.id)}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5 text-sm">
                    <User className="h-3.5 w-3.5" />
                    Contact / Person Involved
                  </Label>
                  <Select
                    value={selectedContactId ? String(selectedContactId) : "none"}
                    onValueChange={(v) => setSelectedContactId(v === "none" ? null : parseInt(v))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select contact…" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {(contacts as any[]).map((c) => (
                        <SelectItem key={c.id} value={String(c.id)}>
                          {c.name ?? `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim()}
                          {c.company ? ` — ${c.company}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Form fields */}
          <Card>
            <CardContent className="pt-6 space-y-6">
              {(selectedTemplate?.schema?.fields ?? []).map((field) => (
                <div key={field.id} className="space-y-2">
                  <Label htmlFor={`field-${field.id}`} className="flex items-center gap-1.5">
                    {field.label}
                    {field.required && (
                      <span className="text-destructive text-xs">*</span>
                    )}
                  </Label>
                  <FormFieldRenderer
                    field={field}
                    value={formData[field.id]}
                    onChange={(val) => handleFieldChange(field.id, val)}
                  />
                </div>
              ))}
            </CardContent>
          </Card>

          <div className="flex gap-3 justify-end">
            <Button
              variant="outline"
              onClick={() => saveMutation.mutate({ status: "draft" })}
              disabled={saveMutation.isPending || !selectedTemplateId || hasTextareaAtLimit()}
              className="gap-2"
            >
              {saveMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Save Draft
            </Button>
            <Button
              onClick={() => saveMutation.mutate({ status: "submitted" })}
              disabled={saveMutation.isPending || !validateRequired() || hasTextareaAtLimit()}
              style={{ background: GOLD, color: BLACK }}
              className="font-semibold gap-2"
            >
              {saveMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Submit Form
            </Button>
          </div>
          <p className="text-xs text-muted-foreground text-right">
            Submitting will notify your foreman and generate an AI summary.
          </p>
        </div>
      )}
    </div>
  );
}
