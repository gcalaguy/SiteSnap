import React, { useState } from "react";
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useGetMe, useListProjects, useListProjectMembers } from "@workspace/api-client-react";

import { useColors } from "@/hooks/useColors";
import { spacing, typography } from "@/constants/theme";
import { Card, SectionHeader, EmptyState, Chip } from "@/components/ui";
import { ClockWidget } from "@/components/ClockWidget";
import { ElapsedTimer } from "@/components/ElapsedTimer";
import {
  useActiveSessions,
  useClockIn,
  useClockOut,
  useClockInAll,
  useTimeClockSummary,
  type TimeClockSession,
} from "@/hooks/useTimeClock";

function SummaryRow() {
  const colors = useColors();
  const { data: summary, isLoading } = useTimeClockSummary();

  if (isLoading || !summary) {
    return (
      <Card style={styles.card}>
        <ActivityIndicator color={colors.primary} />
      </Card>
    );
  }

  return (
    <Card style={styles.card}>
      <View style={styles.summaryRow}>
        <View style={styles.summaryCell}>
          <Text style={[typography.label, { color: colors.mutedForeground }]}>TODAY</Text>
          <Text style={[typography.heading, { color: colors.foreground, marginTop: 2 }]}>
            {summary.todayTotalHours}h
          </Text>
        </View>
        <View style={[styles.summaryDivider, { backgroundColor: colors.border }]} />
        <View style={styles.summaryCell}>
          <Text style={[typography.label, { color: colors.mutedForeground }]}>THIS WEEK</Text>
          <Text style={[typography.heading, { color: colors.foreground, marginTop: 2 }]}>
            {summary.weekTotalHours}h
          </Text>
        </View>
      </View>
    </Card>
  );
}

function WorkerRow({ projectId, userId, name, session }: {
  projectId: number;
  userId: number;
  name: string;
  session: TimeClockSession | undefined;
}) {
  const colors = useColors();
  const clockIn = useClockIn();
  const clockOut = useClockOut();
  const isActive = !!session;
  const busy = clockIn.isPending || clockOut.isPending;

  function haptic() {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }

  function toggle() {
    haptic();
    if (isActive && session) {
      clockOut.mutate({ sessionId: session.id });
    } else {
      clockIn.mutate({ projectId, targetUserId: userId });
    }
  }

  return (
    <View style={styles.workerRow}>
      <View style={{ flex: 1 }}>
        <Text style={[typography.bodyMedium, { color: colors.foreground }]} numberOfLines={1}>{name}</Text>
        {isActive && session ? (
          <ElapsedTimer clockInTime={session.clockInTime} style={[typography.caption, { color: colors.success, marginTop: 1 }]} />
        ) : (
          <Text style={[typography.caption, { color: colors.mutedForeground, marginTop: 1 }]}>Not clocked in</Text>
        )}
      </View>
      <Pressable
        onPress={toggle}
        disabled={busy}
        style={({ pressed }) => [
          styles.smallBtn,
          {
            backgroundColor: isActive ? colors.destructive : colors.success,
            opacity: busy ? 0.6 : pressed ? 0.85 : 1,
          },
        ]}
      >
        {busy ? (
          <ActivityIndicator size="small" color="#FFFFFF" />
        ) : (
          <Text style={[typography.captionMedium, { color: "#FFFFFF" }]}>{isActive ? "Clock Out" : "Clock In"}</Text>
        )}
      </Pressable>
    </View>
  );
}

function TeamPunchSection() {
  const colors = useColors();
  const { data: projects = [] } = useListProjects();
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const activeProjectId = selectedProjectId ?? projects[0]?.id ?? null;

  const { data: members = [], isLoading: membersLoading } = useListProjectMembers(activeProjectId ?? 0, {
    query: { enabled: !!activeProjectId } as any,
  });
  const { data: activeSessions = [] } = useActiveSessions(!!activeProjectId);
  const clockInAll = useClockInAll();

  const sessionsByUser = new Map(activeSessions.map((s) => [s.userId, s]));
  const projectMembers = members;
  const notYetIn = projectMembers.filter((m) => !sessionsByUser.has(m.id)).length;

  function handleClockInAll() {
    if (!activeProjectId) return;
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    clockInAll.mutate({ projectId: activeProjectId });
  }

  return (
    <View style={{ marginTop: spacing.xl }}>
      <SectionHeader title="Team Punch" />

      {projects.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing.md }} contentContainerStyle={{ paddingHorizontal: spacing.xl, gap: spacing.sm }}>
          {projects.map((p) => (
            <Chip key={p.id} label={p.name} selected={p.id === activeProjectId} onPress={() => setSelectedProjectId(p.id)} />
          ))}
        </ScrollView>
      )}

      <Card style={styles.card}>
        {!activeProjectId || membersLoading ? (
          <ActivityIndicator color={colors.primary} />
        ) : projectMembers.length === 0 ? (
          <EmptyState icon="users" title="No workers assigned" subtitle="Assign workers to this project to punch them in." />
        ) : (
          <>
            <Pressable
              onPress={handleClockInAll}
              disabled={clockInAll.isPending || notYetIn === 0}
              style={({ pressed }) => [
                styles.bulkBtn,
                { backgroundColor: colors.success, opacity: clockInAll.isPending || notYetIn === 0 ? 0.5 : pressed ? 0.85 : 1 },
              ]}
            >
              {clockInAll.isPending ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Feather name="users" size={16} color="#FFFFFF" />
                  <Text style={[typography.bodyMedium, { color: "#FFFFFF" }]}>
                    {notYetIn === 0 ? "Entire team clocked in" : `Clock In Entire Team (${notYetIn})`}
                  </Text>
                </>
              )}
            </Pressable>

            <View style={{ marginTop: spacing.md }}>
              {projectMembers.map((m, i) => (
                <React.Fragment key={m.id}>
                  {i > 0 && <View style={[styles.rowDivider, { backgroundColor: colors.border }]} />}
                  <WorkerRow
                    projectId={activeProjectId}
                    userId={m.id}
                    name={`${m.firstName ?? ""} ${m.lastName ?? ""}`.trim() || m.email}
                    session={sessionsByUser.get(m.id)}
                  />
                </React.Fragment>
              ))}
            </View>
          </>
        )}
      </Card>
    </View>
  );
}

export default function TimeClockScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { data: me } = useGetMe();
  const isPrivileged = me?.role === "owner" || me?.role === "foreman";
  const topInsets = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topInsets + 8, backgroundColor: colors.sidebar }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={10}>
          <Feather name="arrow-left" size={22} color="#FFFFFF" />
        </Pressable>
        <Text style={styles.headerTitle}>Clock In / Out</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingTop: spacing.lg, paddingBottom: insets.bottom + 40 }}>
        <ClockWidget />
        <SummaryRow />
        {isPrivileged && <TeamPunchSection />}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  backBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  headerTitle: { color: "#FFFFFF", fontSize: 17, fontFamily: "Inter_700Bold" },
  card: { marginHorizontal: spacing.xl, marginBottom: spacing.lg },
  summaryRow: { flexDirection: "row", alignItems: "center" },
  summaryCell: { flex: 1, alignItems: "center" },
  summaryDivider: { width: 1, alignSelf: "stretch" },
  workerRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.sm },
  rowDivider: { height: StyleSheet.hairlineWidth, marginVertical: 2 },
  smallBtn: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: 8, minWidth: 92, alignItems: "center" },
  bulkBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    borderRadius: 10,
    paddingVertical: spacing.md,
  },
});
