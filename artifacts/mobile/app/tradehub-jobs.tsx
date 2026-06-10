import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
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
  useListTradehubJobs,
  useApplyToTradehubJob,
  getListTradehubJobsQueryKey,
  TradehubPost,
} from "@workspace/api-client-react";

const TRADES = ["Electrician", "Plumber", "HVAC", "General Contractor", "Carpenter", "Welder", "Roofer", "Painter", "Mason", "Ironworker", "Concrete", "Landscaping", "Other"];
const PROVINCES = ["AB", "BC", "MB", "NB", "NL", "NS", "NT", "NU", "ON", "PE", "QC", "SK", "YT"];

function timeAgo(dateStr: string) {
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function TradehubJobsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [tradeFilter, setTradeFilter] = useState("all");
  const [provinceFilter, setProvinceFilter] = useState("all");
  const [applyPost, setApplyPost] = useState<TradehubPost | null>(null);
  const [applyMsg, setApplyMsg] = useState("");

  const jobParams = {
    ...(tradeFilter !== "all" ? { trade: tradeFilter } : {}),
    ...(provinceFilter !== "all" ? { province: provinceFilter } : {}),
  };

  const {
    data: feedData,
    isLoading,
    refetch,
    isRefetching,
    error,
    isError,
  } = useListTradehubJobs(jobParams);

  const posts = feedData?.posts ?? [];

  const applyMutation = useApplyToTradehubJob({
    mutation: {
      onSuccess: () => {
        setApplyPost(null);
        setApplyMsg("");
        queryClient.invalidateQueries({ queryKey: getListTradehubJobsQueryKey() });
        Alert.alert("Applied!", "Your application has been sent.");
      },
      onError: (err: any) => Alert.alert("Error", err?.message ?? "Could not apply."),
    },
  });

  const topInset = Platform.OS === "web" ? 67 : insets.top;

  function renderJob({ item }: { item: TradehubPost }) {
    return (
      <TouchableOpacity
        style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
        onPress={() => router.push(`/tradehub-post/${item.id}` as any)}
        activeOpacity={0.82}
      >
        <View style={styles.cardTop}>
          <View style={[styles.badge, { backgroundColor: "#D4AF3718" }]}>
            <Feather name="briefcase" size={11} color="#D4AF37" />
            <Text style={[styles.badgeText, { color: "#D4AF37" }]}>Job</Text>
          </View>
          <Text style={[styles.time, { color: colors.mutedForeground }]}>{timeAgo(item.createdAt)}</Text>
        </View>

        <Text style={[styles.title, { color: colors.foreground }]} numberOfLines={2}>{item.title}</Text>
        <Text style={[styles.body, { color: colors.mutedForeground }]} numberOfLines={3}>{item.content}</Text>

        <View style={styles.metaRow}>
          {item.trade && (
            <View style={[styles.tag, { borderColor: colors.border }]}>
              <Feather name="tool" size={11} color={colors.mutedForeground} />
              <Text style={[styles.tagText, { color: colors.mutedForeground }]}>{item.trade}</Text>
            </View>
          )}
          {item.province && (
            <View style={[styles.tag, { borderColor: colors.border }]}>
              <Feather name="map-pin" size={11} color={colors.mutedForeground} />
              <Text style={[styles.tagText, { color: colors.mutedForeground }]}>{item.province}</Text>
            </View>
          )}
          {item.budget && (
            <View style={[styles.tag, { borderColor: "#22C55E44", backgroundColor: "#22C55E0A" }]}>
              <Feather name="dollar-sign" size={11} color="#22C55E" />
              <Text style={[styles.tagText, { color: "#22C55E" }]}>{item.budget}</Text>
            </View>
          )}
        </View>

        <TouchableOpacity
          style={[styles.applyBtn, { backgroundColor: colors.primary }]}
          onPress={() => setApplyPost(item)}
        >
          <Feather name="send" size={13} color="#FFFFFF" />
          <Text style={styles.applyText}>Apply Now</Text>
        </TouchableOpacity>
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
          <Text style={styles.headerTitle}>Job Board</Text>
          <Text style={styles.headerSub}>Construction jobs across Canada</Text>
        </View>
        <View style={{ width: 38 }} />
      </View>

      {/* Filters */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={[styles.filterRow, { borderBottomColor: colors.border }]}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 8, paddingVertical: 10 }}
      >
        <TouchableOpacity
          onPress={() => setTradeFilter("all")}
          style={[styles.filterChip, { borderColor: tradeFilter === "all" ? colors.primary : colors.border, backgroundColor: tradeFilter === "all" ? colors.primary + "15" : colors.card }]}
        >
          <Feather name="filter" size={12} color={tradeFilter === "all" ? colors.primary : colors.mutedForeground} />
          <Text style={[styles.filterChipText, { color: tradeFilter === "all" ? colors.primary : colors.mutedForeground }]}>All Trades</Text>
        </TouchableOpacity>
        {TRADES.map((t) => (
          <TouchableOpacity
            key={t}
            onPress={() => setTradeFilter(t)}
            style={[styles.filterChip, { borderColor: tradeFilter === t ? colors.primary : colors.border, backgroundColor: tradeFilter === t ? colors.primary + "15" : colors.card }]}
          >
            <Text style={[styles.filterChipText, { color: tradeFilter === t ? colors.primary : colors.mutedForeground }]}>{t}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 8, paddingVertical: 10 }}
      >
        <TouchableOpacity
          onPress={() => setProvinceFilter("all")}
          style={[styles.filterChip, { borderColor: provinceFilter === "all" ? colors.primary : colors.border, backgroundColor: provinceFilter === "all" ? colors.primary + "15" : colors.card }]}
        >
          <Feather name="map" size={12} color={provinceFilter === "all" ? colors.primary : colors.mutedForeground} />
          <Text style={[styles.filterChipText, { color: provinceFilter === "all" ? colors.primary : colors.mutedForeground }]}>All Provinces</Text>
        </TouchableOpacity>
        {PROVINCES.map((p) => (
          <TouchableOpacity
            key={p}
            onPress={() => setProvinceFilter(p)}
            style={[styles.filterChip, { borderColor: provinceFilter === p ? colors.primary : colors.border, backgroundColor: provinceFilter === p ? colors.primary + "15" : colors.card }]}
          >
            <Text style={[styles.filterChipText, { color: provinceFilter === p ? colors.primary : colors.mutedForeground }]}>{p}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* List */}
      {isLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : isError ? (
        <View style={styles.loading}>
          <Feather name="alert-triangle" size={36} color={colors.mutedForeground} />
          <Text style={[styles.emptyText, { color: colors.mutedForeground, marginTop: 12 }]}>Could not load jobs</Text>
          <Text style={[styles.emptyHint, { color: colors.mutedForeground }]}>{error instanceof Error ? error.message : "Something went wrong"}</Text>
          <TouchableOpacity onPress={() => refetch()} style={[styles.retryBtn, { backgroundColor: colors.primary }]}>
            <Text style={{ color: "#FFFFFF", fontFamily: "Inter_600SemiBold", fontSize: 14 }}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderJob}
          removeClippedSubviews
          maxToRenderPerBatch={10}
          windowSize={10}
          initialNumToRender={10}
          contentContainerStyle={[styles.feedContent, { paddingBottom: insets.bottom + 24 }]}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Feather name="briefcase" size={40} color={colors.border} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No jobs posted yet</Text>
              <Text style={[styles.emptyHint, { color: colors.mutedForeground }]}>Check back later or post a job</Text>
            </View>
          }
        />
      )}

      {/* Apply modal */}
      <Modal visible={!!applyPost} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setApplyPost(null)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={[styles.modal, { backgroundColor: colors.background }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <TouchableOpacity onPress={() => setApplyPost(null)} hitSlop={10}>
                <Feather name="x" size={22} color={colors.foreground} />
              </TouchableOpacity>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>Apply</Text>
              <TouchableOpacity onPress={() => applyPost && applyMutation.mutate({ id: applyPost.id, data: { message: applyMsg.trim() || undefined } })} disabled={applyMutation.isPending}>
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
  card: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 8 },
  cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  badge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  badgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  time: { fontSize: 11, fontFamily: "Inter_400Regular" },
  title: { fontSize: 15, fontFamily: "Inter_600SemiBold", lineHeight: 21 },
  body: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19 },
  metaRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 },
  tag: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: 1 },
  tagText: { fontSize: 11, fontFamily: "Inter_500Medium" },
  applyBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    marginTop: 4,
  },
  applyText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#FFFFFF" },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  retryBtn: { marginTop: 16, paddingHorizontal: 24, paddingVertical: 10, borderRadius: 20 },
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
