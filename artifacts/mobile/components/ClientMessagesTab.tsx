import React, { useState, useRef, useEffect, useCallback } from "react";
import { useFocusEffect } from "expo-router";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { customFetch } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";

const GOLD = "#C9A84C";

type PortalMessage = {
  id: number;
  projectId: number;
  senderRole: "client" | "contractor";
  senderName: string;
  message: string;
  createdAt: string;
};

function relativeDateLabel(iso: string) {
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

type Props = { projectId: number };

export function ClientMessagesTab({ projectId }: Props) {
  const colors = useColors();
  const qc = useQueryClient();
  const [replyText, setReplyText] = useState("");
  const scrollRef = useRef<ScrollView>(null);

  const { data: messages, isLoading, isError, error, refetch } = useQuery<PortalMessage[]>({
    queryKey: ["portal-messages", projectId],
    queryFn: () => customFetch<PortalMessage[]>(`/api/projects/${projectId}/portal/messages`),
    refetchInterval: 15_000,
    retry: false,
  });

  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch]),
  );

  useEffect(() => {
    if (messages && messages.length > 0) {
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages?.length]);

  const sendMutation = useMutation({
    mutationFn: (msg: string) =>
      customFetch<PortalMessage>(`/api/projects/${projectId}/portal/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg }),
      }),
    onSuccess: (newMsg) => {
      qc.setQueryData<PortalMessage[]>(["portal-messages", projectId], (prev) =>
        prev ? [...prev, newMsg] : [newMsg]
      );
      setReplyText("");
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    },
    onError: (e: any) => {
      Alert.alert("Error", e?.message ?? "Failed to send reply.");
    },
  });

  function handleSend() {
    const msg = replyText.trim();
    if (!msg || sendMutation.isPending) return;
    sendMutation.mutate(msg);
  }

  // No active portal
  const noPortal = isError && (error as any)?.message?.includes("No active portal");

  if (isLoading) {
    return (
      <View style={[s.section, { alignItems: "center", paddingVertical: 48 }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (noPortal) {
    return (
      <View style={s.section}>
        <View style={[s.emptyBox, { borderColor: colors.border }]}>
          <Feather name="message-circle" size={28} color={colors.mutedForeground} />
          <Text style={[s.emptyTitle, { color: colors.foreground }]}>No portal active</Text>
          <Text style={[s.emptySubText, { color: colors.mutedForeground }]}>
            Generate a client portal link from the web dashboard to enable messaging.
          </Text>
        </View>
      </View>
    );
  }

  if (isError) {
    return (
      <View style={s.section}>
        <View style={[s.emptyBox, { borderColor: colors.border }]}>
          <Feather name="alert-circle" size={28} color={colors.mutedForeground} />
          <Text style={[s.emptyTitle, { color: colors.foreground }]}>Failed to load messages</Text>
          <Pressable style={[s.retryBtn, { borderColor: colors.border }]} onPress={() => refetch()}>
            <Feather name="refresh-cw" size={14} color={colors.mutedForeground} />
            <Text style={[s.retryText, { color: colors.mutedForeground }]}>Retry</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const msgs = messages ?? [];

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={s.flex}
    >
      <View style={s.section}>
        {/* Header */}
        <View style={s.headerRow}>
          <Text style={[s.sectionTitle, { color: colors.mutedForeground }]}>Client Messages</Text>
          <Pressable onPress={() => refetch()} hitSlop={12}>
            <Feather name="refresh-cw" size={14} color={colors.mutedForeground} />
          </Pressable>
        </View>

        {/* Thread */}
        <View style={[s.threadContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <ScrollView
            ref={scrollRef}
            style={s.thread}
            contentContainerStyle={s.threadContent}
            showsVerticalScrollIndicator={false}
          >
            {msgs.length === 0 ? (
              <View style={s.noMessages}>
                <Feather name="message-circle" size={28} color={colors.mutedForeground} />
                <Text style={[s.emptyTitle, { color: colors.mutedForeground }]}>No messages yet</Text>
                <Text style={[s.emptySubText, { color: colors.mutedForeground }]}>
                  Once the client sends a message, it will appear here.
                </Text>
              </View>
            ) : (
              msgs.map((msg) => {
                const isContractor = msg.senderRole === "contractor";
                return (
                  <View key={msg.id} style={[s.msgWrapper, isContractor ? s.msgRight : s.msgLeft]}>
                    <View
                      style={[
                        s.bubble,
                        isContractor
                          ? [s.bubbleContractor, { backgroundColor: GOLD }]
                          : [s.bubbleClient, { backgroundColor: colors.muted }],
                      ]}
                    >
                      <Text style={[s.bubbleText, { color: isContractor ? "#111" : colors.foreground }]}>
                        {msg.message}
                      </Text>
                    </View>
                    <View style={[s.msgMeta, isContractor ? s.metaRight : s.metaLeft]}>
                      <Text style={[s.metaName, { color: colors.mutedForeground }]}>
                        {isContractor ? msg.senderName : "Client"}
                      </Text>
                      <Text style={[s.metaTime, { color: colors.mutedForeground }]}>
                        · {relativeDateLabel(msg.createdAt)}
                      </Text>
                    </View>
                  </View>
                );
              })
            )}
          </ScrollView>
        </View>

        {/* Reply box */}
        <View style={[s.replyBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <TextInput
            style={[s.input, { color: colors.foreground }]}
            placeholder="Reply to client…"
            placeholderTextColor={colors.mutedForeground}
            multiline
            value={replyText}
            onChangeText={setReplyText}
          />
          <Pressable
            style={[s.sendBtn, { opacity: !replyText.trim() || sendMutation.isPending ? 0.4 : 1 }]}
            onPress={handleSend}
            disabled={!replyText.trim() || sendMutation.isPending}
          >
            {sendMutation.isPending ? (
              <ActivityIndicator size="small" color="#111" />
            ) : (
              <Feather name="send" size={18} color="#111" />
            )}
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  section: { paddingHorizontal: 20, marginBottom: 16 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  sectionTitle: { fontSize: 12, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.5 },
  emptyBox: { alignItems: "center", paddingVertical: 32, gap: 8, borderWidth: 1, borderRadius: 12, borderStyle: "dashed" },
  emptyTitle: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  emptySubText: { fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center", paddingHorizontal: 20 },
  retryBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, borderWidth: 1, marginTop: 4 },
  retryText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  threadContainer: { borderWidth: 1, borderRadius: 12, marginBottom: 8, overflow: "hidden" },
  thread: { maxHeight: 340 },
  threadContent: { padding: 12, gap: 4 },
  noMessages: { alignItems: "center", paddingVertical: 32, gap: 8 },
  msgWrapper: { marginBottom: 8 },
  msgLeft: { alignItems: "flex-start" },
  msgRight: { alignItems: "flex-end" },
  bubble: { maxWidth: "80%", paddingHorizontal: 14, paddingVertical: 10, borderRadius: 18 },
  bubbleClient: { borderBottomLeftRadius: 4 },
  bubbleContractor: { borderBottomRightRadius: 4 },
  bubbleText: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20 },
  msgMeta: { flexDirection: "row", alignItems: "center", gap: 2, marginTop: 2, paddingHorizontal: 2 },
  metaLeft: {},
  metaRight: {},
  metaName: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  metaTime: { fontSize: 10, fontFamily: "Inter_400Regular" },
  replyBox: { flexDirection: "row", alignItems: "flex-end", borderWidth: 1, borderRadius: 12, paddingLeft: 14, paddingRight: 8, paddingVertical: 8, gap: 8 },
  input: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular", maxHeight: 100, paddingTop: Platform.OS === "ios" ? 2 : 0 },
  sendBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: GOLD, alignItems: "center", justifyContent: "center", flexShrink: 0 },
});
