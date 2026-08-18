import React, { useEffect, useState } from "react";
import { ActivityIndicator, Platform, Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { customFetch, useGetMe, useListProjects } from "@workspace/api-client-react";

import { useColors } from "@/hooks/useColors";
import { spacing, radius, typography } from "@/constants/theme";
import { Card, BottomSheet, ListRow } from "@/components/ui";
import { ElapsedTimer } from "@/components/ElapsedTimer";
import { useActiveSession, useClockIn, useClockOut } from "@/hooks/useTimeClock";
import { safeNavigate } from "@/utils/safeNavigate";
import { setClockInGateHandler, setClockOutGateHandler } from "@/utils/clockGateBus";
import type { PsiChecklistDetail, PsiListRow } from "@/constants/psi";

// Matches the date format psi-checklist.tsx stamps onto a new PSI
// (`new Date().toISOString().slice(0, 10)`) — deliberately NOT the
// time-clock's own `localDate` helper, since we're comparing against
// PSI rows, not time-clock rows.
function todayPsiDate(): string {
  return new Date().toISOString().slice(0, 10);
}

// A worker needs at most one submitted-and-self-signed PSI per project per
// day before Clock In proceeds; a same-day return from a break reuses it.
async function hasCompletedPsiToday(projectId: number, myUserId: number): Promise<boolean> {
  const today = todayPsiDate();
  const rows = await customFetch<PsiListRow[]>(`/api/psi?projectId=${projectId}`);
  const candidate = rows.find(
    (r) => r.psi.date === today && r.psi.status === "submitted" && r.creator?.id === myUserId,
  );
  if (!candidate) return false;
  const detail = await customFetch<PsiChecklistDetail>(`/api/psi/${candidate.psi.id}`);
  return detail.signatures.some((s) => s.userId === myUserId);
}

export function ClockWidget() {
  const colors = useColors();
  const router = useRouter();
  const { data, isLoading } = useActiveSession();
  const { data: me } = useGetMe();
  const { data: projects = [] } = useListProjects();
  const clockIn = useClockIn();
  const clockOut = useClockOut();
  const [pickerVisible, setPickerVisible] = useState(false);
  const [checkingGate, setCheckingGate] = useState(false);
  const [isLastClockOut, setIsLastClockOut] = useState(false);

  const session = data?.session ?? null;

  // Registers the "resume the real clock action" handlers ClockWidget itself
  // uses once a gated sub-flow (PSI sign-off / Daily Report submit) completes
  // and navigates back here — see utils/clockGateBus.ts.
  useEffect(() => {
    setClockInGateHandler((projectId) => clockIn.mutate({ projectId }));
    setClockOutGateHandler((sessionId) => clockOut.mutate({ sessionId }));
    return () => {
      setClockInGateHandler(null);
      setClockOutGateHandler(null);
    };
  }, [clockIn, clockOut]);

  function haptic() {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }

  async function startClockIn(projectId: number) {
    haptic();
    setPickerVisible(false);
    if (!me) return;
    setCheckingGate(true);
    const done = await hasCompletedPsiToday(projectId, me.id).catch(() => false);
    setCheckingGate(false);
    if (done) {
      clockIn.mutate({ projectId });
    } else {
      safeNavigate(
        router,
        { pathname: "/(tabs)/(home)/psi-checklist", params: { projectId: String(projectId), returnTo: "clock-in" } },
        "clock-widget:psi-gate",
      );
    }
  }

  function handleClockInPress() {
    const accessible = projects.filter((p) => p.status !== "completed" && p.status !== "cancelled");
    if (accessible.length === 0) return;
    if (accessible.length === 1) {
      startClockIn(accessible[0].id);
      return;
    }
    setPickerVisible(true);
  }

  function handleClockOutPress() {
    if (!session) return;
    haptic();
    if (isLastClockOut) {
      safeNavigate(
        router,
        `/(tabs)/(home)/log?projectId=${session.projectId}&returnTo=clock-out&sessionId=${session.id}`,
        "clock-widget:report-gate",
      );
    } else {
      clockOut.mutate({ sessionId: session.id });
    }
  }

  if (isLoading) {
    return (
      <Card style={styles.card}>
        <ActivityIndicator color={colors.primary} />
      </Card>
    );
  }

  if (session) {
    return (
      <Card style={[styles.card, { borderColor: colors.destructive, borderWidth: 1 }]}>
        <View style={styles.row}>
          <View style={[styles.dot, { backgroundColor: colors.destructive }]} />
          <Text style={[typography.label, { color: colors.destructive }]}>CLOCKED IN</Text>
          <View style={{ flex: 1 }} />
          {session.project?.name ? (
            <View style={[styles.projectBadge, { backgroundColor: `${colors.primary}18` }]}>
              <Text style={[typography.caption, { color: colors.primary }]} numberOfLines={1}>
                {session.project.name}
              </Text>
            </View>
          ) : null}
        </View>

        <ElapsedTimer
          clockInTime={session.clockInTime}
          style={[typography.display, { color: colors.foreground, marginTop: spacing.sm }]}
        />

        <View style={[styles.lastClockOutRow, { marginTop: spacing.lg }]}>
          <Text style={[typography.caption, { color: colors.mutedForeground, flex: 1 }]}>
            This is my last Clock Out today (requires a Daily Report)
          </Text>
          <Switch value={isLastClockOut} onValueChange={setIsLastClockOut} />
        </View>

        <Pressable
          onPress={handleClockOutPress}
          disabled={clockOut.isPending}
          style={({ pressed }) => [
            styles.actionBtn,
            { backgroundColor: colors.destructive, opacity: clockOut.isPending ? 0.6 : pressed ? 0.85 : 1 },
          ]}
        >
          {clockOut.isPending ? (
            <ActivityIndicator size="small" color={colors.destructiveForeground} />
          ) : (
            <>
              <Feather name="square" size={16} color={colors.destructiveForeground} />
              <Text style={[typography.bodyMedium, { color: colors.destructiveForeground }]}>
                {isLastClockOut ? "Submit Report & Clock Out" : "Clock Out"}
              </Text>
            </>
          )}
        </Pressable>
      </Card>
    );
  }

  return (
    <>
      <Card style={styles.card}>
        <View style={styles.row}>
          <Feather name="clock" size={16} color={colors.mutedForeground} />
          <Text style={[typography.label, { color: colors.mutedForeground }]}>NOT CLOCKED IN</Text>
        </View>

        <Pressable
          onPress={handleClockInPress}
          disabled={clockIn.isPending || checkingGate || projects.length === 0}
          style={({ pressed }) => [
            styles.actionBtn,
            {
              backgroundColor: colors.success,
              opacity: clockIn.isPending || checkingGate || projects.length === 0 ? 0.6 : pressed ? 0.85 : 1,
              marginTop: spacing.md,
            },
          ]}
        >
          {clockIn.isPending || checkingGate ? (
            <ActivityIndicator size="small" color={colors.successForeground} />
          ) : (
            <>
              <Feather name="play" size={16} color={colors.successForeground} />
              <Text style={[typography.bodyMedium, { color: colors.successForeground }]}>Clock In</Text>
            </>
          )}
        </Pressable>

        {projects.length === 0 && (
          <Text style={[typography.caption, { color: colors.mutedForeground, marginTop: spacing.sm }]}>
            No projects assigned yet.
          </Text>
        )}
      </Card>

      <BottomSheet visible={pickerVisible} onClose={() => setPickerVisible(false)} title="Clock in to which project?">
        {projects.map((p) => (
          <ListRow key={p.id} title={p.name} subtitle={p.city ?? undefined} onPress={() => startClockIn(p.id)} />
        ))}
      </BottomSheet>
    </>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: spacing.xl, marginBottom: spacing.lg },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  dot: { width: 8, height: 8, borderRadius: 4 },
  projectBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.sm, maxWidth: 160 },
  lastClockOutRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    borderRadius: radius.md,
    paddingVertical: spacing.lg,
    marginTop: spacing.lg,
  },
});
