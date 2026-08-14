import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  FlatList,
  Linking,
  Alert,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { Card, Chip, EmptyState, Button } from "@/components/ui";
import {
  useListProjectCommunicationThreads,
  useGetProjectCommunicationThread,
  useSearchProjectCommunications,
  getProjectCommunicationAttachmentUrl,
  type EmailThread,
} from "@workspace/api-client-react";
import { AttachmentsPanel } from "./comms/AttachmentsPanel";
import { SummariesPanel } from "./comms/SummariesPanel";
import { TimelinePanel } from "./comms/TimelinePanel";
import { SearchPanel } from "./comms/SearchPanel";
import { SuggestedMatchesPanel } from "./comms/SuggestedMatchesPanel";

type Props = { projectId: number };

type CommsMode = "inbox" | "attachments" | "summaries" | "timeline" | "search" | "uncategorized" | "suggested";

const MODE_TABS: { value: CommsMode; label: string }[] = [
  { value: "inbox", label: "Inbox" },
  { value: "attachments", label: "Attachments" },
  { value: "summaries", label: "AI Summaries" },
  { value: "timeline", label: "Timeline" },
  { value: "search", label: "Search" },
  { value: "suggested", label: "Suggested Matches" },
  { value: "uncategorized", label: "Uncategorized" },
];

function relativeDateLabel(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.floor(diffH / 24);
  if (diffD === 1) return "Yesterday";
  if (diffD < 7) return `${diffD}d ago`;
  return d.toLocaleDateString("en-CA", { month: "short", day: "numeric" });
}

function AttachmentRow({ projectId, attachment }: { projectId: number; attachment: { id: number; filename: string; contentType?: string | null } }) {
  const colors = useColors();
  const [opening, setOpening] = useState(false);

  async function handleOpen() {
    setOpening(true);
    try {
      const result = await getProjectCommunicationAttachmentUrl(projectId, attachment.id);
      await Linking.openURL(result.url);
    } catch {
      Alert.alert("Failed", "Could not open this attachment. Please try again.");
    } finally {
      setOpening(false);
    }
  }

  return (
    <Pressable onPress={handleOpen} disabled={opening} style={[s.attachmentRow, { borderColor: colors.border }]}>
      {opening ? (
        <ActivityIndicator size="small" color={colors.mutedForeground} />
      ) : (
        <Feather name="paperclip" size={14} color={colors.primary} />
      )}
      <Text style={[s.attachmentName, { color: colors.foreground }]} numberOfLines={1}>
        {attachment.filename}
      </Text>
      <Feather name="external-link" size={13} color={colors.mutedForeground} />
    </Pressable>
  );
}

function ThreadDetail({ projectId, threadId, onBack }: { projectId: number; threadId: number; onBack: () => void }) {
  const colors = useColors();
  const { data, isLoading, isError, refetch } = useGetProjectCommunicationThread(projectId, threadId);

  return (
    <View style={s.section}>
      <Pressable onPress={onBack} style={s.detailBackRow} hitSlop={8}>
        <Feather name="chevron-left" size={16} color={colors.primary} />
        <Text style={[s.detailBackText, { color: colors.primary }]}>All threads</Text>
      </Pressable>

      {isLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />
      ) : isError || !data ? (
        <View style={{ alignItems: "center" }}>
          <EmptyState icon="alert-circle" title="Failed to load thread" />
          <Pressable style={[s.retryBtn, { borderColor: colors.border }]} onPress={() => refetch()}>
            <Feather name="refresh-cw" size={14} color={colors.mutedForeground} />
            <Text style={[s.retryText, { color: colors.mutedForeground }]}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <Text style={[s.detailSubject, { color: colors.foreground }]}>
            {data.thread.subject || "(no subject)"}
          </Text>
          <View style={s.detailMessages}>
            {data.messages.map((msg) => (
              <Card key={msg.id} elevated={false} style={s.messageCard}>
                <View style={s.messageHeaderRow}>
                  <Text style={[s.messageFrom, { color: colors.foreground }]} numberOfLines={1}>
                    {msg.fromName || msg.fromEmail || "Unknown sender"}
                  </Text>
                  <Text style={[s.messageDate, { color: colors.mutedForeground }]}>
                    {relativeDateLabel(msg.sentAt)}
                  </Text>
                </View>
                {msg.fromName && msg.fromEmail && (
                  <Text style={[s.messageFromEmail, { color: colors.mutedForeground }]} numberOfLines={1}>
                    {msg.fromEmail}
                  </Text>
                )}
                <Text style={[s.messageBody, { color: colors.foreground }]}>
                  {msg.bodyText || "(no preview available)"}
                </Text>
                {(msg.attachments ?? []).length > 0 && (
                  <View style={s.attachmentsList}>
                    {msg.attachments!.map((att) => (
                      <AttachmentRow key={att.id} projectId={projectId} attachment={att} />
                    ))}
                  </View>
                )}
              </Card>
            ))}
          </View>
        </>
      )}
    </View>
  );
}

