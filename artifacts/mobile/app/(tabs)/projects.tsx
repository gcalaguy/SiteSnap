import { useListProjects } from "@workspace/api-client-react";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { Feather } from "@expo/vector-icons";

const STATUS_LABELS: Record<string, string> = {
  active: "Active",
  completed: "Completed",
  on_hold: "On Hold",
};

const STATUS_COLORS: Record<string, string> = {
  active: "#22C55E",
  completed: "#6B7280",
  on_hold: "#F59E0B",
};

function ProjectCard({ project }: { project: any }) {
  const colors = useColors();
  const router = useRouter();

  const statusColor = STATUS_COLORS[project.status] ?? colors.mutedForeground;
  const statusLabel = STATUS_LABELS[project.status] ?? project.status;

  const budget = project.budget != null
    ? project.budget >= 1_000_000
      ? `$${(project.budget / 1_000_000).toFixed(1)}M`
      : `$${(project.budget / 1_000).toFixed(0)}K`
    : null;

  return (
    <Pressable
      style={({ pressed }) => [styles.card, { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.85 : 1 }]}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        router.push(`/project/${project.id}`);
      }}
    >
      {/* Status bar */}
      <View style={[styles.cardAccent, { backgroundColor: statusColor }]} />

      <View style={{ flex: 1, paddingLeft: 16 }}>
        <View style={styles.cardHeader}>
          <Text style={[styles.cardTitle, { color: colors.foreground }]} numberOfLines={2}>
            {project.name}
          </Text>
          <View style={[styles.badge, { backgroundColor: `${statusColor}20` }]}>
            <Text style={[styles.badgeText, { color: statusColor }]}>{statusLabel}</Text>
          </View>
        </View>

        <View style={styles.cardMeta}>
          {!!project.location && (
            <View style={styles.metaRow}>
              <Feather name="map-pin" size={12} color={colors.mutedForeground} />
              <Text style={[styles.metaText, { color: colors.mutedForeground }]} numberOfLines={1}>
                {" "}{project.location}
              </Text>
            </View>
          )}
          {!!budget && (
            <View style={styles.metaRow}>
              <Feather name="dollar-sign" size={12} color={colors.mutedForeground} />
              <Text style={[styles.metaText, { color: colors.mutedForeground }]}>
                {" "}{budget}
              </Text>
            </View>
          )}
          {!!project.startDate && (
            <View style={styles.metaRow}>
              <Feather name="calendar" size={12} color={colors.mutedForeground} />
              <Text style={[styles.metaText, { color: colors.mutedForeground }]}>
                {" "}{new Date(project.startDate).toLocaleDateString("en-CA")}
              </Text>
            </View>
          )}
        </View>
      </View>

      <Feather name="chevron-right" size={18} color={colors.border} style={{ marginLeft: 8 }} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerArea: { paddingHorizontal: 20, paddingBottom: 16 },
  screenTitle: { fontSize: 28, fontFamily: "Inter_700Bold", marginBottom: 14 },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    borderWidth: 1,
    marginBottom: 12,
  },
  searchInput: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular" },
  filterRow: { flexDirection: "row", gap: 8 },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  filterText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  card: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    marginHorizontal: 20,
    marginBottom: 10,
    borderWidth: 1,
    overflow: "hidden",
  },
  cardAccent: { width: 4, alignSelf: "stretch" },
  cardHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 8, paddingTop: 14 },
  cardTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold", flex: 1, marginRight: 8 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  badgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  cardMeta: { gap: 4, paddingBottom: 14 },
  metaRow: { flexDirection: "row", alignItems: "center" },
  metaText: { fontSize: 12, fontFamily: "Inter_400Regular" },
  emptyContainer: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 40 },
  emptyText: { fontSize: 16, fontFamily: "Inter_500Medium", textAlign: "center", marginTop: 12 },
  emptySubtext: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", marginTop: 6 },
  count: { fontSize: 13, fontFamily: "Inter_400Regular", paddingHorizontal: 20, marginBottom: 8 },
});

const ALL_STATUSES = ["all", "active", "on_hold", "completed"];

export default function ProjectsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { data: projects, isLoading, refetch } = useListProjects();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const filtered = (projects ?? []).filter(p => {
    const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase()) || (p.location ?? "").toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || p.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const topInsets = Platform.OS === "web" ? 67 : insets.top;

  return (
    <FlatList
      style={[styles.container, { backgroundColor: colors.background }]}
      data={filtered}
      keyExtractor={item => String(item.id)}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={colors.primary} />}
      contentContainerStyle={{ paddingBottom: Platform.OS === "web" ? 34 : insets.bottom + 90, flexGrow: 1 }}
      ListHeaderComponent={
        <View style={[styles.headerArea, { paddingTop: topInsets + 16 }]}>
          <Text style={[styles.screenTitle, { color: colors.foreground }]}>Projects</Text>
          {/* Search */}
          <View style={[styles.searchBox, { backgroundColor: colors.muted, borderColor: colors.border }]}>
            <Feather name="search" size={16} color={colors.mutedForeground} />
            <TextInput
              style={[styles.searchInput, { color: colors.foreground }]}
              placeholder="Search projects..."
              placeholderTextColor={colors.mutedForeground}
              value={search}
              onChangeText={setSearch}
            />
            {!!search && (
              <Pressable onPress={() => setSearch("")}>
                <Feather name="x" size={16} color={colors.mutedForeground} />
              </Pressable>
            )}
          </View>
          {/* Status filter */}
          <View style={styles.filterRow}>
            {ALL_STATUSES.map(s => {
              const active = statusFilter === s;
              return (
                <Pressable
                  key={s}
                  style={[styles.filterChip, { backgroundColor: active ? colors.primary : colors.muted, borderColor: active ? colors.primary : colors.border }]}
                  onPress={() => setStatusFilter(s)}
                >
                  <Text style={[styles.filterText, { color: active ? "#FFFFFF" : colors.mutedForeground }]}>
                    {s === "all" ? "All" : STATUS_LABELS[s]}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {!isLoading && (
            <Text style={[styles.count, { color: colors.mutedForeground, paddingHorizontal: 0, paddingTop: 10 }]}>
              {filtered.length} project{filtered.length !== 1 ? "s" : ""}
            </Text>
          )}
        </View>
      }
      renderItem={({ item }) => <ProjectCard project={item} />}
      ListEmptyComponent={
        <View style={styles.emptyContainer}>
          {isLoading ? (
            <ActivityIndicator color={colors.primary} size="large" />
          ) : (
            <>
              <Feather name="folder" size={48} color={colors.border} />
              <Text style={[styles.emptyText, { color: colors.foreground }]}>
                {search ? "No matching projects" : "No projects yet"}
              </Text>
              <Text style={[styles.emptySubtext, { color: colors.mutedForeground }]}>
                Projects are created on the web dashboard
              </Text>
            </>
          )}
        </View>
      }
    />
  );
}
