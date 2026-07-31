import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  FlatList,
  Linking,
  Alert,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import {
  useListProjectCommunicationThreads,
  useGetProjectCommunicationThread,
  useSearchProjectCommunications,
  getProjectCommunicationAttachmentUrl,
  type EmailThread,
} from "@workspace/api-client-react";

type Props = { projectId: number };

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
        <View style={[s.emptyBox, { borderColor: colors.border }]}>
          <Feather name="alert-circle" size={26} color={colors.mutedForeground} />
          <Text style={[s.emptyTitle, { color: colors.foreground }]}>Failed to load thread</Text>
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
              <View key={msg.id} style={[s.messageCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
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
              </View>
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
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        s.threadCard,
        { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.9 : 1 },
      ]}
    >
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
    </Pressable>
  );
}

export function CommunicationsTab({ projectId }: Props) {
  const colors = useColors();
  const router = useRouter();
  const [selectedThreadId, setSelectedThreadId] = useState<number | null>(null);
  const [search, setSearch] = useState("");

  const {
    data: listData,
    isLoading: listLoading,
    isError: listIsError,
    refetch: refetchList,
  } = useListProjectCommunicationThreads(projectId, undefined, {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    query: { enabled: !search.trim() } as any,
  });

  const {
    data: searchData,
    isLoading: searchLoading,
  } = useSearchProjectCommunications(
    projectId,
    { q: search.trim() },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { query: { enabled: !!search.trim() } } as any,
  );

  useFocusEffect(
    useCallback(() => {
      refetchList();
    }, [refetchList]),
  );

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
          <View style={[s.emptyBox, { borderColor: colors.border }]}>
            <Feather name="search" size={26} color={colors.mutedForeground} />
            <Text style={[s.emptyTitle, { color: colors.foreground }]}>No matches</Text>
          </View>
        ) : (
          <FlatList
            data={searchResults}
            keyExtractor={(r) => String(r.id)}
            scrollEnabled={false}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => setSelectedThreadId(item.thread_id)}
                style={[s.threadCard, { backgroundColor: colors.card, borderColor: colors.border }]}
              >
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
              </Pressable>
            )}
            ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          />
        )
      ) : listIsError ? (
        <View style={[s.emptyBox, { borderColor: colors.border }]}>
          <Feather name="alert-circle" size={26} color={colors.mutedForeground} />
          <Text style={[s.emptyTitle, { color: colors.foreground }]}>Failed to load communications</Text>
          <Pressable style={[s.retryBtn, { borderColor: colors.border }]} onPress={() => refetchList()}>
            <Feather name="refresh-cw" size={14} color={colors.mutedForeground} />
            <Text style={[s.retryText, { color: colors.mutedForeground }]}>Retry</Text>
          </Pressable>
        </View>
      ) : threads.length === 0 ? (
        <View style={[s.emptyBox, { borderColor: colors.border }]}>
          <Feather name="inbox" size={26} color={colors.mutedForeground} />
          <Text style={[s.emptyTitle, { color: colors.foreground }]}>No emails linked yet</Text>
          <Text style={[s.emptySubText, { color: colors.mutedForeground }]}>
            Connect a mailbox in Email Integrations, then assign relevant threads to this
            project from the Uncategorized inbox.
          </Text>
          <Pressable
            onPress={() => router.push("/uncategorized-emails")}
            style={[s.retryBtn, { borderColor: colors.border }]}
          >
            <Feather name="inbox" size={14} color={colors.mutedForeground} />
            <Text style={[s.retryText, { color: colors.mutedForeground }]}>Open Uncategorized Inbox</Text>
          </Pressable>
        </View>
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
  emptyBox: {
    alignItems: "center",
    paddingVertical: 32,
    gap: 8,
    borderWidth: 1,
    borderRadius: 16,
    borderStyle: "dashed",
  },
  emptyTitle: { fontSize: 13, fontFamily: "NunitoSans_600SemiBold" },
  emptySubText: {
    fontSize: 12,
    fontFamily: "NunitoSans_400Regular",
    textAlign: "center",
    paddingHorizontal: 24,
    lineHeight: 17,
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
