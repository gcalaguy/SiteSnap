import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetMe,
  useListEmailFilingRules,
  getListEmailFilingRulesQueryKey,
  useCreateEmailFilingRule,
  useUpdateEmailFilingRule,
  useDeleteEmailFilingRule,
  useListProjects,
  type EmailFilingRule,
  type FilingRuleCondition,
  type FilingRuleAction,
  type Project,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { ConditionBuilder } from "@/components/ConditionBuilder";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Filter, Plus, Pencil, Trash2, RefreshCw, AlertTriangle } from "lucide-react";

type FieldOption = FilingRuleCondition["field"];
type OperatorOption = FilingRuleCondition["operator"];

const FIELD_OPTIONS: { value: FieldOption; label: string }[] = [
  { value: "subject", label: "Subject" },
  { value: "from_email", label: "Sender email" },
  { value: "from_name", label: "Sender name" },
  { value: "to_emails", label: "Recipients (to)" },
  { value: "cc_emails", label: "Recipients (cc)" },
  { value: "body_text", label: "Body" },
];

const OPERATOR_OPTIONS: { value: OperatorOption; label: string }[] = [
  { value: "contains", label: "contains" },
  { value: "equals", label: "equals" },
  { value: "starts_with", label: "starts with" },
];

function emptyCondition(): FilingRuleCondition {
  return { field: "subject", operator: "contains", value: "" };
}

