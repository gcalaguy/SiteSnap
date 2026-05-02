import {
  useGetDashboardSummary,
  useGetRecentActivity,
  useListProjects,
  customFetch,
} from "@workspace/api-client-react";
import * as Haptics from "expo-haptics";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import React, { useRef, useState, useCallback, useEffect } from "react";
import {
  ActivityIndicator,
  Animated,
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
import { Audio } from "expo-av";
import * as FileSystem from "expo-file-system";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

const QUICK_CHIPS = [
  "What are my active projects?",
  "Give me safety tips for concrete work",
  "How do I write a good daily report?",
  "What does NBC say about fall protection?",
  "Winter construction best practices?",
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
      <View
        style={[
          styles.bubble,
          styles.bubbleAssistant,
          { backgroundColor: colors.card, borderColor: colors.border, paddingVertical: 14 },
        ]}
      >
        <View style={styles.typingDots}>
          <View style={[styles.dot, { backgroundColor: colors.mutedForeground }]} />
          <View style={[styles.dot, { backgroundColor: colors.mutedForeground }]} />
          <View style={[styles.dot, { backgroundColor: colors.mutedForeground }]} />
        </View>
      </View>
    </View>
  );
}

function RecordingPulse({ color }: { color: string }) {
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.4, duration: 600, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1, duration: 600, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [scale]);

  return (
    <Animated.View
      style={[styles.recordingDot, { backgroundColor: "#EF4444", transform: [{ scale }] }]}
    />
  );
}

