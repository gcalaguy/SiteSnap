import {
  useGetDashboardSummary, useGetRecentActivity, useListProjects,
  useGetMe, customFetch,
  getGetMeQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRouter, useFocusEffect } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { WeatherWidget } from "@/components/WeatherWidget";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { usePermissions } from "@/hooks/usePermissions";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { triggerVoiceFab } from "@/utils/voiceFabBus";
import { Card, StatTile, SectionHeader, EmptyState } from "@/components/ui";
import { radius, spacing, typography } from "@/constants/theme";

// ── Data shapes reused from other screens (kept local — same convention as
// tasks.tsx/inspect.tsx, which each declare their own minimal view of the
// shared API response instead of importing a generated type) ──────────────

type MyTask = { id: number; dueDate?: string | null; status: "todo" | "in_progress" | "done" };
type InspectionRow = { inspection: { status: "draft" | "submitted" } };
type Directive = { id: number; urgency: "HIGH" | "MEDIUM" | "LOW" };

function isOverdue(dueDate?: string | null): boolean {
  if (!dueDate) return false;
  return new Date(dueDate) < new Date();
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString("en-CA", { month: "short", day: "numeric" });
}

// ── AI Insights — same /api/ai/foreman-briefing endpoint as before, parsed
// down to a short bullet list instead of the old expandable card. ─────────

type BriefingLine = { icon: string; text: string };

function parseBriefing(raw: string): BriefingLine[] {
  const lines = raw.split(/\n/).map((l) => l.trim()).filter(Boolean);
  const out: BriefingLine[] = [];
  for (const line of lines) {
    if (line.startsWith("📋") || line.toLowerCase().includes("priorit")) {
      out.push({ icon: "list", text: line.replace(/^📋\s*/, "") });
    } else if (line.startsWith("⚠️") || line.toLowerCase().includes("alert") || line.toLowerCase().includes("risk")) {
      out.push({ icon: "alert-triangle", text: line.replace(/^⚠️\s*/, "") });
    } else if (line.startsWith("✅") || line.toLowerCase().includes("complet") || line.toLowerCase().includes("done")) {
      out.push({ icon: "check-circle", text: line.replace(/^✅\s*/, "") });
    } else if (line.startsWith("-") || line.startsWith("•")) {
      out.push({ icon: "chevron-right", text: line.replace(/^[-•]\s*/, "") });
    } else {
      out.push({ icon: "chevron-right", text: line });
    }
  }
  return out.slice(0, 3);
}

function isMotivationalPlaceholder(raw: string): boolean {
  const trimmed = raw.trim();
  return trimmed.length > 0 && !trimmed.includes("\n") && !/^[-•]/.test(trimmed) && trimmed.length < 160;
}

function AiInsights() {
  const colors = useColors();
  const [lines, setLines] = useState<BriefingLine[]>([]);
  const [placeholder, setPlaceholder] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);

  const { mutate, isPending } = useMutation({
    mutationFn: () =>
      customFetch<{ briefing: string } | string>("/api/ai/foreman-briefing", {
        method: "POST",
        body: JSON.stringify({}),
      }),
    onSuccess: (data) => {
      const raw = typeof data === "string"
        ? data
        : (data as any)?.briefing ?? (data as any)?.summary ?? JSON.stringify(data);
      setLoadError(false);
      if (isMotivationalPlaceholder(raw)) {
        setPlaceholder(raw.trim());
        setLines([]);
      } else {
        setPlaceholder(null);
        setLines(parseBriefing(raw));
      }
    },
    onError: () => {
      setLoadError(true);
      setPlaceholder(null);
      setLines([]);
    },
  });

  useEffect(() => { mutate(); }, []);

  return (
    <Card style={{ marginHorizontal: spacing.xl, marginBottom: spacing.lg }}>
      <View style={styles.aiHeader}>
        <Feather name="cpu" size={14} color={colors.primary} />
        <Text style={[typography.label, { color: colors.primary }]}>AI INSIGHTS</Text>
        <View style={{ flex: 1 }} />
        <Pressable onPress={() => mutate()} hitSlop={8} disabled={isPending}>
          <Feather name="refresh-cw" size={13} color={colors.mutedForeground} />
        </Pressable>
      </View>

      {isPending ? (
        <View style={styles.aiRow}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={[typography.caption, { color: colors.mutedForeground }]}>Thinking…</Text>
        </View>
      ) : loadError ? (
        <Text style={[typography.caption, { color: colors.mutedForeground, marginTop: 8 }]}>
          Couldn't load insights — tap refresh to retry.
        </Text>
      ) : placeholder ? (
        <View style={styles.aiRow}>
          <Feather name="check-circle" size={14} color={colors.success} />
          <Text style={[typography.caption, { color: colors.foreground, flex: 1 }]}>{placeholder}</Text>
        </View>
      ) : lines.length === 0 ? (
        <Text style={[typography.caption, { color: colors.mutedForeground, marginTop: 8 }]}>
          Tap refresh to generate today's insights.
        </Text>
      ) : (
        <View style={{ marginTop: 8, gap: 6 }}>
          {lines.map((l, i) => (
            <View key={i} style={styles.aiRow}>
              <Feather name={l.icon as any} size={13} color={colors.mutedForeground} />
              <Text style={[typography.caption, { color: colors.foreground, flex: 1 }]} numberOfLines={2}>
                {l.text}
              </Text>
            </View>
          ))}
        </View>
      )}
    </Card>
  );
}

