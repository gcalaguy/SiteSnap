import React from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";

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
  createdAt: string;
}

function authorName(author: PostAuthor | null): string {
  if (!author) return "Unknown";
  return `${author.firstName ?? ""} ${author.lastName ?? ""}`.trim() || author.email;
}

export default function TradeHubPostScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: post, isLoading } = useQuery<TradePost>({
    queryKey: ["tradehub-post", id],
    queryFn: () => customFetch<TradePost>(`/api/tradehub/posts/${id}`),
    enabled: !!id,
  });

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 12, backgroundColor: colors.sidebar }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>TradeHub</Text>
        <View style={{ width: 38 }} />
      </View>

      {isLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : post ? (
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.title, { color: colors.foreground }]}>{post.title}</Text>
            <Text style={[styles.meta, { color: colors.mutedForeground }]}>
              {authorName(post.author)} • {post.type}
            </Text>
            <Text style={[styles.body, { color: colors.foreground }]}>{post.content}</Text>
          </View>
        </ScrollView>
      ) : (
        <View style={styles.loading}>
          <Text style={{ color: colors.mutedForeground }}>Post not found.</Text>
        </View>
      )}
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
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: { padding: 16 },
  card: { borderWidth: 1, borderRadius: 16, padding: 16, gap: 10 },
  title: { fontSize: 20, fontFamily: "Inter_700Bold" },
  meta: { fontSize: 12, fontFamily: "Inter_400Regular" },
  body: { fontSize: 15, fontFamily: "Inter_400Regular", lineHeight: 22 },
});