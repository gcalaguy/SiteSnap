import React from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
import { ChipRow, ConditionBuilder } from "@/components/ConditionBuilder";
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

function RuleEditorModal({
  visible,
  onClose,
  rule,
  projects,
}: {
  visible: boolean;
  onClose: () => void;
  rule: EmailFilingRule | null;
  projects: Project[];
}) {
  const colors = useColors();
  const queryClient = useQueryClient();

  const [name, setName] = React.useState("");
  const [priority, setPriority] = React.useState("0");
  const [conditionLogic, setConditionLogic] = React.useState<"AND" | "OR">("AND");
  const [conditions, setConditions] = React.useState<FilingRuleCondition[]>([emptyCondition()]);
  const [actionType, setActionType] = React.useState<"move_to_project" | "assign_category">("move_to_project");
  const [actionProjectId, setActionProjectId] = React.useState<number | null>(null);
  const [actionCategory, setActionCategory] = React.useState("");

  React.useEffect(() => {
    if (!visible) return;
    if (rule) {
      setName(rule.name);
      setPriority(String(rule.priority));
      setConditionLogic(rule.conditionLogic);
      setConditions(rule.conditions.length > 0 ? rule.conditions : [emptyCondition()]);
      const firstAction = rule.actions[0];
      if (firstAction?.type === "move_to_project") {
        setActionType("move_to_project");
        setActionProjectId(firstAction.projectId ?? null);
        setActionCategory("");
      } else if (firstAction?.type === "assign_category") {
        setActionType("assign_category");
        setActionCategory(firstAction.category ?? "");
        setActionProjectId(null);
      }
    } else {
      setName("");
      setPriority("0");
      setConditionLogic("AND");
      setConditions([emptyCondition()]);
      setActionType("move_to_project");
      setActionProjectId(null);
      setActionCategory("");
    }
  }, [visible, rule]);

  const createMutation = useCreateEmailFilingRule({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListEmailFilingRulesQueryKey() });
        onClose();
      },
      onError: () => Alert.alert("Failed", "Could not save the rule. Please try again."),
    },
  });
  const updateMutation = useUpdateEmailFilingRule({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListEmailFilingRulesQueryKey() });
        onClose();
      },
      onError: () => Alert.alert("Failed", "Could not save the rule. Please try again."),
    },
  });

  const saving = createMutation.isPending || updateMutation.isPending;

  const validConditions = conditions.filter((c) => c.value.trim().length > 0);
  const validAction: FilingRuleAction | null =
    actionType === "move_to_project"
      ? actionProjectId != null
        ? { type: "move_to_project", projectId: actionProjectId }
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
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={[s.modalHeader, { borderBottomColor: colors.border, backgroundColor: colors.background }]}>
          <Pressable onPress={onClose}>
            <Text style={[s.modalCancel, { color: colors.mutedForeground }]}>Cancel</Text>
          </Pressable>
          <Text style={[s.modalTitle, { color: colors.foreground }]}>{rule ? "Edit Rule" : "New Rule"}</Text>
          <Pressable onPress={handleSave} disabled={!isValid || saving}>
            {saving ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Text style={[s.modalSave, { color: isValid ? colors.primary : colors.mutedForeground }]}>Save</Text>
            )}
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={{ padding: 16, gap: 18 }} keyboardShouldPersistTaps="handled">
          <View style={{ gap: 6 }}>
            <Text style={[s.fieldLabel, { color: colors.foreground }]}>Rule name</Text>
            <TextInput
              style={[s.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
              value={name}
              onChangeText={setName}
              placeholder="e.g. City inspector emails"
              placeholderTextColor={colors.mutedForeground}
            />
          </View>

          <View style={{ gap: 6 }}>
            <Text style={[s.fieldLabel, { color: colors.foreground }]}>Priority (lower runs first)</Text>
            <TextInput
              style={[s.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
              value={priority}
              onChangeText={setPriority}
              keyboardType="number-pad"
            />
          </View>

          <ConditionBuilder
            conditions={conditions}
            onChange={setConditions}
            fieldOptions={FIELD_OPTIONS}
            operatorOptions={OPERATOR_OPTIONS}
            logic={conditionLogic}
            onLogicChange={setConditionLogic}
          />

          <View style={{ gap: 8 }}>
            <Text style={[s.fieldLabel, { color: colors.foreground }]}>THEN</Text>
            <ChipRow
              options={[
                { value: "move_to_project", label: "Move to Project" },
                { value: "assign_category", label: "Assign Category" },
              ]}
              value={actionType}
              onChange={setActionType}
            />
            {actionType === "move_to_project" ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={{ flexDirection: "row", gap: 6 }}>
                  {projects.map((p) => (
                    <Pressable
                      key={p.id}
                      onPress={() => setActionProjectId(p.id)}
                      style={[
                        s.chip,
                        { backgroundColor: actionProjectId === p.id ? colors.primary : colors.muted, borderColor: colors.border },
                      ]}
                    >
                      <Text style={[s.chipText, { color: actionProjectId === p.id ? "#FFFFFF" : colors.foreground }]}>
                        {p.name}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </ScrollView>
            ) : (
              <TextInput
                style={[s.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
                value={actionCategory}
                onChangeText={setActionCategory}
                placeholder="e.g. Inspection"
                placeholderTextColor={colors.mutedForeground}
              />
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function RuleRow({
  rule,
  projects,
  onEdit,
}: {
  rule: EmailFilingRule;
  projects: Project[];
  onEdit: () => void;
}) {
  const colors = useColors();
  const queryClient = useQueryClient();
  const { mutateAsync: updateRule } = useUpdateEmailFilingRule();
  const { mutateAsync: deleteRule, isPending: deleting } = useDeleteEmailFilingRule();

  async function handleToggle(value: boolean) {
    try {
      await updateRule({ ruleId: rule.id, data: { isEnabled: value } });
      queryClient.invalidateQueries({ queryKey: getListEmailFilingRulesQueryKey() });
    } catch {
      Alert.alert("Failed", "Could not update the rule. Please try again.");
    }
  }

  function handleDelete() {
    Alert.alert("Delete rule?", `"${rule.name}" will stop applying to new emails.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteRule({ ruleId: rule.id });
            queryClient.invalidateQueries({ queryKey: getListEmailFilingRulesQueryKey() });
          } catch {
            Alert.alert("Failed", "Could not delete the rule. Please try again.");
          }
        },
      },
    ]);
  }

  const action = rule.actions[0];
  const actionLabel =
    action?.type === "move_to_project"
      ? `Move to ${projects.find((p) => p.id === action.projectId)?.name ?? `project #${action.projectId}`}`
      : action?.type === "assign_category"
      ? `Assign category "${action.category}"`
      : "No action";

  return (
    <Pressable onPress={onEdit} style={[s.ruleCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <View style={{ flex: 1 }}>
          <Text style={[s.ruleName, { color: colors.foreground }]} numberOfLines={1}>{rule.name}</Text>
          <Text style={[s.ruleMeta, { color: colors.mutedForeground }]}>Priority {rule.priority} · {actionLabel}</Text>
        </View>
        <Switch value={rule.isEnabled} onValueChange={handleToggle} />
      </View>
      <Text style={[s.ruleConditions, { color: colors.mutedForeground }]} numberOfLines={2}>
        {rule.conditions
          .map((c) => `${FIELD_OPTIONS.find((f) => f.value === c.field)?.label ?? c.field} ${c.operator} "${c.value}"`)
          .join(rule.conditionLogic === "AND" ? " AND " : " OR ")}
      </Text>
      <Pressable onPress={handleDelete} disabled={deleting} style={s.deleteRow} hitSlop={8}>
        <Feather name="trash-2" size={13} color="#DC2626" />
        <Text style={s.deleteText}>Delete</Text>
      </Pressable>
    </Pressable>
  );
}

export default function EmailFilingRulesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const topInsets = Platform.OS === "web" ? 67 : insets.top;

  const { data: me } = useGetMe();
  const isOwner = me?.role === "owner";

  const { data, isLoading } = useListEmailFilingRules(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { query: { enabled: isOwner } } as any,
  );
  const projectsData = useListProjects();
  const projects = Array.isArray(projectsData.data) ? projectsData.data : [];

  const [editorVisible, setEditorVisible] = React.useState(false);
  const [editingRule, setEditingRule] = React.useState<EmailFilingRule | null>(null);

  if (!isOwner) {
    return (
      <View style={[s.centered, { backgroundColor: colors.background }]}>
        <Feather name="lock" size={40} color={colors.mutedForeground} />
        <Text style={[s.restrictedText, { color: colors.mutedForeground }]}>
          Only company owners can manage Automatic Filing Rules.
        </Text>
      </View>
    );
  }

  const rules = [...(data?.data ?? [])].sort((a, b) => a.priority - b.priority);

  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      <View style={[s.header, { paddingTop: topInsets + 16, backgroundColor: colors.sidebar, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={s.backBtn}>
          <Feather name="arrow-left" size={22} color="#FFFFFF" />
        </Pressable>
        <Text style={s.headerTitle}>Automatic Filing Rules</Text>
        <Pressable
          onPress={() => {
            setEditingRule(null);
            setEditorVisible(true);
          }}
          hitSlop={12}
          style={s.backBtn}
        >
          <Feather name="plus" size={22} color="#FFFFFF" />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: insets.bottom + 24 }}>
        <Text style={[s.introText, { color: colors.mutedForeground }]}>
          Rules run in priority order before the automatic matching engine — the first fully
          matching rule wins.
        </Text>

        {isLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />
        ) : rules.length === 0 ? (
          <View style={[s.emptyBox, { borderColor: colors.border }]}>
            <Feather name="filter" size={26} color={colors.mutedForeground} />
            <Text style={[s.emptyTitle, { color: colors.foreground }]}>No rules yet</Text>
            <Text style={[s.emptySubText, { color: colors.mutedForeground }]}>
              Add a rule to automatically file or categorize incoming emails.
            </Text>
          </View>
        ) : (
          rules.map((rule) => (
            <RuleRow
              key={rule.id}
              rule={rule}
              projects={projects}
              onEdit={() => {
                setEditingRule(rule);
                setEditorVisible(true);
              }}
            />
          ))
        )}
      </ScrollView>

      <RuleEditorModal
        visible={editorVisible}
        onClose={() => setEditorVisible(false)}
        rule={editingRule}
        projects={projects}
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 32 },
  restrictedText: { fontSize: 15, textAlign: "center", fontFamily: "NunitoSans_400Regular" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  backBtn: { minWidth: 34, height: 34, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 17, fontFamily: "NunitoSans_600SemiBold", color: "#FFFFFF" },
  introText: { fontSize: 13, fontFamily: "NunitoSans_400Regular", lineHeight: 18 },
  emptyBox: { alignItems: "center", paddingVertical: 40, gap: 8, borderWidth: 1, borderRadius: 16, borderStyle: "dashed" },
  emptyTitle: { fontSize: 13, fontFamily: "NunitoSans_600SemiBold" },
  emptySubText: { fontSize: 12, fontFamily: "NunitoSans_400Regular", textAlign: "center", paddingHorizontal: 24, lineHeight: 17 },
  ruleCard: { borderWidth: 1, borderRadius: 16, padding: 14, gap: 8 },
  ruleName: { fontSize: 14, fontFamily: "NunitoSans_600SemiBold" },
  ruleMeta: { fontSize: 12, fontFamily: "NunitoSans_400Regular", marginTop: 2 },
  ruleConditions: { fontSize: 12, fontFamily: "NunitoSans_400Regular", lineHeight: 16 },
  deleteRow: { flexDirection: "row", alignItems: "center", gap: 5, alignSelf: "flex-start", marginTop: 2 },
  deleteText: { fontSize: 12, fontFamily: "NunitoSans_600SemiBold", color: "#DC2626" },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1 },
  modalCancel: { fontSize: 15, fontFamily: "NunitoSans_400Regular" },
  modalTitle: { fontSize: 16, fontFamily: "NunitoSans_600SemiBold" },
  modalSave: { fontSize: 15, fontFamily: "NunitoSans_600SemiBold" },
  fieldLabel: { fontSize: 13, fontFamily: "NunitoSans_600SemiBold" },
  subLabel: { fontSize: 11, fontFamily: "NunitoSans_600SemiBold", textTransform: "uppercase", letterSpacing: 0.6 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, fontFamily: "NunitoSans_400Regular" },
  chip: { borderRadius: 16, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 7 },
  chipText: { fontSize: 12, fontFamily: "NunitoSans_600SemiBold" },
  conditionCard: { borderWidth: 1, borderRadius: 14, padding: 10, gap: 8 },
  addRow: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start" },
  addRowText: { fontSize: 13, fontFamily: "NunitoSans_600SemiBold" },
});
