import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetMe,
  useSearchCommunications,
  useSearchCommunicationsAi,
  useListCommunicationSearchTemplates,
  getListCommunicationSearchTemplatesQueryKey,
  useCreateCommunicationSearchTemplate,
  useDeleteCommunicationSearchTemplate,
  type CommunicationSearchCriteria,
  type CommunicationSearchTemplate,
  type StructuredEmailSearchResult,
  type AiSearchResult,
  type SearchConditionField,
  type SearchConditionOperator,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { ConditionBuilder, type ConditionRow } from "@/components/ConditionBuilder";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Search, Bookmark, X, Zap, Plus, RefreshCw, AlertTriangle } from "lucide-react";

type SearchMode = "build" | "advanced" | "ask";

const CONDITION_FIELD_OPTIONS: { value: SearchConditionField; label: string }[] = [
  { value: "subject", label: "Subject" },
  { value: "from_email", label: "Sender email" },
  { value: "from_name", label: "Sender name" },
  { value: "to_emails", label: "Recipients (to)" },
  { value: "cc_emails", label: "Recipients (cc)" },
  { value: "body_text", label: "Body" },
  { value: "thread_category", label: "Category tag" },
  { value: "priority", label: "Priority" },
  { value: "flagged", label: "Flagged" },
  { value: "attachment_type", label: "Attachment type" },
  { value: "project_number", label: "Project number" },
  { value: "date_sent", label: "Date sent" },
];

const CONDITION_OPERATOR_OPTIONS: { value: SearchConditionOperator; label: string }[] = [
  { value: "contains", label: "contains" },
  { value: "not_contains", label: "doesn't contain" },
  { value: "equals", label: "equals" },
  { value: "starts_with", label: "starts with" },
  { value: "before", label: "before" },
  { value: "after", label: "after" },
  { value: "is_true", label: "is true" },
  { value: "is_false", label: "is false" },
];

function emptyAdvancedCondition(): ConditionRow<SearchConditionField, SearchConditionOperator> {
  return { field: "subject", operator: "contains", value: "" };
}

function hideValueForOp(op: SearchConditionOperator) {
  return op === "is_true" || op === "is_false";
}

const ATTACHMENT_TYPES: { value: NonNullable<CommunicationSearchCriteria["attachmentTypes"]>[number]; label: string }[] = [
  { value: "pdf", label: "PDF" },
  { value: "word", label: "Word" },
  { value: "excel", label: "Excel" },
  { value: "image", label: "Images" },
  { value: "cad", label: "CAD" },
];

const PRIORITY_OPTIONS: { value: NonNullable<CommunicationSearchCriteria["priority"]>; label: string }[] = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
];

const EMPTY_CRITERIA: CommunicationSearchCriteria = {};

function TextField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string | undefined;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-foreground/60">{label}</Label>
      <Input value={value ?? ""} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="bg-background border-border" />
    </div>
  );
}

function ResultCard({ subject, meta, summary }: { subject: string; meta: string; summary?: string | null }) {
  return (
    <Card>
      <CardContent className="p-3">
        <p className="font-medium text-sm truncate">{subject || "(no subject)"}</p>
        <p className="text-xs text-foreground/50 mt-0.5">{meta}</p>
        {summary && <p className="text-xs text-foreground/60 mt-1.5 line-clamp-2">{summary}</p>}
      </CardContent>
    </Card>
  );
}

function relativeDateLabel(iso: string | null | undefined) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" });
}

type ConditionGroup = { key: string; logic: "AND" | "OR"; conditions: ConditionRow<SearchConditionField, SearchConditionOperator>[] };

