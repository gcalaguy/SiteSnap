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
  Share,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListTradehubFeed,
  useCreateTradehubPost,
  useReactToTradehubPost,
  getListTradehubFeedQueryKey,
  TradehubPost,
  ListTradehubFeedType,
} from "@workspace/api-client-react";
import { SignedImage } from "@/components/SignedImage";

const ORANGE = "#FF6B00";

const TYPE_LABELS: Record<ListTradehubFeedType, string> = {
  discussion: "Discussion",
  job: "Job",
  showcase: "Showcase",
};

const TYPE_COLORS: Record<ListTradehubFeedType, string> = {
  discussion: "#3B82F6",
  job: "#D4AF37",
  showcase: "#8B5CF6",
};

const TYPE_ICONS: Record<ListTradehubFeedType, string> = {
  discussion: "message-circle",
  job: "briefcase",
  showcase: "star",
};

function authorName(author: TradehubPost["author"]): string {
  if (!author) return "Unknown";
  return `${author.firstName ?? ""} ${author.lastName ?? ""}`.trim() || "Unknown";
}

function initialsFor(profile: TradehubPost["profile"], author: TradehubPost["author"]): string {
  if (profile?.displayName) return profile.displayName.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "??";
  if (author) return (`${author.firstName?.[0] ?? ""}${author.lastName?.[0] ?? ""}`.toUpperCase() || "??");
  return "??";
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

  const [activeType, setActiveType] = useState<ListTradehubFeedType | "all">("all");
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [newType, setNewType] = useState<ListTradehubFeedType>("discussion");

  const feedParams = {
    ...(activeType !== "all" ? { type: activeType } : {}),
  };

  const {
    data: feedData,
    isLoading,
    refetch,
    isRefetching,
    error,
    isError,
  } = useListTradehubFeed(feedParams);

  const posts = feedData?.posts ?? [];

  const react = useReactToTradehubPost({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListTradehubFeedQueryKey() });
      },
    },
  });

  const createPost = useCreateTradehubPost({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListTradehubFeedQueryKey() });
        setShowCreate(false);
        setNewTitle("");
        setNewContent("");
        setNewType("discussion");
      },
      onError: (err: any) => {
        const msg = err?.message || "Please try again.";
        Alert.alert("Failed to post", msg);
      },
    },
  });

  function handlePost() {
    if (!newTitle.trim() || !newContent.trim()) {
      Alert.alert("Missing fields", "Title and body are required.");
      return;
    }
    createPost.mutate({
      data: { title: newTitle.trim(), content: newContent.trim(), type: newType },
    });
  }

  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const types: (ListTradehubFeedType | "all")[] = ["all", "discussion", "job", "showcase"];

  function renderPost({ item }: { item: TradehubPost }) {
    const typeColor = TYPE_COLORS[item.type] ?? colors.primary;
    const typeLabel = TYPE_LABELS[item.type] ?? item.type;
    const typeIcon = (TYPE_ICONS[item.type] ?? "file-text") as any;
    const name = item.profile?.displayName ?? authorName(item.author);
    return (
      <TouchableOpacity
        style={[styles.postCard, { backgroundColor: colors.card, borderColor: colors.border }]}
        onPress={() => router.push(`/tradehub-post/${item.id}` as any)}
        activeOpacity={0.9}
      >
        {/* Post anatomy: avatar, name, trade/role badge, timestamp */}
        <View style={styles.postHeader}>
          <View style={[styles.avatar, { backgroundColor: colors.primary + "22" }]}>
            <Text style={[styles.avatarText, { color: colors.primary }]}>{initialsFor(item.profile, item.author)}</Text>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Text style={[styles.authorName, { color: colors.foreground }]} numberOfLines={1}>{name}</Text>
              {item.profile?.isVerified && <Feather name="check-circle" size={12} color="#3B82F6" />}
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 }}>
              {item.profile?.trade && (
                <View style={[styles.tradeBadge, { backgroundColor: colors.primary + "18" }]}>
                  <Text style={[styles.tradeBadgeText, { color: colors.primary }]}>{item.profile.trade}</Text>
                </View>
              )}
              <Text style={[styles.timeText, { color: colors.mutedForeground }]}>{timeAgo(item.createdAt)}</Text>
            </View>
          </View>
          <View style={[styles.typeBadge, { backgroundColor: typeColor + "18" }]}>
            <Feather name={typeIcon} size={11} color={typeColor} />
            <Text style={[styles.typeText, { color: typeColor }]}>{typeLabel}</Text>
          </View>
        </View>

        <Text style={[styles.postTitle, { color: colors.foreground }]} numberOfLines={2}>
          {item.title}
        </Text>
        <Text style={[styles.postBody, { color: colors.mutedForeground }]} numberOfLines={3}>
          {item.content}
        </Text>

        {/* Media block: edge-to-edge, full visual priority on mobile */}
        {item.media && item.media.length > 0 && (
          <View style={styles.mediaBlock}>
            <SignedImage objectPath={item.media[0].url} style={styles.mediaImage} resizeMode="cover" />
          </View>
        )}

        {/* Interaction bar */}
        <View style={styles.postFooter}>
          <Pressable
            style={styles.actionBtn}
            onPress={() => react.mutate({ id: item.id })}
            hitSlop={8}
          >
            <Feather
              name="thumbs-up"
              size={14}
              color={item.hasReacted ? ORANGE : colors.mutedForeground}
            />
            <Text style={[styles.actionCount, { color: item.hasReacted ? ORANGE : colors.mutedForeground }]}>
              {item.reactionCount > 0 ? item.reactionCount : "Like"}
            </Text>
          </Pressable>
          <Pressable
            style={styles.actionBtn}
            onPress={() => router.push(`/tradehub-post/${item.id}` as any)}
            hitSlop={8}
          >
            <Feather name="message-square" size={14} color={colors.mutedForeground} />
            <Text style={[styles.actionCount, { color: colors.mutedForeground }]}>{item.commentCount > 0 ? item.commentCount : "Comment"}</Text>
          </Pressable>
          <Pressable
            style={styles.actionBtn}
            onPress={() => Share.share({ message: `${item.title} — TradeHub`, url: `https://tradehub/posts/${item.id}` }).catch(() => {})}
            hitSlop={8}
          >
            <Feather name="share-2" size={14} color={colors.mutedForeground} />
            <Text style={[styles.actionCount, { color: colors.mutedForeground }]}>Share</Text>
          </Pressable>
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topInset + 12, backgroundColor: colors.sidebar }]}>
        <View>
          <Text style={styles.headerTitle}>TradeHub</Text>
          <Text style={styles.headerSub}>Canadian Trades Community</Text>
        </View>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <TouchableOpacity
            style={[styles.iconBtn, { backgroundColor: "rgba(255,255,255,0.12)" }]}
            onPress={() => router.push("/tradehub-jobs" as any)}
            hitSlop={8}
          >
            <Feather name="briefcase" size={18} color="#FFFFFF" />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.iconBtn, { backgroundColor: "rgba(255,255,255,0.12)" }]}
            onPress={() => router.push("/tradehub-messages" as any)}
            hitSlop={8}
          >
            <Feather name="message-circle" size={18} color="#FFFFFF" />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.newBtn, { backgroundColor: colors.primary }]}
            onPress={() => setShowCreate(true)}
            hitSlop={8}
          >
            <Feather name="plus" size={18} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
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
          removeClippedSubviews
          maxToRenderPerBatch={10}
          windowSize={10}
          initialNumToRender={10}
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
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Type</Text>
              <View style={styles.typeRow}>
                {(["discussion", "job", "showcase"] as ListTradehubFeedType[]).map((t) => (
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
  iconBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
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
  postCard: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 8, overflow: "hidden" },
  postHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 13, fontFamily: "Inter_700Bold" },
  authorName: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  tradeBadge: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6 },
  tradeBadgeText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  postTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  typeBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  typeText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  timeText: { fontSize: 11, fontFamily: "Inter_400Regular" },
  postTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold", lineHeight: 21 },
  postBody: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19 },
  mediaBlock: { marginHorizontal: -14 },
  mediaImage: { width: "100%", aspectRatio: 16 / 9, borderRadius: 12 },
  postFooter: { flexDirection: "row", alignItems: "center", gap: 18, marginTop: 4 },
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
