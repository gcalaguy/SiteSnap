import { useEffect, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { useGetMe } from "@workspace/api-client-react";
import { ArrowLeft, ClipboardCheck, Loader2, Plus, Save, Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProjectSelect } from "@/components/cor-compliance/shared";
import {
  PSI_HAZARD_CATEGORIES,
  PSI_HAZARD_CATEGORY_KEYS,
  emptyPsiHazards,
  type PsiHazardCategoryKey,
  type PsiHazards,
  type PsiTaskRow,
} from "@/components/cor-compliance/psiConstants";
import { useCreatePsi, useUpdatePsi, useSubmitPsi, usePsiDetail } from "@/hooks/cor-compliance/usePsi";

const GOLD = "#C9A84C";
const BLACK = "#111111";

function newTaskRow(): PsiTaskRow {
  return { id: `row-${Math.random().toString(36).slice(2, 10)}`, task: "", hazard: "", control: "" };
}

const inputStyle = { background: "#1a1a1a", border: "1px solid #333", color: "#e5e5e5" };

export default function PsiSubmitPage() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const editId = new URLSearchParams(search).get("id");
  const editIdNum = editId ? parseInt(editId) : undefined;
  const { data: me } = useGetMe();

  // Admins arrive here from the COR Compliance tab's read-only audit list;
  // everyone else arrives via Safety & Forms, where PSI checklists are created.
  const isAdmin = me?.role === "owner" || me?.role === "foreman";
  const backHref = isAdmin ? "/safety-compliance?tab=cor" : "/safety-compliance?tab=safety";

  const existingQuery = usePsiDetail(editIdNum);

  const [projectId, setProjectId] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [weatherTemp, setWeatherTemp] = useState("");
  const [tradeDescription, setTradeDescription] = useState("");
  const [location, setLocation2] = useState("");
  const [hazards, setHazards] = useState<PsiHazards>(() => emptyPsiHazards());
  const [taskRows, setTaskRows] = useState<PsiTaskRow[]>([newTaskRow()]);

  useEffect(() => {
    if (!existingQuery.data) return;
    const psi = existingQuery.data.psi;
    setProjectId(String(psi.projectId));
    setDate(psi.date);
    setWeatherTemp(psi.weatherTemp ?? "");
    setTradeDescription(psi.tradeDescription ?? "");
    setLocation2(psi.location ?? "");
    setHazards({ ...emptyPsiHazards(), ...psi.hazards });
    setTaskRows(psi.taskRows.length ? psi.taskRows : [newTaskRow()]);
  }, [existingQuery.data]);

  const createMutation = useCreatePsi((psi) => setLocation(`/psi/${psi.id}`));
  const updateMutation = useUpdatePsi(() => setLocation(editIdNum ? `/psi/${editIdNum}` : backHref));
  const submitMutation = useSubmitPsi((psi) => setLocation(`/psi/${psi.id}`));

  const saving = createMutation.isPending || updateMutation.isPending;
  const submitting = submitMutation.isPending;

  function toggleHazard(key: PsiHazardCategoryKey, item: string) {
    setHazards((prev) => {
      const current = prev[key];
      const checked = current.checked.includes(item)
        ? current.checked.filter((v) => v !== item)
        : [...current.checked, item];
      return { ...prev, [key]: { ...current, checked } };
    });
  }

  function setOtherText(key: PsiHazardCategoryKey, field: "otherText" | "other2Text" | "other3Text", value: string) {
    setHazards((prev) => ({ ...prev, [key]: { ...prev[key], [field]: value } }));
  }

  function updateTaskRow(id: string, field: keyof Omit<PsiTaskRow, "id">, value: string) {
    setTaskRows((rows) => rows.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  }

  function removeTaskRow(id: string) {
    setTaskRows((rows) => (rows.length > 1 ? rows.filter((r) => r.id !== id) : rows));
  }

  const canSave = !!projectId && !!date;

  function buildPayload() {
    return {
      projectId: parseInt(projectId),
      date,
      weatherTemp: weatherTemp || null,
      tradeDescription: tradeDescription || null,
      location: location || null,
      hazards,
      taskRows: taskRows.filter((r) => r.task || r.hazard || r.control),
    };
  }

  function handleSaveDraft() {
    if (!canSave) return;
    if (editIdNum) {
      updateMutation.mutate({ id: editIdNum, body: buildPayload() });
    } else {
      createMutation.mutate({ ...buildPayload(), submit: false });
    }
  }

  function handleSubmit() {
    if (!canSave) return;
    if (editIdNum) {
      updateMutation.mutate(
        { id: editIdNum, body: buildPayload() },
        { onSuccess: () => submitMutation.mutate(editIdNum) },
      );
    } else {
      createMutation.mutate({ ...buildPayload(), submit: true });
    }
  }

  if (editIdNum && existingQuery.isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#0a0a0a" }}>
        <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: "#0a0a0a" }}>
      <div className="px-6 py-5 border-b flex items-center gap-3" style={{ borderColor: "#1a1a1a", background: BLACK }}>
        <Button variant="ghost" size="icon" onClick={() => setLocation(backHref)} aria-label="Back">
          <ArrowLeft className="h-4 w-4" style={{ color: "#e5e5e5" }} />
        </Button>
        <div className="flex items-center justify-center rounded-lg"
          style={{ width: 38, height: 38, background: `${GOLD}1a`, border: `1px solid ${GOLD}40` }}>
          <ClipboardCheck className="h-5 w-5" style={{ color: GOLD }} />
        </div>
        <div>
          <h1 className="text-lg font-bold text-white">{editIdNum ? "Edit" : "New"} Pre-Inspection Checklist</h1>
          <p className="text-xs text-zinc-500">PSI — Pre-Site/Task Inspection</p>
        </div>
      </div>

      <div className="p-6 max-w-4xl mx-auto space-y-5">
        <Card style={{ background: "#111111", border: "1px solid #2a2a2a" }}>
          <CardContent className="pt-6 grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs text-zinc-400">Project *</Label>
              <ProjectSelect value={projectId} onChange={setProjectId} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-zinc-400">Date *</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inputStyle} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-zinc-400">Weather / Temperature</Label>
              <Input value={weatherTemp} onChange={(e) => setWeatherTemp(e.target.value)} placeholder="e.g. Clear, 12°C" style={inputStyle} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-zinc-400">Trade / Task Description</Label>
              <Input value={tradeDescription} onChange={(e) => setTradeDescription(e.target.value)} placeholder="e.g. Formwork installation" style={inputStyle} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs text-zinc-400">Location</Label>
              <Input value={location} onChange={(e) => setLocation2(e.target.value)} placeholder="e.g. Level 3, North Wing" style={inputStyle} />
            </div>
          </CardContent>
        </Card>

        {PSI_HAZARD_CATEGORY_KEYS.map((key) => {
          const category = PSI_HAZARD_CATEGORIES[key];
          const value = hazards[key];
          return (
            <Card key={key} style={{ background: "#111111", border: "1px solid #2a2a2a" }}>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm" style={{ color: "#e5e5e5" }}>{category.title}</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2.5 sm:grid-cols-2">
                {category.items.map((item) => {
                  const checkboxId = `${key}-${item}`;
                  return (
                    <div key={item} className="flex items-center gap-2">
                      <Checkbox
                        id={checkboxId}
                        checked={value.checked.includes(item)}
                        onCheckedChange={() => toggleHazard(key, item)}
                      />
                      <Label htmlFor={checkboxId} className="font-normal cursor-pointer text-sm" style={{ color: "#d4d4d8" }}>
                        {item}
                      </Label>
                    </div>
                  );
                })}
                {"hasOther" in category && category.hasOther && (
                  <div className="sm:col-span-2 pt-1">
                    <Input
                      value={value.otherText ?? ""}
                      onChange={(e) => setOtherText(key, "otherText", e.target.value)}
                      placeholder={"otherLabel" in category ? category.otherLabel : "Other…"}
                      style={inputStyle}
                    />
                  </div>
                )}
                {"hasOther2" in category && category.hasOther2 && (
                  <div className="sm:col-span-2">
                    <Input
                      value={value.other2Text ?? ""}
                      onChange={(e) => setOtherText(key, "other2Text", e.target.value)}
                      placeholder="Other…"
                      style={inputStyle}
                    />
                  </div>
                )}
                {"hasOther3" in category && category.hasOther3 && (
                  <div className="sm:col-span-2">
                    <Input
                      value={value.other3Text ?? ""}
                      onChange={(e) => setOtherText(key, "other3Text", e.target.value)}
                      placeholder="Other…"
                      style={inputStyle}
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}

        <Card style={{ background: "#111111", border: "1px solid #2a2a2a" }}>
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-sm" style={{ color: "#e5e5e5" }}>Task / Hazard / Control</CardTitle>
            <Button size="sm" variant="ghost" style={{ color: GOLD }} onClick={() => setTaskRows((r) => [...r, newTaskRow()])}>
              <Plus className="h-3.5 w-3.5 mr-1" />Add Row
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {taskRows.map((row) => (
              <div key={row.id} className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto] items-start">
                <Input placeholder="Task" value={row.task} onChange={(e) => updateTaskRow(row.id, "task", e.target.value)} style={inputStyle} />
                <Input placeholder="Hazard" value={row.hazard} onChange={(e) => updateTaskRow(row.id, "hazard", e.target.value)} style={inputStyle} />
                <Input placeholder="Control" value={row.control} onChange={(e) => updateTaskRow(row.id, "control", e.target.value)} style={inputStyle} />
                <Button size="icon" variant="ghost" style={{ color: "#71717a" }} disabled={taskRows.length <= 1} onClick={() => removeTaskRow(row.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="flex gap-3 justify-end pb-8">
          <Button
            variant="outline"
            onClick={handleSaveDraft}
            disabled={!canSave || saving || submitting}
            style={{ background: "transparent", border: "1px solid #333", color: "#e5e5e5" }}
            className="gap-2"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save Draft
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!canSave || saving || submitting}
            style={{ background: GOLD, color: BLACK }}
            className="font-semibold gap-2"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Submit Checklist
          </Button>
        </div>
      </div>
    </div>
  );
}