export default function CommunicationsSearchPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: me } = useGetMe();
  const canView = !me?.permissions || (me.permissions as Record<string, boolean>).viewProjectCommunications !== false;

  const [mode, setMode] = useState<SearchMode>("build");
  const [criteria, setCriteria] = useState<CommunicationSearchCriteria>(EMPTY_CRITERIA);
  const [results, setResults] = useState<StructuredEmailSearchResult[] | null>(null);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [templateName, setTemplateName] = useState("");

  // Advanced (Phase 4): top-level flat conditions, plus zero or more nested
  // groups — matches the backend's one-level-of-nesting SearchConditionGroup.
  const [advancedLogic, setAdvancedLogic] = useState<"AND" | "OR">("AND");
  const [advancedConditions, setAdvancedConditions] = useState<ConditionRow<SearchConditionField, SearchConditionOperator>[]>([
    emptyAdvancedCondition(),
  ]);
  const [advancedGroups, setAdvancedGroups] = useState<ConditionGroup[]>([]);

  const [aiQuery, setAiQuery] = useState("");
  const [aiAnswer, setAiAnswer] = useState<string | null>(null);
  const [aiResults, setAiResults] = useState<AiSearchResult[] | null>(null);

  const { data: templatesData } = useListCommunicationSearchTemplates({
    query: { queryKey: getListCommunicationSearchTemplatesQueryKey(), enabled: canView },
  });
  const templates = templatesData?.data ?? [];

  const { mutateAsync: runSearch, isPending: searching } = useSearchCommunications();
  const { mutateAsync: runAiSearch, isPending: aiSearching } = useSearchCommunicationsAi();
  const { mutateAsync: saveTemplate, isPending: savingTemplate } = useCreateCommunicationSearchTemplate();
  const { mutateAsync: deleteTemplate } = useDeleteCommunicationSearchTemplate();

  function set<K extends keyof CommunicationSearchCriteria>(key: K, value: CommunicationSearchCriteria[K]) {
    setCriteria((prev) => ({ ...prev, [key]: value }));
  }

  function toggleAttachmentType(type: NonNullable<CommunicationSearchCriteria["attachmentTypes"]>[number]) {
    const current = criteria.attachmentTypes ?? [];
    set("attachmentTypes", current.includes(type) ? current.filter((t) => t !== type) : [...current, type]);
  }

  function addGroup() {
    setAdvancedGroups((prev) => [...prev, { key: crypto.randomUUID(), logic: "AND", conditions: [emptyAdvancedCondition()] }]);
  }
  function updateGroup(key: string, patch: Partial<ConditionGroup>) {
    setAdvancedGroups((prev) => prev.map((g) => (g.key === key ? { ...g, ...patch } : g)));
  }
  function removeGroup(key: string) {
    setAdvancedGroups((prev) => prev.filter((g) => g.key !== key));
  }

  async function handleSearch() {
    try {
      const result = await runSearch({ data: criteria, params: { limit: 50 } });
      setResults(result.results);
    } catch {
      toast({ title: "Search failed", description: "Please try again.", variant: "destructive" });
    }
  }

  async function handleAdvancedSearch() {
    const validTop = advancedConditions.filter((c) => hideValueForOp(c.operator) || c.value.trim().length > 0);
    const validGroups = advancedGroups
      .map((g) => ({ ...g, conditions: g.conditions.filter((c) => hideValueForOp(c.operator) || c.value.trim().length > 0) }))
      .filter((g) => g.conditions.length > 0);
    if (validTop.length === 0 && validGroups.length === 0) return;
    try {
      const result = await runSearch({
        data: {
          conditionTree: {
            logic: advancedLogic,
            conditions: [...validTop, ...validGroups.map((g) => ({ logic: g.logic, conditions: g.conditions }))],
          },
        },
        params: { limit: 50 },
      });
      setResults(result.results);
    } catch {
      toast({ title: "Search failed", description: "Please try again.", variant: "destructive" });
    }
  }

  async function handleAiSearch() {
    if (!aiQuery.trim()) return;
    try {
      const result = await runAiSearch({ data: { query: aiQuery.trim() } });
      setAiAnswer(result.answer ?? null);
      setAiResults(result.results);
    } catch {
      toast({ title: "Search failed", description: "Please try again.", variant: "destructive" });
    }
  }

  function applyTemplate(template: CommunicationSearchTemplate) {
    setCriteria(template.criteria ?? {});
    setResults(null);
    setMode("build");
  }

  async function handleSaveTemplate() {
    if (!templateName.trim()) return;
    try {
      await saveTemplate({ data: { name: templateName.trim(), criteria } });
      queryClient.invalidateQueries({ queryKey: getListCommunicationSearchTemplatesQueryKey() });
      setShowSaveDialog(false);
      setTemplateName("");
    } catch {
      toast({ title: "Failed", description: "Could not save this template. Please try again.", variant: "destructive" });
    }
  }

  async function handleDeleteTemplate(id: number) {
    if (!window.confirm("Delete this saved search?")) return;
    try {
      await deleteTemplate({ templateId: id });
      queryClient.invalidateQueries({ queryKey: getListCommunicationSearchTemplatesQueryKey() });
    } catch {
      toast({ title: "Failed", description: "Could not delete this template. Please try again.", variant: "destructive" });
    }
  }

  if (!canView) {
    return (
      <div className="py-16 flex flex-col items-center text-center">
        <AlertTriangle className="w-10 h-10 text-amber-400 mb-3" />
        <p className="text-sm font-medium">You don't have access to Project Communications.</p>
      </div>
    );
  }

  const hasAnyCriteria = Object.values(criteria).some((v) => (Array.isArray(v) ? v.length > 0 : v != null && v !== ""));

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-foreground flex items-center gap-2">
          <Search className="h-6 w-6 text-primary" />
          Search Builder
        </h1>
        <p className="text-sm text-foreground/60 font-medium">Search across every synced project email.</p>
      </div>

      <div className="flex gap-1.5">
        {(
          [
            { value: "build", label: "Build a Search" },
            { value: "advanced", label: "Advanced" },
            { value: "ask", label: "Ask AI" },
          ] as { value: SearchMode; label: string }[]
        ).map((t) => (
          <button
            key={t.value}
            onClick={() => setMode(t.value)}
            className={`flex-1 px-3 py-2 rounded-md text-sm font-semibold border transition-colors ${
              mode === t.value ? "bg-primary text-black border-primary" : "bg-muted text-foreground/70 border-border hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {mode === "advanced" ? (
        <div className="space-y-4">
          <ConditionBuilder
            conditions={advancedConditions}
            onChange={setAdvancedConditions}
            fieldOptions={CONDITION_FIELD_OPTIONS}
            operatorOptions={CONDITION_OPERATOR_OPTIONS}
            logic={advancedLogic}
            onLogicChange={setAdvancedLogic}
            hideValueFor={hideValueForOp}
          />

          {advancedGroups.map((group) => (
            <Card key={group.key} className="border-dashed border-primary/40 bg-primary/[0.03]">
              <CardContent className="p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-primary">Nested group</span>
                  <button type="button" onClick={() => removeGroup(group.key)} className="text-muted-foreground hover:text-foreground">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                <ConditionBuilder
                  conditions={group.conditions}
                  onChange={(c) => updateGroup(group.key, { conditions: c })}
                  fieldOptions={CONDITION_FIELD_OPTIONS}
                  operatorOptions={CONDITION_OPERATOR_OPTIONS}
                  logic={group.logic}
                  onLogicChange={(l) => updateGroup(group.key, { logic: l })}
                  hideValueFor={hideValueForOp}
                />
              </CardContent>
            </Card>
          ))}

          <Button type="button" variant="ghost" size="sm" onClick={addGroup} className="text-primary hover:text-primary px-0 h-7">
            <Plus className="h-3.5 w-3.5 mr-1" /> Add nested group
          </Button>

          <Button onClick={handleAdvancedSearch} disabled={searching} className="bg-primary text-black hover:bg-primary/90">
            {searching && <RefreshCw className="w-4 h-4 mr-2 animate-spin" />}
            Search
          </Button>

          {results != null && (
            <div className="space-y-2">
              <p className="text-xs text-foreground/50">{results.length} result{results.length === 1 ? "" : "s"}</p>
              {results.length === 0 ? (
                <p className="text-sm text-foreground/50 py-6 text-center">No matches</p>
              ) : (
                results.map((r) => (
                  <ResultCard key={r.id} subject={r.subject ?? ""} meta={`${r.from_name || r.from_email || ""} · ${relativeDateLabel(r.sent_at)}`} />
                ))
              )}
            </div>
          )}
        </div>
      ) : mode === "ask" ? (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-foreground/60">Ask a question about your synced emails</Label>
            <Textarea
              value={aiQuery}
              onChange={(e) => setAiQuery(e.target.value)}
              placeholder='e.g. "Show all plumbing emails" or "What invoices arrived this month?"'
              className="bg-background border-border"
            />
          </div>
          <Button onClick={handleAiSearch} disabled={aiSearching || !aiQuery.trim()} className="bg-primary text-black hover:bg-primary/90">
            {aiSearching && <RefreshCw className="w-4 h-4 mr-2 animate-spin" />}
            Ask
          </Button>

          {aiAnswer && (
            <div className="flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
              <Zap className="w-4 h-4 text-primary mt-0.5 shrink-0" />
              <p className="text-sm text-foreground leading-relaxed">{aiAnswer}</p>
            </div>
          )}

          {aiResults != null && (
            <div className="space-y-2">
              <p className="text-xs text-foreground/50">{aiResults.length} result{aiResults.length === 1 ? "" : "s"}</p>
              {aiResults.length === 0 ? (
                <p className="text-sm text-foreground/50 py-6 text-center">No matches</p>
              ) : (
                aiResults.map((r) => (
                  <ResultCard
                    key={r.id}
                    subject={r.subject ?? ""}
                    meta={`${r.from_name || r.from_email || ""} · ${relativeDateLabel(r.sent_at)}${r.ai_trade ? ` · ${r.ai_trade}` : ""}`}
                    summary={r.ai_summary}
                  />
                ))
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {templates.length > 0 && (
            <div className="space-y-1.5">
              <Label className="text-xs text-foreground/60">Saved templates</Label>
              <div className="flex flex-wrap gap-2">
                {templates.map((t) => (
                  <div key={t.id} className="flex items-center gap-1.5 rounded-full border border-border bg-muted px-2.5 py-1">
                    <button onClick={() => applyTemplate(t)} className="flex items-center gap-1.5 text-xs font-medium">
                      <Bookmark className="w-3 h-3 text-primary" /> {t.name}
                    </button>
                    <button onClick={() => handleDeleteTemplate(t.id)} aria-label="Delete template">
                      <X className="w-3 h-3 text-foreground/40 hover:text-foreground" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <TextField label="Keywords" value={criteria.keywords} onChange={(v) => set("keywords", v)} placeholder="Free-text search" />
          <TextField label="Subject" value={criteria.subject} onChange={(v) => set("subject", v)} />
          <TextField label="Sender" value={criteria.sender} onChange={(v) => set("sender", v)} />
          <TextField label="Recipient" value={criteria.recipient} onChange={(v) => set("recipient", v)} />
          <TextField label="Client" value={criteria.client} onChange={(v) => set("client", v)} />
          <TextField label="Vendor" value={criteria.vendor} onChange={(v) => set("vendor", v)} />
          <TextField label="Address" value={criteria.address} onChange={(v) => set("address", v)} />
          <TextField label="Project Number" value={criteria.projectNumber} onChange={(v) => set("projectNumber", v)} />

          <div className="grid grid-cols-2 gap-3">
            <TextField label="From date" value={criteria.dateFrom} onChange={(v) => set("dateFrom", v)} placeholder="YYYY-MM-DD" />
            <TextField label="To date" value={criteria.dateTo} onChange={(v) => set("dateTo", v)} placeholder="YYYY-MM-DD" />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-foreground/60">Attachment type</Label>
            <div className="flex flex-wrap gap-1.5">
              {ATTACHMENT_TYPES.map((opt) => {
                const active = (criteria.attachmentTypes ?? []).includes(opt.value);
                return (
                  <button
                    key={opt.value}
                    onClick={() => toggleAttachmentType(opt.value)}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                      active ? "bg-primary text-black border-primary" : "bg-muted text-foreground/70 border-border"
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-foreground/60">Priority</Label>
            <div className="flex flex-wrap gap-1.5">
              {PRIORITY_OPTIONS.map((opt) => {
                const active = criteria.priority === opt.value;
                return (
                  <button
                    key={opt.value}
                    onClick={() => set("priority", active ? undefined : opt.value)}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                      active ? "bg-primary text-black border-primary" : "bg-muted text-foreground/70 border-border"
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          <label className="flex items-center justify-between cursor-pointer">
            <span className="text-sm font-medium">Flagged only</span>
            <Checkbox checked={!!criteria.flagged} onCheckedChange={(v) => set("flagged", (!!v) || undefined)} />
          </label>
          <label className="flex items-center justify-between cursor-pointer">
            <span className="text-sm font-medium">Part of a conversation (2+ messages)</span>
            <Checkbox checked={!!criteria.hasConversation} onCheckedChange={(v) => set("hasConversation", (!!v) || undefined)} />
          </label>

          <div className="flex gap-2">
            <Button onClick={handleSearch} disabled={searching} className="flex-1 bg-primary text-black hover:bg-primary/90">
              {searching && <RefreshCw className="w-4 h-4 mr-2 animate-spin" />}
              Search
            </Button>
            <Button variant="outline" className="border-border" disabled={!hasAnyCriteria} onClick={() => setShowSaveDialog(true)}>
              <Bookmark className="w-4 h-4 mr-1.5" /> Save
            </Button>
          </div>

          {results != null && (
            <div className="space-y-2">
              <p className="text-xs text-foreground/50">{results.length} result{results.length === 1 ? "" : "s"}</p>
              {results.length === 0 ? (
                <p className="text-sm text-foreground/50 py-6 text-center">No matches</p>
              ) : (
                results.map((r) => (
                  <ResultCard key={r.id} subject={r.subject ?? ""} meta={`${r.from_name || r.from_email || ""} · ${relativeDateLabel(r.sent_at)}`} />
                ))
              )}
            </div>
          )}
        </div>
      )}

      <Dialog
        open={showSaveDialog}
        onOpenChange={(o) => {
          if (!o) {
            setShowSaveDialog(false);
            setTemplateName("");
          }
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Save Search Template</DialogTitle>
          </DialogHeader>
          <Input
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
            placeholder="e.g. Permits, RFIs, Roofing"
            className="bg-background border-border"
          />
          <DialogFooter>
            <Button
              className="w-full bg-primary text-black hover:bg-primary/90"
              disabled={!templateName.trim() || savingTemplate}
              onClick={handleSaveTemplate}
            >
              {savingTemplate && <RefreshCw className="w-4 h-4 mr-2 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
