import { useGetDashboardSummary, useGetRecentActivity, useListProjects, customFetch } from "@workspace/api-client-react";
import * as Haptics from "expo-haptics";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import React, { useRef, useState, useCallback } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { Feather } from "@expo/vector-icons";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

const QUICK_CHIPS = [
  "What are my active projects?",
  "What's the weather like today?",
  "Give me safety tips for concrete work",
  "How do I write a good daily report?",
  "What should I watch for with winter construction?",
];

function MessageBubble({ msg }: { msg: Message }) {
  const colors = useColors();
  const isUser = msg.role === "user";

  return (
    <View style={[styles.bubbleRow, isUser ? styles.bubbleRowUser : styles.bubbleRowAssistant]}>
      {!isUser && (
        <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
          <Feather name="cpu" size={14} color="#FFFFFF" />
        </View>
      )}
      <View
        style={[
          styles.bubble,
          isUser
            ? [styles.bubbleUser, { backgroundColor: colors.primary }]
            : [styles.bubbleAssistant, { backgroundColor: colors.card, borderColor: colors.border }],
        ]}
      >
        <Text style={[styles.bubbleText, { color: isUser ? "#FFFFFF" : colors.foreground }]}>
          {msg.content}
        </Text>
      </View>
    </View>
  );
}

function TypingIndicator() {
  const colors = useColors();
  return (
    <View style={styles.bubbleRowAssistant}>
      <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
        <Feather name="cpu" size={14} color="#FFFFFF" />
      </View>
      <View style={[styles.bubble, styles.bubbleAssistant, { backgroundColor: colors.card, borderColor: colors.border, paddingVertical: 14 }]}>
        <View style={styles.typingDots}>
          <View style={[styles.dot, { backgroundColor: colors.mutedForeground }]} />
          <View style={[styles.dot, { backgroundColor: colors.mutedForeground }]} />
          <View style={[styles.dot, { backgroundColor: colors.mutedForeground }]} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 12, flexDirection: "row", alignItems: "flex-end" },
  headerLeft: { flex: 1 },
  title: { fontSize: 24, fontFamily: "Inter_700Bold" },
  subtitle: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#22C55E", marginBottom: 2 },
  list: { flex: 1 },
  listContent: { paddingHorizontal: 16, paddingVertical: 16, gap: 12 },
  bubbleRow: { flexDirection: "row", alignItems: "flex-end", gap: 8, maxWidth: "100%" },
  bubbleRowUser: { justifyContent: "flex-end" },
  bubbleRowAssistant: { justifyContent: "flex-start" },
  avatar: { width: 28, height: 28, borderRadius: 8, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  bubble: { maxWidth: "78%", borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10 },
  bubbleUser: { borderBottomRightRadius: 4 },
  bubbleAssistant: { borderBottomLeftRadius: 4, borderWidth: 1 },
  bubbleText: { fontSize: 15, fontFamily: "Inter_400Regular", lineHeight: 22 },
  typingDots: { flexDirection: "row", gap: 5, alignItems: "center" },
  dot: { width: 7, height: 7, borderRadius: 3.5, opacity: 0.6 },
  emptyContainer: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 },
  emptyTitle: { fontSize: 20, fontFamily: "Inter_700Bold", marginTop: 16, textAlign: "center" },
  emptySubtitle: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", marginTop: 8, lineHeight: 22 },
  chipsScrollContent: { paddingHorizontal: 16, gap: 8, paddingBottom: 4 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    flexShrink: 0,
  },
  chipText: { fontSize: 13, fontFamily: "Inter_400Regular" },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 12,
    gap: 10,
    borderTopWidth: 1,
  },
  inputWrap: {
    flex: 1,
    borderRadius: 22,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 10,
    maxHeight: 120,
  },
  input: { fontSize: 15, fontFamily: "Inter_400Regular" },
  sendButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  clearButton: { padding: 6 },
});