function ThreadCard({ thread, onPress }: { thread: EmailThread; onPress: () => void }) {
  const colors = useColors();
  return (
    <Card onPress={onPress} elevated={false} style={s.threadCard}>
      <View style={[s.threadIcon, { backgroundColor: colors.muted }]}>
        <Feather name="mail" size={15} color={colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          {thread.flagged && <Feather name="flag" size={11} color="#DC2626" />}
          <Text style={[s.threadSubject, { color: colors.foreground, flexShrink: 1 }]} numberOfLines={1}>
            {thread.subject || "(no subject)"}
          </Text>
        </View>
        <Text style={[s.threadMeta, { color: colors.mutedForeground }]} numberOfLines={1}>
          {(thread.participantEmails ?? []).slice(0, 2).join(", ") || "Unknown participants"}
          {thread.category ? ` · ${thread.category}` : ""}
        </Text>
        {thread.latestAiTrade && (
          <View style={[s.tradeChip, { backgroundColor: colors.muted }]}>
            <Text style={[s.tradeChipText, { color: colors.primary }]}>{thread.latestAiTrade}</Text>
          </View>
        )}
        {thread.latestAiSummary && (
          <Text style={[s.threadSummary, { color: colors.mutedForeground }]} numberOfLines={2}>
            {thread.latestAiSummary}
          </Text>
        )}
      </View>
      <Text style={[s.threadDate, { color: colors.mutedForeground }]}>
        {relativeDateLabel(thread.lastMessageAt)}
      </Text>
    </Card>
  );
}

export function CommunicationsTab({ projectId }: Props) {
  const colors = useColors();
  const router = useRouter();
  const [mode, setMode] = useState<CommsMode>("inbox");
  const [selectedThreadId, setSelectedThreadId] = useState<number | null>(null);
  const [search, setSearch] = useState("");

  const {
    data: listData,
    isLoading: listLoading,
    isError: listIsError,
    refetch: refetchList,
  } = useListProjectCommunicationThreads(projectId, undefined, {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    query: { enabled: mode === "inbox" && !search.trim() } as any,
  });

  const {
    data: searchData,
    isLoading: searchLoading,
  } = useSearchProjectCommunications(
    projectId,
    { q: search.trim() },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { query: { enabled: mode === "inbox" && !!search.trim() } } as any,
  );

  useFocusEffect(
    useCallback(() => {
      if (mode === "inbox") refetchList();
    }, [refetchList, mode]),
  );

  // Shared by every sub-tab that links back to a specific email (AI
  // Summaries, Timeline, Suggested Matches) — jumps to Inbox mode with that
  // thread's detail open, so "back" always lands somewhere sensible.
  function openThread(threadId: number) {
    setMode("inbox");
    setSelectedThreadId(threadId);
  }

  if (selectedThreadId != null) {
    return (
      <ThreadDetail
        projectId={projectId}
        threadId={selectedThreadId}
        onBack={() => setSelectedThreadId(null)}
      />
    );
  }

  const isSearching = !!search.trim();
  const isLoading = isSearching ? searchLoading : listLoading;
  const threads = isSearching ? [] : listData?.data ?? [];
  const searchResults = isSearching ? searchData?.results ?? [] : [];

  return (
    <View style={s.section}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
        <View style={{ flexDirection: "row", gap: 6 }}>
          {MODE_TABS.map((t) => (
            <Chip key={t.value} label={t.label} selected={mode === t.value} onPress={() => setMode(t.value)} />
          ))}
        </View>
      </ScrollView>

      {mode === "attachments" && <AttachmentsPanel projectId={projectId} />}
      {mode === "summaries" && <SummariesPanel projectId={projectId} onOpenThread={openThread} />}
      {mode === "timeline" && <TimelinePanel projectId={projectId} onOpenThread={openThread} />}
      {mode === "search" && <SearchPanel projectId={projectId} />}
      {mode === "suggested" && <SuggestedMatchesPanel projectId={projectId} onOpenThread={openThread} />}

      {mode === "uncategorized" && (
        <View style={{ alignItems: "center" }}>
          <EmptyState
            icon="inbox"
            title="Company-wide Uncategorized Inbox"
            subtitle="Threads land here when they're unassigned to any project — file them from the global inbox (opening it here since an unfiled thread can't be scoped to just this project yet)."
          />
          <Button label="Open Uncategorized Inbox" icon="inbox" variant="secondary" onPress={() => router.push("/uncategorized-emails")} />
        </View>
      )}

      {mode === "inbox" && (
        <>
          <View style={[s.searchBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Feather name="search" size={15} color={colors.mutedForeground} />
            <TextInput
              style={[s.searchInput, { color: colors.foreground }]}
              placeholder="Search project emails…"
              placeholderTextColor={colors.mutedForeground}
              value={search}
              onChangeText={setSearch}
              autoCapitalize="none"
            />
            {!!search && (
              <Pressable onPress={() => setSearch("")} hitSlop={8}>
                <Feather name="x" size={15} color={colors.mutedForeground} />
              </Pressable>
            )}
          </View>

          {isLoading ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />
          ) : isSearching ? (
            searchResults.length === 0 ? (
              <EmptyState icon="search" title="No matches" />
            ) : (
              <FlatList
                data={searchResults}
                keyExtractor={(r) => String(r.id)}
                scrollEnabled={false}
                renderItem={({ item }) => (
                  <Card onPress={() => setSelectedThreadId(item.thread_id)} elevated={false} style={s.threadCard}>
                    <View style={[s.threadIcon, { backgroundColor: colors.muted }]}>
                      <Feather name="mail" size={15} color={colors.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.threadSubject, { color: colors.foreground }]} numberOfLines={1}>
                        {item.subject || "(no subject)"}
                      </Text>
                      <Text style={[s.threadMeta, { color: colors.mutedForeground }]} numberOfLines={1}>
                        {item.from_name || item.from_email || ""}
                      </Text>
                    </View>
                    <Text style={[s.threadDate, { color: colors.mutedForeground }]}>
                      {relativeDateLabel(item.sent_at)}
                    </Text>
                  </Card>
                )}
                ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
              />
            )
          ) : listIsError ? (
            <View style={{ alignItems: "center" }}>
              <EmptyState icon="alert-circle" title="Failed to load communications" />
              <Pressable style={[s.retryBtn, { borderColor: colors.border }]} onPress={() => refetchList()}>
                <Feather name="refresh-cw" size={14} color={colors.mutedForeground} />
                <Text style={[s.retryText, { color: colors.mutedForeground }]}>Retry</Text>
              </Pressable>
            </View>
          ) : threads.length === 0 ? (
            <EmptyState
              icon="inbox"
              title="No emails linked yet"
              subtitle="Connect a mailbox in Email Integrations, then assign relevant threads to this project from the Uncategorized tab."
            />
          ) : (
            <FlatList
              data={threads}
              keyExtractor={(t) => String(t.id)}
              scrollEnabled={false}
              renderItem={({ item }) => (
                <ThreadCard thread={item} onPress={() => setSelectedThreadId(item.id)} />
              )}
              ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
            />
          )}
        </>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  section: { paddingHorizontal: 20, marginBottom: 16 },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: "NunitoSans_400Regular",
  },
  retryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 4,
  },
  retryText: { fontSize: 13, fontFamily: "NunitoSans_500Medium" },
  threadCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
  },
  threadIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  threadSubject: { fontSize: 14, fontFamily: "NunitoSans_600SemiBold" },
  threadMeta: { fontSize: 12, fontFamily: "NunitoSans_400Regular", marginTop: 1 },
  threadDate: { fontSize: 11, fontFamily: "NunitoSans_400Regular" },
  tradeChip: { alignSelf: "flex-start", borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2, marginTop: 4 },
  tradeChipText: { fontSize: 10, fontFamily: "NunitoSans_600SemiBold", textTransform: "capitalize" },
  threadSummary: { fontSize: 12, fontFamily: "NunitoSans_400Regular", marginTop: 4, lineHeight: 16 },
  detailBackRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 12,
  },
  detailBackText: { fontSize: 13, fontFamily: "NunitoSans_500Medium" },
  detailSubject: {
    fontSize: 16,
    fontFamily: "NunitoSans_700Bold",
    marginBottom: 12,
  },
  detailMessages: { gap: 10 },
  messageCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
    gap: 4,
  },
  messageHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  messageFrom: { fontSize: 13, fontFamily: "NunitoSans_600SemiBold", flex: 1 },
  messageFromEmail: { fontSize: 11, fontFamily: "NunitoSans_400Regular" },
  messageDate: { fontSize: 11, fontFamily: "NunitoSans_400Regular" },
  messageBody: {
    fontSize: 13,
    fontFamily: "NunitoSans_400Regular",
    lineHeight: 19,
    marginTop: 4,
  },
  attachmentsList: { marginTop: 8, gap: 6 },
  attachmentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  attachmentName: { flex: 1, fontSize: 12, fontFamily: "NunitoSans_500Medium" },
});
