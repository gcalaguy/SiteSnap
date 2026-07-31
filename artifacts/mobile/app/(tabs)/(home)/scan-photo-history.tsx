import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { customFetch, useGetMe } from "@workspace/api-client-react";

import { useColors } from "@/hooks/useColors";
import { spacing, radius, typography } from "@/constants/theme";
import { EmptyState } from "@/components/ui";
import { PhotoThumbnail, PhotoLightbox } from "@/components/PhotoThumbnail";
import { getHiddenScanIds, hideScanId } from "@/utils/scanPhotoHistoryHidden";

interface ScanRecord {
  id: number;
  siteAddress: string | null;
  complianceScore: number | null;
  riskLevel: "low" | "medium" | "high" | "critical" | null;
  createdAt: string;
  photoObjectPaths: string[];
}

const RISK_COLOR: Record<string, string> = {
  critical: "#DC2626",
  high: "#D97706",
  medium: "#CA8A04",
  low: "#16A34A",
};

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "";
  return (
    d.toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" }) +
    " · " +
    d.toLocaleTimeString("en-CA", { hour: "numeric", minute: "2-digit" })
  );
}

export default function ScanPhotoHistoryScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { data: me } = useGetMe();

  const [lightboxPath, setLightboxPath] = useState<string | null>(null);

  const {
    data: scans = [],
    isLoading,
    isFetching,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["safety-scans", "photo-history"],
    queryFn: () => customFetch<{ data: ScanRecord[]; total: number }>("/api/safety/scans").then((r) => r.data),
  });

  const hiddenIdsQueryKey = ["hidden-safety-scans", me?.id];
  const { data: hiddenIds = [] } = useQuery({
    queryKey: hiddenIdsQueryKey,
    queryFn: () => getHiddenScanIds(me!.id),
    enabled: me?.id != null,
  });

  const visibleScans = useMemo(() => {
    const hidden = new Set(hiddenIds);
    return [...scans]
      .filter((s) => !hidden.has(s.id))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [scans, hiddenIds]);

  const handleDelete = useCallback(
    (scan: ScanRecord) => {
      if (me?.id == null) return;
      Alert.alert(
        "Remove from this device?",
        "This scan will be removed from your Photo History on this device only. It will still be visible on the Web Dashboard.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Remove",
            style: "destructive",
            onPress: async () => {
              await hideScanId(me.id, scan.id);
              queryClient.invalidateQueries({ queryKey: hiddenIdsQueryKey });
            },
          },
        ],
      );
    },
    [me?.id, queryClient],
  );

  const renderItem = useCallback(
    ({ item }: { item: ScanRecord }) => {
      const riskColor = RISK_COLOR[item.riskLevel ?? "low"];
      return (
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() =>
              router.push({ pathname: "/(tabs)/(home)/safety-scan-results", params: { id: String(item.id) } })
            }
            style={styles.cardHeader}
          >
            <View style={{ flex: 1 }}>
              <Text style={[typography.bodyMedium, { color: colors.foreground }]} numberOfLines={1}>
                {item.siteAddress ?? "Unknown location"}
              </Text>
              <Text style={[typography.caption, { color: colors.mutedForeground, marginTop: 2 }]}>
                {formatDate(item.createdAt)}
              </Text>
            </View>
            <View style={[styles.riskPill, { backgroundColor: `${riskColor}1A` }]}>
              <Text style={[styles.riskPillText, { color: riskColor }]}>
                {(item.riskLevel ?? "low").toUpperCase()}
              </Text>
            </View>
            <TouchableOpacity hitSlop={10} onPress={() => handleDelete(item)} style={styles.deleteBtn}>
              <Feather name="trash-2" size={16} color={colors.mutedForeground} />
            </TouchableOpacity>
          </TouchableOpacity>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photoRow}>
            {item.photoObjectPaths.map((path, i) => (
              <PhotoThumbnail
                key={`${item.id}-${i}`}
                objectPath={path}
                size={64}
                onPress={() => setLightboxPath(path)}
              />
            ))}
          </ScrollView>
        </View>
      );
    },
    [colors, router, handleDelete],
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.header,
          { paddingTop: Platform.OS === "web" ? 67 : insets.top + 12, backgroundColor: colors.sidebar },
        ]}
      >
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color="#FFFFFF" />
        </TouchableOpacity>
        <View>
          <Text style={styles.headerTitle}>Scan Photo History</Text>
          <Text style={styles.headerSub}>
            {visibleScans.length} {visibleScans.length === 1 ? "scan" : "scans"}
          </Text>
        </View>
        <View style={{ width: 38 }} />
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : isError ? (
        <View style={styles.center}>
          <EmptyState icon="alert-triangle" title="Could not load scans" subtitle="Pull down to try again" />
        </View>
      ) : (
        <FlatList
          data={visibleScans}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          removeClippedSubviews
          initialNumToRender={10}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 40 }]}
          refreshControl={
            <RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor={colors.primary} />
          }
          ListEmptyComponent={
            <EmptyState
              icon="shield"
              title="No safety scan photos yet"
              subtitle="Photos from your AI Safety Scans will show up here"
            />
          }
        />
      )}

      <PhotoLightbox
        objectPath={lightboxPath}
        visible={!!lightboxPath}
        onClose={() => setLightboxPath(null)}
      />
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
  headerTitle: { fontSize: 18, fontFamily: "NunitoSans_700Bold", color: "#FFFFFF" },
  headerSub: { fontSize: 12, fontFamily: "NunitoSans_400Regular", color: "rgba(255,255,255,0.6)", marginTop: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  list: { padding: spacing.md, gap: spacing.sm },
  card: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  cardHeader: { flexDirection: "row", alignItems: "center" },
  riskPill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 16, marginRight: spacing.sm },
  riskPillText: { fontSize: 10, fontFamily: "NunitoSans_700Bold" },
  deleteBtn: { padding: spacing.xs },
  photoRow: { marginTop: spacing.sm },
});