function RuleEditorDialog({
  open,
  onClose,
  rule,
  projects,
}: {
  open: boolean;
  onClose: () => void;
  rule: EmailFilingRule | null;
  projects: Project[];
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [name, setName] = useState("");
  const [priority, setPriority] = useState("0");
  const [conditionLogic, setConditionLogic] = useState<"AND" | "OR">("AND");
  const [conditions, setConditions] = useState<FilingRuleCondition[]>([emptyCondition()]);
  const [actionType, setActionType] = useState<"move_to_project" | "assign_category">("move_to_project");
  const [actionProjectId, setActionProjectId] = useState<string>("");
  const [actionCategory, setActionCategory] = useState("");

  useEffect(() => {
    if (!open) return;
    if (rule) {
      setName(rule.name);
      setPriority(String(rule.priority));
      setConditionLogic(rule.conditionLogic);
      setConditions(rule.conditions.length > 0 ? rule.conditions : [emptyCondition()]);
      const firstAction = rule.actions[0];
      if (firstAction?.type === "move_to_project") {
        setActionType("move_to_project");
        setActionProjectId(String(firstAction.projectId ?? ""));
        setActionCategory("");
      } else if (firstAction?.type === "assign_category") {
        setActionType("assign_category");
        setActionCategory(firstAction.category ?? "");
        setActionProjectId("");
      }
    } else {
      setName("");
      setPriority("0");
      setConditionLogic("AND");
      setConditions([emptyCondition()]);
      setActionType("move_to_project");
      setActionProjectId("");
      setActionCategory("");
    }
  }, [open, rule]);

  const createMutation = useCreateEmailFilingRule({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListEmailFilingRulesQueryKey() });
        toast({ title: "Rule created", description: name.trim() });
        onClose();
      },
      onError: () => toast({ title: "Failed", description: "Could not save the rule. Please try again.", variant: "destructive" }),
    },
  });
  const updateMutation = useUpdateEmailFilingRule({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListEmailFilingRulesQueryKey() });
        toast({ title: "Rule updated", description: name.trim() });
        onClose();
      },
      onError: () => toast({ title: "Failed", description: "Could not save the rule. Please try again.", variant: "destructive" }),
    },
  });

  const saving = createMutation.isPending || updateMutation.isPending;

  const validConditions = conditions.filter((c) => c.value.trim().length > 0);
  const validAction: FilingRuleAction | null =
    actionType === "move_to_project"
      ? actionProjectId
        ? { type: "move_to_project", projectId: Number(actionProjectId) }
        : null
      : actionCategory.trim()
      ? { type: "assign_category", category: actionCategory.trim() }
      : null;
  const isValid = name.trim().length > 0 && validConditions.length > 0 && !!validAction;

  function handleSave() {
    if (!isValid || !validAction) return;
    const body = {
      name: name.trim(),
      priority: parseInt(priority, 10) || 0,
      conditionLogic,
      conditions: validConditions,
      actions: [validAction],
    };
    if (rule) {
      updateMutation.mutate({ ruleId: rule.id, data: body });
    } else {
      createMutation.mutate({ data: { ...body, isEnabled: true } });
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{rule ? "Edit Rule" : "New Rule"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-1">
          <div className="space-y-1.5">
            <Label>Rule name</Label>
            <Input
              placeholder="e.g. City inspector emails"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="bg-background border-border"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Priority (lower runs first)</Label>
            <Input
              type="number"
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="bg-background border-border"
            />
          </div>

          <ConditionBuilder
            conditions={conditions}
            onChange={setConditions}
            fieldOptions={FIELD_OPTIONS}
            operatorOptions={OPERATOR_OPTIONS}
            logic={conditionLogic}
            onLogicChange={setConditionLogic}
          />

          <div className="space-y-2">
            <Label>THEN</Label>
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => setActionType("move_to_project")}
                className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                  actionType === "move_to_project" ? "bg-primary text-black border-primary" : "bg-muted text-foreground/70 border-border"
                }`}
              >
                Move to Project
              </button>
              <button
                type="button"
                onClick={() => setActionType("assign_category")}
                className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                  actionType === "assign_category" ? "bg-primary text-black border-primary" : "bg-muted text-foreground/70 border-border"
                }`}
              >
                Assign Category
              </button>
            </div>
            {actionType === "move_to_project" ? (
              <Select value={actionProjectId} onValueChange={setActionProjectId}>
                <SelectTrigger className="bg-background border-border">
                  <SelectValue placeholder="Select a project" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                value={actionCategory}
                onChange={(e) => setActionCategory(e.target.value)}
                placeholder="e.g. Inspection"
                className="bg-background border-border"
              />
            )}
          </div>
        </div>
        <DialogFooter className="mt-2">
          <Button variant="outline" className="border-border" onClick={onClose}>
            Cancel
          </Button>
          <Button
            className="bg-primary text-black hover:bg-primary/90"
            disabled={!isValid || saving}
            onClick={handleSave}
          >
            {saving && <RefreshCw className="w-4 h-4 mr-2 animate-spin" />}
            {rule ? "Save Changes" : "Create Rule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RuleRow({
  rule,
  projects,
  onEdit,
  onDelete,
}: {
  rule: EmailFilingRule;
  projects: Project[];
  onEdit: () => void;
  onDelete: () => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { mutateAsync: updateRule } = useUpdateEmailFilingRule();

  async function handleToggle(checked: boolean) {
    try {
      await updateRule({ ruleId: rule.id, data: { isEnabled: checked } });
      queryClient.invalidateQueries({ queryKey: getListEmailFilingRulesQueryKey() });
    } catch {
      toast({ title: "Failed", description: "Could not update the rule. Please try again.", variant: "destructive" });
    }
  }

  const action = rule.actions[0];
  const actionLabel =
    action?.type === "move_to_project"
      ? `Move to ${projects.find((p) => p.id === action.projectId)?.name ?? `project #${action.projectId}`}`
      : action?.type === "assign_category"
      ? `Assign category "${action.category}"`
      : "No action";

  return (
    <Card className="hover:border-primary/40 transition-colors">
      <CardContent className="p-4 space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm text-foreground">{rule.name}</p>
            <p className="text-xs text-foreground/50 mt-0.5">Priority {rule.priority} · {actionLabel}</p>
          </div>
          <label className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
            <Checkbox checked={rule.isEnabled} onCheckedChange={(v) => handleToggle(!!v)} />
            <span className="text-xs text-foreground/60">{rule.isEnabled ? "Enabled" : "Disabled"}</span>
          </label>
        </div>
        <p className="text-xs text-foreground/60 leading-relaxed">
          {rule.conditions
            .map((c) => `${FIELD_OPTIONS.find((f) => f.value === c.field)?.label ?? c.field} ${c.operator} "${c.value}"`)
            .join(rule.conditionLogic === "AND" ? " AND " : " OR ")}
        </p>
        <div className="flex items-center gap-3 pt-1">
          <Button variant="ghost" size="sm" className="h-7 px-2 text-foreground/70" onClick={onEdit}>
            <Pencil className="w-3.5 h-3.5 mr-1.5" /> Edit
          </Button>
          <Button variant="ghost" size="sm" className="h-7 px-2 text-red-500 hover:text-red-600 hover:bg-red-50" onClick={onDelete}>
            <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Delete
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function EmailFilingRulesPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: me } = useGetMe();
  const isOwner = me?.role === "owner" || me?.systemRole === "super_admin";

  const { data, isLoading } = useListEmailFilingRules({
    query: { queryKey: getListEmailFilingRulesQueryKey(), enabled: isOwner },
  });
  const { data: projects = [] } = useListProjects();

  const { mutateAsync: deleteRule } = useDeleteEmailFilingRule();

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<EmailFilingRule | null>(null);
  const [deleting, setDeleting] = useState<EmailFilingRule | null>(null);

  if (!isOwner) {
    return (
      <div className="py-16 flex flex-col items-center text-center">
        <AlertTriangle className="w-10 h-10 text-amber-400 mb-3" />
        <p className="text-sm font-medium">Only company owners can manage Automatic Filing Rules.</p>
      </div>
    );
  }

  async function handleDelete() {
    if (!deleting) return;
    try {
      await deleteRule({ ruleId: deleting.id });
      queryClient.invalidateQueries({ queryKey: getListEmailFilingRulesQueryKey() });
      toast({ title: "Rule deleted", description: deleting.name });
    } catch {
      toast({ title: "Failed", description: "Could not delete the rule. Please try again.", variant: "destructive" });
    } finally {
      setDeleting(null);
    }
  }

  const rules = [...(data?.data ?? [])].sort((a, b) => a.priority - b.priority);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-foreground flex items-center gap-2">
            <Filter className="h-6 w-6 text-primary" />
            Automatic Filing Rules
          </h1>
          <p className="text-sm text-foreground/60 font-medium">
            Rules run in priority order before the automatic matching engine — the first fully matching rule wins.
          </p>
        </div>
        <Button
          className="bg-primary text-black hover:bg-primary/90"
          onClick={() => {
            setEditingRule(null);
            setEditorOpen(true);
          }}
        >
          <Plus className="w-4 h-4 mr-1.5" /> New Rule
        </Button>
      </div>

      {isLoading ? (
        <div className="py-16 text-center text-foreground/60 animate-pulse font-medium">Loading rules…</div>
      ) : rules.length === 0 ? (
        <Card>
          <CardContent className="py-16 flex flex-col items-center gap-3 text-center">
            <Filter className="h-10 w-10 text-foreground/20" />
            <p className="text-foreground/60 font-medium">No rules yet</p>
            <p className="text-xs text-foreground/40">Add a rule to automatically file or categorize incoming emails.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 max-w-2xl">
          {rules.map((rule) => (
            <RuleRow
              key={rule.id}
              rule={rule}
              projects={projects}
              onEdit={() => {
                setEditingRule(rule);
                setEditorOpen(true);
              }}
              onDelete={() => setDeleting(rule)}
            />
          ))}
        </div>
      )}

      {editorOpen && (
        <RuleEditorDialog
          open={editorOpen}
          onClose={() => {
            setEditorOpen(false);
            setEditingRule(null);
          }}
          rule={editingRule}
          projects={projects}
        />
      )}

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete rule?</AlertDialogTitle>
            <AlertDialogDescription>
              "{deleting?.name}" will stop applying to new emails. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700 text-white" onClick={handleDelete}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