export default function AskScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const recordingRef = useRef<Audio.Recording | null>(null);

  const { data: summary } = useGetDashboardSummary();
  const { data: projects } = useListProjects();
  const { data: activity } = useGetRecentActivity();

  const buildContext = useCallback(() => {
    const activeProjects = (projects ?? []).filter((p) => p.status === "active");
    return JSON.stringify({
      activeProjects: activeProjects.map((p) => ({
        name: p.name,
        city: p.city,
        province: p.province,
        status: p.status,
      })),
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
      recentActivity: (activity ?? []).slice(0, 5).map((a) => ({
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

      const userMsg: Message = { id: `${Date.now()}-u`, role: "user", content: trimmed };
      const newHistory = [...messages, userMsg];
      setMessages(newHistory);
      setInput("");
      setLoading(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      try {
        const domain = process.env.EXPO_PUBLIC_DOMAIN;
        const data = await customFetch<{ reply: string }>(
          `https://${domain}/api/ai/assistant`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              messages: newHistory.map((m) => ({ role: m.role, content: m.content })),
              context: buildContext(),
            }),
          },
        );
        const assistantMsg: Message = {
          id: `${Date.now()}-a`,
          role: "assistant",
          content: data.reply ?? "I couldn't generate a response. Please try again.",
        };
        setMessages((prev) => [...prev, assistantMsg]);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } catch {
        const errMsg: Message = {
          id: `${Date.now()}-e`,
          role: "assistant",
          content: "Something went wrong reaching the server. Please check your connection.",
        };
        setMessages((prev) => [...prev, errMsg]);
      } finally {
        setLoading(false);
      }
    },
    [messages, loading, buildContext],
  );

  const toggleRecording = useCallback(async () => {
    if (Platform.OS === "web") return;

    if (isRecording) {
      // Stop recording
      try {
        setIsRecording(false);
        const rec = recordingRef.current;
        if (!rec) return;
        await rec.stopAndUnloadAsync();
        const uri = rec.getURI();
        recordingRef.current = null;

        if (!uri) return;
        setIsTranscribing(true);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

        // Read file as base64
        const base64 = await FileSystem.readAsStringAsync(uri, {
          encoding: FileSystem.EncodingType.Base64,
        });

        const domain = process.env.EXPO_PUBLIC_DOMAIN;
        const result = await customFetch<{ text: string }>(
          `https://${domain}/api/ai/transcribe`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ audio: base64, format: "m4a" }),
          },
        );

        if (result.text) {
          setInput((prev) => (prev ? `${prev} ${result.text}` : result.text));
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
      } catch {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      } finally {
        setIsTranscribing(false);
      }
      return;
    }

    // Start recording
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== "granted") return;

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY,
      );
      recordingRef.current = recording;
      setIsRecording(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {
      // permission denied or hardware not available
    }
  }, [isRecording]);

  const topInsets = Platform.OS === "web" ? 67 : insets.top;
  const bottomInsets = Platform.OS === "web" ? 34 : insets.bottom;
  const hasMessages = messages.length > 0;

  const micColor =
    isRecording ? "#EF4444" : isTranscribing ? colors.mutedForeground : colors.mutedForeground;
  const micBg =
    isRecording
      ? "rgba(239,68,68,0.12)"
      : isTranscribing
        ? colors.muted
        : colors.muted;

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior="padding"
      keyboardVerticalOffset={0}
    >
      {/* Header */}
      <View
        style={[styles.header, { paddingTop: topInsets + 16, backgroundColor: colors.sidebar }]}
      >
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
            onPress={() => {
              setMessages([]);
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            }}
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
          keyExtractor={(item) => item.id}
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
          <View
            style={[
              styles.avatar,
              { backgroundColor: colors.primary, width: 64, height: 64, borderRadius: 20 },
            ]}
          >
            <Feather name="cpu" size={30} color="#FFFFFF" />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Ask me anything</Text>
          <Text style={[styles.emptySubtitle, { color: colors.mutedForeground }]}>
            Projects, daily reports, Canadian building codes, safety, and more.
          </Text>
        </View>
      )}

      {/* Quick chips */}
      {!hasMessages && (
        <FlatList
          data={QUICK_CHIPS}
          keyExtractor={(item) => item}
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
        {/* Voice button */}
        {Platform.OS !== "web" && (
          <TouchableOpacity
            style={[styles.micButton, { backgroundColor: micBg }]}
            onPress={toggleRecording}
            disabled={isTranscribing}
            activeOpacity={0.7}
          >
            {isTranscribing ? (
              <ActivityIndicator color={colors.mutedForeground} size="small" />
            ) : isRecording ? (
              <View style={styles.recordingRow}>
                <RecordingPulse color="#EF4444" />
                <Feather name="mic-off" size={18} color="#EF4444" />
              </View>
            ) : (
              <Feather name="mic" size={18} color={micColor} />
            )}
          </TouchableOpacity>
        )}

        <View
          style={[styles.inputWrap, { backgroundColor: colors.card, borderColor: colors.border }]}
        >
          <TextInput
            style={[styles.input, { color: colors.foreground }]}
            value={input}
            onChangeText={setInput}
            placeholder={isRecording ? "Recording… tap mic to stop" : "Ask a question…"}
            placeholderTextColor={isRecording ? "#EF4444" : colors.mutedForeground}
            multiline
            returnKeyType="send"
            onSubmitEditing={() => sendMessage(input)}
            blurOnSubmit={false}
          />
        </View>

        <TouchableOpacity
          style={[
            styles.sendButton,
            { backgroundColor: input.trim() && !loading ? colors.primary : colors.muted },
          ]}
          onPress={() => sendMessage(input)}
          disabled={!input.trim() || loading}
          activeOpacity={0.8}
        >
          {loading ? (
            <ActivityIndicator color={colors.mutedForeground} size="small" />
          ) : (
            <Feather
              name="send"
              size={18}
              color={input.trim() ? "#FFFFFF" : colors.mutedForeground}
            />
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    flexDirection: "row",
    alignItems: "flex-end",
  },
  headerLeft: { flex: 1 },
  title: { fontSize: 24, fontFamily: "Inter_700Bold" },
  subtitle: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#22C55E",
    marginBottom: 2,
    marginRight: 8,
  },
  list: { flex: 1 },
  listContent: { paddingHorizontal: 16, paddingVertical: 16, gap: 12 },
  bubbleRow: { flexDirection: "row", alignItems: "flex-end", gap: 8, maxWidth: "100%" },
  bubbleRowUser: { justifyContent: "flex-end" },
  bubbleRowAssistant: { justifyContent: "flex-start" },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  bubble: { maxWidth: "78%", borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10 },
  bubbleUser: { borderBottomRightRadius: 4 },
  bubbleAssistant: { borderBottomLeftRadius: 4, borderWidth: 1 },
  bubbleText: { fontSize: 15, fontFamily: "Inter_400Regular", lineHeight: 22 },
  typingDots: { flexDirection: "row", gap: 5, alignItems: "center" },
  dot: { width: 7, height: 7, borderRadius: 3.5, opacity: 0.6 },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    marginTop: 16,
    textAlign: "center",
  },
  emptySubtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    marginTop: 8,
    lineHeight: 22,
  },
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
    gap: 8,
    borderTopWidth: 1,
  },
  micButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  recordingRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  recordingDot: { width: 8, height: 8, borderRadius: 4 },
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
