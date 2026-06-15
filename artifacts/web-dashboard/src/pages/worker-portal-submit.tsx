import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { ChevronRight, Save, Send, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { WorkerLayout } from "@/components/worker-layout";

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

const categoryEmoji: Record<string, string> = {
  injury: "🩹",
  safety: "⚠️",
  hazard: "🔶",
  toolbox: "🛠️",
};

const categoryColor: Record<string, string> = {
  injury:  "border-red-200 bg-red-50",
  safety:  "border-blue-200 bg-blue-50",
  hazard:  "border-orange-200 bg-orange-50",
  toolbox: "border-green-200 bg-green-50",
};

const categoryBadge: Record<string, string> = {
  injury:  "bg-red-100 text-red-700",
  safety:  "bg-blue-100 text-blue-700",
  hazard:  "bg-orange-100 text-orange-700",
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
          className="text-base"
        />
      );

    case "textarea":
      return (
        <Textarea
          id={id}
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          required={field.required}
          placeholder={field.required ? "Required" : "Optional"}
          rows={3}
          className="text-base"
        />
      );

    case "select":
      return (
        <Select value={value ?? ""} onValueChange={onChange}>
          <SelectTrigger id={id} className="text-base">
            <SelectValue placeholder="Select an option…" />
          </SelectTrigger>
          <SelectContent>
            {field.options?.map((opt) => (
              <SelectItem key={opt} value={opt}>{opt}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      );

    case "radio":
      return (
        <RadioGroup value={value ?? ""} onValueChange={onChange} className="space-y-2">
          {field.options?.map((opt) => (
            <div key={opt} className="flex items-center gap-3 bg-gray-50 rounded-xl px-4 py-3 border border-gray-100">
              <RadioGroupItem value={opt} id={`${id}-${opt}`} />
              <Label htmlFor={`${id}-${opt}`} className="font-normal cursor-pointer text-sm flex-1">
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
          {field.options?.map((opt) => {
            const checked = selected.includes(opt);
            return (
              <div
                key={opt}
                className={`flex items-center gap-3 rounded-xl px-4 py-3 border transition-colors cursor-pointer ${
                  checked ? "bg-primary/5 border-primary/30" : "bg-gray-50 border-gray-100"
                }`}
                onClick={() => {
                  if (checked) onChange(selected.filter((v) => v !== opt));
                  else onChange([...selected, opt]);
                }}
              >
                <Checkbox
                  id={`${id}-${opt}`}
                  checked={checked}
                  onCheckedChange={(c) => {
                    if (c) onChange([...selected, opt]);
                    else onChange(selected.filter((v) => v !== opt));
                  }}
                />
                <Label htmlFor={`${id}-${opt}`} className="font-normal cursor-pointer text-sm flex-1">
                  {opt}
                </Label>
              </div>
            );
          })}
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

export default function WorkerPortalSubmitPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const [formData, setFormData] = useState<Record<string, any>>({});

  const { data: templates = [], isLoading } = useQuery<FormTemplate[]>({
    queryKey: ["safety-templates"],
    queryFn: () => customFetch("/api/safety/templates"),
  });

  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId);

  const saveMutation = useMutation({
    mutationFn: (payload: { status: "draft" | "submitted" }) =>
      customFetch("/api/safety/submissions", {
        method: "POST",
        body: JSON.stringify({
          templateId: selectedTemplateId,
          data: formData,
          status: payload.status,
        }),
      }),
    onSuccess: (data: any, vars) => {
      queryClient.invalidateQueries({ queryKey: ["safety-submissions"] });
      if (vars.status === "submitted") {
        toast({
          title: "Form Submitted ✓",
          description: "Your foreman has been notified. An AI summary is being generated.",
        });
      } else {
        toast({ title: "Draft Saved", description: "Continue filling it out anytime." });
      }
      setLocation(`/worker-portal/submissions/${data.id}`);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save. Please try again.", variant: "destructive" });
    },
  });

  const validateRequired = () => {
    if (!selectedTemplate) return false;
    return (selectedTemplate.schema?.fields ?? []).every((f) => {
      if (!f.required) return true;
      const v = formData[f.id];
      if (Array.isArray(v)) return v.length > 0;
      return v !== undefined && v !== null && v !== "";
    });
  };

  const completedCount = selectedTemplate
    ? (selectedTemplate.schema?.fields ?? []).filter((f) => {
        const v = formData[f.id];
        if (Array.isArray(v)) return v.length > 0;
        return v !== undefined && v !== null && v !== "";
      }).length
    : 0;

  const totalFields = selectedTemplate?.schema?.fields?.length ?? 0;

  if (isLoading) {
    return (
      <WorkerLayout breadcrumbs={[{ label: "New Form" }]}>
        <div className="flex items-center justify-center h-48">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </WorkerLayout>
    );
  }

  return (
    <WorkerLayout
      breadcrumbs={
        selectedTemplate
          ? [{ label: "New Form", href: "/worker-portal/submit" }, { label: selectedTemplate.name }]
          : [{ label: "New Form" }]
      }
    >
      {!selectedTemplateId ? (
        /* Template Picker */
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Select Form Type</h2>
            <p className="text-sm text-gray-500">Choose the type of report you need to file</p>
          </div>

          <div className="space-y-3">
            {templates.map((t) => (
              <button
                key={t.id}
                onClick={() => setSelectedTemplateId(t.id)}
                className={`w-full text-left rounded-2xl border-2 px-4 py-4 flex items-center gap-4 transition-all hover:shadow-md hover:border-primary/40 ${
                  categoryColor[t.category] ?? "border-gray-100 bg-gray-50"
                }`}
              >
                <span className="text-3xl flex-shrink-0">{categoryEmoji[t.category] ?? "📋"}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900">{t.name}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {(t.schema?.fields ?? []).length} fields
                    <span className={`ml-2 px-1.5 py-0.5 rounded-full text-[10px] font-medium ${categoryBadge[t.category] ?? "bg-gray-100 text-gray-600"}`}>
                      {t.category}
                    </span>
                  </p>
                </div>
                <ChevronRight className="h-5 w-5 text-gray-400 flex-shrink-0" />
              </button>
            ))}
          </div>
        </div>
      ) : (
        /* Form */
        <div className="space-y-5">
          {/* Form header */}
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-2xl">{categoryEmoji[selectedTemplate?.category ?? ""] ?? "📋"}</span>
              <h2 className="text-lg font-bold text-gray-900">{selectedTemplate?.name}</h2>
            </div>
            <p className="text-xs text-gray-500">
              {completedCount} of {totalFields} fields filled
            </p>
            {/* Progress */}
            <div className="mt-2 h-1.5 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-300"
                style={{ width: totalFields > 0 ? `${(completedCount / totalFields) * 100}%` : "0%" }}
              />
            </div>
          </div>

          {/* Fields */}
          <div className="space-y-5">
            {(selectedTemplate?.schema?.fields ?? []).map((field) => (
              <div key={field.id} className="space-y-2">
                <Label htmlFor={`field-${field.id}`} className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
                  {field.label}
                  {field.required && <span className="text-red-500 text-xs">*</span>}
                </Label>
                <FormFieldRenderer
                  field={field}
                  value={formData[field.id]}
                  onChange={(val) => setFormData((prev) => ({ ...prev, [field.id]: val }))}
                />
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className="pt-2 space-y-3 pb-6">
            <Button
              className="w-full h-12 text-base gap-2"
              onClick={() => saveMutation.mutate({ status: "submitted" })}
              disabled={saveMutation.isPending || !validateRequired()}
            >
              {saveMutation.isPending ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Send className="h-5 w-5" />
              )}
              Submit Form
            </Button>
            <Button
              variant="outline"
              className="w-full h-12 text-base gap-2"
              onClick={() => saveMutation.mutate({ status: "draft" })}
              disabled={saveMutation.isPending}
            >
              {saveMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Save as Draft
            </Button>
            <p className="text-xs text-center text-gray-400">
              Submitting notifies your foreman and generates an AI safety summary
            </p>
          </div>
        </div>
      )}
    </WorkerLayout>
  );
}
