import React, { useState, useCallback, useEffect } from "react";
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
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { customFetch, useGetMe, useListTimesheets, useSubmitTimesheet } from "@workspace/api-client-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";

// ── types ─────────────────────────────────────────────────────────────────────

type TimeEntry = {
  id: number;
  date: string;
  hours: string;
  description?: string | null;
  user: { firstName?: string | null; lastName?: string | null } | null;
};

type Timesheet = {
  id: number;
  weekStart: string;
  totalHours: string;
  hourlyRate?: string | null;
  description?: string | null;
  notes?: string | null;
  status: string;
  submittedAt: string;
  projectId?: number | null;
};

// ── helpers ──────────────────────────────────────────────────────────────────

function getMondayOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function toISO(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function weekLabel(mondayISO: string): string {
  const monday = new Date(mondayISO + "T00:00:00");
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-CA", { month: "short", day: "numeric" });
  return `${fmt(monday)} – ${fmt(sunday)}, ${sunday.getFullYear()}`;
}

function formatDate(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-CA", {
    weekday: "short", month: "short", day: "numeric",
  });
}

function fmtCAD(v: number | string) {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(Number(v));
}

function getWeekEntries(entries: TimeEntry[], mondayISO: string): TimeEntry[] {
  const monday = new Date(mondayISO + "T00:00:00");
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return entries.filter((e) => {
    const d = new Date(e.date + "T00:00:00");
    return d >= monday && d <= sunday;
  });
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  submitted: { label: "Pending Review", color: "#D97706", bg: "#FEF3C7", icon: "clock" },
  approved:  { label: "Approved",       color: "#16A34A", bg: "#DCFCE7", icon: "check-circle" },
  denied:    { label: "Denied",         color: "#DC2626", bg: "#FEE2E2", icon: "x-circle" },
};

// ── main component ────────────────────────────────────────────────────────────

