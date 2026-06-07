import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Modal,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { customFetch, useGetMe } from "@workspace/api-client-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import * as Haptics from "expo-haptics";
import DateTimePicker, { DateTimePickerChangeEvent } from "@react-native-community/datetimepicker";
import { useLocalSearchParams } from "expo-router";
import { ComplianceAlertBanner } from "@/components/ComplianceAlertBanner";

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
  workerName?: string;
  status: string;
  aiSummary: string | null;
  createdAt: string;
}

// ── Colour maps ────────────────────────────────────────────────────────────────

const CAT_COLORS: Record<string, { bg: string; text: string; icon: string }> = {
  injury:  { bg: "#FEE2E2", text: "#B91C1C", icon: "alert-circle" },
  safety:  { bg: "#DBEAFE", text: "#1D4ED8", icon: "shield" },
  hazard:  { bg: "#FFEDD5", text: "#C2410C", icon: "alert-triangle" },
  toolbox: { bg: "#DCFCE7", text: "#15803D", icon: "tool" },
};
const STATUS_CFG: Record<string, { label: string; color: string; icon: string }> = {
  draft:     { label: "Draft",     color: "#6B7280", icon: "clock" },
  submitted: { label: "Submitted", color: "#F59E0B", icon: "send" },
  reviewed:  { label: "Reviewed",  color: "#3B82F6", icon: "eye" },
  approved:  { label: "Approved",  color: "#10B981", icon: "check-circle" },
};

// ── Category quick buttons ─────────────────────────────────────────────────────

const QUICK_CATS = [
  { key: "injury",  label: "Injury Report",   ...CAT_COLORS.injury,   icon: "alert-circle" },
  { key: "hazard",  label: "Hazard Report",   ...CAT_COLORS.hazard,   icon: "alert-triangle" },
  { key: "safety",  label: "Safety Check",    ...CAT_COLORS.safety,   icon: "shield" },
  { key: "toolbox", label: "Toolbox Talk",    ...CAT_COLORS.toolbox,  icon: "tool" },
];

/**
 * Parse an ISO date/datetime string into a local Date object without
 * UTC offset bugs. `new Date("2025-06-04")` parses as UTC midnight, which
 * shifts to the wrong local date in timezones west of GMT. We append
 * `T00:00:00` to force local-time parsing, or parse components manually.
 */
function parseISOToLocal(value: unknown): Date {
  if (typeof value !== "string" || !value.trim()) return new Date();
  // If it's a datetime string (has "T"), append zero seconds to ensure
  // local-time parsing, then strip the timezone suffix if present.
  const clean = value.replace("Z", "");
  if (clean.includes("T")) {
    return new Date(clean + ":00");
  }
  // Date-only: force local time by appending T00:00:00
  return new Date(clean + "T00:00:00");
}

// ── Field renderer ─────────────────────────────────────────────────────────────

