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
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { customFetch, useGetMe } from "@workspace/api-client-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";

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

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(iso: string) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric", weekday: "short" });
}

export function HoursTab({ projectId }: { projectId: number }) {
  const colors = useColors();
  const qc = useQueryClient();
  const { data: me } = useGetMe();

  const isPrivileged = me?.role === "owner" || me?.role === "foreman";

  const [date, setDate] = useState(todayISO());
  const [hours, setHours] = useState("");
  const [description, setDescription] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [dateError, setDateError] = useState("");
  const [hoursError, setHoursError] = useState("");

  const QUERY_KEY = ["time-entries", "project", projectId];

  const { data: entries = [], isLoading } = useQuery<TimeEntry[]>({
    queryKey: QUERY_KEY,
    queryFn: () => customFetch(`/api/projects/${projectId}/time-entries`),
  });

  const logHours = useMutation({
    mutationFn: (body: { date: string; hours: number; description?: string }) =>
      customFetch(`/api/projects/${projectId}/time-entries`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEY });
      setHours("");
      setDescription("");
      setDate(todayISO());
      setShowForm(false);
    },
    onError: () => Alert.alert("Error", "Failed to log hours. Please try again."),
  });

  const deleteEntry = useMutation({
    mutationFn: (entryId: number) =>
      customFetch(`/api/projects/${projectId}/time-entries/${entryId}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
    onError: () => Alert.alert("Error", "Failed to delete entry."),
  });

  const handleSubmit = useCallback(() => {
    let valid = true;
    setDateError("");
    setHoursError("");

    if (!date.match(/^\d{4}-\d{2}-\d{2}$/)) {
      setDateError("Use format YYYY-MM-DD");
      valid = false;
    }
    const h = parseFloat(hours);
    if (!hours || isNaN(h) || h <= 0 || h > 24) {
      setHoursError("Enter hours between 0.5 and 24");
      valid = false;
    }
    if (!valid) return;

    logHours.mutate({ date, hours: h, description: description.trim() || undefined });
  }, [date, hours, description]);

  const handleDelete = useCallback((entry: TimeEntry) => {
    const isOwn = entry.userId === me?.id;
    if (!isOwn && !isPrivileged) return;
    Alert.alert("Delete Entry", "Remove this time entry?", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => deleteEntry.mutate(entry.id) },
    ]);
  }, [me?.id, isPrivileged]);

  // Group entries: own vs others (for privileged users)
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
        {/* Header row */}
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
          <Pressable
            style={[s.logBtn, { backgroundColor: colors.primary }]}
            onPress={() => setShowForm(v => !v)}
          >
            <Feather name={showForm ? "x" : "plus"} size={16} color="#fff" />
            <Text style={s.logBtnText}>{showForm ? "Cancel" : "Log Hours"}</Text>
          </Pressable>
        </View>

        {/* Log hours form */}
        {showForm && (
          <View style={[s.form, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[s.formLabel, { color: colors.foreground }]}>Date</Text>
            <TextInput
              style={[s.input, { backgroundColor: colors.background, borderColor: dateError ? "#EF4444" : colors.border, color: colors.foreground }]}
              value={date}
              onChangeText={t => { setDate(t); setDateError(""); }}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="numbers-and-punctuation"
            />
            {!!dateError && <Text style={s.error}>{dateError}</Text>}

            <Text style={[s.formLabel, { color: colors.foreground, marginTop: 12 }]}>Hours Worked</Text>
            <TextInput
              style={[s.input, { backgroundColor: colors.background, borderColor: hoursError ? "#EF4444" : colors.border, color: colors.foreground }]}
              value={hours}
              onChangeText={t => { setHours(t); setHoursError(""); }}
              placeholder="e.g. 8 or 7.5"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="decimal-pad"
            />
            {!!hoursError && <Text style={s.error}>{hoursError}</Text>}

            <Text style={[s.formLabel, { color: colors.foreground, marginTop: 12 }]}>Description (optional)</Text>
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
              style={[s.submitBtn, { backgroundColor: colors.primary, opacity: logHours.isPending ? 0.7 : 1 }]}
              onPress={handleSubmit}
              disabled={logHours.isPending}
            >
              {logHours.isPending
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={s.submitBtnText}>Save Entry</Text>
              }
            </Pressable>
          </View>
        )}

        {/* My entries */}
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
                    canDelete={true}
                    onDelete={() => handleDelete(entry)}
                    colors={colors}
                  />
                ))}
              </>
            )}

            {/* Other workers' entries (foreman/owner) */}
            {isPrivileged && otherEntries.length > 0 && (
              <>
                <Text style={[s.groupLabel, { color: colors.mutedForeground, marginTop: 20 }]}>Team Entries</Text>
                {otherEntries.map(entry => (
                  <EntryRow
                    key={entry.id}
                    entry={entry}
                    showUser={true}
                    canDelete={true}
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
  entry,
  showUser,
  canDelete,
  onDelete,
  colors,
}: {
  entry: TimeEntry;
  showUser: boolean;
  canDelete: boolean;
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
                {entry.user.firstName} {entry.user.lastName}
              </Text>
            </View>
          )}
        </View>
        {!!entry.description && (
          <Text style={[s.entryDesc, { color: colors.mutedForeground }]} numberOfLines={2}>{entry.description}</Text>
        )}
      </View>
      {canDelete && (
        <Pressable onPress={onDelete} style={s.deleteBtn} hitSlop={8}>
          <Feather name="trash-2" size={15} color={colors.mutedForeground} />
        </Pressable>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { paddingHorizontal: 20, paddingBottom: 40, paddingTop: 4 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
  sectionTitle: { fontSize: 11, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.8 },
  totalLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold", marginTop: 2 },
  logBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  logBtnText: { color: "#fff", fontSize: 13, fontFamily: "Inter_600SemiBold" },
  form: { borderRadius: 12, borderWidth: 1, padding: 16, marginBottom: 20 },
  formLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold", marginBottom: 6 },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, fontFamily: "Inter_400Regular" },
  multiline: { minHeight: 70, textAlignVertical: "top", paddingTop: 10 },
  error: { color: "#EF4444", fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 4 },
  submitBtn: { marginTop: 16, borderRadius: 10, paddingVertical: 13, alignItems: "center", justifyContent: "center" },
  submitBtnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_700Bold" },
  groupLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 },
  entryCard: { flexDirection: "row", alignItems: "flex-start", gap: 12, borderRadius: 12, borderWidth: 1, padding: 14, marginBottom: 10 },
  hoursCircle: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 1 },
  hoursNum: { fontSize: 17, fontFamily: "Inter_700Bold" },
  hoursUnit: { fontSize: 11, fontFamily: "Inter_600SemiBold", alignSelf: "flex-end", marginBottom: 3 },
  entryDate: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  entryDesc: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 3, lineHeight: 17 },
  userChip: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  userChipText: { fontSize: 11, fontFamily: "Inter_500Medium" },
  deleteBtn: { padding: 4 },
  empty: { alignItems: "center", paddingVertical: 48, gap: 8 },
  emptyText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  emptySubText: { fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center" },
});