// ── Active project spotlight ────────────────────────────────────────────────

function progressFraction(startDate?: string | null, endDate?: string | null): number | null {
  if (!startDate || !endDate) return null;
  const start = new Date(startDate).getTime();
  const end = new Date(endDate).getTime();
  if (!(end > start)) return null;
  return Math.min(1, Math.max(0, (Date.now() - start) / (end - start)));
}

function ActiveProjectCard({ project, onPress }: { project: any; onPress: () => void }) {
  const colors = useColors();
  const progress = progressFraction(project.startDate, project.endDate);
  const statusColors: Record<string, string> = {
    active: colors.success,
    planning: colors.warning,
    completed: colors.mutedForeground,
    on_hold: colors.warning,
  };

  return (
    <Card onPress={onPress} padding="lg" style={{ marginHorizontal: spacing.xl }}>
      <View style={styles.activeProjectTop}>
        <View style={{ flex: 1 }}>
          <Text style={[typography.label, { color: colors.mutedForeground }]}>ACTIVE PROJECT</Text>
          <Text style={[typography.heading, { color: colors.foreground, marginTop: 4 }]} numberOfLines={1}>
            {project.name}
          </Text>
          {!!project.city && (
            <Text style={[typography.caption, { color: colors.mutedForeground, marginTop: 2 }]} numberOfLines={1}>
              {project.city}{project.province ? `, ${project.province}` : ""}
            </Text>
          )}
        </View>
        <View style={[styles.statusDot, { backgroundColor: statusColors[project.status] ?? colors.mutedForeground }]} />
      </View>

      {progress != null ? (
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%`, backgroundColor: colors.primary }]} />
        </View>
      ) : null}

      <View style={styles.activeProjectFooter}>
        <Text style={[typography.captionMedium, { color: colors.primary }]}>View project</Text>
        <Feather name="arrow-right" size={14} color={colors.primary} />
      </View>
    </Card>
  );
}

// ── Recent activity ──────────────────────────────────────────────────────────

const ACTIVITY_ICONS: Record<string, string> = {
  daily_report: "file-text",
  rfi_created: "alert-circle",
  project_created: "folder",
  task_created: "check-square",
  schedule_assigned: "calendar",
  cost_added: "dollar-sign",
};

function ActivityRow({ item }: { item: any }) {
  const colors = useColors();
  const iconName = ACTIVITY_ICONS[item.type] ?? "activity";

  return (
    <View style={styles.activityRow}>
      <View style={[styles.activityIcon, { backgroundColor: `${colors.primary}18` }]}>
        <Feather name={iconName as any} size={14} color={colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[typography.caption, { color: colors.foreground }]} numberOfLines={2}>{item.description}</Text>
        <Text style={[typography.caption, { color: colors.mutedForeground, marginTop: 1 }]} numberOfLines={1}>
          {item.projectName ? `${item.projectName} · ` : ""}{timeAgo(item.createdAt)}
        </Text>
      </View>
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: spacing.xl, paddingBottom: spacing.lg,
    flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end",
  },
  greeting: { marginTop: 2 },
  companyBadge: {
    flexDirection: "row", alignItems: "center", gap: 4, marginTop: spacing.sm,
    alignSelf: "flex-start", backgroundColor: "#C9A84C22", borderWidth: 1,
    borderColor: "#C9A84C44", borderRadius: radius.sm, paddingHorizontal: 7, paddingVertical: 3,
  },
  bellBtn: { position: "relative", padding: 4 },
  badge: {
    position: "absolute", top: -2, right: -4, minWidth: 18, height: 18,
    borderRadius: 9, alignItems: "center", justifyContent: "center", paddingHorizontal: 4,
  },
  badgeText: { color: "#FFFFFF", fontSize: 11, fontFamily: "Inter_700Bold" },

  priorityRow: { flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.xl, marginBottom: spacing.lg },

  aiHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  aiRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },

  activeProjectTop: { flexDirection: "row", alignItems: "flex-start" },
  statusDot: { width: 9, height: 9, borderRadius: 5, marginTop: 4 },
  progressTrack: { height: 4, borderRadius: 2, backgroundColor: "#88888833", marginTop: spacing.lg, overflow: "hidden" },
  progressFill: { height: 4, borderRadius: 2 },
  activeProjectFooter: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: spacing.lg },

  voiceCard: {
    marginHorizontal: spacing.xl, marginTop: spacing.lg, marginBottom: spacing.xxl,
    borderRadius: radius.lg, paddingVertical: spacing.xl, alignItems: "center", gap: spacing.sm,
  },
  voiceIconWrap: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center" },

  section: { paddingHorizontal: spacing.xl, marginBottom: spacing.xxl },

  activityRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md, paddingVertical: spacing.sm },
  activityIcon: { width: 30, height: 30, borderRadius: radius.sm, alignItems: "center", justifyContent: "center" },
});

// ── Screen ────────────────────────────────────────────────────────────────────

export default function DashboardScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const { data: me } = useGetMe();
  const { isLoading: summaryLoading, refetch: refetchSummary } = useGetDashboardSummary();
  const { data: activity, isLoading: activityLoading, refetch: refetchActivity } = useGetRecentActivity();
  const { data: projects, isLoading: projectsLoading, refetch: refetchProjects } = useListProjects();

  const { data: unreadData } = useQuery<{ count: number }>({
    queryKey: ["notifications", "unread"],
    queryFn: () => customFetch<{ count: number }>("/api/notifications/unread-count"),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
  const unreadCount = unreadData?.count ?? 0;

  const perms = usePermissions();

  const { data: myTasks = [], refetch: refetchTasks } = useQuery<MyTask[]>({
    queryKey: ["my-tasks"],
    queryFn: () => customFetch<MyTask[]>("/api/dashboard/my-tasks"),
  });
  const overdueTaskCount = myTasks.filter((t) => t.status !== "done" && isOverdue(t.dueDate)).length;

  const { data: inspectionRows = [] } = useQuery<InspectionRow[]>({
    queryKey: ["inspections-mobile", null],
    queryFn: () => customFetch<InspectionRow[]>("/api/inspections"),
    enabled: perms.viewInspectTab,
  });
  const inspectionsDueCount = inspectionRows.filter((r) => r.inspection.status === "draft").length;

  const { data: directives = [] } = useQuery<Directive[]>({
    queryKey: ["compliance-directives", "all"],
    queryFn: () => customFetch<Directive[]>("/api/compliance/directives?status=PENDING"),
    staleTime: 60_000,
  });

  const refreshing = summaryLoading || activityLoading || projectsLoading;
  const qc = useQueryClient();
  const handleRefresh = () => {
    refetchSummary(); refetchActivity(); refetchProjects(); refetchTasks();
    qc.invalidateQueries({ queryKey: getGetMeQueryKey() });
  };

  useFocusEffect(
    useCallback(() => {
      qc.invalidateQueries({ queryKey: getGetMeQueryKey() });
    }, [qc]),
  );

  const firstName = me?.firstName ?? "there";
  const isWorker = me?.role === "worker";
  const hasMultipleCompanies = (me?.memberships?.length ?? 0) > 1;
  const activeCompanyName =
    me?.company?.name ??
    me?.memberships?.find((m) => m.companyId === me?.activeCompanyId)?.companyName ??
    null;
  const allProjects = projects ?? [];
  const activeProjects = allProjects.filter((p) => p.status === "active" || p.status === "planning");
  const spotlightProjects = isWorker ? allProjects : activeProjects;
  const spotlight = spotlightProjects[0];

  function go(path: string) {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(path as Parameters<typeof router.push>[0]);
  }

  const topInsets = Platform.OS === "web" ? 67 : insets.top;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
      contentContainerStyle={{ paddingBottom: Platform.OS === "web" ? 34 : insets.bottom + 90 }}
    >
      {/* Welcome */}
      <View style={[styles.header, { paddingTop: topInsets + 8 }]}>
        <View>
          <Text style={[typography.caption, { color: colors.mutedForeground }]}>
            {new Date().toLocaleDateString("en-CA", { weekday: "long", month: "long", day: "numeric" })}
          </Text>
          <Text style={[typography.display, styles.greeting, { color: colors.foreground }]}>
            {greeting()}, {firstName}
          </Text>
          {hasMultipleCompanies && activeCompanyName ? (
            <View style={styles.companyBadge}>
              <Feather name="briefcase" size={10} color={colors.primary} />
              <Text style={[typography.label, { color: colors.primary }]} numberOfLines={1}>{activeCompanyName}</Text>
            </View>
          ) : null}
        </View>
        <Pressable onPress={() => go("/notifications")} style={styles.bellBtn} hitSlop={10}>
          <Feather name="bell" size={22} color={colors.foreground} />
          {unreadCount > 0 && (
            <View style={[styles.badge, { backgroundColor: colors.destructive }]}>
              <Text style={styles.badgeText}>{unreadCount > 99 ? "99+" : String(unreadCount)}</Text>
            </View>
          )}
        </Pressable>
      </View>

      <View style={{ paddingHorizontal: spacing.xl, marginBottom: spacing.lg }}>
        <WeatherWidget />
      </View>

      {/* Today's Priorities */}
      <View style={[styles.section, { marginBottom: spacing.sm, paddingHorizontal: spacing.xl }]}>
        <Text style={[typography.label, { color: colors.mutedForeground }]}>TODAY'S PRIORITIES</Text>
      </View>
      <View style={styles.priorityRow}>
        <StatTile
          label="Overdue Tasks"
          value={overdueTaskCount}
          status={overdueTaskCount > 0 ? "critical" : "success"}
          onPress={() => go("/(tabs)/tasks")}
        />
        {perms.viewInspectTab && (
          <StatTile
            label="Inspections Due"
            value={inspectionsDueCount}
            status={inspectionsDueCount > 0 ? "warning" : "success"}
            onPress={() => go("/(tabs)/inspect")}
          />
        )}
        <StatTile
          label="Safety Alerts"
          value={directives.length}
          status={directives.length > 0 ? "warning" : "success"}
          onPress={() => go("/(tabs)/safety")}
        />
      </View>

      {/* Active project */}
      {projectsLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginBottom: spacing.lg }} />
      ) : spotlight ? (
        <>
          <ActiveProjectCard project={spotlight} onPress={() => go(`/project/${spotlight.id}`)} />
          {spotlightProjects.length > 1 ? (
            <Pressable onPress={() => go("/projects")} style={{ paddingHorizontal: spacing.xl, marginTop: spacing.sm, marginBottom: spacing.lg }}>
              <Text style={[typography.captionMedium, { color: colors.primary }]}>
                View all {spotlightProjects.length} projects →
              </Text>
            </Pressable>
          ) : (
            <View style={{ marginBottom: spacing.lg }} />
          )}
        </>
      ) : (
        <View style={{ marginHorizontal: spacing.xl, marginBottom: spacing.lg }}>
          <EmptyState icon="folder" title="No active projects" subtitle="Projects assigned to you will show up here." />
        </View>
      )}

      {/* AI Insights */}
      {perms.viewAskAI && <AiInsights />}

      {/* Voice Assistant */}
      <Pressable
        onPress={() => { if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); triggerVoiceFab(); }}
        style={({ pressed }) => [styles.voiceCard, { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, opacity: pressed ? 0.85 : 1 }]}
      >
        <View style={[styles.voiceIconWrap, { backgroundColor: `${colors.primary}1F` }]}>
          <Feather name="mic" size={24} color={colors.primary} />
        </View>
        <Text style={[typography.bodyMedium, { color: colors.foreground }]}>Tap to talk</Text>
        <Text style={[typography.caption, { color: colors.mutedForeground }]}>
          Log an update, ask a question, or start a report
        </Text>
      </Pressable>

      {/* Recent Activity */}
      <View style={styles.section}>
        <SectionHeader title="Recent Activity" />
        {activityLoading ? (
          <ActivityIndicator color={colors.primary} />
        ) : (activity ?? []).length === 0 ? (
          <EmptyState icon="activity" title="No recent activity" />
        ) : (
          (activity ?? []).slice(0, 6).map((item) => <ActivityRow key={item.id} item={item} />)
        )}
      </View>
    </ScrollView>
  );
}
