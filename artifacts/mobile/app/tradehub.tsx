import React, { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Alert,
  Modal,
  KeyboardAvoidingView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { customFetch } from "@workspace/api-client-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

type PostType = "discussion" | "job" | "showcase";

interface PostAuthor {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
}

interface TradePost {
  id: number;
  type: PostType;
  title: string;
  content: string;
  trade: string | null;
  location: string | null;
  province: string | null;
  author: PostAuthor | null;
  reactionCount: number;
  commentCount: number;
  hasReacted: boolean;
  createdAt: string;
  isMine?: boolean;
}

const TYPE_LABELS: Record<PostType, string> = {
  discussion: "Discussion",
  job: "Job",
  showcase: "Showcase",
};
const TYPE_COLORS: Record<PostType, string> = {
  discussion: "#3B82F6",
  job: "#D4AF37",
  showcase: "#8B5CF6",
};
const TYPE_ICONS: Record<PostType, string> = {
  discussion: "message-circle",
  job: "briefcase",
  showcase: "star",
};

function authorName(author: PostAuthor | null): string {
  if (!author) return "Unknown";
  return `${author.firstName ?? ""} ${author.lastName ?? ""}`.trim() || author.email;
}

function timeAgo(dateStr: string) {
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function TradeHubScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [activeType, setActiveType] = useState<PostType | "all">("all");
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [newType, setNewType] = useState<PostType>("discussion");

  const {
    data: posts = [],
    isLoading,
    refetch,
    isRefetching,
    error,
    isError,
  } = useQuery<TradePost[]>({
    queryKey: ["tradehub-feed-mobile", activeType],
    queryFn: () =>
      customFetch<TradePost[]>(
        activeType === "all" ? "/api/tradehub/posts" : `/api/tradehub/posts?kind=${activeType}`
      ),
  });

  const react = useMutation({
    mutationFn: (postId: number) =>
      customFetch(`/api/tradehub/posts/${postId}/react`, { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tradehub-feed-mobile"] }),
  });

  const createPost = useMutation({
    mutationFn: (data: { title: string; content: string; type: PostType }) =>
      customFetch("/api/tradehub/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tradehub-feed-mobile"] });
      setShowCreate(false);
      setNewTitle("");
      setNewContent("");
      setNewType("discussion");
    },
    onError: () => Alert.alert("Failed to post", "Please try again."),
  });

  function handlePost() {
    if (!newTitle.trim() || !newContent.trim()) {
      Alert.alert("Missing fields", "Title and body are required.");
      return;
    }
    createPost.mutate({ title: newTitle.trim(), content: newContent.trim(), type: newType });
  }

  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const types: (PostType | "all")[] = ["all", "discussion", "job", "showcase"];

  function renderPost({ item }: { item: TradePost }) {
    const typeColor = TYPE_COLORS[item.type] ?? colors.primary;
    const typeLabel = TYPE_LABELS[item.type] ?? item.type;
    const typeIcon = (TYPE_ICONS[item.type] ?? "file-text") as any;
    return (
      <TouchableOpacity
        style={[styles.postCard, { backgroundColor: colors.card, borderColor: colors.border }]}
        onPress={() => router.push(`/tradehub-post/${item.id}` as any)}
        activeOpacity={0.82}
      >
        {/* Type badge */}
        <View style={styles.postTop}>
          <View style={[styles.typeBadge, { backgroundColor: typeColor + "18" }]}>
            <Feather name={typeIcon} size={11} color={typeColor} />
            <Text style={[styles.typeText, { color: typeColor }]}>{typeLabel}</Text>
          </View>
          <Text style={[styles.timeText, { color: colors.mutedForeground }]}>{timeAgo(item.createdAt)}</Text>
        </View>

        <Text style={[styles.postTitle, { color: colors.foreground }]} numberOfLines={2}>
          {item.title}
        </Text>
        <Text style={[styles.postBody, { color: colors.mutedForeground }]} numberOfLines={3}>
          {item.content}
        </Text>

        {/* Footer */}
        <View style={styles.postFooter}>
          <Text style={[styles.authorText, { color: colors.mutedForeground }]}>{authorName(item.author)}</Text>
          <View style={styles.postActions}>
            <Pressable
              style={styles.actionBtn}
              onPress={() => react.mutate(item.id)}
              hitSlop={8}
            >
              <Feather
                name="thumbs-up"
                size={14}
                color={item.hasReacted ? colors.primary : colors.mutedForeground}
              />
              <Text style={[styles.actionCount, { color: item.hasReacted ? colors.primary : colors.mutedForeground }]}>
                {item.reactionCount}
              </Text>
            </Pressable>
            <View style={styles.actionBtn}>
              <Feather name="message-square" size={14} color={colors.mutedForeground} />
              <Text style={[styles.actionCount, { color: colors.mutedForeground }]}>{item.commentCount}</Text>
            </View>
          </View>
        </View>
      </TouchableOpacity>
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
          <Text style={styles.headerTitle}>TradeHub</Text>
          <Text style={styles.headerSub}>Canadian Trades Community</Text>
        </View>
        <TouchableOpacity
          style={[styles.newBtn, { backgroundColor: colors.primary }]}
          onPress={() => setShowCreate(true)}
          hitSlop={8}
        >
          <Feather name="plus" size={18} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      {/* Type filter */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={[styles.filterRow, { borderBottomColor: colors.border }]}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 8, paddingVertical: 10 }}
      >
        {types.map((t) => {
          const isActive = activeType === t;
          const label = t === "all" ? "All" : TYPE_LABELS[t];
          const color = t === "all" ? colors.primary : TYPE_COLORS[t];
          return (
            <TouchableOpacity
              key={t}
              onPress={() => setActiveType(t)}
              style={[
                styles.filterChip,
                { borderColor: isActive ? color : colors.border, backgroundColor: isActive ? color + "15" : colors.card },
              ]}
            >
              {t !== "all" && <Feather name={TYPE_ICONS[t] as any} size={12} color={isActive ? color : colors.mutedForeground} />}
              <Text style={[styles.filterChipText, { color: isActive ? color : colors.mutedForeground }]}>{label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Feed */}
      {isLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : isError ? (
        <View style={styles.loading}>
          <Feather name="alert-triangle" size={36} color={colors.mutedForeground} />
          <Text style={[styles.emptyText, { color: colors.mutedForeground, marginTop: 12 }]}>
            Could not load TradeHub
          </Text>
          <Text style={[styles.emptyHint, { color: colors.mutedForeground }]}>
            {error instanceof Error ? error.message : "Something went wrong"}
          </Text>
          <TouchableOpacity
            onPress={() => refetch()}
            style={[styles.retryBtn, { backgroundColor: colors.primary }]}
          >
            <Text style={{ color: "#FFFFFF", fontFamily: "Inter_600SemiBold", fontSize: 14 }}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderPost}
          contentContainerStyle={[styles.feedContent, { paddingBottom: insets.bottom + 24 }]}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Feather name="globe" size={40} color={colors.border} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No posts yet</Text>
              <Text style={[styles.emptyHint, { color: colors.mutedForeground }]}>Be the first to post in this category</Text>
            </View>
          }
        />
      )}

      {/* Create modal */}
      <Modal visible={showCreate} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowCreate(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={[styles.modal, { backgroundColor: colors.background }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <TouchableOpacity onPress={() => setShowCreate(false)} hitSlop={10}>
                <Feather name="x" size={22} color={colors.foreground} />
              </TouchableOpacity>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>New Post</Text>
              <Pressable onPress={handlePost} disabled={createPost.isPending}>
                {createPost.isPending ? (
                  <ActivityIndicator color={colors.primary} size="small" />
                ) : (
                  <Text style={[styles.postBtn, { color: colors.primary }]}>Post</Text>
                )}
              </Pressable>
            </View>

            <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
              {/* Type picker */}
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Type</Text>
              <View style={styles.typeRow}>
                {(["discussion", "job", "showcase"] as PostType[]).map((t) => (
                  <TouchableOpacity
                    key={t}
                    onPress={() => setNewType(t)}
                    style={[
                      styles.typeChip,
                      { borderColor: newType === t ? TYPE_COLORS[t] : colors.border, backgroundColor: newType === t ? TYPE_COLORS[t] + "15" : colors.card },
                    ]}
                  >
                    <Feather name={TYPE_ICONS[t] as any} size={12} color={newType === t ? TYPE_COLORS[t] : colors.mutedForeground} />
                    <Text style={[styles.typeChipText, { color: newType === t ? TYPE_COLORS[t] : colors.mutedForeground }]}>
                      {TYPE_LABELS[t]}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginTop: 20 }]}>Title</Text>
              <TextInput
                style={[styles.textInput, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
                placeholder="What's this about?"
                placeholderTextColor={colors.mutedForeground}
                value={newTitle}
                onChangeText={setNewTitle}
                returnKeyType="next"
              />

              <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginTop: 16 }]}>Details</Text>
              <TextInput
                style={[styles.textInput, styles.bodyInput, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
                placeholder="Share details, ask a question, post a job…"
                placeholderTextColor={colors.mutedForeground}
                value={newContent}
                onChangeText={setNewContent}
                multiline
                textAlignVertical="top"
              />
            </ScrollView>
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
  headerTitle: { fontSize: 18, fontFamily: "Inter_700Bold", color: "#FFFFFF" },
  headerSub: { fontSize: 12, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.6)", marginTop: 1 },
  newBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  filterRow: { borderBottomWidth: 1 },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  filterChipText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  feedContent: { padding: 12, gap: 10 },
  postCard: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 8 },
  postTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  typeBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  typeText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  timeText: { fontSize: 11, fontFamily: "Inter_400Regular" },
  postTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold", lineHeight: 21 },
  postBody: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19 },
  postFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 4 },
  authorText: { fontSize: 12, fontFamily: "Inter_400Regular" },
  postActions: { flexDirection: "row", gap: 14 },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: 5 },
  actionCount: { fontSize: 13, fontFamily: "Inter_500Medium" },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  retryBtn: {
    marginTop: 16,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 20,
  },
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
  modalScroll: { flex: 1 },
  modalContent: { padding: 20, gap: 4 },
  fieldLabel: { fontSize: 13, fontFamily: "Inter_500Medium", marginBottom: 8 },
  typeRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  typeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  typeChipText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  textInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
  bodyInput: { minHeight: 140 },
});