function FieldRenderer({ field, value, onChange, colors }: {
  field: FormField; value: any; onChange: (v: any) => void; colors: any;
}) {
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [tempDate, setTempDate] = useState<Date>(value ? parseISOToLocal(value) : new Date());

  const formatDateValue = useCallback((date: Date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    if (field.type === "datetime-local") {
      const h = String(date.getHours()).padStart(2, "0");
      const min = String(date.getMinutes()).padStart(2, "0");
      return `${y}-${m}-${d}T${h}:${min}`;
    }
    return `${y}-${m}-${d}`;
  }, [field.type]);

  const onValueChange = useCallback((_event: DateTimePickerChangeEvent, date?: Date) => {
    if (date == null) return;
    if (Platform.OS === "android") {
      setShowDatePicker(false);
      onChange(formatDateValue(date));
    } else {
      setTempDate(date);
    }
  }, [formatDateValue, onChange]);

  const onDismiss = useCallback(() => {
    setShowDatePicker(false);
  }, []);

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

  if (field.type === "date" || field.type === "datetime-local") {
    const isDateTime = field.type === "datetime-local";
    const displayValue = value ? String(value) : "";
    return (
      <>
        <Pressable
          onPress={() => {
            setTempDate(displayValue ? parseISOToLocal(displayValue) : new Date());
            setShowDatePicker(true);
          }}
          style={[styles.dateField, { backgroundColor: colors.background, borderColor: colors.border }]}
        >
          <Feather name="calendar" size={15} color={colors.primary} />
          <Text style={[styles.dateFieldText, { color: displayValue ? colors.foreground : colors.mutedForeground }]}>
            {displayValue || (isDateTime ? "Select date & time" : "Select date")}
          </Text>
          <Feather name="chevron-down" size={14} color={colors.mutedForeground} />
        </Pressable>

        {showDatePicker && Platform.OS === "android" && (
          <DateTimePicker
            value={tempDate}
            mode={isDateTime ? "datetime" : "date"}
            display="default"
            themeVariant="dark"
            onValueChange={onValueChange}
            onDismiss={onDismiss}
          />
        )}

        {Platform.OS === "ios" && (
          <Modal visible={showDatePicker} transparent animationType="slide" onRequestClose={() => setShowDatePicker(false)}>
            <View style={styles.modalOverlay}>
              <View style={[styles.modalSheet, { backgroundColor: colors.card }]}>
                <View style={styles.modalHeader}>
                  <Pressable onPress={() => setShowDatePicker(false)} hitSlop={8}>
                    <Text style={[styles.modalCancel, { color: colors.mutedForeground }]}>Cancel</Text>
                  </Pressable>
                  <Text style={[styles.modalTitle, { color: colors.foreground }]}>{isDateTime ? "Select Date & Time" : "Select Date"}</Text>
                  <Pressable
                    onPress={() => {
                      onChange(formatDateValue(tempDate));
                      setShowDatePicker(false);
                    }}
                    hitSlop={8}
                  >
                    <Text style={[styles.modalDone, { color: colors.primary }]}>Done</Text>
                  </Pressable>
                </View>
                <DateTimePicker
                  value={tempDate}
                  mode={isDateTime ? "datetime" : "date"}
                  display="spinner"
                  themeVariant="dark"
                  onValueChange={onValueChange}
                  onDismiss={onDismiss}
                  style={{ width: "100%" }}
                />
              </View>
            </View>
          </Modal>
        )}
      </>
    );
  }

  if (field.type === "select" || field.type === "radio") {
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 4 }}>
        <View style={{ flexDirection: "row", gap: 6, paddingBottom: 2 }}>
          {field.options?.map((opt) => {
            const sel = value === opt;
            return (
              <Pressable
                key={opt}
                onPress={() => onChange(opt)}
                style={[styles.optPill, { borderColor: sel ? colors.primary : colors.border, backgroundColor: sel ? `${colors.primary}15` : colors.card }]}
              >
                <Text style={{ fontSize: 13, color: sel ? colors.primary : colors.mutedForeground, fontFamily: sel ? "Inter_600SemiBold" : "Inter_400Regular" }}>
                  {opt}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    );
  }

  if (field.type === "checkbox") {
    const selected: string[] = Array.isArray(value) ? value : [];
    return (
      <View style={{ gap: 8, marginTop: 4 }}>
        {field.options?.map((opt) => {
          const checked = selected.includes(opt);
          return (
            <Pressable key={opt} onPress={() => onChange(checked ? selected.filter((v) => v !== opt) : [...selected, opt])} style={styles.checkRow}>
              <View style={[styles.checkbox, { borderColor: checked ? colors.primary : colors.border, backgroundColor: checked ? colors.primary : "transparent" }]}>
                {checked && <Feather name="check" size={12} color="#FFFFFF" />}
              </View>
              <Text style={{ fontSize: 14, color: colors.foreground, flex: 1 }}>{opt}</Text>
            </Pressable>
          );
        })}
      </View>
    );
  }

  return (
    <TextInput
      style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
      keyboardType={field.type === "number" ? "decimal-pad" : "default"}
      placeholder={(field.type as string) === "date" ? "YYYY-MM-DD" : field.required ? "Required" : "Optional"}
      placeholderTextColor={colors.mutedForeground}
      value={value ?? ""}
      onChangeText={onChange}
      returnKeyType="next"
    />
  );
}

// ── Submission card ────────────────────────────────────────────────────────────

function SubmissionCard({
  sub, isOwnerOrForeman, colors,
}: {
  sub: Submission; isOwnerOrForeman: boolean; colors: any;
}) {
  const sc = STATUS_CFG[sub.status] ?? STATUS_CFG.draft;
  const cat = CAT_COLORS[sub.templateCategory] ?? { bg: "#F3F4F6", text: "#374151", icon: "file-text" };
  const [expanded, setExpanded] = useState(false);

  return (
    <Pressable
      style={[styles.subCard, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={() => {
        if (sub.aiSummary && isOwnerOrForeman) setExpanded((v) => !v);
      }}
      android_ripple={{ color: `${colors.primary}10` }}
    >
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
        <View style={[styles.subIcon, { backgroundColor: cat.bg }]}>
          <Feather name={cat.icon as any} size={16} color={cat.text} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <Text style={[styles.subName, { color: colors.foreground }]} numberOfLines={1}>
              {sub.templateName ?? "Safety Form"}
            </Text>
            <View style={[styles.catTag, { backgroundColor: cat.bg }]}>
              <Text style={[styles.catTagText, { color: cat.text }]}>{sub.templateCategory}</Text>
            </View>
          </View>
          {isOwnerOrForeman && sub.workerName ? (
            <Text style={[styles.subMeta, { color: colors.mutedForeground }]}>{sub.workerName}</Text>
          ) : null}
          <Text style={[styles.subDate, { color: colors.mutedForeground }]}>
            {format(new Date(sub.createdAt), "MMM d, yyyy 'at' h:mm a")}
          </Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: `${sc.color}18` }]}>
          <Feather name={sc.icon as any} size={11} color={sc.color} />
          <Text style={[styles.statusText, { color: sc.color }]}>{sc.label}</Text>
        </View>
      </View>

      {/* AI Summary — owners/foremen only */}
      {isOwnerOrForeman && sub.aiSummary ? (
        <>
          <Pressable
            onPress={() => setExpanded((v) => !v)}
            style={[styles.aiToggle, { borderTopColor: colors.border }]}
          >
            <Feather name="cpu" size={12} color={colors.primary} />
            <Text style={{ fontSize: 12, color: colors.primary, fontFamily: "Inter_500Medium", flex: 1 }}>
              AI Summary
            </Text>
            <Feather name={expanded ? "chevron-up" : "chevron-down"} size={14} color={colors.primary} />
          </Pressable>
          {expanded ? (
            <View style={[styles.aiSummaryBox, { backgroundColor: `${colors.primary}08`, borderColor: `${colors.primary}20` }]}>
              <Text style={{ fontSize: 12, color: colors.foreground, lineHeight: 18 }}>
                {sub.aiSummary}
              </Text>
            </View>
          ) : null}
        </>
      ) : null}
    </Pressable>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────

type TabKey = "log" | "new";

export default function SafetyTab() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const topInsets = Platform.OS === "web" ? 67 : insets.top;

  const { data: me } = useGetMe();
  const isOwnerOrForeman = me?.role === "owner" || me?.role === "foreman";
  const isWorker = me?.role === "worker";

  const { initCategory, initTab } = useLocalSearchParams<{ initCategory?: string; initTab?: string }>();

  const [tab, setTab] = useState<TabKey>("log");
  const [selectedTemplate, setSelectedTemplate] = useState<FormTemplate | null>(null);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [catFilter, setCatFilter] = useState<string | null>(null);

  // Deep-link from compliance banner: e.g. initCategory="toolbox" initTab="new"
  useEffect(() => {
    if (initCategory) setCatFilter(initCategory);
    if (initTab === "new") setTab("new");
  }, [initCategory, initTab]);

  const { data: templates = [], isLoading: templatesLoading } = useQuery<FormTemplate[]>({
    queryKey: ["safety-templates"],
    queryFn: () => customFetch<FormTemplate[]>("/api/safety/templates"),
  });

  const { data: submissions = [], isLoading: subsLoading, refetch: refetchSubs } = useQuery<Submission[]>({
    queryKey: ["safety-submissions"],
    queryFn: () => customFetch<Submission[]>("/api/safety/submissions"),
  });

  const submitMutation = useMutation({
    mutationFn: (payload: { status: "draft" | "submitted" }) =>
      customFetch<any>("/api/safety/submissions", {
        method: "POST",
        body: JSON.stringify({ templateId: selectedTemplate?.id, data: formData, status: payload.status }),
      }),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["safety-submissions"] });
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(
        vars.status === "submitted" ? "Submitted!" : "Draft Saved",
        vars.status === "submitted"
          ? "Report submitted — your foreman has been notified."
          : "Draft saved — you can submit it later.",
        [{ text: "OK", onPress: () => { resetForm(); setTab("log"); } }]
      );
    },
    onError: () => Alert.alert("Error", "Failed to save. Please try again."),
  });

  function resetForm() {
    setSelectedTemplate(null);
    setFormData({});
  }

  function selectTemplate(t: FormTemplate) {
    const defaults: Record<string, any> = {};
    (t.schema?.fields ?? []).forEach((f) => {
      if (f.type === "select" && f.options) defaults[f.id] = f.options[0];
    });
    setSelectedTemplate(t);
    setFormData(defaults);
  }

  function validateRequired() {
    if (!selectedTemplate) return false;
    return (selectedTemplate.schema?.fields ?? []).every((f) => {
      if (!f.required) return true;
      const v = formData[f.id];
      if (Array.isArray(v)) return v.length > 0;
      return v !== undefined && v !== null && v !== "";
    });
  }

  // Stats
  const total = submissions.length;
  const pending = submissions.filter((s) => s.status === "submitted").length;
  const approved = submissions.filter((s) => s.status === "approved").length;
  const drafts = submissions.filter((s) => s.status === "draft").length;

  // Filtered templates
  const filteredTemplates = catFilter
    ? templates.filter((t) => t.category === catFilter)
    : templates;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topInsets + 8, backgroundColor: colors.sidebar }]}>
        <View>
          <Text style={[styles.headerSub, { color: "rgba(255,255,255,0.55)" }]}>Site Snap</Text>
          <Text style={[styles.headerTitle, { color: "#FFFFFF" }]}>Safety & Incidents</Text>
        </View>
        {/* Role badge */}
        <View style={[styles.roleBadge, { backgroundColor: isWorker ? "#334155" : "#D4AF37" }]}>
          <Text style={{ fontSize: 11, fontFamily: "Inter_700Bold", color: isWorker ? "#94a3b8" : "#111111" }}>
            {isWorker ? "Worker" : isOwnerOrForeman ? (me?.role === "owner" ? "Owner" : "Foreman") : ""}
          </Text>
        </View>
      </View>

      {/* Tab bar */}
      <View style={[styles.tabBar, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        {([["log", "Reports", "list"], ["new", "File Report", "alert-triangle"]] as const).map(([key, label, icon]) => (
          <Pressable
            key={key}
            onPress={() => { setTab(key); if (key === "log") resetForm(); }}
            style={[styles.tabBtn, tab === key && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
          >
            <Feather name={icon as any} size={15} color={tab === key ? colors.primary : colors.mutedForeground} />
            <Text style={{ fontSize: 14, color: tab === key ? colors.primary : colors.mutedForeground, fontFamily: tab === key ? "Inter_600SemiBold" : "Inter_400Regular" }}>
              {label}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* ── Log Tab ── */}
      {tab === "log" && (
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 90 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={subsLoading} onRefresh={refetchSubs} tintColor={colors.primary} />}
        >
          {/* AI Compliance Alerts */}
          <ComplianceAlertBanner />

          {/* Stat row */}
          <View style={styles.statsRow}>
            {[
              { label: "Total", value: total, color: colors.foreground },
              { label: "Drafts", value: drafts, color: "#6B7280" },
              { label: "Pending", value: pending, color: "#F59E0B" },
              { label: "Approved", value: approved, color: "#10B981" },
            ].map((stat) => (
              <View key={stat.label} style={[styles.miniStat, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.miniStatVal, { color: stat.color }]}>{stat.value}</Text>
                <Text style={[styles.miniStatLabel, { color: colors.mutedForeground }]}>{stat.label}</Text>
              </View>
            ))}
          </View>

          {/* Quick category shortcuts */}
          <View style={{ marginBottom: 16 }}>
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>Quick File</Text>
            <View style={styles.quickGrid}>
              {QUICK_CATS.map((cat) => (
                <TouchableOpacity
                  key={cat.key}
                  style={[styles.quickBtn, { backgroundColor: cat.bg, borderColor: `${cat.text}30` }]}
                  onPress={() => {
                    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setCatFilter(cat.key);
                    setTab("new");
                  }}
                  activeOpacity={0.8}
                >
                  <Feather name={cat.icon as any} size={20} color={cat.text} />
                  <Text style={[styles.quickBtnText, { color: cat.text }]}>{cat.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Submissions list */}
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
            {isOwnerOrForeman ? "All Submissions" : "My Submissions"}
          </Text>

          {subsLoading ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />
          ) : submissions.length === 0 ? (
            <View style={[styles.emptyBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Feather name="shield" size={36} color={colors.mutedForeground} />
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No reports yet</Text>
              <Text style={[styles.emptyDesc, { color: colors.mutedForeground }]}>
                Use the quick buttons above or tap "File Report" to submit your first form.
              </Text>
            </View>
          ) : (
            <View style={{ gap: 8 }}>
              {submissions.map((s) => (
                <SubmissionCard key={s.id} sub={s} isOwnerOrForeman={isOwnerOrForeman} colors={colors} />
              ))}
            </View>
          )}
        </ScrollView>
      )}

      {/* ── New Report Tab ── */}
      {tab === "new" && (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <ScrollView
            contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 90 }]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {!selectedTemplate ? (
              <>
                {/* Hint banner */}
                <View style={[styles.hintBanner, { backgroundColor: "#FFF7F0", borderColor: "#FFDAB8" }]}>
                  <Feather name="alert-triangle" size={16} color="#D4AF37" />
                  <Text style={{ fontSize: 13, color: "#CC5200", flex: 1, lineHeight: 18 }}>
                    Select the type of report that best describes the situation.
                  </Text>
                </View>

                {/* Category filter */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    {[null, ...Object.keys(CAT_COLORS)].map((cat) => {
                      const active = catFilter === cat;
                      return (
                        <Pressable
                          key={cat ?? "all"}
                          onPress={() => setCatFilter(cat)}
                          style={[styles.filterPill, {
                            backgroundColor: active ? colors.primary : colors.card,
                            borderColor: active ? colors.primary : colors.border,
                          }]}
                        >
                          <Text style={{ fontSize: 13, color: active ? "#fff" : colors.foreground, fontFamily: "Inter_600SemiBold" }}>
                            {cat ? cat.charAt(0).toUpperCase() + cat.slice(1) : "All"}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </ScrollView>

                {templatesLoading ? (
                  <ActivityIndicator color={colors.primary} style={{ marginTop: 32 }} />
                ) : filteredTemplates.length === 0 ? (
                  <View style={[styles.emptyBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <Feather name="inbox" size={32} color={colors.mutedForeground} />
                    <Text style={[styles.emptyDesc, { color: colors.mutedForeground }]}>
                      No form templates available. Contact your foreman.
                    </Text>
                  </View>
                ) : (
                  <View style={{ gap: 10 }}>
                    {filteredTemplates.map((t) => {
                      const cat = CAT_COLORS[t.category] ?? { bg: "#F3F4F6", text: "#374151", icon: "file-text" };
                      return (
                        <TouchableOpacity
                          key={t.id}
                          style={[styles.templateCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                          onPress={() => { selectTemplate(t); setCatFilter(null); }}
                          activeOpacity={0.75}
                        >
                          <View style={[styles.templateIcon, { backgroundColor: cat.bg }]}>
                            <Feather name={cat.icon as any} size={20} color={cat.text} />
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
              <>
                {/* Back to templates */}
                <TouchableOpacity onPress={resetForm} style={styles.backLink}>
                  <Feather name="chevron-left" size={16} color={colors.primary} />
                  <Text style={{ fontSize: 14, color: colors.primary, fontFamily: "Inter_600SemiBold" }}>Change Form</Text>
                </TouchableOpacity>

                {/* Form header */}
                <View style={[styles.formHeader, { backgroundColor: "#FFF7F0", borderColor: "#FFDAB8" }]}>
                  <Feather name="shield" size={18} color="#D4AF37" />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontFamily: "Inter_700Bold", color: "#CC5200" }}>
                      {selectedTemplate.name}
                    </Text>
                    <Text style={{ fontSize: 12, color: "#CC5200", marginTop: 2, textTransform: "capitalize" }}>
                      {selectedTemplate.category}
                    </Text>
                  </View>
                </View>

                {/* Fields */}
                <View style={[styles.fieldsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  {(selectedTemplate.schema?.fields ?? []).map((field, i) => (
                    <View
                      key={field.id}
                      style={[
                        styles.fieldRow,
                        i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: 14 },
                      ]}
                    >
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 6 }}>
                        <Text style={[styles.fieldLabel, { color: colors.foreground }]}>{field.label}</Text>
                        {field.required && <Text style={{ color: "#EF4444", fontSize: 14 }}>*</Text>}
                      </View>
                      <FieldRenderer
                        field={field}
                        value={formData[field.id]}
                        onChange={(v) => setFormData((prev) => ({ ...prev, [field.id]: v }))}
                        colors={colors}
                      />
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
                    style={[styles.submitBtn, { backgroundColor: validateRequired() ? "#D4AF37" : colors.muted, opacity: validateRequired() ? 1 : 0.55 }]}
                    onPress={() => validateRequired() && submitMutation.mutate({ status: "submitted" })}
                    disabled={submitMutation.isPending || !validateRequired()}
                  >
                    {submitMutation.isPending ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Feather name="send" size={16} color="#FFFFFF" />
                    )}
                    <Text style={styles.submitBtnText}>Submit</Text>
                  </TouchableOpacity>
                </View>

                <Text style={[styles.submitNote, { color: colors.mutedForeground }]}>
                  Submitting notifies your foreman and triggers an AI safety summary.
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
  header: {
    paddingHorizontal: 20,
    paddingBottom: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  headerSub: { fontSize: 12, fontFamily: "Inter_400Regular" },
  headerTitle: { fontSize: 24, fontFamily: "Inter_700Bold", marginTop: 2 },
  roleBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    alignSelf: "flex-end",
    marginBottom: 4,
  },

  tabBar: {
    flexDirection: "row",
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tabBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 13,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },

  scroll: { padding: 16, gap: 0 },

  statsRow: { flexDirection: "row", gap: 8, marginBottom: 16 },
  miniStat: { flex: 1, borderRadius: 10, borderWidth: 1, paddingVertical: 10, alignItems: "center" },
  miniStatVal: { fontSize: 20, fontFamily: "Inter_700Bold" },
  miniStatLabel: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },

  sectionLabel: { fontSize: 12, fontFamily: "Inter_500Medium", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 },

  quickGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  quickBtn: {
    width: "47%",
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    alignItems: "center",
    gap: 8,
  },
  quickBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold", textAlign: "center" },

  subCard: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
    marginBottom: 8,
    padding: 12,
  },
  subIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  subName: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  subMeta: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
  subDate: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 3 },
  catTag: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4 },
  catTagText: { fontSize: 10, fontFamily: "Inter_600SemiBold", textTransform: "capitalize" },
  statusBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6 },
  statusText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  aiToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  aiSummaryBox: {
    marginTop: 8,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
  },

  hintBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 14,
  },
  filterPill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  templateCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
  },
  templateIcon: { width: 42, height: 42, borderRadius: 10, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  templateName: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  templateMeta: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },

  formHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 12,
  },
  fieldsCard: { borderRadius: 12, borderWidth: 1, padding: 16, marginBottom: 16 },
  fieldRow: { paddingBottom: 14 },
  fieldLabel: { fontSize: 14, fontFamily: "Inter_500Medium" },
  input: { borderWidth: 1, borderRadius: 8, padding: 12, fontSize: 14, fontFamily: "Inter_400Regular" },
  textarea: { minHeight: 90 },
  optPill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  checkRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, alignItems: "center", justifyContent: "center" },

  actionRow: { flexDirection: "row", gap: 10, marginBottom: 10 },
  draftBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, padding: 14, borderRadius: 12, borderWidth: 1 },
  draftBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  submitBtn: { flex: 2, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, padding: 14, borderRadius: 12 },
  submitBtnText: { fontSize: 15, fontFamily: "Inter_700Bold", color: "#FFFFFF" },
  submitNote: { fontSize: 12, textAlign: "center", lineHeight: 17, marginBottom: 4 },
  backLink: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 12 },

  emptyBox: { borderRadius: 12, borderWidth: 1, padding: 32, alignItems: "center", gap: 10, marginTop: 8 },
  emptyTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  emptyDesc: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 18 },

  dateField: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10 },
  dateFieldText: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular" },
  modalOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.4)" },
  modalSheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 32 },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 14 },
  modalCancel: { fontSize: 15, fontFamily: "Inter_400Regular" },
  modalTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  modalDone: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
});
