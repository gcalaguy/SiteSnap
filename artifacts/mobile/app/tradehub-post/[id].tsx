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
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { formatDistanceToNow } from "date-fns";
import {
  useGetTradehubPost,
  useReactToTradehubPost,
  useApplyToTradehubJob,
  useDeleteTradehubPost,
  useGetMe,
  customFetch,
  TradehubPostDetail,
  TradehubComment,
} from "@workspace/api-client-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type PostType = "discussion" | "job" | "showcase";

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

function authorName(author: TradehubPostDetail["author"], profile: TradehubPostDetail["profile"]): string {
  if (profile?.displayName) return profile.displayName;
  if (!author) return "Unknown";
  return `${author.firstName ?? ""} ${author.lastName ?? ""}`.trim() || "Unknown";
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
  const postId = Number(id);

  const { data: me } = useGetMe();
  const meId = (me as any)?.id as number | undefined;

  const [comment, setComment] = useState("");
  const [applyMsg, setApplyMsg] = useState("");
  const [showApply, setShowApply] = useState(false);
  const inputRef = useRef<TextInput>(null);

  const { data: post, isLoading, error, isError, refetch } = useGetTradehubPost(postId);

  const reactMutation = useReactToTradehubPost({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ["tradehubPost", postId] });
        qc.invalidateQueries({ queryKey: ["tradehubFeed"] });
      },
    },
  });

  const commentMutation = useMutation({
    mutationFn: (content: string) =>
      customFetch(`/api/tradehub/posts/${postId}/comments`, {
        method: "POST",
        body: JSON.stringify({ content }),
      }),
    onSuccess: () => {
      setComment("");
      qc.invalidateQueries({ queryKey: ["tradehubPost", postId] });
      qc.invalidateQueries({ queryKey: ["tradehubFeed"] });
    },
    onError: () => Alert.alert("Error", "Failed to post comment."),
  });

  const applyMutation = useApplyToTradehubJob({
    mutation: {
      onSuccess: () => {
        setShowApply(false);
        setApplyMsg("");
        qc.invalidateQueries({ queryKey: ["tradehubPost", postId] });
        Alert.alert("Applied!", "Your application has been sent.");
      },
      onError: (err: any) => Alert.alert("Error", err?.message ?? "Could not apply."),
    },
  });

  const deleteMutation = useDeleteTradehubPost({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ["tradehubFeed"] });
        router.back();
      },
      onError: () => Alert.alert("Error", "Failed to delete post."),
    },
  });

  const handleSendComment = () => {
    const trimmed = comment.trim();
    if (!trimmed || commentMutation.isPending) return;
    commentMutation.mutate(trimmed);
  };

  const handleDelete = () => {
    Alert.alert("Delete Post", "Are you sure you want to delete this post?", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => deleteMutation.mutate({ id: postId }) },
    ]);
  };

  const isOwner = !!meId && post?.userId === meId;
  const myApplication = (post as any)?.applications?.find((a: any) => a.applicantId === meId);
  const typeColor = post ? (TYPE_COLOR[post.type as PostType] ?? colors.primary) : colors.primary;

  const comments: TradehubComment[] = (post as any)?.comments ?? [];

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
            data={comments}
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
                        {post.province ? ` \u00b7 ${post.province}` : ""}
                        {post.trade ? ` \u00b7 ${post.trade}` : ""}
                      </Text>
                    </View>
                    <View style={[styles.typeBadge, { backgroundColor: typeColor + "18" }]}>
                      <Text style={[styles.typeText, { color: typeColor }]}>
                        {TYPE_LABEL[post.type as PostType] ?? post.type}
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
                      onPress={() => reactMutation.mutate({ id: postId })}
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
                {comments.length > 0 && (
                  <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
                    Comments ({comments.length})
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
              style={[
                styles.input,
                {
                  backgroundColor: colors.background,
                  borderColor: colors.border,
                  color: colors.foreground,
                },
              ]}
              placeholder="Write a comment…"
              placeholderTextColor={colors.mutedForeground}
              value={comment}
              onChangeText={setComment}
              multiline
              returnKeyType="send"
              onSubmitEditing={handleSendComment}
              blurOnSubmit={false}
            />
            <TouchableOpacity
              style={[styles.sendBtn, { backgroundColor: colors.primary }]}
              onPress={handleSendComment}
              disabled={commentMutation.isPending || !comment.trim()}
            >
              {commentMutation.isPending ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Feather name="send" size={18} color="#FFFFFF" />
              )}
            </TouchableOpacity>
          </View>
        </>
      )}

      {/* Apply modal */}
      <Modal visible={showApply} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowApply(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={[styles.modal, { backgroundColor: colors.background }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <TouchableOpacity onPress={() => setShowApply(false)} hitSlop={10}>
                <Feather name="x" size={22} color={colors.foreground} />
              </TouchableOpacity>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>Apply</Text>
              <TouchableOpacity
                onPress={() => applyMutation.mutate({ id: postId, data: { message: applyMsg.trim() || undefined } })}
                disabled={applyMutation.isPending}
              >
                {applyMutation.isPending ? <ActivityIndicator color={colors.primary} size="small" /> : <Text style={[styles.postBtn, { color: colors.primary }]}>Send</Text>}
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalContent}>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Cover message (optional)</Text>
              <TextInput
                style={[styles.textInput, styles.bodyInput, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
                placeholder="Introduce yourself and why you're a good fit…"
                placeholderTextColor={colors.mutedForeground}
                value={applyMsg}
                onChangeText={setApplyMsg}
                multiline
                textAlignVertical="top"
              />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  iconBtn: { width: 38, height: 38, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 18, fontFamily: "Inter_700Bold", color: "#FFFFFF" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  emptyText: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  emptyHint: { fontSize: 13, fontFamily: "Inter_400Regular" },
  retryBtn: { marginTop: 16, paddingHorizontal: 24, paddingVertical: 10, borderRadius: 20 },
  card: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 10 },
  authorRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 14, fontFamily: "Inter_700Bold" },
  authorName: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  metaText: { fontSize: 12, fontFamily: "Inter_400Regular" },
  typeBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  typeText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  postTitle: { fontSize: 17, fontFamily: "Inter_700Bold", lineHeight: 24 },
  postBody: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 21 },
  tagsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  tag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: 1 },
  tagText: { fontSize: 11, fontFamily: "Inter_500Medium" },
  actionsRow: { flexDirection: "row", alignItems: "center", gap: 16, paddingTop: 10, borderTopWidth: 1 },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: 5 },
  actionText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  applyBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  applyBtnText: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: "#FFFFFF" },
  appliedBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1 },
  sectionLabel: { fontSize: 14, fontFamily: "Inter_600SemiBold", marginTop: 4 },
  commentCard: { borderRadius: 12, borderWidth: 1, padding: 12, gap: 8 },
  commentHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  commentAvatar: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  commentAvatarText: { fontSize: 11, fontFamily: "Inter_700Bold" },
  commentAuthor: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  commentTime: { fontSize: 11, fontFamily: "Inter_400Regular" },
  commentBody: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20 },
  emptyComments: { alignItems: "center", justifyContent: "center", paddingVertical: 40, gap: 8 },
  inputBar: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, paddingVertical: 8, borderTopWidth: 1 },
  input: { flex: 1, borderWidth: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, fontSize: 14, fontFamily: "Inter_400Regular", maxHeight: 100 },
  sendBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
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