export function TimesheetsTab({ projectId }: { projectId: number }) {
  const colors = useColors();
  const qc = useQueryClient();
  const { data: me } = useGetMe();

  const [selectedMonday, setSelectedMonday] = useState<Date>(() => getMondayOfWeek(new Date()));
  const weekISO = toISO(selectedMonday);

  const [showForm, setShowForm] = useState(false);
  const [editingTimesheet, setEditingTimesheet] = useState<Timesheet | null>(null);

  const [totalHours, setTotalHours] = useState("");
  const [hourlyRate, setHourlyRate] = useState("");
  const [description, setDescription] = useState("");
  const [hoursError, setHoursError] = useState("");
  const [userEditedHours, setUserEditedHours] = useState(false);

  const { data: timesheets = [], isLoading } = useListTimesheets({});

  const { data: timeEntries = [] } = useQuery<TimeEntry[]>({
    queryKey: ["time-entries", "project", projectId],
    queryFn: () => customFetch(`/api/projects/${projectId}/time-entries`),
  });

  const weekEntries = getWeekEntries(timeEntries, weekISO);
  const weekTotal = weekEntries.reduce((s, e) => s + parseFloat(e.hours), 0);

  // Auto-fill when form opens or week total arrives — only if user hasn't typed yet
  useEffect(() => {
    if (showForm && !editingTimesheet && weekTotal > 0 && !userEditedHours) {
      setTotalHours(weekTotal.toFixed(1));
    }
  }, [showForm, weekISO, weekTotal, editingTimesheet, userEditedHours]);

  const resetForm = useCallback(() => {
    setTotalHours("");
    setHourlyRate("");
    setDescription("");
    setHoursError("");
    setUserEditedHours(false);
    setEditingTimesheet(null);
    setShowForm(false);
  }, []);

  const openNew = useCallback(() => {
    setEditingTimesheet(null);
    setTotalHours("");
    setHourlyRate("");
    setDescription("");
    setHoursError("");
    setUserEditedHours(false);
    setShowForm(true);
  }, []);

  const openEdit = useCallback((ts: Timesheet) => {
    setEditingTimesheet(ts);
    setSelectedMonday(getMondayOfWeek(new Date(ts.weekStart + "T00:00:00")));
    setTotalHours(parseFloat(ts.totalHours).toString());
    setHourlyRate(ts.hourlyRate ? parseFloat(ts.hourlyRate).toString() : "");
    setDescription(ts.description ?? "");
    setHoursError("");
    setUserEditedHours(true);
    setShowForm(true);
  }, []);

  const submitMutation = useSubmitTimesheet({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ["/api/timesheets"] });
        resetForm();
        Alert.alert("Submitted!", "Your timesheet has been sent for review.");
      },
      onError: () => Alert.alert("Error", "Failed to submit timesheet. Please try again."),
    },
  });

  const editMutation = useMutation({
    mutationFn: ({ id, body }: { id: number; body: { totalHours?: number; hourlyRate?: number | null; description?: string | null } }) =>
      customFetch(`/api/timesheets/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/timesheets"] });
      resetForm();
      Alert.alert("Updated!", "Your timesheet has been updated.");
    },
    onError: () => Alert.alert("Error", "Failed to update timesheet. Please try again."),
  });

  const navigateWeek = useCallback((dir: -1 | 1) => {
    setSelectedMonday((prev) => {
      const d = new Date(prev);
      d.setDate(d.getDate() + dir * 7);
      return d;
    });
  }, []);

  const handleSubmit = useCallback(() => {
    setHoursError("");
    const h = parseFloat(totalHours);
    if (!totalHours || isNaN(h) || h <= 0 || h > 168) {
      setHoursError("Enter hours between 0.5 and 168");
      return;
    }
    const rate = hourlyRate ? parseFloat(hourlyRate) : undefined;
    const rateValue = rate && !isNaN(rate) ? rate : undefined;

    if (editingTimesheet) {
      editMutation.mutate({
        id: editingTimesheet.id,
        body: {
          totalHours: h,
          hourlyRate: rateValue ?? null,
          description: description.trim() || null,
        },
      });
    } else {
      submitMutation.mutate({
        data: {
          weekStart: weekISO,
          totalHours: h,
          hourlyRate: rateValue,
          description: description.trim() || undefined,
          projectId,
        },
      });
    }
  }, [totalHours, hourlyRate, description, weekISO, projectId, editingTimesheet]);

  const existingForWeek = timesheets.find((t) => t.weekStart === weekISO);
  const isPending = submitMutation.isPending || editMutation.isPending;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={{ flex: 1 }}
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.container}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Section header ─────────────────────────────────────── */}
        <View style={s.headerRow}>
          <View>
            <Text style={[s.sectionTitle, { color: colors.mutedForeground }]}>
              Weekly Timesheets
            </Text>
            <Text style={[s.sectionSub, { color: colors.mutedForeground }]}>
              Submit your hours for review
            </Text>
          </View>
          {showForm ? (
            <Pressable style={[s.newBtn, { backgroundColor: colors.muted }]} onPress={resetForm}>
              <Feather name="x" size={16} color={colors.foreground} />
              <Text style={[s.newBtnText, { color: colors.foreground }]}>Cancel</Text>
            </Pressable>
          ) : (
            <Pressable style={[s.newBtn, { backgroundColor: colors.primary }]} onPress={openNew}>
              <Feather name="plus" size={16} color="#fff" />
              <Text style={s.newBtnText}>New Submission</Text>
            </Pressable>
          )}
        </View>

        {/* ── Submission / Edit form ────────────────────────────── */}
        {showForm && (
          <View style={[s.form, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[s.formTitle, { color: colors.foreground }]}>
              {editingTimesheet ? "Edit Timesheet" : "Submit Timesheet"}
            </Text>

            {/* Week picker — disabled when editing (week is fixed) */}
            <Text style={[s.formLabel, { color: colors.foreground }]}>
              Week <Text style={{ color: "#EF4444" }}>*</Text>
            </Text>
            <View style={s.weekPicker}>
              {!editingTimesheet && (
                <Pressable
                  onPress={() => navigateWeek(-1)}
                  style={[s.weekArrow, { backgroundColor: colors.muted }]}
                  hitSlop={8}
                >
                  <Feather name="chevron-left" size={18} color={colors.foreground} />
                </Pressable>
              )}
              <View style={[s.weekDisplay, { backgroundColor: editingTimesheet ? colors.muted : "transparent", borderRadius: 8 }]}>
                <Feather name="calendar" size={14} color={colors.primary} />
                <Text style={[s.weekText, { color: colors.foreground }]}>{weekLabel(weekISO)}</Text>
              </View>
              {!editingTimesheet && (
                <Pressable
                  onPress={() => navigateWeek(1)}
                  style={[s.weekArrow, { backgroundColor: colors.muted }]}
                  hitSlop={8}
                  disabled={weekISO >= toISO(getMondayOfWeek(new Date()))}
                >
                  <Feather
                    name="chevron-right"
                    size={18}
                    color={weekISO >= toISO(getMondayOfWeek(new Date())) ? colors.mutedForeground : colors.foreground}
                  />
                </Pressable>
              )}
            </View>

            {!editingTimesheet && existingForWeek && (
              <View style={[s.alreadyBadge, { backgroundColor: `${colors.primary}15`, borderColor: `${colors.primary}40` }]}>
                <Feather name="info" size={12} color={colors.primary} />
                <Text style={[s.alreadyText, { color: colors.primary }]}>
                  Existing submission for this week — re-submitting will update it.
                </Text>
              </View>
            )}

            {/* Hours logged this week from Hours tab */}
            {!editingTimesheet && weekEntries.length > 0 && (
              <View style={[s.entriesBlock, { backgroundColor: `${colors.primary}08`, borderColor: `${colors.primary}20` }]}>
                <View style={s.entriesBlockHeader}>
                  <Feather name="clock" size={13} color={colors.primary} />
                  <Text style={[s.entriesBlockTitle, { color: colors.primary }]}>
                    Hours logged this week — {weekTotal.toFixed(1)}h from {weekEntries.length} {weekEntries.length === 1 ? "entry" : "entries"}
                  </Text>
                </View>
                {weekEntries.map((e) => (
                  <View key={e.id} style={s.entryRow}>
                    <Text style={[s.entryDate, { color: colors.foreground }]}>{formatDate(e.date)}</Text>
                    <Text style={[s.entryHours, { color: colors.primary }]}>{parseFloat(e.hours).toFixed(1)}h</Text>
                    {!!e.description && (
                      <Text style={[s.entryDesc, { color: colors.mutedForeground }]} numberOfLines={1}>
                        — {e.description}
                      </Text>
                    )}
                  </View>
                ))}
              </View>
            )}

            {/* Total hours */}
            <Text style={[s.formLabel, { color: colors.foreground, marginTop: 14 }]}>
              Total Hours This Week <Text style={{ color: "#EF4444" }}>*</Text>
            </Text>
            {!editingTimesheet && weekEntries.length > 0 && (
              <Text style={[s.autoFillNote, { color: colors.mutedForeground }]}>
                Auto-filled from your Hours entries — adjust if needed.
              </Text>
            )}
            <TextInput
              style={[
                s.input,
                { backgroundColor: colors.background, borderColor: hoursError ? "#EF4444" : colors.border, color: colors.foreground },
              ]}
              value={totalHours}
              onChangeText={(t) => { setTotalHours(t); setHoursError(""); setUserEditedHours(true); }}
              placeholder="e.g. 40"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="decimal-pad"
            />
            {!!hoursError && <Text style={s.error}>{hoursError}</Text>}

            {/* Hourly rate */}
            <Text style={[s.formLabel, { color: colors.foreground, marginTop: 14 }]}>
              Hourly Rate (CAD/hr) <Text style={[s.optional, { color: colors.mutedForeground }]}>optional</Text>
            </Text>
            <TextInput
              style={[s.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
              value={hourlyRate}
              onChangeText={setHourlyRate}
              placeholder="e.g. 35.00"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="decimal-pad"
            />

            {/* Description */}
            <Text style={[s.formLabel, { color: colors.foreground, marginTop: 14 }]}>
              Description of Work <Text style={[s.optional, { color: colors.mutedForeground }]}>optional</Text>
            </Text>
            <TextInput
              style={[s.input, s.multiline, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
              value={description}
              onChangeText={setDescription}
              placeholder="What did you work on this week?"
              placeholderTextColor={colors.mutedForeground}
              multiline
              numberOfLines={4}
            />

            {/* Earnings preview */}
            {totalHours && hourlyRate && !isNaN(parseFloat(totalHours)) && !isNaN(parseFloat(hourlyRate)) && (
              <View style={[s.earningsRow, { backgroundColor: `${colors.primary}10` }]}>
                <Feather name="dollar-sign" size={14} color={colors.primary} />
                <Text style={[s.earningsText, { color: colors.primary }]}>
                  Estimated earnings: {fmtCAD(parseFloat(totalHours) * parseFloat(hourlyRate))}
                </Text>
              </View>
            )}

            <Pressable
              style={[s.submitBtn, { backgroundColor: colors.primary, opacity: isPending ? 0.7 : 1 }]}
              onPress={handleSubmit}
              disabled={isPending}
            >
              {isPending ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Feather name={editingTimesheet ? "save" : "send"} size={15} color="#fff" />
                  <Text style={s.submitBtnText}>{editingTimesheet ? "Save Changes" : "Submit Timesheet"}</Text>
                </>
              )}
            </Pressable>
          </View>
        )}

        {/* ── Timesheet history ──────────────────────────────────── */}
        <Text style={[s.histLabel, { color: colors.mutedForeground }]}>Your Submissions</Text>

        {isLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 32 }} />
        ) : timesheets.length === 0 ? (
          <View style={s.empty}>
            <Feather name="clipboard" size={36} color={colors.border} />
            <Text style={[s.emptyTitle, { color: colors.foreground }]}>No timesheets yet</Text>
            <Text style={[s.emptySub, { color: colors.mutedForeground }]}>
              Tap "New Submission" to submit your first weekly timesheet.
            </Text>
          </View>
        ) : (
          (timesheets as unknown as Timesheet[]).map((ts) => {
            const cfg = STATUS_CONFIG[ts.status] ?? STATUS_CONFIG.submitted;
            const totalAmt =
              ts.hourlyRate && ts.totalHours
                ? parseFloat(ts.totalHours) * parseFloat(ts.hourlyRate)
                : null;
            const entriesForCard = getWeekEntries(timeEntries, ts.weekStart);
            return (
              <View
                key={ts.id}
                style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}
              >
                {/* Top row: week + status + edit */}
                <View style={s.cardTop}>
                  <View style={[s.calIcon, { backgroundColor: `${colors.primary}15` }]}>
                    <Feather name="calendar" size={16} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.cardWeek, { color: colors.foreground }]}>
                      {weekLabel(ts.weekStart)}
                    </Text>
                    <Text style={[s.cardSub, { color: colors.mutedForeground }]}>
                      Submitted {new Date(ts.submittedAt).toLocaleDateString("en-CA", { month: "short", day: "numeric" })}
                    </Text>
                  </View>
                  <View style={{ alignItems: "flex-end", gap: 6 }}>
                    <View style={[s.statusBadge, { backgroundColor: cfg.bg }]}>
                      <Feather name={cfg.icon as any} size={11} color={cfg.color} />
                      <Text style={[s.statusText, { color: cfg.color }]}>{cfg.label}</Text>
                    </View>
                    {/* Edit button — only on submitted (not approved) */}
                    {ts.status === "submitted" && (
                      <Pressable
                        style={[s.editCardBtn, { borderColor: colors.border }]}
                        onPress={() => openEdit(ts)}
                        hitSlop={6}
                      >
                        <Feather name="edit-2" size={12} color={colors.primary} />
                        <Text style={[s.editCardBtnText, { color: colors.primary }]}>Edit</Text>
                      </Pressable>
                    )}
                  </View>
                </View>

                {/* Stats row */}
                <View style={s.statsRow}>
                  <View style={s.statItem}>
                    <Feather name="clock" size={13} color={colors.primary} />
                    <Text style={[s.statValue, { color: colors.foreground }]}>
                      {parseFloat(ts.totalHours).toFixed(1)}h
                    </Text>
                    <Text style={[s.statLabel, { color: colors.mutedForeground }]}>Hours</Text>
                  </View>
                  {ts.hourlyRate && (
                    <View style={s.statItem}>
                      <Feather name="tag" size={13} color={colors.primary} />
                      <Text style={[s.statValue, { color: colors.foreground }]}>
                        {fmtCAD(ts.hourlyRate)}/hr
                      </Text>
                      <Text style={[s.statLabel, { color: colors.mutedForeground }]}>Rate</Text>
                    </View>
                  )}
                  {totalAmt !== null && (
                    <View style={s.statItem}>
                      <Feather name="dollar-sign" size={13} color={colors.primary} />
                      <Text style={[s.statValue, { color: colors.primary }]}>
                        {fmtCAD(totalAmt)}
                      </Text>
                      <Text style={[s.statLabel, { color: colors.mutedForeground }]}>Earnings</Text>
                    </View>
                  )}
                </View>

                {/* Linked Hours entries for this week */}
                {entriesForCard.length > 0 && (
                  <View style={[s.linkedEntries, { borderColor: colors.border }]}>
                    <View style={s.linkedHeader}>
                      <Feather name="list" size={11} color={colors.mutedForeground} />
                      <Text style={[s.linkedTitle, { color: colors.mutedForeground }]}>
                        {entriesForCard.length} logged {entriesForCard.length === 1 ? "entry" : "entries"} this week
                      </Text>
                    </View>
                    {entriesForCard.map((e) => (
                      <View key={e.id} style={s.linkedRow}>
                        <Text style={[s.linkedDate, { color: colors.foreground }]}>{formatDate(e.date)}</Text>
                        <Text style={[s.linkedHours, { color: colors.primary }]}>{parseFloat(e.hours).toFixed(1)}h</Text>
                      </View>
                    ))}
                  </View>
                )}

                {ts.description && (
                  <Text style={[s.cardDesc, { color: colors.mutedForeground }]} numberOfLines={3}>
                    {ts.description}
                  </Text>
                )}

                {ts.notes && (
                  <View style={[s.notesRow, { backgroundColor: ts.status === "denied" ? "#FEE2E220" : `${colors.primary}08`, borderColor: ts.status === "denied" ? "#FCA5A5" : `${colors.primary}25` }]}>
                    <Feather name={ts.status === "denied" ? "alert-circle" : "message-circle"} size={12} color={ts.status === "denied" ? "#DC2626" : colors.primary} />
                    <Text style={[s.notesText, { color: ts.status === "denied" ? "#DC2626" : colors.foreground }]}>
                      {ts.status === "denied" ? "Reason: " : "Note: "}{ts.notes}
                    </Text>
                  </View>
                )}
              </View>
            );
          })
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ── styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { paddingHorizontal: 20, paddingBottom: 48, paddingTop: 4 },
  headerRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 },
  sectionTitle: { fontSize: 11, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.8 },
  sectionSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 3 },
  newBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  newBtnText: { color: "#fff", fontSize: 13, fontFamily: "Inter_600SemiBold" },

  // Form
  form: { borderRadius: 14, borderWidth: 1, padding: 16, marginBottom: 28 },
  formTitle: { fontSize: 15, fontFamily: "Inter_700Bold", marginBottom: 14 },
  formLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold", marginBottom: 6 },
  optional: { fontSize: 11, fontFamily: "Inter_400Regular" },

  weekPicker: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  weekArrow: { width: 32, height: 32, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  weekDisplay: { flex: 1, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 6 },
  weekText: { flex: 1, fontSize: 13, fontFamily: "Inter_600SemiBold" },

  alreadyBadge: { flexDirection: "row", alignItems: "flex-start", gap: 6, borderRadius: 8, borderWidth: 1, padding: 10, marginTop: 8 },
  alreadyText: { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 17 },

  entriesBlock: { borderRadius: 10, borderWidth: 1, padding: 12, marginTop: 12 },
  entriesBlockHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 },
  entriesBlockTitle: { fontSize: 12, fontFamily: "Inter_600SemiBold", flex: 1 },
  entryRow: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 3 },
  entryDate: { fontSize: 12, fontFamily: "Inter_500Medium", minWidth: 90 },
  entryHours: { fontSize: 12, fontFamily: "Inter_700Bold", minWidth: 36 },
  entryDesc: { fontSize: 11, fontFamily: "Inter_400Regular", flex: 1 },
  autoFillNote: { fontSize: 11, fontFamily: "Inter_400Regular", marginBottom: 6, fontStyle: "italic" },

  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, fontFamily: "Inter_400Regular" },
  multiline: { minHeight: 90, textAlignVertical: "top", paddingTop: 10 },
  error: { color: "#EF4444", fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 4 },
  earningsRow: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 8, padding: 10, marginTop: 12 },
  earningsText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  submitBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 16, borderRadius: 10, paddingVertical: 13 },
  submitBtnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_700Bold" },

  histLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 12 },
  empty: { alignItems: "center", paddingVertical: 48, gap: 10 },
  emptyTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  emptySub: { fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center", maxWidth: 260 },

  card: { borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 12 },
  cardTop: { flexDirection: "row", alignItems: "flex-start", gap: 10, marginBottom: 12 },
  calIcon: { width: 36, height: 36, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  cardWeek: { fontSize: 13, fontFamily: "Inter_700Bold" },
  cardSub: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  statusBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20 },
  statusText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  editCardBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, borderWidth: 1 },
  editCardBtnText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  statsRow: { flexDirection: "row", gap: 0, marginBottom: 10, borderRadius: 10, overflow: "hidden" },
  statItem: { flex: 1, alignItems: "center", gap: 3, paddingVertical: 10, paddingHorizontal: 4 },
  statValue: { fontSize: 14, fontFamily: "Inter_700Bold" },
  statLabel: { fontSize: 10, fontFamily: "Inter_400Regular" },

  linkedEntries: { borderTopWidth: 1, paddingTop: 10, marginBottom: 10 },
  linkedHeader: { flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 6 },
  linkedTitle: { fontSize: 11, fontFamily: "Inter_500Medium" },
  linkedRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 2 },
  linkedDate: { fontSize: 12, fontFamily: "Inter_400Regular" },
  linkedHours: { fontSize: 12, fontFamily: "Inter_700Bold" },

  cardDesc: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 18, marginBottom: 8 },
  notesRow: { flexDirection: "row", alignItems: "flex-start", gap: 6, borderRadius: 8, borderWidth: 1, padding: 10, marginTop: 4 },
  notesText: { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 17 },
});
