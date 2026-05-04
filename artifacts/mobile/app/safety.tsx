import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { customFetch } from "@workspace/api-client-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";

// ── Types ──────────────────────────────────────────────────────────────────────
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
interface Submission {
  id: number;
  templateName: string;
  templateCategory: string;
  status: string;
  aiSummary: string | null;
  createdAt: string;
}

// ── Colour maps ────────────────────────────────────────────────────────────────
const CAT_COLORS: Record<string, { bg: string; text: string }> = {
  injury:  { bg: "#FEE2E2", text: "#B91C1C" },
  safety:  { bg: "#DBEAFE", text: "#1D4ED8" },
  hazard:  { bg: "#FFEDD5", text: "#C2410C" },
  toolbox: { bg: "#DCFCE7", text: "#15803D" },
};
const STATUS_CFG: Record<string, { label: string; color: string; icon: string }> = {
  draft:     { label: "Draft",     color: "#6B7280", icon: "clock" },
  submitted: { label: "Submitted", color: "#F59E0B", icon: "send" },
  reviewed:  { label: "Reviewed",  color: "#3B82F6", icon: "eye" },
  approved:  { label: "Approved",  color: "#10B981", icon: "check-circle" },
};

// ── Field renderer ─────────────────────────────────────────────────────────────
function FieldRenderer({ field, value, onChange, colors }: {
  field: FormField; value: any; onChange: (v: any) => void; colors: any;
}) {
  if (field.type === "textarea") {
    return (
      <TextInput
        style={[styles.input, styles.textarea, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
        multiline
        numberOfLines={4}
        textAlignVertical="top"
        placeholder={field.required ? "Required" : "Optional"}
        placeholderTextColor={colors.mutedForeground}
        value={value ?? ""}
        onChangeText={onChange}
      />
    );
  }

  if (field.type === "select") {
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 4 }}>
        <View style={{ flexDirection: "row", gap: 6, paddingBottom: 2 }}>
          {field.options?.map((opt) => {
            const sel = value === opt;
            return (
              <Pressable
                key={opt}
                onPress={() => onChange(opt)}
                style={[styles.optionPill, { borderColor: sel ? colors.primary : colors.border, backgroundColor: sel ? `${colors.primary}15` : colors.card }]}
              >
                <Text style={[styles.optionPillText, { color: sel ? colors.primary : colors.mutedForeground, fontFamily: sel ? "Inter_600SemiBold" : "Inter_400Regular" }]}>
                  {opt}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    );
  }

  if (field.type === "radio") {
    return (
      <View style={{ gap: 8, marginTop: 4 }}>
        {field.options?.map((opt) => {
          const sel = value === opt;
          return (
            <Pressable key={opt} onPress={() => onChange(opt)} style={styles.radioRow}>
              <View style={[styles.radioOuter, { borderColor: sel ? colors.primary : colors.border }]}>
                {sel && <View style={[styles.radioInner, { backgroundColor: colors.primary }]} />}
              </View>
              <Text style={[styles.radioLabel, { color: colors.foreground }]}>{opt}</Text>
            </Pressable>
          );
        })}
      </View>
    );
  }

  if (field.type === "checkbox") {
    const selected: string[] = Array.isArray(value) ? value : [];
    return (
      <View style={{ gap: 8, marginTop: 4 }}>
        {field.options?.map((opt) => {
          const checked = selected.includes(opt);
          return (
            <Pressable
              key={opt}
              onPress={() => onChange(checked ? selected.filter((v) => v !== opt) : [...selected, opt])}
              style={styles.radioRow}
            >
              <View style={[styles.checkbox, { borderColor: checked ? colors.primary : colors.border, backgroundColor: checked ? colors.primary : "transparent" }]}>
                {checked && <Feather name="check" size={12} color="#FFFFFF" />}
              </View>
              <Text style={[styles.radioLabel, { color: colors.foreground }]}>{opt}</Text>
            </Pressable>
          );
        })}
      </View>
    );
  }

  // text, number, date, datetime-local
  return (
    <TextInput
      style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
      keyboardType={field.type === "number" ? "decimal-pad" : "default"}
      placeholder={
        field.type === "date" ? "YYYY-MM-DD" :
        field.type === "datetime-local" ? "YYYY-MM-DD HH:MM" :
        (field.required ? "Required" : "Optional")
      }
      placeholderTextColor={colors.mutedForeground}
      value={value ?? ""}
      onChangeText={onChange}
      returnKeyType="next"
    />
  );
}

// ── Submission log card ────────────────────────────────────────────────────────
function SubmissionCard({ sub, colors, onPress }: { sub: Submission; colors: any; onPress: () => void }) {
  const sc = STATUS_CFG[sub.status] ?? STATUS_CFG.draft;
  const cat = CAT_COLORS[sub.templateCategory] ?? { bg: "#F3F4F6", text: "#374151" };
  return (
    <TouchableOpacity style={[styles.subCard, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={onPress} activeOpacity={0.75}>
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
        <View style={[styles.subIconWrap, { backgroundColor: "#FEF3EB" }]}>
          <Feather name="shield" size={16} color="#FF6600" />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <Text style={[styles.subName, { color: colors.foreground }]} numberOfLines={1}>{sub.templateName ?? "Safety Form"}</Text>
            {sub.templateCategory && (
              <View style={[styles.catTag, { backgroundColor: cat.bg }]}>
                <Text style={[styles.catTagText, { color: cat.text }]}>{sub.templateCategory}</Text>
              </View>
            )}
          </View>
          {sub.aiSummary && (
            <Text style={[styles.subSummary, { color: colors.mutedForeground }]} numberOfLines={2}>"{sub.aiSummary.slice(0, 100)}…"</Text>
          )}
          <Text style={[styles.subDate, { color: colors.mutedForeground }]}>
            {format(new Date(sub.createdAt), "MMM d, yyyy 'at' h:mm a")}
          </Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: `${sc.color}18` }]}>
          <Feather name={sc.icon as any} size={11} color={sc.color} />
          <Text style={[styles.statusText, { color: sc.color }]}>{sc.label}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ── Main screen ────────────────────────────────────────────────────────────────
export default function SafetyScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const topInset = Platform.OS === "web" ? 67 : insets.top;

  type Tab = "log" | "new";
  const [tab, setTab] = useState<Tab>("log");
  const [selectedTemplate, setSelectedTemplate] = useState<FormTemplate | null>(null);
  const [formData, setFormData] = useState<Record<string, any>>({});

  // ── Data fetching ──────────────────────────────────────────────────────────
  const { data: templates = [], isLoading: templatesLoading } = useQuery<FormTemplate[]>({
    queryKey: ["safety-templates"],
    queryFn: () => customFetch<FormTemplate[]>("/api/safety/templates"),
  });

  const { data: submissions = [], isLoading: subsLoading, refetch: refetchSubs } = useQuery<Submission[]>({
    queryKey: ["safety-submissions"],
    queryFn: () => customFetch<Submission[]>("/api/safety/submissions"),
  });

  // ── Submission mutation ────────────────────────────────────────────────────
  const submitMutation = useMutation({
    mutationFn: (payload: { status: "draft" | "submitted" }) =>
      customFetch<any>("/api/safety/submissions", {
        method: "POST",
        body: JSON.stringify({ templateId: selectedTemplate?.id, data: formData, status: payload.status }),
      }),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["safety-submissions"] });
      const msg = vars.status === "submitted"
        ? "Form submitted — your foreman has been notified and an AI summary is being generated."
        : "Draft saved — you can submit it later.";
      Alert.alert(vars.status === "submitted" ? "Submitted!" : "Draft Saved", msg, [
        { text: "OK", onPress: () => { resetForm(); setTab("log"); } },
      ]);
    },
    onError: () => Alert.alert("Error", "Failed to save form. Please try again."),
  });

  function resetForm() {
    setSelectedTemplate(null);
    setFormData({});
  }

  function handleFieldChange(fieldId: string, value: any) {
    setFormData((prev) => ({ ...prev, [fieldId]: value }));
  }

  function selectTemplate(t: FormTemplate) {
    const defaults: Record<string, any> = {};
    (t.schema?.fields ?? []).forEach((f) => {
      if (f.type === "select" && f.options) defaults[f.id] = f.options[0];
    });
    setSelectedTemplate(t);
    setFormData(defaults);
  }

  function validateRequired(): boolean {
    if (!selectedTemplate) return false;
    return (selectedTemplate.schema?.fields ?? []).every((f) => {
      if (!f.required) return true;
      const v = formData[f.id];
      if (Array.isArray(v)) return v.length > 0;
      return v !== undefined && v !== null && v !== "";
    });
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topInset + 12, backgroundColor: colors.sidebar }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Safety & Incidents</Text>
        <View style={{ width: 38 }} />
      </View>

      {/* Tab bar */}
      <View style={[styles.tabBar, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        {([["log", "My Reports", "list"], ["new", "File Report", "alert-triangle"]] as const).map(([key, label, icon]) => (
          <Pressable
            key={key}
            onPress={() => { setTab(key); if (key === "log") resetForm(); }}
            style={[styles.tabBtn, tab === key && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
          >
            <Feather name={icon as any} size={15} color={tab === key ? colors.primary : colors.mutedForeground} />
            <Text style={[styles.tabLabel, { color: tab === key ? colors.primary : colors.mutedForeground, fontFamily: tab === key ? "Inter_600SemiBold" : "Inter_400Regular" }]}>
              {label}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* ── Log tab ──────────────────────────────────────────────────────────── */}
      {tab === "log" && (
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 32 }]}
        >
          {/* Stats row */}
          <View style={styles.statsRow}>
            {[
              { label: "Total", value: submissions.length, color: colors.foreground },
              { label: "Drafts", value: submissions.filter((s) => s.status === "draft").length, color: "#6B7280" },
              { label: "Pending", value: submissions.filter((s) => s.status === "submitted").length, color: "#F59E0B" },
              { label: "Approved", value: submissions.filter((s) => s.status === "approved").length, color: "#10B981" },
            ].map((stat) => (
              <View key={stat.label} style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.statValue, { color: stat.color }]}>{stat.value}</Text>
                <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{stat.label}</Text>
              </View>
            ))}
          </View>

          {/* New report CTA */}
          <TouchableOpacity
            style={[styles.newReportCta, { backgroundColor: "#FF6600" }]}
            onPress={() => setTab("new")}
            activeOpacity={0.85}
          >
            <Feather name="plus-circle" size={18} color="#FFFFFF" />
            <Text style={styles.newReportCtaText}>File a New Report</Text>
          </TouchableOpacity>

          {/* Submissions */}
          {subsLoading ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: 32 }} />
          ) : submissions.length === 0 ? (
            <View style={[styles.emptyBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Feather name="shield" size={36} color={colors.mutedForeground} />
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No reports yet</Text>
              <Text style={[styles.emptyDesc, { color: colors.mutedForeground }]}>Tap "File a New Report" to submit your first safety form.</Text>
            </View>
          ) : (
            <View style={{ gap: 8 }}>
              {submissions.map((s) => (
                <SubmissionCard key={s.id} sub={s} colors={colors} onPress={() => {}} />
              ))}
            </View>
          )}
        </ScrollView>
      )}

      {/* ── New Report tab ────────────────────────────────────────────────────── */}
      {tab === "new" && (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 48 }]} keyboardShouldPersistTaps="handled">
            {!selectedTemplate ? (
              /* Template picker */
              <>
                <View style={[styles.formPickerHeader, { backgroundColor: "#FFF7F0", borderColor: "#FFDAB8" }]}>
                  <Feather name="alert-triangle" size={18} color="#FF6600" />
                  <Text style={[styles.formPickerHint, { color: "#CC5200" }]}>
                    Select the type of report that best describes the situation.
                  </Text>
                </View>

                {templatesLoading ? (
                  <ActivityIndicator color={colors.primary} style={{ marginTop: 32 }} />
                ) : templates.length === 0 ? (
                  <View style={[styles.emptyBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <Feather name="inbox" size={32} color={colors.mutedForeground} />
                    <Text style={[styles.emptyDesc, { color: colors.mutedForeground }]}>No form templates available. Contact your foreman.</Text>
                  </View>
                ) : (
                  <View style={{ gap: 10 }}>
                    {templates.map((t) => {
                      const cat = CAT_COLORS[t.category] ?? { bg: "#F3F4F6", text: "#374151" };
                      return (
                        <TouchableOpacity
                          key={t.id}
                          style={[styles.templateCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                          onPress={() => selectTemplate(t)}
                          activeOpacity={0.75}
                        >
                          <View style={[styles.templateIconWrap, { backgroundColor: cat.bg }]}>
                            <Feather name="file-text" size={20} color={cat.text} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.templateName, { color: colors.foreground }]}>{t.name}</Text>
                            <Text style={[styles.templateMeta, { color: colors.mutedForeground }]}>
                              {(t.schema?.fields ?? []).length} fields · {t.category}
                            </Text>
                          </View>
                          <Feather name="chevron-right" size={18} color={colors.border} />
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
              </>
            ) : (
              /* Form fill */
              <>
                {/* Selected template header */}
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 4 }}>
                  <TouchableOpacity onPress={resetForm} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <Feather name="chevron-left" size={16} color={colors.primary} />
                    <Text style={[styles.backLink, { color: colors.primary }]}>Change Form</Text>
                  </TouchableOpacity>
                </View>

                <View style={[styles.formHeader, { backgroundColor: "#FFF7F0", borderColor: "#FFDAB8" }]}>
                  <Feather name="shield" size={18} color="#FF6600" />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.formHeaderName, { color: "#CC5200" }]}>{selectedTemplate.name}</Text>
                    <Text style={[styles.formHeaderCat, { color: "#CC5200" }]}>{selectedTemplate.category}</Text>
                  </View>
                </View>

                {/* Fields */}
                <View style={[styles.fieldsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  {(selectedTemplate.schema?.fields ?? []).map((field, i) => (
                    <View key={field.id} style={[styles.fieldRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: 14 }]}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 6 }}>
                        <Text style={[styles.fieldLabel, { color: colors.foreground }]}>{field.label}</Text>
                        {field.required && <Text style={{ color: "#EF4444", fontSize: 13 }}>*</Text>}
                      </View>
                      <FieldRenderer field={field} value={formData[field.id]} onChange={(v) => handleFieldChange(field.id, v)} colors={colors} />
                    </View>
                  ))}
                </View>

                {/* Actions */}
                <View style={styles.actionRow}>
                  <TouchableOpacity
                    style={[styles.draftBtn, { borderColor: colors.border, backgroundColor: colors.card }]}
                    onPress={() => submitMutation.mutate({ status: "draft" })}
                    disabled={submitMutation.isPending}
                  >
                    {submitMutation.isPending ? (
                      <ActivityIndicator size="small" color={colors.mutedForeground} />
                    ) : (
                      <Feather name="save" size={16} color={colors.mutedForeground} />
                    )}
                    <Text style={[styles.draftBtnText, { color: colors.mutedForeground }]}>Save Draft</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.submitBtn, { backgroundColor: validateRequired() ? "#FF6600" : colors.muted, opacity: validateRequired() ? 1 : 0.6 }]}
                    onPress={() => validateRequired() && submitMutation.mutate({ status: "submitted" })}
                    disabled={submitMutation.isPending || !validateRequired()}
                  >
                    {submitMutation.isPending ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Feather name="send" size={16} color="#FFFFFF" />
                    )}
                    <Text style={styles.submitBtnText}>Submit Report</Text>
                  </TouchableOpacity>
                </View>

                <Text style={[styles.submitNote, { color: colors.mutedForeground }]}>
                  Submitting notifies your foreman and generates an AI safety summary.
                </Text>
              </>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 14 },
  backBtn: { width: 38, height: 38, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 18, fontFamily: "Inter_700Bold", color: "#FFFFFF" },

  tabBar: { flexDirection: "row", borderBottomWidth: StyleSheet.hairlineWidth },
  tabBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 13, borderBottomWidth: 2, borderBottomColor: "transparent" },
  tabLabel: { fontSize: 14 },

  scroll: { padding: 16, gap: 12 },

  statsRow: { flexDirection: "row", gap: 8 },
  statCard: { flex: 1, borderRadius: 10, borderWidth: 1, paddingVertical: 10, alignItems: "center" },
  statValue: { fontSize: 20, fontFamily: "Inter_700Bold" },
  statLabel: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },

  newReportCta: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderRadius: 12 },
  newReportCtaText: { fontSize: 15, fontFamily: "Inter_700Bold", color: "#FFFFFF" },

  emptyBox: { borderRadius: 12, borderWidth: 1, padding: 32, alignItems: "center", gap: 10 },
  emptyTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  emptyDesc: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 19 },

  subCard: { borderRadius: 12, borderWidth: 1, padding: 14 },
  subIconWrap: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  subName: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  subSummary: { fontSize: 12, fontFamily: "Inter_400Regular", fontStyle: "italic", marginTop: 3, lineHeight: 17 },
  subDate: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 4 },
  catTag: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  catTagText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  statusBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  statusText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },

  formPickerHeader: { flexDirection: "row", alignItems: "flex-start", gap: 10, padding: 12, borderRadius: 10, borderWidth: 1 },
  formPickerHint: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },

  templateCard: { flexDirection: "row", alignItems: "center", padding: 14, borderRadius: 12, borderWidth: 1, gap: 12 },
  templateIconWrap: { width: 44, height: 44, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  templateName: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  templateMeta: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },

  backLink: { fontSize: 14, fontFamily: "Inter_500Medium" },
  formHeader: { flexDirection: "row", alignItems: "center", gap: 10, padding: 14, borderRadius: 12, borderWidth: 1 },
  formHeaderName: { fontSize: 15, fontFamily: "Inter_700Bold" },
  formHeaderCat: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1, textTransform: "capitalize" },

  fieldsCard: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 14 },
  fieldRow: { gap: 0 },
  fieldLabel: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, fontSize: 15, fontFamily: "Inter_400Regular" },
  textarea: { height: 96, paddingTop: 10 },
  optionPill: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8, borderWidth: 1 },
  optionPillText: { fontSize: 13 },
  radioRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  radioOuter: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  radioInner: { width: 10, height: 10, borderRadius: 5 },
  checkbox: { width: 20, height: 20, borderRadius: 5, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  radioLabel: { fontSize: 14, fontFamily: "Inter_400Regular", flex: 1 },

  actionRow: { flexDirection: "row", gap: 10 },
  draftBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 13, borderRadius: 12, borderWidth: 1 },
  draftBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  submitBtn: { flex: 2, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 13, borderRadius: 12 },
  submitBtnText: { fontSize: 14, fontFamily: "Inter_700Bold", color: "#FFFFFF" },
  submitNote: { fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 17 },
});
