import React from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator, FlatList } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { useListProjectCommunicationSummaries, type MessageSummary } from "@workspace/api-client-react";
import { commsStyles as cs } from "./styles";

function relativeDateLabel(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  const diffMin = Math.floor((Date.now() - d.getTime()) / 60_000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.floor(diffH / 24);
  if (diffD === 1) return "Yesterday";
  if (diffD < 7) return `${diffD}d ago`;
  return d.toLocaleDateString("en-CA", { month: "short", day: "numeric" });
}

function SummaryCard({ summary, onPress }: { summary: MessageSummary; onPress: () => void }) {
  const colors = useColors();
  return (
    <Pressable onPress={onPress} style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text style={[cs.rowTitle, { color: colors.foreground, flex: 1 }]} numberOfLines={1}>
          {summary.subject || "(no subject)"}
        </Text>
        <Text style={[cs.rowDate, { color: colors.mutedForeground }]}>{relativeDateLabel(summary.sent_at)}</Text>
      </View>
      <Text style={[cs.rowMeta, { color: colors.mutedForeground }]} numberOfLines={1}>
        {summary.from_name || summary.from_email || "Unknown sender"}
      </Text>
      {summary.ai_trade && (
        <View style={[cs.badge, { backgroundColor: colors.muted, alignSelf: "flex-start", marginTop: 6 }]}>
          <Text style={[cs.badgeText, { color: colors.primary, textTransform: "capitalize" }]}>{summary.ai_trade}</Text>
        </View>
      )}
      <Text style={[s.summaryText, { color: colors.foreground }]} numberOfLines={3}>
        {summary.ai_summary}
      </Text>
    </Pressable>
  );
}

export function SummariesPanel({ projectId, onOpenThread }: { projectId: number; onOpenThread: (threadId: number) => void }) {
  const colors = useColors();
  const { data, isLoading, isError, refetch } = useListProjectCommunicationSummaries(projectId);
  const summaries = data?.data ?? [];

  if (isLoading) return <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />;

  if (isError) {
    return (
      <View style={[cs.emptyBox, { borderColor: colors.border }]}>
        <Feather name="alert-circle" size={26} color={colors.mutedForeground} />
        <Text style={[cs.emptyTitle, { color: colors.foreground }]}>Failed to load summaries</Text>
        <Pressable style={[cs.retryBtn, { borderColor: colors.border }]} onPress={() => refetch()}>
          <Feather name="refresh-cw" size={14} color={colors.mutedForeground} />
          <Text style={[cs.retryText, { color: colors.mutedForeground }]}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  if (summaries.length === 0) {
    return (
      <View style={[cs.emptyBox, { borderColor: colors.border }]}>
        <Feather name="zap" size={26} color={colors.mutedForeground} />
        <Text style={[cs.emptyTitle, { color: colors.foreground }]}>No AI summaries yet</Text>
        <Text style={[cs.emptySubText, { color: colors.mutedForeground }]}>
          Summaries appear here shortly after new emails are synced and assigned to this project.
        </Text>
      </View>
    );
  }

  return (
    <FlatList
      data={summaries}
      keyExtractor={(m) => String(m.id)}
      scrollEnabled={false}
      renderItem={({ item }) => <SummaryCard summary={item} onPress={() => onOpenThread(item.thread_id)} />}
      ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
    />
  );
}

const s = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 16, padding: 12, gap: 2 },
  summaryText: { fontSize: 13, fontFamily: "NunitoSans_400Regular", marginTop: 6, lineHeight: 18 },
});
