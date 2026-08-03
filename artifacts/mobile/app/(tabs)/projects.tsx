import {
  useListProjects,
  useGetMe,
  useCreateProject,
  getListProjectsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
import { Chip } from "@/components/ui";
import { ProjectFormSheet, type ProjectFormValues } from "@/components/sheets/ProjectFormSheet";

const STATUS_LABELS: Record<string, string> = {
  planning: "Active",
  active: "Active",
  completed: "Completed",
  on_hold: "On Hold",
};

const STATUS_COLORS: Record<string, string> = {
  planning: "#22C55E",
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
  fab: {
    position: "absolute",
    right: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 24,
    borderWidth: 1,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  fabText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
});

const ALL_STATUSES = ["all", "active", "on_hold", "completed"];

type HeaderProps = {
  search: string;
  onSearch: (v: string) => void;
  statusFilter: string;
  onStatus: (v: string) => void;
  isLoading: boolean;
  filteredCount: number;
};

function ProjectsHeader({ search, onSearch, statusFilter, onStatus, isLoading, filteredCount }: HeaderProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topInsets = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={[styles.headerArea, { paddingTop: topInsets + 16 }]}>
      <Text style={[styles.screenTitle, { color: colors.foreground }]}>Projects</Text>
      <View style={[styles.searchBox, { backgroundColor: colors.muted, borderColor: colors.border }]}>
        <Feather name="search" size={16} color={colors.mutedForeground} />
        <TextInput
          style={[styles.searchInput, { color: colors.foreground }]}
          placeholder="Search projects..."
          placeholderTextColor={colors.mutedForeground}
          value={search}
          onChangeText={onSearch}
        />
        {!!search && (
          <Pressable onPress={() => onSearch("")}>
            <Feather name="x" size={16} color={colors.mutedForeground} />
          </Pressable>
        )}
      </View>
      <View style={styles.filterRow}>
        {ALL_STATUSES.map(s => (
          <Chip
            key={s}
            label={s === "all" ? "All" : STATUS_LABELS[s]}
            selected={statusFilter === s}
            onPress={() => onStatus(s)}
          />
        ))}
      </View>
      {!isLoading && (
        <Text style={[styles.count, { color: colors.mutedForeground, paddingHorizontal: 0, paddingTop: 10 }]}>
          {filteredCount} project{filteredCount !== 1 ? "s" : ""}
        </Text>
      )}
    </View>
  );
}

export default function ProjectsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const bottomInset = insets.bottom;
  const qc = useQueryClient();
  const { data: projects, isLoading, refetch } = useListProjects();
  const { data: me } = useGetMe();
  const isWorker = me?.role === "worker";
  const isOwnerOrForeman = me?.role === "owner" || me?.role === "foreman";

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showCreateSheet, setShowCreateSheet] = useState(false);
  const [creating, setCreating] = useState(false);

  const createProject = useCreateProject({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListProjectsQueryKey() });
        refetch();
        setShowCreateSheet(false);
      },
      onError: () => Alert.alert("Failed to create project"),
      onSettled: () => setCreating(false),
    },
  });

  function handleCreateProject(values: ProjectFormValues) {
    setCreating(true);
    createProject.mutate({
      data: {
        name: values.name,
        address: values.address,
        city: values.city,
        province: values.province,
        status: values.status,
        startDate: values.startDate ?? undefined,
        endDate: values.endDate ?? undefined,
        budget: values.budget ?? undefined,
        description: values.description ?? undefined,
      },
    });
  }

  const filtered = (projects ?? []).filter(p => {
    const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase()) || ((p as any).location ?? "").toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all"
      || p.status === statusFilter
      || (statusFilter === "active" && p.status === "planning");
    return matchSearch && matchStatus;
  });

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
    <FlatList
      style={[styles.container, { backgroundColor: colors.background }]}
      data={filtered}
      keyExtractor={item => String(item.id)}
      showsVerticalScrollIndicator={false}
      removeClippedSubviews
      maxToRenderPerBatch={10}
      windowSize={10}
      initialNumToRender={15}
      refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={colors.primary} />}
      contentContainerStyle={{ paddingBottom: Platform.OS === "web" ? 34 : bottomInset + 90, flexGrow: 1 }}
      ListHeaderComponent={
        <ProjectsHeader
          search={search}
          onSearch={setSearch}
          statusFilter={statusFilter}
          onStatus={setStatusFilter}
          isLoading={isLoading}
          filteredCount={filtered.length}
        />
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
                {search
                  ? "Try a different search term or clear your filters."
                  : isWorker
                  ? "You haven't been assigned to any projects yet. Ask your manager to add you to a project."
                  : isOwnerOrForeman
                  ? "Tap + New Project to create your first one."
                  : "Projects are created and managed on the web dashboard."}
              </Text>
            </>
          )}
        </View>
      }
    />

      {isOwnerOrForeman && (
        <Pressable
          style={[styles.fab, { backgroundColor: colors.card, borderColor: colors.border, bottom: bottomInset + 20 }]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setShowCreateSheet(true);
          }}
        >
          <Feather name="plus" size={18} color={colors.primary} />
          <Text style={[styles.fabText, { color: colors.primary }]}>New Project</Text>
        </Pressable>
      )}

      <ProjectFormSheet
        visible={showCreateSheet}
        onClose={() => setShowCreateSheet(false)}
        onSubmit={handleCreateProject}
        submitting={creating}
      />
    </View>
  );
}
