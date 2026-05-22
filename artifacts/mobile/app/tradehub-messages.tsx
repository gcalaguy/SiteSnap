import React, { useState, useRef, useEffect } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
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
import { useQueryClient } from "@tanstack/react-query";
import {
  useListTradehubConversations,
  useListTradehubMessages,
  useSendTradehubMessage,
  useCreateTradehubConversation,
  useSearchTradehubUsers,
  useMarkTradehubConversationRead,
  TradehubConversation,
  TradehubMessage,
} from "@workspace/api-client-react";

function formatTime(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  const diffH = (now.getTime() - d.getTime()) / 36e5;
  if (diffH < 24) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  if (diffH < 48) return "Yesterday";
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

export default function TradehubMessagesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const listRef = useRef<FlatList>(null);

  const [activeConv, setActiveConv] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [newMsg, setNewMsg] = useState("");

  const {
    data: conversationsData,
    isLoading: convLoading,
    refetch: refetchConvs,
    isRefetching: convRefetching,
  } = useListTradehubConversations();

  const conversations = (conversationsData as any)?.conversations ?? (conversationsData as any) ?? [];

  const {
    data: messagesData,
    isLoading: msgLoading,
    refetch: refetchMsgs,
  } = useListTradehubMessages(activeConv ?? 0, { query: { enabled: !!activeConv } as any });

  const messages = (messagesData as any)?.messages ?? (messagesData as any) ?? [];

  const sendMutation = useSendTradehubMessage({
    mutation: {
      onSuccess: () => {
        setMessage("");
        queryClient.invalidateQueries({ queryKey: ["tradehubMessages"] });
        queryClient.invalidateQueries({ queryKey: ["tradehubConversations"] });
      },
      onError: () => Alert.alert("Error", "Failed to send message."),
    },
  });

  const createConvMutation = useCreateTradehubConversation({
    mutation: {
      onSuccess: (data: any) => {
        const convId = data?.conversationId;
        setShowNew(false);
        setSearch("");
        setSelectedUser(null);
        setNewMsg("");
        queryClient.invalidateQueries({ queryKey: ["tradehubConversations"] });
        if (convId) setActiveConv(convId);
      },
      onError: (err: any) => Alert.alert("Error", err?.message ?? "Failed to start conversation."),
    },
  });

  const markRead = useMarkTradehubConversationRead({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tradehubConversations"] }),
    },
  });

  const { data: searchResults, isLoading: searchLoading } = useSearchTradehubUsers(
    { q: search },
    { query: { enabled: search.trim().length >= 2 && showNew } as any }
  );

  const users = (searchResults as any)?.users ?? (searchResults as any) ?? [];

  useEffect(() => {
    if (activeConv && messages.length > 0) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
      markRead.mutate({ id: activeConv });
    }
  }, [activeConv, messages.length]);

  const topInset = Platform.OS === "web" ? 67 : insets.top;

  function renderConversation({ item }: { item: TradehubConversation }) {
    const other = item.otherParticipant;
    return (
      <TouchableOpacity
        style={[styles.convCard, { backgroundColor: colors.card, borderColor: colors.border }, item.unreadCount > 0 && { borderLeftWidth: 3, borderLeftColor: colors.primary }]}
        onPress={() => setActiveConv(item.id)}
        activeOpacity={0.82}
      >
        <View style={[styles.avatar, { backgroundColor: colors.muted }]}>
          <Text style={[styles.avatarText, { color: colors.mutedForeground }]}>
            {(other?.displayName?.[0] ?? "?").toUpperCase()}
          </Text>
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={[styles.convName, { color: colors.foreground }]}>{other?.displayName ?? "Unknown"}</Text>
            {item.lastMessage && (
              <Text style={[styles.convTime, { color: colors.mutedForeground }]}>{formatTime(item.lastMessage.createdAt ?? "")}</Text>
            )}
          </View>
          <Text style={[styles.convPreview, { color: colors.mutedForeground }]} numberOfLines={1}>
            {item.lastMessage?.content ?? "No messages yet"}
          </Text>
        </View>
        {item.unreadCount > 0 && (
          <View style={[styles.unreadBadge, { backgroundColor: colors.primary }]}>
            <Text style={styles.unreadText}>{item.unreadCount}</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  }

  function renderMessage({ item }: { item: TradehubMessage }) {
    const isMe = false; // we don't have current user id easily here; align right if we did
    return (
      <View style={[styles.msgBubble, { backgroundColor: colors.muted, alignSelf: "flex-start" }]}>
        <Text style={[styles.msgText, { color: colors.foreground }]}>{item.content}</Text>
        <Text style={[styles.msgTime, { color: colors.mutedForeground }]}>{formatTime(item.createdAt)}</Text>
      </View>
    );
  }

  if (activeConv) {
    const conv = (conversations as TradehubConversation[]).find((c) => c.id === activeConv);
    const otherName = conv?.otherParticipant?.displayName ?? "Chat";
    return (
      <KeyboardAvoidingView style={[styles.container, { backgroundColor: colors.background }]} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        {/* Chat header */}
        <View style={[styles.header, { paddingTop: topInset + 12, backgroundColor: colors.sidebar }]}>
          <TouchableOpacity onPress={() => setActiveConv(null)} hitSlop={12} style={styles.backBtn}>
            <Feather name="arrow-left" size={22} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>{otherName}</Text>
          <View style={{ width: 38 }} />
        </View>

        {msgLoading ? (
          <View style={styles.loading}><ActivityIndicator color={colors.primary} size="large" /></View>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(item: TradehubMessage) => String(item.id)}
            renderItem={renderMessage}
            contentContainerStyle={{ padding: 16, gap: 8, paddingBottom: insets.bottom + 8 }}
            refreshControl={<RefreshControl refreshing={false} onRefresh={refetchMsgs} tintColor={colors.primary} />}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Feather name="message-circle" size={32} color={colors.border} />
                <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No messages yet</Text>
              </View>
            }
          />
        )}

        {/* Input */}
        <View style={[styles.inputBar, { backgroundColor: colors.card, borderTopColor: colors.border, paddingBottom: insets.bottom + 8 }]}>
          <TextInput
            style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
            placeholder="Type a message…"
            placeholderTextColor={colors.mutedForeground}
            value={message}
            onChangeText={setMessage}
            multiline
          />
          <TouchableOpacity
            style={[styles.sendBtn, { backgroundColor: colors.primary }]}
            onPress={() => {
              const trimmed = message.trim();
              if (!trimmed || sendMutation.isPending) return;
              sendMutation.mutate({ id: activeConv, data: { content: trimmed } });
            }}
            disabled={sendMutation.isPending}
          >
            <Feather name="send" size={18} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topInset + 12, backgroundColor: colors.sidebar }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color="#FFFFFF" />
        </TouchableOpacity>
        <View>
          <Text style={styles.headerTitle}>Messages</Text>
          <Text style={styles.headerSub}>Direct messages</Text>
        </View>
        <TouchableOpacity onPress={() => setShowNew(true)} hitSlop={8} style={styles.newBtn}>
          <Feather name="plus" size={18} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      {convLoading ? (
        <View style={styles.loading}><ActivityIndicator color={colors.primary} size="large" /></View>
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(item: TradehubConversation) => String(item.id)}
          renderItem={renderConversation}
          contentContainerStyle={[styles.feedContent, { paddingBottom: insets.bottom + 24 }]}
          refreshControl={<RefreshControl refreshing={convRefetching} onRefresh={refetchConvs} tintColor={colors.primary} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Feather name="message-circle" size={40} color={colors.border} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No conversations yet</Text>
              <Text style={[styles.emptyHint, { color: colors.mutedForeground }]}>Tap + to start a new conversation</Text>
            </View>
          }
        />
      )}

      {/* New conversation modal */}
      <Modal visible={showNew} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => { setShowNew(false); setSelectedUser(null); setSearch(""); }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={[styles.modal, { backgroundColor: colors.background }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <TouchableOpacity onPress={() => { setShowNew(false); setSelectedUser(null); setSearch(""); }} hitSlop={10}>
                <Feather name="x" size={22} color={colors.foreground} />
              </TouchableOpacity>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>New Message</Text>
              <TouchableOpacity
                onPress={() => selectedUser && createConvMutation.mutate({ data: { recipientId: selectedUser.id, message: newMsg.trim() || "Hi" } })}
                disabled={!selectedUser || createConvMutation.isPending}
              >
                {createConvMutation.isPending ? <ActivityIndicator color={colors.primary} size="small" /> : <Text style={[styles.postBtn, { color: selectedUser ? colors.primary : colors.mutedForeground }]}>Start</Text>}
              </TouchableOpacity>
            </View>

            <View style={{ padding: 16, gap: 12 }}>
              {!selectedUser ? (
                <>
                  <View style={[styles.searchBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <Feather name="search" size={16} color={colors.mutedForeground} />
                    <TextInput
                      style={[styles.searchInput, { color: colors.foreground }]}
                      placeholder="Search by name or trade…"
                      placeholderTextColor={colors.mutedForeground}
                      value={search}
                      onChangeText={setSearch}
                      autoFocus
                    />
                  </View>
                  {search.trim().length >= 2 && (
                    <>
                      {searchLoading && <ActivityIndicator color={colors.primary} style={{ marginVertical: 12 }} />}
                      <FlatList
                        data={users}
                        keyExtractor={(u: any) => String(u.id)}
                        renderItem={({ item }: { item: any }) => (
                          <TouchableOpacity
                            style={[styles.userRow, { borderBottomColor: colors.border }]}
                            onPress={() => setSelectedUser(item)}
                          >
                            <View style={[styles.avatar, { backgroundColor: colors.muted }]}>
                              <Text style={[styles.avatarText, { color: colors.mutedForeground }]}>{(item.displayName?.[0] ?? "?").toUpperCase()}</Text>
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={[styles.userName, { color: colors.foreground }]}>{item.displayName ?? "Unknown"}</Text>
                              <Text style={[styles.userTrade, { color: colors.mutedForeground }]}>{item.trade ?? "Trade professional"}</Text>
                            </View>
                            <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
                          </TouchableOpacity>
                        )}
                        ListEmptyComponent={!searchLoading ? <Text style={{ color: colors.mutedForeground, textAlign: "center", marginTop: 20 }}>No users found</Text> : null}
                      />
                    </>
                  )}
                </>
              ) : (
                <>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                    <View style={[styles.avatar, { backgroundColor: colors.muted }]}>
                      <Text style={[styles.avatarText, { color: colors.mutedForeground }]}>{(selectedUser.displayName?.[0] ?? "?").toUpperCase()}</Text>
                    </View>
                    <View>
                      <Text style={[styles.userName, { color: colors.foreground }]}>{selectedUser.displayName ?? "Unknown"}</Text>
                      <Text style={[styles.userTrade, { color: colors.mutedForeground }]}>{selectedUser.trade ?? "Trade professional"}</Text>
                    </View>
                    <TouchableOpacity onPress={() => setSelectedUser(null)} style={{ marginLeft: "auto" }}>
                      <Feather name="x" size={18} color={colors.mutedForeground} />
                    </TouchableOpacity>
                  </View>
                  <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>First message</Text>
                  <TextInput
                    style={[styles.textInput, styles.bodyInput, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
                    placeholder="Say hello…"
                    placeholderTextColor={colors.mutedForeground}
                    value={newMsg}
                    onChangeText={setNewMsg}
                    multiline
                    textAlignVertical="top"
                    autoFocus
                  />
                </>
              )}
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  backBtn: { width: 38, height: 38, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 18, fontFamily: "Inter_700Bold", color: "#FFFFFF", flex: 1, textAlign: "center" },
  headerSub: { fontSize: 12, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.6)", marginTop: 1 },
  newBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.12)" },
  feedContent: { padding: 12, gap: 8 },
  convCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
  },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 16, fontFamily: "Inter_700Bold" },
  convName: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  convTime: { fontSize: 11, fontFamily: "Inter_400Regular" },
  convPreview: { fontSize: 13, fontFamily: "Inter_400Regular" },
  unreadBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
  },
  unreadText: { fontSize: 11, fontFamily: "Inter_700Bold", color: "#FFFFFF" },
  msgBubble: { borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, maxWidth: "80%" },
  msgText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  msgTime: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 4, alignSelf: "flex-end" },
  inputBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    maxHeight: 100,
  },
  sendBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { alignItems: "center", justifyContent: "center", paddingVertical: 60, gap: 10 },
  emptyText: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  emptyHint: { fontSize: 13, fontFamily: "Inter_400Regular" },
  modal: { flex: 1 },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  modalTitle: { fontSize: 17, fontFamily: "Inter_700Bold" },
  postBtn: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  searchInput: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular" },
  userRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  userName: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  userTrade: { fontSize: 13, fontFamily: "Inter_400Regular" },
  fieldLabel: { fontSize: 13, fontFamily: "Inter_500Medium", marginBottom: 8 },
  textInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
  bodyInput: { minHeight: 100 },
});
