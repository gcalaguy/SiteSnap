import { customFetch, useListProjects } from "@workspace/api-client-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { Feather } from "@expo/vector-icons";
import {
  PSI_HAZARD_CATEGORIES,
  PSI_HAZARD_CATEGORY_KEYS,
  emptyPsiHazards,
  type PsiHazardCategoryKey,
  type PsiHazards,
  type PsiTaskRow,
  type PsiChecklistDetail,
} from "@/constants/psi";

function newTaskRow(): PsiTaskRow {
  return { id: `row-${Math.random().toString(36).slice(2, 10)}`, task: "", hazard: "", control: "" };
}

export default function PsiChecklistScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { id, projectId: initialProjectId } = useLocalSearchParams<{ id?: string; projectId?: string }>();
  const editId = id ? parseInt(id) : undefined;

  const { data: projects = [] } = useListProjects();
  const existingQuery = useQuery<PsiChecklistDetail>({
    queryKey: ["psi-checklist", editId],
    queryFn: () => customFetch(`/api/psi/${editId}`),
    enabled: !!editId,
  });

  const [projectId, setProjectId] = useState<number | null>(initialProjectId ? parseInt(initialProjectId) : null);
  const [weatherTemp, setWeatherTemp] = useState("");
  const [tradeDescription, setTradeDescription] = useState("");
  const [location, setLocation] = useState("");
  const [hazards, setHazards] = useState<PsiHazards>(() => emptyPsiHazards());
  const [taskRows, setTaskRows] = useState<PsiTaskRow[]>([newTaskRow()]);
  const [expanded, setExpanded] = useState<PsiHazardCategoryKey | null>(PSI_HAZARD_CATEGORY_KEYS[0] ?? null);

  useEffect(() => {
    if (!existingQuery.data) return;
    const psi = existingQuery.data.psi;
    setProjectId(psi.projectId);
    setWeatherTemp(psi.weatherTemp ?? "");
    setTradeDescription(psi.tradeDescription ?? "");
    setLocation(psi.location ?? "");
    setHazards({ ...emptyPsiHazards(), ...psi.hazards });
    setTaskRows(psi.taskRows.length ? psi.taskRows : [newTaskRow()]);
  }, [existingQuery.data]);

  function buildPayload() {
    return {
      projectId,
      date: new Date().toISOString().slice(0, 10),
      weatherTemp: weatherTemp || null,
      tradeDescription: tradeDescription || null,
      location: location || null,
      hazards,
      taskRows: taskRows.filter((r) => r.task || r.hazard || r.control),
    };
  }

  const saveMutation = useMutation({
    mutationFn: async ({ submit }: { submit: boolean }) => {
      if (editId) {
        await customFetch(`/api/psi/${editId}`, { method: "PATCH", body: JSON.stringify(buildPayload()) });
        if (submit) {
          return customFetch<{ id: number }>(`/api/psi/${editId}/submit`, { method: "POST" });
        }
        return { id: editId };
      }
      return customFetch<{ id: number }>("/api/psi", {
        method: "POST",
        body: JSON.stringify({ ...buildPayload(), submit }),
      });
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["psi-checklists"] });
      router.replace(`/(tabs)/(home)/psi-detail?id=${result.id}`);
    },
  });

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

  function updateTaskRow(rowId: string, field: keyof Omit<PsiTaskRow, "id">, value: string) {
    setTaskRows((rows) => rows.map((r) => (r.id === rowId ? { ...r, [field]: value } : r)));
  }

  function removeTaskRow(rowId: string) {
    setTaskRows((rows) => (rows.length > 1 ? rows.filter((r) => r.id !== rowId) : rows));
  }

  const canSave = !!projectId;
  const s = styles(colors);

  if (editId && existingQuery.isLoading) {
    return (
      <View style={[s.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: insets.top + 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Feather name="arrow-left" size={20} color={colors.foreground} />
          <Text style={[s.backText, { color: colors.foreground }]}>Back</Text>
        </TouchableOpacity>
        <Text style={[s.title, { color: colors.foreground }]}>{editId ? "Edit" : "New"} Pre-Inspection Checklist</Text>
        <Text style={[s.subtitle, { color: colors.mutedForeground }]}>PSI — Pre-Site/Task Inspection</Text>

        <Text style={[s.label, { color: colors.mutedForeground }]}>Project</Text>
        <View style={s.chipRow}>
          {projects.map((p) => (
            <TouchableOpacity
              key={p.id}
              onPress={() => setProjectId(p.id)}
              style={[s.chip, { backgroundColor: projectId === p.id ? colors.primary : colors.card, borderColor: projectId === p.id ? colors.primary : colors.border }]}
            >
              <Text style={[s.chipText, { color: projectId === p.id ? "#fff" : colors.foreground }]}>{p.name}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={[s.label, { color: colors.mutedForeground }]}>Weather / Temperature</Text>
        <TextInput
          value={weatherTemp}
          onChangeText={setWeatherTemp}
          placeholder="e.g. Clear, 12°C"
          placeholderTextColor={colors.mutedForeground}
          style={[s.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]}
        />

        <Text style={[s.label, { color: colors.mutedForeground }]}>Trade / Task Description</Text>
        <TextInput
          value={tradeDescription}
          onChangeText={setTradeDescription}
          placeholder="e.g. Formwork installation"
          placeholderTextColor={colors.mutedForeground}
          style={[s.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]}
        />

        <Text style={[s.label, { color: colors.mutedForeground }]}>Location</Text>
        <TextInput
          value={location}
          onChangeText={setLocation}
          placeholder="e.g. Level 3, North Wing"
          placeholderTextColor={colors.mutedForeground}
          style={[s.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]}
        />

        <Text style={[s.label, { color: colors.mutedForeground, marginTop: 20 }]}>Hazard Checklist</Text>
        {PSI_HAZARD_CATEGORY_KEYS.map((key) => {
          const category = PSI_HAZARD_CATEGORIES[key];
          const value = hazards[key];
          const isOpen = expanded === key;
          const checkedCount = value.checked.length;
          return (
            <View key={key} style={[s.categoryCard, { borderColor: colors.border, backgroundColor: colors.card }]}>
              <TouchableOpacity style={s.categoryHeader} onPress={() => setExpanded(isOpen ? null : key)}>
                <Text style={[s.categoryTitle, { color: colors.foreground }]}>{category.title}</Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  {checkedCount > 0 && (
                    <View style={[s.countBadge, { backgroundColor: colors.primary }]}>
                      <Text style={s.countBadgeText}>{checkedCount}</Text>
                    </View>
                  )}
                  <Feather name={isOpen ? "chevron-up" : "chevron-down"} size={18} color={colors.mutedForeground} />
                </View>
              </TouchableOpacity>
              {isOpen && (
                <View style={s.categoryBody}>
                  {category.items.map((item) => {
                    const checked = value.checked.includes(item);
                    return (
                      <TouchableOpacity key={item} style={s.checkItem} onPress={() => toggleHazard(key, item)}>
                        <View style={[s.checkbox, { borderColor: checked ? colors.primary : colors.border, backgroundColor: checked ? colors.primary : "transparent" }]}>
                          {checked && <Feather name="check" size={12} color="#fff" />}
                        </View>
                        <Text style={[s.checkLabel, { color: colors.foreground }]}>{item}</Text>
                      </TouchableOpacity>
                    );
                  })}
                  {"hasOther" in category && category.hasOther && (
                    <TextInput
                      value={value.otherText ?? ""}
                      onChangeText={(v) => setOtherText(key, "otherText", v)}
                      placeholder={"otherLabel" in category ? category.otherLabel : "Other…"}
                      placeholderTextColor={colors.mutedForeground}
                      style={[s.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background, marginTop: 4 }]}
                    />
                  )}
                  {"hasOther2" in category && category.hasOther2 && (
                    <TextInput
                      value={value.other2Text ?? ""}
                      onChangeText={(v) => setOtherText(key, "other2Text", v)}
                      placeholder="Other…"
                      placeholderTextColor={colors.mutedForeground}
                      style={[s.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
                    />
                  )}
                  {"hasOther3" in category && category.hasOther3 && (
                    <TextInput
                      value={value.other3Text ?? ""}
                      onChangeText={(v) => setOtherText(key, "other3Text", v)}
                      placeholder="Other…"
                      placeholderTextColor={colors.mutedForeground}
                      style={[s.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
                    />
                  )}
                </View>
              )}
            </View>
          );
        })}

        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 20 }}>
          <Text style={[s.label, { color: colors.mutedForeground, marginTop: 0 }]}>Task / Hazard / Control</Text>
          <TouchableOpacity onPress={() => setTaskRows((rows) => [...rows, newTaskRow()])}>
            <Text style={{ color: colors.primary, fontFamily: "Inter_600SemiBold", fontSize: 13 }}>+ Add Row</Text>
          </TouchableOpacity>
        </View>
        {taskRows.map((row) => (
          <View key={row.id} style={[s.taskRow, { borderColor: colors.border, backgroundColor: colors.card }]}>
            <TextInput value={row.task} onChangeText={(v) => updateTaskRow(row.id, "task", v)} placeholder="Task" placeholderTextColor={colors.mutedForeground}
              style={[s.taskInput, { color: colors.foreground, borderColor: colors.border }]} />
            <TextInput value={row.hazard} onChangeText={(v) => updateTaskRow(row.id, "hazard", v)} placeholder="Hazard" placeholderTextColor={colors.mutedForeground}
              style={[s.taskInput, { color: colors.foreground, borderColor: colors.border }]} />
            <TextInput value={row.control} onChangeText={(v) => updateTaskRow(row.id, "control", v)} placeholder="Control" placeholderTextColor={colors.mutedForeground}
              style={[s.taskInput, { color: colors.foreground, borderColor: colors.border, marginBottom: 0 }]} />
            <TouchableOpacity onPress={() => removeTaskRow(row.id)} style={{ alignSelf: "flex-end", marginTop: 4 }} disabled={taskRows.length <= 1}>
              <Feather name="trash-2" size={14} color={taskRows.length <= 1 ? colors.border : "#EF4444"} />
            </TouchableOpacity>
          </View>
        ))}

        <TouchableOpacity
          onPress={() => saveMutation.mutate({ submit: false })}
          disabled={!canSave || saveMutation.isPending}
          style={[s.secondaryBtn, { borderColor: colors.border, opacity: !canSave || saveMutation.isPending ? 0.5 : 1 }]}
        >
          <Text style={[s.secondaryBtnText, { color: colors.foreground }]}>Save Draft</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => saveMutation.mutate({ submit: true })}
          disabled={!canSave || saveMutation.isPending}
          style={[s.submitBtn, { backgroundColor: !canSave || saveMutation.isPending ? "#ccc" : colors.primary }]}
        >
          {saveMutation.isPending ? <ActivityIndicator color="#fff" /> : <Text style={s.submitText}>Submit Checklist</Text>}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = (colors: ReturnType<typeof useColors>) =>
  StyleSheet.create({
    center: { flex: 1, alignItems: "center", justifyContent: "center" },
    backBtn: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 },
    backText: { fontSize: 14, fontFamily: "Inter_500Medium" },
    title: { fontSize: 24, fontFamily: "Inter_700Bold", marginBottom: 4 },
    subtitle: { fontSize: 13, fontFamily: "Inter_400Regular", marginBottom: 16 },
    label: { fontSize: 12, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8, marginTop: 16 },
    chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    chip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, borderWidth: 1 },
    chipText: { fontSize: 13, fontFamily: "Inter_500Medium" },
    input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, fontFamily: "Inter_400Regular", marginBottom: 4 },
    categoryCard: { borderWidth: 1, borderRadius: 12, marginBottom: 10, overflow: "hidden" },
    categoryHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 14 },
    categoryTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold", flexShrink: 1 },
    categoryBody: { paddingHorizontal: 14, paddingBottom: 14, gap: 10 },
    countBadge: { minWidth: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center", paddingHorizontal: 5 },
    countBadgeText: { color: "#fff", fontSize: 11, fontFamily: "Inter_700Bold" },
    checkItem: { flexDirection: "row", alignItems: "center", gap: 10 },
    checkbox: { width: 20, height: 20, borderRadius: 5, borderWidth: 2, alignItems: "center", justifyContent: "center" },
    checkLabel: { fontSize: 13, fontFamily: "Inter_400Regular", flexShrink: 1 },
    taskRow: { borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 10 },
    taskInput: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, fontFamily: "Inter_400Regular", marginBottom: 8 },
    secondaryBtn: { paddingVertical: 14, borderRadius: 12, alignItems: "center", marginTop: 24, borderWidth: 1 },
    secondaryBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
    submitBtn: { paddingVertical: 14, borderRadius: 12, alignItems: "center", marginTop: 10 },
    submitText: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" },
  });
