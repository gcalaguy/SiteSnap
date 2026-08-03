import React from "react";
import {
  ActivityIndicator,
  Alert,
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
import { usePermissions } from "@/hooks/usePermissions";
import { ConditionBuilder, type ConditionRow } from "@/components/ConditionBuilder";
import {
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
  onChangeText,
  placeholder,
}: {
  label: string;
  value: string | undefined;
  onChangeText: (v: string) => void;
  placeholder?: string;
}) {
  const colors = useColors();
  return (
    <View style={{ gap: 5 }}>
      <Text style={[s.fieldLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <TextInput
        style={[s.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
        value={value ?? ""}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.mutedForeground}
        autoCapitalize="none"
      />
    </View>
  );
}

function relativeDateLabel(iso: string | null | undefined) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" });
}

function SaveTemplateModal({
  visible,
  onClose,
  onSave,
  saving,
}: {
  visible: boolean;
  onClose: () => void;
  onSave: (name: string) => void;
  saving: boolean;
}) {
  const colors = useColors();
  const [name, setName] = React.useState("");
  React.useEffect(() => {
    if (visible) setName("");
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.overlay} onPress={onClose} />
      <View style={[s.sheet, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
        <View style={[s.sheetHandle, { backgroundColor: colors.border }]} />
        <Text style={[s.sheetTitle, { color: colors.foreground }]}>Save Search Template</Text>
        <View style={{ paddingHorizontal: 16, gap: 12, paddingBottom: 16 }}>
          <TextInput
            style={[s.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
            value={name}
            onChangeText={setName}
            placeholder="e.g. Permits, RFIs, Roofing"
            placeholderTextColor={colors.mutedForeground}
          />
          <Pressable
            onPress={() => name.trim() && onSave(name.trim())}
            disabled={!name.trim() || saving}
            style={[s.primaryBtn, { backgroundColor: colors.primary, opacity: !name.trim() || saving ? 0.6 : 1 }]}
          >
            {saving ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={s.primaryBtnText}>Save</Text>}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

export default function CommunicationsSearchScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const permissions = usePermissions();
  const topInsets = Platform.OS === "web" ? 67 : insets.top;

  const [mode, setMode] = React.useState<SearchMode>("build");
  const [criteria, setCriteria] = React.useState<CommunicationSearchCriteria>(EMPTY_CRITERIA);
  const [results, setResults] = React.useState<StructuredEmailSearchResult[] | null>(null);
  const [showSaveModal, setShowSaveModal] = React.useState(false);

  const [advancedLogic, setAdvancedLogic] = React.useState<"AND" | "OR">("AND");
  const [advancedConditions, setAdvancedConditions] = React.useState<
    ConditionRow<SearchConditionField, SearchConditionOperator>[]
  >([emptyAdvancedCondition()]);

  const [aiQuery, setAiQuery] = React.useState("");
  const [aiAnswer, setAiAnswer] = React.useState<string | null>(null);
  const [aiResults, setAiResults] = React.useState<AiSearchResult[] | null>(null);

  const canView = permissions.viewProjectCommunications;

  const { data: templatesData } = useListCommunicationSearchTemplates(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { query: { enabled: canView } } as any,
  );
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

  async function handleSearch() {
    try {
      const result = await runSearch({ data: criteria, params: { limit: 50 } });
      setResults(result.results);
    } catch {
      Alert.alert("Search failed", "Please try again.");
    }
  }

  async function handleAdvancedSearch() {
    const validConditions = advancedConditions.filter(
      (c) => c.operator === "is_true" || c.operator === "is_false" || c.value.trim().length > 0,
    );
    if (validConditions.length === 0) return;
    try {
      const result = await runSearch({
        data: { conditionTree: { logic: advancedLogic, conditions: validConditions } },
        params: { limit: 50 },
      });
      setResults(result.results);
    } catch {
      Alert.alert("Search failed", "Please try again.");
    }
  }

  async function handleAiSearch() {
    if (!aiQuery.trim()) return;
    try {
      const result = await runAiSearch({ data: { query: aiQuery.trim() } });
      setAiAnswer(result.answer ?? null);
      setAiResults(result.results);
    } catch {
      Alert.alert("Search failed", "Please try again.");
    }
  }

  function applyTemplate(template: CommunicationSearchTemplate) {
    setCriteria(template.criteria ?? {});
    setResults(null);
  }

  async function handleSaveTemplate(name: string) {
    try {
      await saveTemplate({ data: { name, criteria } });
      queryClient.invalidateQueries({ queryKey: getListCommunicationSearchTemplatesQueryKey() });
      setShowSaveModal(false);
    } catch {
      Alert.alert("Failed", "Could not save this template. Please try again.");
    }
  }

  function handleDeleteTemplate(id: number) {
    Alert.alert("Delete template?", undefined, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteTemplate({ templateId: id });
            queryClient.invalidateQueries({ queryKey: getListCommunicationSearchTemplatesQueryKey() });
          } catch {
            Alert.alert("Failed", "Could not delete this template. Please try again.");
          }
        },
      },
    ]);
  }

  if (!canView) {
    return (
      <View style={[s.centered, { backgroundColor: colors.background }]}>
        <Feather name="lock" size={40} color={colors.mutedForeground} />
        <Text style={[s.restrictedText, { color: colors.mutedForeground }]}>
          You don't have access to Project Communications.
        </Text>
      </View>
    );
  }

  const hasAnyCriteria = Object.values(criteria).some((v) =>
    Array.isArray(v) ? v.length > 0 : v != null && v !== "",
  );

  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      <View style={[s.header, { paddingTop: topInsets + 16, backgroundColor: colors.sidebar, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={s.backBtn}>
          <Feather name="arrow-left" size={22} color="#FFFFFF" />
        </Pressable>
        <Text style={s.headerTitle}>Search Builder</Text>
        <View style={{ width: 34 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40, gap: 18 }} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Pressable
            onPress={() => setMode("build")}
            style={[s.chip, { flex: 1, alignItems: "center", backgroundColor: mode === "build" ? colors.primary : colors.muted, borderColor: colors.border }]}
          >
            <Text style={[s.chipText, { color: mode === "build" ? "#FFFFFF" : colors.foreground }]}>Build a Search</Text>
          </Pressable>
          <Pressable
            onPress={() => setMode("advanced")}
            style={[s.chip, { flex: 1, alignItems: "center", backgroundColor: mode === "advanced" ? colors.primary : colors.muted, borderColor: colors.border }]}
          >
            <Text style={[s.chipText, { color: mode === "advanced" ? "#FFFFFF" : colors.foreground }]}>Advanced</Text>
          </Pressable>
          <Pressable
            onPress={() => setMode("ask")}
            style={[s.chip, { flex: 1, alignItems: "center", backgroundColor: mode === "ask" ? colors.primary : colors.muted, borderColor: colors.border }]}
          >
            <Text style={[s.chipText, { color: mode === "ask" ? "#FFFFFF" : colors.foreground }]}>Ask AI</Text>
          </Pressable>
        </View>

        {mode === "advanced" ? (
          <>
            <ConditionBuilder
              conditions={advancedConditions}
              onChange={setAdvancedConditions}
              fieldOptions={CONDITION_FIELD_OPTIONS}
              operatorOptions={CONDITION_OPERATOR_OPTIONS}
              logic={advancedLogic}
              onLogicChange={setAdvancedLogic}
            />
            <Pressable onPress={handleAdvancedSearch} disabled={searching} style={[s.primaryBtn, { backgroundColor: colors.primary }]}>
              {searching ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={s.primaryBtnText}>Search</Text>}
            </Pressable>

            {results != null && (
              <View style={{ gap: 8 }}>
                <Text style={[s.fieldLabel, { color: colors.mutedForeground }]}>{results.length} result{results.length === 1 ? "" : "s"}</Text>
                {results.length === 0 ? (
                  <View style={[s.emptyBox, { borderColor: colors.border }]}>
                    <Feather name="search" size={22} color={colors.mutedForeground} />
                    <Text style={[s.emptyTitle, { color: colors.foreground }]}>No matches</Text>
                  </View>
                ) : (
                  results.map((r) => (
                    <View key={r.id} style={[s.resultCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                      <Text style={[s.resultSubject, { color: colors.foreground }]} numberOfLines={1}>
                        {r.subject || "(no subject)"}
                      </Text>
                      <Text style={[s.resultMeta, { color: colors.mutedForeground }]} numberOfLines={1}>
                        {r.from_name || r.from_email || ""} · {relativeDateLabel(r.sent_at)}
                      </Text>
                    </View>
                  ))
                )}
              </View>
            )}
          </>
        ) : mode === "ask" ? (
          <>
            <View style={{ gap: 6 }}>
              <Text style={[s.fieldLabel, { color: colors.mutedForeground }]}>
                Ask a question about your synced emails
              </Text>
              <TextInput
                style={[s.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
                value={aiQuery}
                onChangeText={setAiQuery}
                placeholder='e.g. "Show all plumbing emails" or "What invoices arrived this month?"'
                placeholderTextColor={colors.mutedForeground}
                multiline
              />
            </View>
            <Pressable
              onPress={handleAiSearch}
              disabled={aiSearching || !aiQuery.trim()}
              style={[s.primaryBtn, { backgroundColor: colors.primary, opacity: !aiQuery.trim() ? 0.6 : 1 }]}
            >
              {aiSearching ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={s.primaryBtnText}>Ask</Text>}
            </Pressable>

            {aiAnswer && (
              <View style={[s.answerBox, { backgroundColor: `${colors.primary}12`, borderColor: colors.primary }]}>
                <Feather name="zap" size={13} color={colors.primary} />
                <Text style={[s.answerText, { color: colors.foreground }]}>{aiAnswer}</Text>
              </View>
            )}

            {aiResults != null && (
              <View style={{ gap: 8 }}>
                <Text style={[s.fieldLabel, { color: colors.mutedForeground }]}>
                  {aiResults.length} result{aiResults.length === 1 ? "" : "s"}
                </Text>
                {aiResults.length === 0 ? (
                  <View style={[s.emptyBox, { borderColor: colors.border }]}>
                    <Feather name="search" size={22} color={colors.mutedForeground} />
                    <Text style={[s.emptyTitle, { color: colors.foreground }]}>No matches</Text>
                  </View>
                ) : (
                  aiResults.map((r) => (
                    <View key={r.id} style={[s.resultCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                      <Text style={[s.resultSubject, { color: colors.foreground }]} numberOfLines={1}>
                        {r.subject || "(no subject)"}
                      </Text>
                      <Text style={[s.resultMeta, { color: colors.mutedForeground }]} numberOfLines={1}>
                        {r.from_name || r.from_email || ""} · {relativeDateLabel(r.sent_at)}
                        {r.ai_trade ? ` · ${r.ai_trade}` : ""}
                      </Text>
                      {r.ai_summary && (
                        <Text style={[s.resultSummary, { color: colors.mutedForeground }]} numberOfLines={2}>
                          {r.ai_summary}
                        </Text>
                      )}
                    </View>
                  ))
                )}
              </View>
            )}
          </>
        ) : (
        <>
        {templates.length > 0 && (
          <View style={{ gap: 8 }}>
            <Text style={[s.fieldLabel, { color: colors.mutedForeground }]}>Saved templates</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {templates.map((t) => (
                  <View key={t.id} style={[s.templateChip, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                    <Pressable onPress={() => applyTemplate(t)} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <Feather name="bookmark" size={12} color={colors.primary} />
                      <Text style={[s.templateChipText, { color: colors.foreground }]}>{t.name}</Text>
                    </Pressable>
                    <Pressable onPress={() => handleDeleteTemplate(t.id)} hitSlop={8}>
                      <Feather name="x" size={13} color={colors.mutedForeground} />
                    </Pressable>
                  </View>
                ))}
              </View>
            </ScrollView>
          </View>
        )}

        <TextField label="Keywords" value={criteria.keywords} onChangeText={(v) => set("keywords", v)} placeholder="Free-text search" />
        <TextField label="Subject" value={criteria.subject} onChangeText={(v) => set("subject", v)} />
        <TextField label="Sender" value={criteria.sender} onChangeText={(v) => set("sender", v)} />
        <TextField label="Recipient" value={criteria.recipient} onChangeText={(v) => set("recipient", v)} />
        <TextField label="Client" value={criteria.client} onChangeText={(v) => set("client", v)} />
        <TextField label="Vendor" value={criteria.vendor} onChangeText={(v) => set("vendor", v)} />
        <TextField label="Address" value={criteria.address} onChangeText={(v) => set("address", v)} />
        <TextField label="Project Number" value={criteria.projectNumber} onChangeText={(v) => set("projectNumber", v)} />

        <View style={{ flexDirection: "row", gap: 10 }}>
          <View style={{ flex: 1 }}>
            <TextField label="From date" value={criteria.dateFrom} onChangeText={(v) => set("dateFrom", v)} placeholder="YYYY-MM-DD" />
          </View>
          <View style={{ flex: 1 }}>
            <TextField label="To date" value={criteria.dateTo} onChangeText={(v) => set("dateTo", v)} placeholder="YYYY-MM-DD" />
          </View>
        </View>

        <View style={{ gap: 6 }}>
          <Text style={[s.fieldLabel, { color: colors.mutedForeground }]}>Attachment type</Text>
          <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
            {ATTACHMENT_TYPES.map((opt) => {
              const active = (criteria.attachmentTypes ?? []).includes(opt.value);
              return (
                <Pressable
                  key={opt.value}
                  onPress={() => toggleAttachmentType(opt.value)}
                  style={[s.chip, { backgroundColor: active ? colors.primary : colors.muted, borderColor: colors.border }]}
                >
                  <Text style={[s.chipText, { color: active ? "#FFFFFF" : colors.foreground }]}>{opt.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={{ gap: 6 }}>
          <Text style={[s.fieldLabel, { color: colors.mutedForeground }]}>Priority</Text>
          <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
            {PRIORITY_OPTIONS.map((opt) => {
              const active = criteria.priority === opt.value;
              return (
                <Pressable
                  key={opt.value}
                  onPress={() => set("priority", active ? undefined : opt.value)}
                  style={[s.chip, { backgroundColor: active ? colors.primary : colors.muted, borderColor: colors.border }]}
                >
                  <Text style={[s.chipText, { color: active ? "#FFFFFF" : colors.foreground }]}>{opt.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={s.switchRow}>
          <Text style={[s.fieldLabel, { color: colors.foreground }]}>Flagged only</Text>
          <Switch value={!!criteria.flagged} onValueChange={(v) => set("flagged", v || undefined)} />
        </View>
        <View style={s.switchRow}>
          <Text style={[s.fieldLabel, { color: colors.foreground }]}>Part of a conversation (2+ messages)</Text>
          <Switch value={!!criteria.hasConversation} onValueChange={(v) => set("hasConversation", v || undefined)} />
        </View>

        <View style={{ flexDirection: "row", gap: 10 }}>
          <Pressable onPress={handleSearch} disabled={searching} style={[s.primaryBtn, { flex: 1, backgroundColor: colors.primary }]}>
            {searching ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={s.primaryBtnText}>Search</Text>}
          </Pressable>
          <Pressable
            onPress={() => setShowSaveModal(true)}
            disabled={!hasAnyCriteria}
            style={[s.secondaryBtn, { borderColor: colors.border, opacity: hasAnyCriteria ? 1 : 0.5 }]}
          >
            <Feather name="bookmark" size={14} color={colors.foreground} />
            <Text style={[s.secondaryBtnText, { color: colors.foreground }]}>Save</Text>
          </Pressable>
        </View>

        {results != null && (
          <View style={{ gap: 8 }}>
            <Text style={[s.fieldLabel, { color: colors.mutedForeground }]}>{results.length} result{results.length === 1 ? "" : "s"}</Text>
            {results.length === 0 ? (
              <View style={[s.emptyBox, { borderColor: colors.border }]}>
                <Feather name="search" size={22} color={colors.mutedForeground} />
                <Text style={[s.emptyTitle, { color: colors.foreground }]}>No matches</Text>
              </View>
            ) : (
              results.map((r) => (
                <View key={r.id} style={[s.resultCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Text style={[s.resultSubject, { color: colors.foreground }]} numberOfLines={1}>
                    {r.subject || "(no subject)"}
                  </Text>
                  <Text style={[s.resultMeta, { color: colors.mutedForeground }]} numberOfLines={1}>
                    {r.from_name || r.from_email || ""} · {relativeDateLabel(r.sent_at)}
                  </Text>
                </View>
              ))
            )}
          </View>
        )}
        </>
        )}
      </ScrollView>

      <SaveTemplateModal
        visible={showSaveModal}
        onClose={() => setShowSaveModal(false)}
        onSave={handleSaveTemplate}
        saving={savingTemplate}
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
  fieldLabel: { fontSize: 12, fontFamily: "NunitoSans_600SemiBold" },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, fontFamily: "NunitoSans_400Regular" },
  chip: { borderRadius: 16, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 7 },
  chipText: { fontSize: 12, fontFamily: "NunitoSans_600SemiBold" },
  switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  primaryBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 16, paddingVertical: 13 },
  primaryBtnText: { fontSize: 14, fontFamily: "NunitoSans_600SemiBold", color: "#FFFFFF" },
  secondaryBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 16, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 13 },
  secondaryBtnText: { fontSize: 13, fontFamily: "NunitoSans_600SemiBold" },
  templateChip: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 16, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 7 },
  templateChipText: { fontSize: 12, fontFamily: "NunitoSans_600SemiBold" },
  emptyBox: { alignItems: "center", paddingVertical: 24, gap: 6, borderWidth: 1, borderRadius: 16, borderStyle: "dashed" },
  emptyTitle: { fontSize: 13, fontFamily: "NunitoSans_600SemiBold" },
  resultCard: { borderWidth: 1, borderRadius: 14, padding: 12, gap: 2 },
  resultSubject: { fontSize: 14, fontFamily: "NunitoSans_600SemiBold" },
  resultMeta: { fontSize: 12, fontFamily: "NunitoSans_400Regular" },
  resultSummary: { fontSize: 12, fontFamily: "NunitoSans_400Regular", marginTop: 4, lineHeight: 16 },
  answerBox: { flexDirection: "row", gap: 8, alignItems: "flex-start", borderWidth: 1, borderRadius: 14, padding: 12 },
  answerText: { flex: 1, fontSize: 13, fontFamily: "NunitoSans_400Regular", lineHeight: 19 },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)" },
  sheet: { borderTopWidth: 1, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 10, paddingBottom: 20 },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, alignSelf: "center", marginBottom: 12 },
  sheetTitle: { fontSize: 15, fontFamily: "NunitoSans_600SemiBold", paddingHorizontal: 16, marginBottom: 8 },
});