export default function AskScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  const { data: summary } = useGetDashboardSummary();
  const { data: projects } = useListProjects();
  const { data: activity } = useGetRecentActivity();

  const buildContext = useCallback(() => {
    const activeProjects = (projects ?? []).filter(p => p.status === "active");
    return JSON.stringify({
      activeProjects: activeProjects.map(p => ({ name: p.name, city: p.city, province: p.province, status: p.status })),
      dashboardSummary: summary
        ? {
            activeProjects: summary.activeProjects,
            totalProjects: summary.totalProjects,
            reportsThisWeek: summary.reportsThisWeek,
            openRFIs: summary.openRFIs,
            totalSpentThisMonth: summary.totalSpentThisMonth,
            teamMemberCount: summary.teamMemberCount,
          }
        : null,
      recentActivity: (activity ?? []).slice(0, 5).map(a => ({
        type: a.type,
        description: a.description,
        project: a.projectName,
      })),
    });
  }, [summary, projects, activity]);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || loading) return;

      const userMsg: Message = {
        id: `${Date.now()}-u`,
        role: "user",
        content: trimmed,
      };

      const newHistory = [...messages, userMsg];
      setMessages(newHistory);
      setInput("");
      setLoading(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      try {
        const domain = process.env.EXPO_PUBLIC_DOMAIN;
        const data = await customFetch<{ reply: string }>(`https://${domain}/api/ai/assistant`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: newHistory.map(m => ({ role: m.role, content: m.content })),
            context: buildContext(),
          }),
        });
        const assistantMsg: Message = {
          id: `${Date.now()}-a`,
          role: "assistant",
          content: data.reply ?? "I couldn't generate a response. Please try again.",
        };
        setMessages(prev => [...prev, assistantMsg]);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } catch {
        const errMsg: Message = {
          id: `${Date.now()}-e`,
          role: "assistant",
          content: "Something went wrong reaching the server. Please check your connection and try again.",
        };
        setMessages(prev => [...prev, errMsg]);
      } finally {
        setLoading(false);
      }
    },
    [messages, loading, buildContext]
  );

  const topInsets = Platform.OS === "web" ? 67 : insets.top;
  const bottomInsets = Platform.OS === "web" ? 34 : insets.bottom;
  const hasMessages = messages.length > 0;

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior="padding"
      keyboardVerticalOffset={0}
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: topInsets + 16, backgroundColor: colors.sidebar }]}>
        <View style={styles.headerLeft}>
          <Text style={[styles.title, { color: "#FFFFFF" }]}>BuildCore AI</Text>
          <Text style={[styles.subtitle, { color: "rgba(255,255,255,0.55)" }]}>
            Your construction assistant
          </Text>
        </View>
        <View style={styles.statusDot} />
        {hasMessages && (
          <Pressable
            style={styles.clearButton}
            onPress={() => { setMessages([]); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); }}
          >
            <Feather name="trash-2" size={18} color="rgba(255,255,255,0.5)" />
          </Pressable>
        )}
      </View>

      {/* Messages */}
      {hasMessages ? (
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={item => item.id}
          renderItem={({ item }) => <MessageBubble msg={item} />}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          style={styles.list}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
          ListFooterComponent={loading ? <TypingIndicator /> : null}
        />
      ) : (
        <View style={styles.emptyContainer}>
          <View style={[styles.avatar, { backgroundColor: colors.primary, width: 64, height: 64, borderRadius: 20 }]}>
            <Feather name="cpu" size={30} color="#FFFFFF" />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
            Ask me anything
          </Text>
          <Text style={[styles.emptySubtitle, { color: colors.mutedForeground }]}>
            I can help with your projects, daily reports, Canadian building codes, safety, and more.
          </Text>
        </View>
      )}

      {/* Quick chips (show only when no messages) */}
      {!hasMessages && (
        <FlatList
          data={QUICK_CHIPS}
          keyExtractor={item => item}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsScrollContent}
          renderItem={({ item }) => (
            <Pressable
              style={[styles.chip, { backgroundColor: colors.muted, borderColor: colors.border }]}
              onPress={() => sendMessage(item)}
            >
              <Text style={[styles.chipText, { color: colors.foreground }]}>{item}</Text>
            </Pressable>
          )}
          style={{ flexShrink: 0, marginBottom: 8 }}
        />
      )}

      {/* Input bar */}
      <View
        style={[
          styles.inputRow,
          {
            backgroundColor: colors.background,
            borderTopColor: colors.border,
            paddingBottom: bottomInsets + 8,
          },
        ]}
      >
        <View style={[styles.inputWrap, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <TextInput
            style={[styles.input, { color: colors.foreground }]}
            value={input}
            onChangeText={setInput}
            placeholder="Ask a question..."
            placeholderTextColor={colors.mutedForeground}
            multiline
            returnKeyType="send"
            onSubmitEditing={() => sendMessage(input)}
            blurOnSubmit={false}
          />
        </View>
        <TouchableOpacity
          style={[styles.sendButton, { backgroundColor: input.trim() && !loading ? colors.primary : colors.muted }]}
          onPress={() => sendMessage(input)}
          disabled={!input.trim() || loading}
          activeOpacity={0.8}
        >
          {loading ? (
            <ActivityIndicator color={colors.mutedForeground} size="small" />
          ) : (
            <Feather name="send" size={18} color={input.trim() ? "#FFFFFF" : colors.mutedForeground} />
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}
