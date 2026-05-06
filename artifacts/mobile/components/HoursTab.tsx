import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Pressable,
  ActivityIndicator,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  Modal,
} from "react-native";
import DateTimePicker, { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { Feather } from "@expo/vector-icons";
import { customFetch, useGetMe, useListQuotes } from "@workspace/api-client-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
import { useRouter } from "expo-router";

type TimeEntry = {
  id: number;
  projectId: number;
  userId: number;
  date: string;
  hours: string;
  description?: string | null;
  createdAt: string;
  user: { id: number; firstName: string; lastName: string; role: string } | null;
};

function displayName(user: { firstName?: string | null; lastName?: string | null } | null): string {
  if (!user) return "Unknown";
  const name = `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim();
  return name || "Worker";
}

function todayDate() {
  return new Date();
}

function isoFromDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function dateFromISO(iso: string): Date {
  return new Date(iso + "T00:00:00");
}

function formatDate(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-CA", {
    month: "short", day: "numeric", year: "numeric", weekday: "short",
  });
}

function fmtCAD(v: number | string) {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(Number(v));
}

const QUOTE_STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  pending_approval: "Submitted",
  approved: "Approved",
  rejected: "Needs Revision",
  converted: "Invoiced",
};
const QUOTE_STATUS_COLORS: Record<string, string> = {
  pending_approval: "#2563EB",
  approved: "#16A34A",
  rejected: "#EA580C",
  converted: "#7C3AED",
};
const QUOTE_STATUS_BG: Record<string, string> = {
  pending_approval: "#DBEAFE",
  approved: "#DCFCE7",
  rejected: "#FFF7ED",
  converted: "#EDE9FE",
};

export function HoursTab({ projectId }: { projectId: number }) {
  const colors = useColors();
  const qc = useQueryClient();
  const router = useRouter();
  const { data: me } = useGetMe();

  const isPrivileged = me?.role === "owner" || me?.role === "foreman";

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [editingEntry, setEditingEntry] = useState<TimeEntry | null>(null);

  // Date picker state
  const [selectedDate, setSelectedDate] = useState<Date>(todayDate());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [tempDate, setTempDate] = useState<Date>(todayDate()); // iOS temp pick

  const [hours, setHours] = useState("");
  const [description, setDescription] = useState("");
  const [hoursError, setHoursError] = useState("");

  const QUERY_KEY = ["time-entries", "project", projectId];

  const { data: entries = [], isLoading } = useQuery<TimeEntry[]>({
    queryKey: QUERY_KEY,
    queryFn: () => customFetch(`/api/projects/${projectId}/time-entries`),
  });

  const { data: allQuotes = [] } = useListQuotes(projectId);
  const submittedQuotes = allQuotes.filter(
    (q) => q.status === "pending_approval" || q.status === "approved" || q.status === "rejected"
  );

  const resetForm = useCallback(() => {
    setSelectedDate(todayDate());
    setHours("");
    setDescription("");
    setHoursError("");
    setEditingEntry(null);
    setShowForm(false);
  }, []);

  const openNew = useCallback(() => {
    setEditingEntry(null);
    setSelectedDate(todayDate());
    setHours("");
    setDescription("");
    setHoursError("");
    setShowForm(true);
  }, []);

  const openEdit = useCallback((entry: TimeEntry) => {
    setEditingEntry(entry);
    setSelectedDate(dateFromISO(entry.date));
    setHours(parseFloat(entry.hours).toString());
    setDescription(entry.description ?? "");
    setHoursError("");
    setShowForm(true);
  }, []);

  const logHours = useMutation({
    mutationFn: (body: { date: string; hours: number; description?: string }) =>
      customFetch(`/api/projects/${projectId}/time-entries`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: QUERY_KEY }); resetForm(); },
    onError: () => Alert.alert("Error", "Failed to log hours. Please try again."),
  });

  const editHours = useMutation({
    mutationFn: ({ entryId, body }: { entryId: number; body: { date?: string; hours?: number; description?: string | null } }) =>
      customFetch(`/api/projects/${projectId}/time-entries/${entryId}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: QUERY_KEY }); resetForm(); },
    onError: () => Alert.alert("Error", "Failed to update entry. Please try again."),
  });

  const deleteEntry = useMutation({
    mutationFn: (entryId: number) =>
      customFetch(`/api/projects/${projectId}/time-entries/${entryId}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
    onError: () => Alert.alert("Error", "Failed to delete entry."),
  });

  const handleSubmit = useCallback(() => {
    setHoursError("");
    const h = parseFloat(hours);
    if (!hours || isNaN(h) || h <= 0 || h > 24) {
      setHoursError("Enter hours between 0.5 and 24");
      return;
    }
    const dateISO = isoFromDate(selectedDate);
    if (editingEntry) {
      editHours.mutate({
        entryId: editingEntry.id,
        body: { date: dateISO, hours: h, description: description.trim() || null },
      });
    } else {
      logHours.mutate({ date: dateISO, hours: h, description: description.trim() || undefined });
    }
  }, [hours, selectedDate, description, editingEntry]);

  const handleDelete = useCallback((entry: TimeEntry) => {
    const isOwn = entry.userId === me?.id;
    if (!isOwn && !isPrivileged) return;
    Alert.alert("Delete Entry", "Remove this time entry?", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => deleteEntry.mutate(entry.id) },
    ]);
  }, [me?.id, isPrivileged]);

  // Date picker handlers
  const onDateChange = useCallback((_event: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS === "android") {
      setShowDatePicker(false);
      if (_event.type === "set" && date) setSelectedDate(date);
    } else {
      if (date) setTempDate(date);
    }
  }, []);

  const confirmIOSDate = useCallback(() => {
    setSelectedDate(tempDate);
    setShowDatePicker(false);
  }, [tempDate]);

  const isPending = logHours.isPending || editHours.isPending;

  const myEntries = entries.filter(e => e.userId === me?.id);
  const otherEntries = entries.filter(e => e.userId !== me?.id);
  const myTotal = myEntries.reduce((s, e) => s + parseFloat(e.hours), 0);
  const totalAll = entries.reduce((s, e) => s + parseFloat(e.hours), 0);

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.container}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Submitted Quotes ──────────────────────────────────── */}
        {submittedQuotes.length > 0 && (
          <View style={s.quotesSection}>
            <View style={s.quotesSectionHeader}>
              <Feather name="file-text" size={13} color={colors.primary} />
              <Text style={[s.quotesSectionTitle, { color: colors.mutedForeground }]}>Submitted Quotes</Text>
            </View>
            {submittedQuotes.map((q) => {
              const statusColor = QUOTE_STATUS_COLORS[q.status] ?? "#6B7280";
              const statusBg = QUOTE_STATUS_BG[q.status] ?? "#F3F4F6";
              return (
                <TouchableOpacity
                  key={q.id}
                  onPress={() => router.push(`/quote/${q.id}?projectId=${projectId}`)}
                  activeOpacity={0.75}
                  style={[s.quoteCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                >
                  <View style={[s.quoteIconBox, { backgroundColor: `${colors.primary}15` }]}>
                    <Feather name="file-text" size={16} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[s.quoteTitle, { color: colors.foreground }]} numberOfLines={1}>{q.title}</Text>
                    <Text style={[s.quoteSub, { color: colors.mutedForeground }]}>{q.quoteNumber} · {q.clientName}</Text>
                  </View>
                  <View style={{ alignItems: "flex-end", gap: 4 }}>
                    <Text style={[s.quoteAmount, { color: colors.primary }]}>{fmtCAD(q.total)}</Text>
                    <View style={[s.quoteBadge, { backgroundColor: statusBg }]}>
                      <Text style={[s.quoteBadgeText, { color: statusColor }]}>{QUOTE_STATUS_LABELS[q.status]}</Text>
                    </View>
                  </View>
                  <Feather name="chevron-right" size={14} color={colors.mutedForeground} style={{ marginLeft: 4 }} />
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* ── Hours header ──────────────────────────────────────── */}
        <View style={s.headerRow}>
          <View>
            <Text style={[s.sectionTitle, { color: colors.mutedForeground }]}>
              {isPrivileged ? "Team Hours" : "My Hours"}
            </Text>
            {isPrivileged && totalAll > 0 && (
              <Text style={[s.totalLabel, { color: colors.primary }]}>
                {totalAll.toFixed(1)}h total · {entries.length} {entries.length === 1 ? "entry" : "entries"}
              </Text>
            )}
            {!isPrivileged && myTotal > 0 && (
              <Text style={[s.totalLabel, { color: colors.primary }]}>
                {myTotal.toFixed(1)}h logged by you
              </Text>
            )}
          </View>
          {showForm ? (
            <Pressable style={[s.logBtn, { backgroundColor: colors.muted }]} onPress={resetForm}>
              <Feather name="x" size={16} color={colors.foreground} />
              <Text style={[s.logBtnText, { color: colors.foreground }]}>Cancel</Text>
            </Pressable>
          ) : (
            <Pressable style={[s.logBtn, { backgroundColor: colors.primary }]} onPress={openNew}>
              <Feather name="plus" size={16} color="#fff" />
              <Text style={s.logBtnText}>Log Hours</Text>
            </Pressable>
          )}
        </View>

        {/* ── Log / Edit form ───────────────────────────────────── */}
        {showForm && (
          <View style={[s.form, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[s.formTitle, { color: colors.foreground }]}>
              {editingEntry ? "Edit Time Entry" : "Log Hours"}
            </Text>

            {/* Date picker field */}
            <Text style={[s.formLabel, { color: colors.foreground }]}>
              Date <Text style={{ color: "#EF4444" }}>*</Text>
            </Text>
            <Pressable
              style={[s.dateField, { backgroundColor: colors.background, borderColor: colors.border }]}
              onPress={() => { setTempDate(selectedDate); setShowDatePicker(true); }}
            >
              <Feather name="calendar" size={15} color={colors.primary} />
              <Text style={[s.dateFieldText, { color: colors.foreground }]}>
                {formatDate(isoFromDate(selectedDate))}
              </Text>
              <Feather name="chevron-down" size={14} color={colors.mutedForeground} />
            </Pressable>

            {/* Android date picker (shows as dialog) */}
            {showDatePicker && Platform.OS === "android" && (
              <DateTimePicker
                value={selectedDate}
                mode="date"
                display="default"
                onChange={onDateChange}
                maximumDate={new Date()}
              />
            )}

            {/* iOS date picker in modal */}
            {Platform.OS === "ios" && (
              <Modal
                visible={showDatePicker}
                transparent
                animationType="slide"
                onRequestClose={() => setShowDatePicker(false)}
              >
                <View style={s.modalOverlay}>
                  <View style={[s.modalSheet, { backgroundColor: colors.card }]}>
                    <View style={s.modalHeader}>
                      <Pressable onPress={() => setShowDatePicker(false)} hitSlop={8}>
                        <Text style={[s.modalCancel, { color: colors.mutedForeground }]}>Cancel</Text>
                      </Pressable>
                      <Text style={[s.modalTitle, { color: colors.foreground }]}>Select Date</Text>
                      <Pressable onPress={confirmIOSDate} hitSlop={8}>
                        <Text style={[s.modalDone, { color: colors.primary }]}>Done</Text>
                      </Pressable>
                    </View>
                    <DateTimePicker
                      value={tempDate}
                      mode="date"
                      display="spinner"
                      onChange={onDateChange}
                      maximumDate={new Date()}
                      style={{ width: "100%" }}
                    />
                  </View>
                </View>
              </Modal>
            )}

            {/* Hours */}
            <Text style={[s.formLabel, { color: colors.foreground, marginTop: 14 }]}>
              Hours Worked <Text style={{ color: "#EF4444" }}>*</Text>
            </Text>
            <TextInput
              style={[s.input, { backgroundColor: colors.background, borderColor: hoursError ? "#EF4444" : colors.border, color: colors.foreground }]}
              value={hours}
              onChangeText={t => { setHours(t); setHoursError(""); }}
              placeholder="e.g. 8 or 7.5"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="decimal-pad"
            />
            {!!hoursError && <Text style={s.error}>{hoursError}</Text>}

            {/* Description */}
            <Text style={[s.formLabel, { color: colors.foreground, marginTop: 14 }]}>
              Description <Text style={[s.optional, { color: colors.mutedForeground }]}>optional</Text>
            </Text>
            <TextInput
              style={[s.input, s.multiline, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
              value={description}
              onChangeText={setDescription}
              placeholder="What did you work on?"
              placeholderTextColor={colors.mutedForeground}
              multiline
              numberOfLines={3}
            />

            <Pressable
              style={[s.submitBtn, { backgroundColor: colors.primary, opacity: isPending ? 0.7 : 1 }]}
              onPress={handleSubmit}
              disabled={isPending}
            >
              {isPending
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={s.submitBtnText}>{editingEntry ? "Save Changes" : "Save Entry"}</Text>
              }
            </Pressable>
          </View>
        )}

        {/* ── Entries list ──────────────────────────────────────── */}
        {isLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 32 }} />
        ) : (
          <>
            {myEntries.length === 0 && !isPrivileged && (
              <View style={s.empty}>
                <Feather name="clock" size={32} color={colors.border} />
                <Text style={[s.emptyText, { color: colors.mutedForeground }]}>No hours logged yet.</Text>
                <Text style={[s.emptySubText, { color: colors.mutedForeground }]}>Tap "Log Hours" to add your first entry.</Text>
              </View>
            )}

            {myEntries.length > 0 && (
              <>
                {isPrivileged && (
                  <Text style={[s.groupLabel, { color: colors.mutedForeground }]}>My Entries</Text>
                )}
                {myEntries.map(entry => (
                  <EntryRow
                    key={entry.id}
                    entry={entry}
                    showUser={false}
                    canEdit={true}
                    canDelete={true}
                    onEdit={() => openEdit(entry)}
                    onDelete={() => handleDelete(entry)}
                    colors={colors}
                  />
                ))}
              </>
            )}

            {isPrivileged && otherEntries.length > 0 && (
              <>
                <Text style={[s.groupLabel, { color: colors.mutedForeground, marginTop: 20 }]}>Team Entries</Text>
                {otherEntries.map(entry => (
                  <EntryRow
                    key={entry.id}
                    entry={entry}
                    showUser={true}
                    canEdit={true}
                    canDelete={true}
                    onEdit={() => openEdit(entry)}
                    onDelete={() => handleDelete(entry)}
                    colors={colors}
                  />
                ))}
              </>
            )}

            {isPrivileged && entries.length === 0 && (
              <View style={s.empty}>
                <Feather name="clock" size={32} color={colors.border} />
                <Text style={[s.emptyText, { color: colors.mutedForeground }]}>No hours logged yet.</Text>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function EntryRow({
  entry, showUser, canEdit, canDelete, onEdit, onDelete, colors,
}: {
  entry: TimeEntry;
  showUser: boolean;
  canEdit: boolean;
  canDelete: boolean;
  onEdit: () => void;
  onDelete: () => void;
  colors: any;
}) {
  return (
    <View style={[s.entryCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={[s.hoursCircle, { backgroundColor: colors.primary + "20" }]}>
        <Text style={[s.hoursNum, { color: colors.primary }]}>{parseFloat(entry.hours).toFixed(1)}</Text>
        <Text style={[s.hoursUnit, { color: colors.primary }]}>h</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <Text style={[s.entryDate, { color: colors.foreground }]}>{formatDate(entry.date)}</Text>
          {showUser && entry.user && (
            <View style={[s.userChip, { backgroundColor: colors.muted }]}>
              <Text style={[s.userChipText, { color: colors.mutedForeground }]}>
                {displayName(entry.user)}
              </Text>
            </View>
          )}
        </View>
        {!!entry.description && (
          <Text style={[s.entryDesc, { color: colors.mutedForeground }]} numberOfLines={2}>{entry.description}</Text>
        )}
      </View>
      <View style={s.entryActions}>
        {canEdit && (
          <Pressable onPress={onEdit} style={s.actionBtn} hitSlop={8}>
            <Feather name="edit-2" size={14} color={colors.primary} />
          </Pressable>
        )}
        {canDelete && (
          <Pressable onPress={onDelete} style={s.actionBtn} hitSlop={8}>
            <Feather name="trash-2" size={14} color={colors.mutedForeground} />
          </Pressable>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { paddingHorizontal: 20, paddingBottom: 40, paddingTop: 4 },

  // Quotes
  quotesSection: { marginBottom: 24 },
  quotesSectionHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 10 },
  quotesSectionTitle: { fontSize: 11, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.8 },
  quoteCard: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 12, borderWidth: 1, padding: 12, marginBottom: 8 },
  quoteIconBox: { width: 36, height: 36, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  quoteTitle: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  quoteSub: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 1 },
  quoteAmount: { fontSize: 13, fontFamily: "Inter_700Bold" },
  quoteBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  quoteBadgeText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },

  // Header
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
  sectionTitle: { fontSize: 11, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.8 },
  totalLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold", marginTop: 2 },
  logBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  logBtnText: { color: "#fff", fontSize: 13, fontFamily: "Inter_600SemiBold" },

  // Form
  form: { borderRadius: 12, borderWidth: 1, padding: 16, marginBottom: 20 },
  formTitle: { fontSize: 15, fontFamily: "Inter_700Bold", marginBottom: 14 },
  formLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold", marginBottom: 6 },
  optional: { fontSize: 11, fontFamily: "Inter_400Regular" },
  dateField: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 12 },
  dateFieldText: { flex: 1, fontSize: 14, fontFamily: "Inter_500Medium" },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, fontFamily: "Inter_400Regular" },
  multiline: { minHeight: 70, textAlignVertical: "top", paddingTop: 10 },
  error: { color: "#EF4444", fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 4 },
  submitBtn: { marginTop: 16, borderRadius: 10, paddingVertical: 13, alignItems: "center", justifyContent: "center" },
  submitBtnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_700Bold" },

  // Date picker modal (iOS)
  modalOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.4)" },
  modalSheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 32 },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 14 },
  modalTitle: { fontSize: 15, fontFamily: "Inter_700Bold" },
  modalCancel: { fontSize: 14, fontFamily: "Inter_400Regular" },
  modalDone: { fontSize: 14, fontFamily: "Inter_700Bold" },

  // Entry cards
  groupLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 },
  entryCard: { flexDirection: "row", alignItems: "flex-start", gap: 12, borderRadius: 12, borderWidth: 1, padding: 14, marginBottom: 10 },
  hoursCircle: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 1 },
  hoursNum: { fontSize: 17, fontFamily: "Inter_700Bold" },
  hoursUnit: { fontSize: 11, fontFamily: "Inter_600SemiBold", alignSelf: "flex-end", marginBottom: 3 },
  entryDate: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  entryDesc: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 3, lineHeight: 17 },
  userChip: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  userChipText: { fontSize: 11, fontFamily: "Inter_500Medium" },
  entryActions: { flexDirection: "row", gap: 6, alignItems: "center" },
  actionBtn: { padding: 5 },

  // Empty
  empty: { alignItems: "center", paddingVertical: 48, gap: 8 },
  emptyText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  emptySubText: { fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center" },
});
