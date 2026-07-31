import React from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator, FlatList, Alert } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import {
  useListUncategorizedEmails,
  getListUncategorizedEmailsQueryKey,
  useAssignEmailThreadToProject,
  useIgnoreUncategorizedEmail,
  type EmailThread,
} from "@workspace/api-client-react";
import { commsStyles as cs } from "./styles";

function SuggestionCard({
  thread,
  onConfirm,
  onIgnore,
  onOpenThread,
  busy,
}: {
  thread: EmailThread;
  onConfirm: () => void;
  onIgnore: () => void;
  onOpenThread: () => void;
  busy: boolean;
}) {
  const colors = useColors();
  return (
    <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Pressable onPress={onOpenThread}>
        <Text style={[cs.rowTitle, { color: colors.foreground }]} numberOfLines={1}>
          {thread.subject || "(no subject)"}
        </Text>
        <Text style={[cs.rowMeta, { color: colors.mutedForeground }]} numberOfLines={1}>
          {(thread.participantEmails ?? []).slice(0, 2).join(", ") || "Unknown participants"}
        </Text>
      </Pressable>
      {thread.matchConfidence != null && (
        <View style={[s.confidenceBox, { backgroundColor: `${colors.primary}12` }]}>
          <Feather name="zap" size={12} color={colors.primary} />
          <Text style={[s.confidenceText, { color: colors.primary }]}>
            {thread.matchConfidence}% match
            {(thread.matchReasons ?? [])[0]?.value ? ` · ${thread.matchReasons![0].value}` : ""}
          </Text>
        </View>
      )}
      <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
        <Pressable onPress={onConfirm} disabled={busy} style={[s.confirmBtn, { backgroundColor: colors.primary, opacity: busy ? 0.6 : 1 }]}>
          {busy ? <ActivityIndicator size="small" color="#FFFFFF" /> : (
            <>
              <Feather name="check" size={13} color="#FFFFFF" />
              <Text style={s.confirmText}>Confirm</Text>
            </>
          )}
        </Pressable>
        <Pressable onPress={onIgnore} disabled={busy} style={[s.ignoreBtn, { borderColor: colors.border, opacity: busy ? 0.6 : 1 }]}>
          <Feather name="x" size={13} color={colors.mutedForeground} />
          <Text style={[s.ignoreText, { color: colors.mutedForeground }]}>Ignore</Text>
        </Pressable>
      </View>
    </View>
  );
}

export function SuggestedMatchesPanel({ projectId, onOpenThread }: { projectId: number; onOpenThread: (threadId: number) => void }) {
  const colors = useColors();
  const queryClient = useQueryClient();

  const { data, isLoading, isError, refetch } = useListUncategorizedEmails({
    status: "suggested",
    suggestedProjectId: projectId,
  });
  const threads = data?.data ?? [];

  const { mutateAsync: assignThread, isPending: assigning } = useAssignEmailThreadToProject();
  const { mutateAsync: ignoreThread, isPending: ignoring } = useIgnoreUncategorizedEmail();
  const busy = assigning || ignoring;

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: getListUncategorizedEmailsQueryKey() });
  }

  async function handleConfirm(threadId: number) {
    try {
      await assignThread({ threadId, data: { projectId } });
      invalidate();
    } catch {
      Alert.alert("Failed", "Could not confirm this match. Please try again.");
    }
  }

  async function handleIgnore(threadId: number) {
    try {
      await ignoreThread({ threadId });
      invalidate();
    } catch {
      Alert.alert("Failed", "Could not ignore this thread. Please try again.");
    }
  }

  if (isLoading) return <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />;

  if (isError) {
    return (
      <View style={[cs.emptyBox, { borderColor: colors.border }]}>
        <Feather name="alert-circle" size={26} color={colors.mutedForeground} />
        <Text style={[cs.emptyTitle, { color: colors.foreground }]}>Failed to load suggested matches</Text>
        <Pressable style={[cs.retryBtn, { borderColor: colors.border }]} onPress={() => refetch()}>
          <Feather name="refresh-cw" size={14} color={colors.mutedForeground} />
          <Text style={[cs.retryText, { color: colors.mutedForeground }]}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  if (threads.length === 0) {
    return (
      <View style={[cs.emptyBox, { borderColor: colors.border }]}>
        <Feather name="check-circle" size={26} color={colors.mutedForeground} />
        <Text style={[cs.emptyTitle, { color: colors.foreground }]}>No suggested matches</Text>
        <Text style={[cs.emptySubText, { color: colors.mutedForeground }]}>
          When the matching engine finds an unfiled email that's likely part of this project, it'll show
          up here for a quick confirm.
        </Text>
      </View>
    );
  }

  return (
    <FlatList
      data={threads}
      keyExtractor={(t) => String(t.id)}
      scrollEnabled={false}
      renderItem={({ item }) => (
        <SuggestionCard
          thread={item}
          busy={busy}
          onConfirm={() => handleConfirm(item.id)}
          onIgnore={() => handleIgnore(item.id)}
          onOpenThread={() => onOpenThread(item.id)}
        />
      )}
      ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
    />
  );
}

const s = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 16, padding: 12, gap: 8 },
  confidenceBox: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 5, alignSelf: "flex-start" },
  confidenceText: { fontSize: 11, fontFamily: "NunitoSans_600SemiBold" },
  confirmBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 14, paddingVertical: 9 },
  confirmText: { fontSize: 13, fontFamily: "NunitoSans_600SemiBold", color: "#FFFFFF" },
  ignoreBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 14, borderWidth: 1, paddingVertical: 9 },
  ignoreText: { fontSize: 13, fontFamily: "NunitoSans_600SemiBold" },
});
