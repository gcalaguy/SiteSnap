import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { customFetch, useGetMe } from "@workspace/api-client-react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { formatDistanceToNow } from "date-fns";

// ── Types ─────────────────────────────────────────────────────────────────────

type PostType = "discussion" | "job" | "showcase";

interface PostAuthor {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
}

interface Comment {
  id: number;
  postId: number;
  userId: number;
  content: string;
  createdAt: string;
  author: PostAuthor | null;
  profile: { displayName?: string } | null;
}

interface TradePost {
  id: number;
  userId: number;
  type: PostType;
  title: string;
  content: string;
  trade: string | null;
  location: string | null;
  province: string | null;
  budget: string | null;
  jobType: string | null;
  author: PostAuthor | null;
  profile: { displayName?: string } | null;
  reactionCount: number;
  commentCount: number;
  hasReacted: boolean;
  createdAt: string;
  comments: Comment[];
  applications: any[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const TYPE_COLOR: Record<PostType, string> = {
  discussion: "#3B82F6",
  job: "#22C55E",
  showcase: "#A855F7",
};

const TYPE_LABEL: Record<PostType, string> = {
  discussion: "Discussion",
  job: "Job",
  showcase: "Showcase",
};

function authorName(author: PostAuthor | null, profile: { displayName?: string } | null): string {
  if (profile?.displayName) return profile.displayName;
  if (!author) return "Unknown";
  return `${author.firstName ?? ""} ${author.lastName ?? ""}`.trim() || author.email;
}

function timeAgo(dateStr: string): string {
  try {
    return formatDistanceToNow(new Date(dateStr), { addSuffix: true });
  } catch {
    return "";
  }
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function TradeHubPostScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: me } = useGetMe();
  const meId = (me as any)?.id as number | undefined;

  const [comment, setComment] = useState("");
  const [applyMsg, setApplyMsg] = useState("");
  const [showApply, setShowApply] = useState(false);
  const inputRef = useRef<TextInput>(null);

  const { data: post, isLoading, error, isError, refetch } = useQuery<TradePost>({
    queryKey: ["tradehub-post", id],
    queryFn: () => customFetch<TradePost>(`/api/tradehub/posts/${id}`),
    enabled: !!id,
  });

  const reactMutation = useMutation({
    mutationFn: () => customFetch(`/api/tradehub/posts/${id}/react`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tradehub-post", id] }),
  });

  const commentMutation = useMutation({
    mutationFn: (content: string) =>
      customFetch(`/api/tradehub/posts/${id}/comments`, {
        method: "POST",
        body: JSON.stringify({ content }),
      }),
    onSuccess: () => {
      setComment("");
      qc.invalidateQueries({ queryKey: ["tradehub-post", id] });
      qc.invalidateQueries({ queryKey: ["tradehub-posts"] });
    },
    onError: () => Alert.alert("Error", "Failed to post comment."),
  });

  const applyMutation = useMutation({
    mutationFn: () =>
      customFetch(`/api/tradehub/jobs/${id}/apply`, {
        method: "POST",
        body: JSON.stringify({ message: applyMsg }),
      }),
    onSuccess: () => {
      setShowApply(false);
      setApplyMsg("");
      qc.invalidateQueries({ queryKey: ["tradehub-post", id] });
      Alert.alert("Applied!", "Your application has been sent.");
    },
    onError: (err: any) => Alert.alert("Error", err?.message ?? "Could not apply."),
  });

  const deleteMutation = useMutation({
    mutationFn: () => customFetch(`/api/tradehub/posts/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tradehub-posts"] });
      router.back();
    },
    onError: () => Alert.alert("Error", "Failed to delete post."),
  });

  const handleSendComment = () => {
    const trimmed = comment.trim();
    if (!trimmed || commentMutation.isPending) return;
    commentMutation.mutate(trimmed);
  };

  const handleDelete = () => {
    Alert.alert("Delete Post", "Are you sure you want to delete this post?", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => deleteMutation.mutate() },
    ]);
  };

  const isOwner = !!meId && post?.userId === meId;
  const myApplication = post?.applications?.find((a: any) => a.applicantId === meId);
  const typeColor = post ? (TYPE_COLOR[post.type] ?? colors.primary) : colors.primary;

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={0}
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12, backgroundColor: colors.sidebar }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} style={styles.iconBtn}>
          <Feather name="arrow-left" size={22} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>TradeHub</Text>
        {isOwner ? (
          <TouchableOpacity onPress={handleDelete} hitSlop={12} style={styles.iconBtn}>
            <Feather name="trash-2" size={18} color="#EF4444" />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 38 }} />
        )}
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : isError ? (
        <View style={styles.center}>
          <Feather name="alert-triangle" size={36} color={colors.mutedForeground} />
          <Text style={[styles.emptyText, { color: colors.mutedForeground, marginTop: 12 }]}>
            Could not load post
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
      ) : !post ? (
        <View style={styles.center}>
          <Text style={{ color: colors.mutedForeground }}>Post not found.</Text>
        </View>
      ) : (
        <>
          <FlatList
            data={post.comments}
            keyExtractor={(c) => String(c.id)}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: 16 }}
            ListHeaderComponent={
              <View style={{ padding: 16, gap: 12 }}>
                {/* Post card */}
                <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  {/* Author row */}
                  <View style={styles.authorRow}>
                    <View style={[styles.avatar, { backgroundColor: typeColor + "22" }]}>
                      <Text style={[styles.avatarText, { color: typeColor }]}>
                        {(authorName(post.author, post.profile)[0] ?? "?").toUpperCase()}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.authorName, { color: colors.foreground }]}>
                        {authorName(post.author, post.profile)}
                      </Text>
                      <Text style={[styles.metaText, { color: colors.mutedForeground }]}>
                        {timeAgo(post.createdAt)}
                        {post.province ? ` · ${post.province}` : ""}
                        {post.trade ? ` · ${post.trade}` : ""}
                      </Text>
                    </View>
                    <View style={[styles.typeBadge, { backgroundColor: typeColor + "18" }]}>
                      <Text style={[styles.typeText, { color: typeColor }]}>
                        {TYPE_LABEL[post.type] ?? post.type}
                      </Text>
                    </View>
                  </View>

                  {/* Title + content */}
                  <Text style={[styles.postTitle, { color: colors.foreground }]}>{post.title}</Text>
                  <Text style={[styles.postBody, { color: colors.foreground }]}>{post.content}</Text>

                  {/* Job metadata */}
                  {post.type === "job" && (post.budget || post.jobType) && (
                    <View style={styles.tagsRow}>
                      {post.jobType && (
                        <View style={[styles.tag, { borderColor: colors.border }]}>
                          <Text style={[styles.tagText, { color: colors.mutedForeground }]}>{post.jobType}</Text>
                        </View>
                      )}
                      {post.budget && (
                        <View style={[styles.tag, { borderColor: "#22C55E44", backgroundColor: "#22C55E0A" }]}>
                          <Text style={[styles.tagText, { color: "#22C55E" }]}>{post.budget}</Text>
                        </View>
                      )}
                    </View>
                  )}

                  {/* Actions bar */}
                  <View style={[styles.actionsRow, { borderTopColor: colors.border }]}>
                    <TouchableOpacity
                      style={styles.actionBtn}
                      onPress={() => reactMutation.mutate()}
                      disabled={reactMutation.isPending}
                    >
                      <Feather
                        name="thumbs-up"
                        size={16}
                        color={post.hasReacted ? colors.primary : colors.mutedForeground}
                      />
                      <Text
                        style={[
                          styles.actionText,
                          { color: post.hasReacted ? colors.primary : colors.mutedForeground },
                        ]}
                      >
                        {post.reactionCount > 0 ? post.reactionCount : ""} Like{post.reactionCount !== 1 ? "s" : ""}
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.actionBtn} onPress={() => inputRef.current?.focus()}>
                      <Feather name="message-circle" size={16} color={colors.mutedForeground} />
                      <Text style={[styles.actionText, { color: colors.mutedForeground }]}>
                        {post.commentCount} Comment{post.commentCount !== 1 ? "s" : ""}
                      </Text>
                    </TouchableOpacity>

                    {post.type === "job" && !isOwner && (
                      <View style={{ marginLeft: "auto" }}>
                        {myApplication ? (
                          <View style={[styles.appliedBadge, { borderColor: "#22C55E66", backgroundColor: "#22C55E0A" }]}>
                            <Feather name="check-circle" size={13} color="#22C55E" />
                            <Text style={{ fontSize: 12, color: "#22C55E", fontFamily: "Inter_500Medium" }}>
                              Applied
                            </Text>
                          </View>
                        ) : (
                          <TouchableOpacity
                            style={[styles.applyBtn, { backgroundColor: colors.primary }]}
                            onPress={() => setShowApply(true)}
                          >
                            <Feather name="briefcase" size={13} color="#FFF" />
                            <Text style={styles.applyBtnText}>Apply Now</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    )}
                  </View>
                </View>

                {/* Comments header */}
                {post.comments.length > 0 && (
                  <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
                    Comments ({post.comments.length})
                  </Text>
                )}
              </View>
            }
            renderItem={({ item }) => (
              <View style={[styles.commentCard, { backgroundColor: colors.card, borderColor: colors.border, marginHorizontal: 16, marginBottom: 8 }]}>
                <View style={styles.commentHeader}>
                  <View style={[styles.commentAvatar, { backgroundColor: colors.muted }]}>
                    <Text style={[styles.commentAvatarText, { color: colors.mutedForeground }]}>
                      {(authorName(item.author, item.profile)[0] ?? "?").toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.commentAuthor, { color: colors.foreground }]}>
                      {authorName(item.author, item.profile)}
                    </Text>
                    <Text style={[styles.commentTime, { color: colors.mutedForeground }]}>
                      {timeAgo(item.createdAt)}
                    </Text>
                  </View>
                </View>
                <Text style={[styles.commentBody, { color: colors.foreground }]}>{item.content}</Text>
              </View>
            )}
            ListEmptyComponent={
              <View style={styles.emptyComments}>
                <Feather name="message-circle" size={28} color={colors.mutedForeground} />
                <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                  No comments yet — be the first!
                </Text>
              </View>
            }
          />

          {/* Comment input */}
          <View
            style={[
              styles.inputBar,
              {
                backgroundColor: colors.card,
                borderTopColor: colors.border,
                paddingBottom: insets.bottom + 8,
              },
            ]}
          >
            <TextInput
              ref={inputRef}
              style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
              placeholder="Add a comment…"
              placeholderTextColor={colors.mutedForeground}
              value={comment}
              onChangeText={setComment}
              multiline
              maxLength={1000}
              returnKeyType="send"
              onSubmitEditing={handleSendComment}
            />
            <Pressable
              onPress={handleSendComment}
              disabled={!comment.trim() || commentMutation.isPending}
              style={({ pressed }) => [
                styles.sendBtn,
                { backgroundColor: colors.primary, opacity: !comment.trim() || commentMutation.isPending ? 0.4 : pressed ? 0.8 : 1 },
              ]}
            >
              {commentMutation.isPending ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <Feather name="send" size={16} color="#FFF" />
              )}
            </Pressable>
          </View>
        </>
      )}

      {/* Apply modal */}
      <Modal visible={showApply} transparent animationType="slide" onRequestClose={() => setShowApply(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowApply(false)} />
        <View style={[styles.modalSheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.modalHandle} />
          <Text style={[styles.modalTitle, { color: colors.foreground }]}>Apply for this Job</Text>
          <Text style={[styles.modalSub, { color: colors.mutedForeground }]}>
            Add a short message to introduce yourself (optional).
          </Text>
          <TextInput
            style={[styles.modalInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
            placeholder="Hi, I'm interested in this position…"
            placeholderTextColor={colors.mutedForeground}
            value={applyMsg}
            onChangeText={setApplyMsg}
            multiline
            maxLength={500}
            numberOfLines={4}
          />
          <TouchableOpacity
            style={[styles.modalSubmitBtn, { backgroundColor: colors.primary, opacity: applyMutation.isPending ? 0.6 : 1 }]}
            onPress={() => applyMutation.mutate()}
            disabled={applyMutation.isPending}
          >
            {applyMutation.isPending ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={styles.modalSubmitText}>Send Application</Text>
            )}
          </TouchableOpacity>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  headerTitle: { fontSize: 18, fontFamily: "Inter_700Bold", color: "#FFFFFF" },
  iconBtn: { width: 38, height: 38, alignItems: "center", justifyContent: "center" },

  // Post card
  card: { borderWidth: 1, borderRadius: 16, padding: 16, gap: 10 },
  authorRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 16, fontFamily: "Inter_700Bold" },
  authorName: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  metaText: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
  typeBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  typeText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  postTitle: { fontSize: 19, fontFamily: "Inter_700Bold", lineHeight: 26 },
  postBody: { fontSize: 15, fontFamily: "Inter_400Regular", lineHeight: 22 },
  tagsRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  tag: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1 },
  tagText: { fontSize: 12, fontFamily: "Inter_500Medium" },

  // Actions
  actionsRow: { flexDirection: "row", alignItems: "center", gap: 16, paddingTop: 12, borderTopWidth: 1, flexWrap: "wrap" },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: 6 },
  actionText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  applyBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20 },
  applyBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#FFF" },
  appliedBadge: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1 },

  // Section label
  sectionLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", letterSpacing: 0.5, textTransform: "uppercase" },

  // Comments
  commentCard: { borderWidth: 1, borderRadius: 14, padding: 12, gap: 8 },
  commentHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  commentAvatar: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  commentAvatarText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  commentAuthor: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  commentTime: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 1 },
  commentBody: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20 },
  emptyComments: { alignItems: "center", paddingVertical: 32, gap: 10, paddingHorizontal: 32 },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },

  // Input bar
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    gap: 8,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 10,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    maxHeight: 100,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },

  // Apply modal
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)" },
  modalSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, gap: 12 },
  modalHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: "#CCC", alignSelf: "center", marginBottom: 8 },
  modalTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  modalSub: { fontSize: 14, fontFamily: "Inter_400Regular" },
  modalInput: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    minHeight: 90,
    textAlignVertical: "top",
  },
  modalSubmitBtn: { borderRadius: 14, paddingVertical: 14, alignItems: "center", justifyContent: "center" },
  modalSubmitText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#FFF" },
  emptyHint: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", marginTop: 4 },
  retryBtn: {
    marginTop: 16,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 20,
  },
});
