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
import { Chip, MediaCard } from "@/components/ui";
import { elevation, layout, radius, spacing, typography } from "@/constants/theme";
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

  // The old card spread location / budget / start date over three icon rows.
  // A photo tile has one line of room under the title, so they collapse into a
  // single middot-separated meta line — same information, one glance.
  const meta = [project.location, budget, project.startDate && new Date(project.startDate).toLocaleDateString("en-CA")]
    .filter(Boolean)
    .join("  ·  ");

  return (
    <MediaCard
      objectPath={project.coverPhotoUrl}
      seed={project.id}
      fallbackIcon="home"
      title={project.name}
      meta={meta || undefined}
      badge={
        <View style={[styles.badge, { backgroundColor: `${statusColor}26`, borderColor: `${statusColor}59` }]}>
          <Text style={[styles.badgeText, { color: statusColor }]}>{statusLabel}</Text>
        </View>
      }
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        router.push(`/project/${project.id}`);
      }}
      style={styles.card}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerArea: { paddingHorizontal: layout.gutter, paddingBottom: spacing.xl },
  screenTitle: { ...typography.hero, marginBottom: spacing.xl },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: radius.full,
    paddingHorizontal: spacing.xl,
    paddingVertical: 14,
    gap: spacing.md,
    borderWidth: 1,
    marginBottom: spacing.lg,
  },
  searchInput: { flex: 1, ...typography.body },
  filterRow: { flexDirection: "row", gap: spacing.sm },
  card: {
    marginHorizontal: layout.gutter,
    marginBottom: spacing.lg,
  },
  badge: { paddingHorizontal: spacing.md, paddingVertical: 5, borderRadius: radius.full, borderWidth: 1 },
  badgeText: { ...typography.label, letterSpacing: 0.6 },
  emptyContainer: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 40 },
  emptyText: { ...typography.heading, textAlign: "center", marginTop: spacing.lg },
  emptySubtext: { ...typography.body, textAlign: "center", marginTop: spacing.sm },
  count: { ...typography.caption, paddingHorizontal: layout.gutter, marginBottom: spacing.sm },
  fab: {
    position: "absolute",
    right: spacing.xl,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingVertical: 14,
    borderRadius: radius.full,
    borderWidth: 1,
    ...elevation.card,
  },
  fabText: { ...typography.captionMedium },
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
    <View style={[styles.headerArea, { paddingTop: topInsets + spacing.xxl }]}>
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
