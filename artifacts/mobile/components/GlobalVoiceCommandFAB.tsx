import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import {
  useGetMe,
  useListProjects,
  useListTasks,
  useCreateDailyReport,
  useUpdateTask,
  useCreateRFI,
  customFetch,
} from "@workspace/api-client-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";
import { useVoiceRecorder } from "@/hooks/useVoiceRecorder";
import { useVoiceIntentExecutor } from "@/hooks/useVoiceIntentExecutor";
import { interpretVoiceCommand, type SingleAction, type VoiceIntent } from "@/src/utils/voiceRouter";

type FabState = "idle" | "recording" | "transcribing" | "result" | "error";

interface ResultLine {
  icon: string;
  label: string;
  detail: string;
  status: "ok" | "error" | "pending";
}

function fuzzyMatch(query: string, candidates: string[]): string | null {
  const q = query.toLowerCase();
  for (const c of candidates) {
    if (c.toLowerCase().includes(q)) return c;
  }
  return candidates.find((c) => q.includes(c.toLowerCase())) ?? null;
}

export function GlobalVoiceCommandFAB() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const { data: me } = useGetMe();
  const { data: projects } = useListProjects();
  const [open, setOpen] = useState(false);
  const [fabState, setFabState] = useState<FabState>("idle");
  const [transcript, setTranscript] = useState<string>("");
  const [results, setResults] = useState<ResultLine[]>([]);
  const [intent, setIntent] = useState<VoiceIntent | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const projectList = useMemo(
    () => (projects ?? []).map((p: any) => ({ id: p.id, name: p.name })),
    [projects]
  );

  // ── API mutations ──
  const createReport = useCreateDailyReport();
  const updateTask = useUpdateTask();
  const createRFI = useCreateRFI();

  const logHoursMutation = useMutation({
    mutationFn: async (body: { projectId: number; date: string; hours: number; description: string }) => {
      return customFetch(`/api/projects/${body.projectId}/time-entries`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: body.date, hours: body.hours, description: body.description }),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/timesheets"] });
    },
  });

  const logDelayMutation = useMutation({
    mutationFn: async (body: { projectId: number; workPerformed: string; reportDate: string }) => {
      return customFetch(`/api/projects/${body.projectId}/daily-reports`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workPerformed: body.workPerformed, reportDate: body.reportDate }),
      });
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["/api/projects", vars.projectId, "daily-reports"] });
    },
  });

  // ── Project resolution helpers ──
  const resolveProject = useCallback(
    (nameHint: string | null): { id: number; name: string } | null => {
      if (!nameHint) return null;
      const names = projectList.map((p) => p.name);
      const match = fuzzyMatch(nameHint, names);
      if (!match) return null;
      const proj = projectList.find((p) => p.name === match);
      return proj ?? null;
    },
    [projectList]
  );

  const askPickProject = useCallback(
    (onPick: (p: { id: number; name: string }) => void) => {
      if (!projectList.length) {
        Alert.alert("No projects", "You have no active projects to associate this command with.");
        return;
      }
      const options = projectList.map((p) => ({
        text: p.name,
        onPress: () => onPick(p),
      }));
      Alert.alert("Pick a project", "Which project is this for?", [...options, { text: "Cancel", style: "cancel" }]);
    },
    [projectList]
  );

  // ── Task resolution via query ──
  const [pendingTaskProjectId, setPendingTaskProjectId] = useState<number | null>(null);

  const { data: projectTasks } = useListTasks(
    pendingTaskProjectId ?? 0,
    { query: { queryKey: ["tasks", pendingTaskProjectId], enabled: pendingTaskProjectId !== null } }
  );

  // ── Voice callbacks ──
  const addResult = useCallback((icon: string, label: string, detail: string, status: ResultLine["status"]) => {
    setResults((prev) => [...prev, { icon, label, detail, status }]);
  }, []);

  const handleLogOwnHours = useCallback(
    async (action: Extract<SingleAction, { type: "LOG_OWN_HOURS" }>) => {
      const workerName = `${me?.firstName ?? ""} ${me?.lastName ?? ""}`.trim() || "Me";
      const proj = resolveProject(action.project);
      if (!proj) {
        addResult("clock", "Log hours", "Need project — pick below", "pending");
        askPickProject((p) => {
          logHoursMutation.mutate(
            { projectId: p.id, date: new Date().toISOString().split("T")[0], hours: action.hours, description: `${workerName} — via voice` },
            { onSuccess: () => addResult("check", "Log hours", `${action.hours}h logged`, "ok"), onError: () => addResult("x", "Log hours", "Failed", "error") }
          );
        });
        return;
      }
      logHoursMutation.mutate(
        { projectId: proj.id, date: new Date().toISOString().split("T")[0], hours: action.hours, description: `${workerName} — via voice` },
        { onSuccess: () => addResult("check", "Log hours", `${action.hours}h on ${proj.name}`, "ok"), onError: () => addResult("x", "Log hours", "Failed", "error") }
      );
    },
    [resolveProject, askPickProject, logHoursMutation, me, addResult]
  );

  const handleLogHours = useCallback(
    async (action: Extract<SingleAction, { type: "LOG_HOURS" }>) => {
      const proj = resolveProject(action.project);
      if (!proj) {
        addResult("clock", "Log hours", "Need project — pick below", "pending");
        askPickProject((p) => {
          logHoursMutation.mutate(
            { projectId: p.id, date: new Date().toISOString().split("T")[0], hours: action.hours, description: `${action.worker} — via voice` },
            { onSuccess: () => addResult("check", "Log hours", `${action.hours}h for ${action.worker}`, "ok"), onError: () => addResult("x", "Log hours", "Failed", "error") }
          );
        });
        return;
      }
      logHoursMutation.mutate(
        { projectId: proj.id, date: new Date().toISOString().split("T")[0], hours: action.hours, description: `${action.worker} — via voice` },
        { onSuccess: () => addResult("check", "Log hours", `${action.hours}h for ${action.worker}`, "ok"), onError: () => addResult("x", "Log hours", "Failed", "error") }
      );
    },
    [resolveProject, askPickProject, logHoursMutation, addResult]
  );

  const handleMarkTaskDone = useCallback(
    async (action: Extract<SingleAction, { type: "MARK_TASK_DONE" }>) => {
      const proj = resolveProject(action.project);
      if (!proj) {
        addResult("check-square", "Complete task", "Need project — pick below", "pending");
        askPickProject((p) => setPendingTaskProjectId(p.id));
        return;
      }
      setPendingTaskProjectId(proj.id);
    },
    [resolveProject, askPickProject, addResult]
  );

  // When tasks load after setting pendingTaskProjectId, try to find matching task
  useEffect(() => {
    if (!pendingTaskProjectId || !projectTasks) return;
    const tasks = Array.isArray(projectTasks) ? projectTasks : (projectTasks as any).data ?? [];
    if (!tasks.length) {
      addResult("x", "Complete task", "No tasks found", "error");
      setPendingTaskProjectId(null);
      return;
    }
    const taskName = intent && intent.intent === "SINGLE_ACTION" && intent.action.type === "MARK_TASK_DONE"
      ? intent.action.taskName
      : "";
    const match = fuzzyMatch(taskName, tasks.map((t: any) => t.title));
    const task = match ? tasks.find((t: any) => t.title === match) : null;
    if (!task) {
      addResult("x", "Complete task", `No task matching "${taskName}"`, "error");
      setPendingTaskProjectId(null);
      return;
    }
    updateTask.mutate(
      { projectId: pendingTaskProjectId, taskId: task.id, data: { status: "done" } },
      {
        onSuccess: () => {
          addResult("check", "Complete task", `"${task.title}" marked done`, "ok");
          setPendingTaskProjectId(null);
          qc.invalidateQueries({ queryKey: ["/api/projects", pendingTaskProjectId, "tasks"] });
        },
        onError: () => {
          addResult("x", "Complete task", "Failed to update", "error");
          setPendingTaskProjectId(null);
        },
      }
    );
  }, [pendingTaskProjectId, projectTasks, intent, updateTask, qc, addResult]);

  const handleLogDelay = useCallback(
    async (action: Extract<SingleAction, { type: "LOG_DELAY" }>) => {
      const proj = resolveProject(action.project);
      if (!proj) {
        addResult("alert-triangle", "Log delay", "Need project — pick below", "pending");
        askPickProject((p) => {
          logDelayMutation.mutate(
            { projectId: p.id, workPerformed: `${action.hours}h delay: ${action.reason}`, reportDate: new Date().toISOString().split("T")[0] },
            { onSuccess: () => addResult("check", "Log delay", `${action.hours}h delay logged`, "ok"), onError: () => addResult("x", "Log delay", "Failed", "error") }
          );
        });
        return;
      }
      logDelayMutation.mutate(
        { projectId: proj.id, workPerformed: `${action.hours}h delay: ${action.reason}`, reportDate: new Date().toISOString().split("T")[0] },
        { onSuccess: () => addResult("check", "Log delay", `${action.hours}h delay on ${proj.name}`, "ok"), onError: () => addResult("x", "Log delay", "Failed", "error") }
      );
    },
    [resolveProject, askPickProject, logDelayMutation, addResult]
  );

  const handleLogExpense = useCallback(
    async (action: Extract<SingleAction, { type: "LOG_EXPENSE" }>) => {
      // Expense logging is not yet backed by a dedicated mobile endpoint.
      addResult("dollar-sign", "Log expense", `Not yet implemented ($${action.amount} for ${action.description})`, "error");
    },
    [addResult]
  );

  const handleCreateRFI = useCallback(
    async (action: Extract<SingleAction, { type: "CREATE_RFI" }>) => {
      const proj = resolveProject(action.project);
      if (!proj) {
        addResult("message-square", "Create RFI", "Need project — pick below", "pending");
        askPickProject((p) => {
          createRFI.mutate(
            { projectId: p.id, data: { subject: action.subject, description: `Created via voice: ${action.subject}`, priority: "medium" } },
            { onSuccess: () => addResult("check", "Create RFI", `RFI created on ${p.name}`, "ok"), onError: () => addResult("x", "Create RFI", "Failed", "error") }
          );
        });
        return;
      }
      createRFI.mutate(
        { projectId: proj.id, data: { subject: action.subject, description: `Created via voice: ${action.subject}`, priority: "medium" } },
        { onSuccess: () => addResult("check", "Create RFI", `RFI created on ${proj.name}`, "ok"), onError: () => addResult("x", "Create RFI", "Failed", "error") }
      );
    },
    [resolveProject, askPickProject, createRFI, addResult]
  );

  const executor = useVoiceIntentExecutor({
    onLogHours: handleLogHours,
    onLogOwnHours: handleLogOwnHours,
    onMarkTaskDone: handleMarkTaskDone,
    onLogDelay: handleLogDelay,
    onLogExpense: handleLogExpense,
    onCreateRFI: handleCreateRFI,
    onMaterialAlert: ({ item }) => addResult("package", "Material alert", `Flagged: ${item}`, "ok"),
    onTriggerCamera: () => addResult("camera", "Photo", "Camera triggered", "ok"),
    onSafetyLog: ({ issue }) => addResult("alert-octagon", "Safety", issue, "ok"),
    onNavigate: (target) => {
      const pathMap: Record<string, string> = {
        Calculators: "/calculators",
        Schedule: "/schedule",
        Projects: "/",
        Ask: "/",
        Tasks: "/",
        Invoices: "/finance",
        Reports: "/",
      };
      if (pathMap[target]) {
        addResult("navigation", "Navigate", `Go to ${target}`, "ok");
        router.push(pathMap[target] as any);
      }
    },
    onAddNote: (payload) => addResult("file-text", "Note", payload.slice(0, 60), "ok"),
    onUnknown: (t) => addResult("help-circle", "Unrecognized", t.slice(0, 60), "error"),
  });

  // ── Voice recorder wiring ──
  const voice = useVoiceRecorder((text) => {
    setTranscript(text);
    setResults([]);
    setIntent(null);
    executor.execute(text, null);
  });

  useEffect(() => {
    if (voice.state === "recording") {
      setFabState("recording");
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.3, duration: 700, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
        ])
      ).start();
    } else if (voice.state === "transcribing") {
      setFabState("transcribing");
      pulseAnim.setValue(1);
    } else {
      pulseAnim.setValue(1);
    }
  }, [voice.state, pulseAnim]);

  useEffect(() => {
    if (executor.state === "executing" || executor.state === "done" || executor.state === "error") {
      setFabState(executor.state === "executing" ? "transcribing" : executor.state === "done" ? "result" : "error");
    }
  }, [executor.state]);

  useEffect(() => {
    if (executor.lastIntent) {
      setIntent(executor.lastIntent);
    }
  }, [executor.lastIntent]);

  // ── FAB open / close ──
  const handleToggle = useCallback(async () => {
    if (!open) {
      setOpen(true);
      setTranscript("");
      setResults([]);
      setIntent(null);
      setFabState("idle");
      await voice.toggle(); // starts recording
    } else {
      if (voice.state === "recording") {
        await voice.toggle(); // stops & transcribes
      } else {
        setOpen(false);
      }
    }
  }, [open, voice]);

  const handleClose = useCallback(() => {
    setOpen(false);
    setFabState("idle");
    setTranscript("");
    setResults([]);
    setIntent(null);
    executor.reset();
    pulseAnim.setValue(1);
  }, [executor, pulseAnim]);

  const bottomOffset = Platform.OS === "ios" ? insets.bottom + 70 : insets.bottom + 80;
  const isWeb = Platform.OS === "web";

  return (
    <>
      {/* ── Floating Action Button ── */}
      <View
        pointerEvents="box-none"
        style={[StyleSheet.absoluteFill, { justifyContent: "flex-end", alignItems: "center", zIndex: 50 }]}
      >
        <TouchableOpacity
          onPress={handleToggle}
          activeOpacity={0.85}
          style={{
            position: "absolute",
            bottom: bottomOffset,
            alignSelf: "center",
            width: 56,
            height: 56,
            borderRadius: 28,
            backgroundColor: voice.state === "recording" ? "#EF4444" : colors.primary,
            alignItems: "center",
            justifyContent: "center",
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.2,
            shadowRadius: 8,
            elevation: 6,
          }}
        >
          {voice.state === "transcribing" ? (
            <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
              <ActivityIndicator size="small" color="#FFFFFF" />
            </Animated.View>
          ) : (
            <Feather name={voice.state === "recording" ? "mic-off" : "mic"} size={24} color="#FFFFFF" />
          )}
        </TouchableOpacity>
      </View>

      {/* ── Bottom Sheet Overlay ── */}
      <Modal
        visible={open}
        transparent
        animationType="slide"
        onRequestClose={handleClose}
      >
        <View style={{ flex: 1, justifyContent: "flex-end" }}>
          <Pressable style={styles.backdrop} onPress={handleClose} />

          <View
            style={[
              styles.sheet,
              {
                backgroundColor: colors.background,
                borderColor: colors.border,
                paddingBottom: Math.max(insets.bottom, 20),
              },
            ]}
          >
            {/* Header */}
            <View style={styles.sheetHeader}>
              <Text style={[styles.sheetTitle, { color: colors.foreground }]}>
                {fabState === "idle"
                  ? "Tap the mic to speak"
                  : fabState === "recording"
                  ? "Listening..."
                  : fabState === "transcribing"
                  ? "Working on it..."
                  : fabState === "error"
                  ? "Couldn\u2019t understand"
                  : "Done"}
              </Text>
              <TouchableOpacity onPress={handleClose} hitSlop={8}>
                <Feather name="x" size={22} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>

            {/* Recording indicator */}
            {fabState === "recording" && (
              <View style={styles.recordingRow}>
                <Animated.View
                  style={[
                    styles.recordingDot,
                    { transform: [{ scale: pulseAnim }] },
                  ]}
                />
                <Text style={styles.recordingText}>Recording — tap to stop</Text>
              </View>
            )}

            {/* Transcript */}
            {!!transcript && (
              <View style={[styles.transcriptBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Feather name="message-circle" size={14} color={colors.primary} style={{ marginRight: 8 }} />
                <Text style={[styles.transcriptText, { color: colors.foreground }]} numberOfLines={3}>
                  {transcript}
                </Text>
              </View>
            )}

            {/* Results list */}
            {results.length > 0 && (
              <View style={{ gap: 8, marginTop: 12 }}>
                {results.map((r, i) => (
                  <View
                    key={i}
                    style={[
                      styles.resultRow,
                      {
                        backgroundColor:
                          r.status === "ok"
                            ? "#DCFCE7"
                            : r.status === "error"
                            ? "#FEF2F2"
                            : `${colors.primary}10`,
                        borderColor:
                          r.status === "ok" ? "#22C55E" : r.status === "error" ? "#EF4444" : colors.border,
                      },
                    ]}
                  >
                    <Feather
                      name={r.icon as any}
                      size={16}
                      color={r.status === "ok" ? "#22C55E" : r.status === "error" ? "#EF4444" : colors.primary}
                      style={{ marginRight: 10 }}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.resultLabel, { color: colors.foreground }]}>{r.label}</Text>
                      <Text style={[styles.resultDetail, { color: colors.mutedForeground }]}>{r.detail}</Text>
                    </View>
                    {r.status === "ok" && <Feather name="check" size={16} color="#22C55E" />}
                    {r.status === "error" && <Feather name="alert-circle" size={16} color="#EF4444" />}
                  </View>
                ))}
              </View>
            )}

            {/* Hint chips */}
            {fabState === "idle" && (
              <View style={styles.hintGrid}>
                {HINTS.map((h, i) => (
                  <TouchableOpacity
                    key={i}
                    onPress={() => {
                      setTranscript(h.text);
                      setResults([]);
                      setIntent(null);
                      executor.execute(h.text, null);
                    }}
                    style={[styles.hintChip, { backgroundColor: `${colors.primary}10`, borderColor: `${colors.primary}30` }]}
                  >
                    <Feather name={h.icon as any} size={12} color={colors.primary} style={{ marginRight: 6 }} />
                    <Text style={[styles.hintText, { color: colors.primary }]}>{h.text}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Primary action button inside sheet */}
            {fabState !== "idle" && (
              <TouchableOpacity
                onPress={handleToggle}
                style={[
                  styles.sheetActionBtn,
                  {
                    backgroundColor: fabState === "recording" ? "#EF4444" : colors.primary,
                  },
                ]}
              >
                <Feather
                  name={fabState === "recording" ? "mic-off" : fabState === "transcribing" ? "loader" : "mic"}
                  size={18}
                  color="#FFFFFF"
                />
                <Text style={styles.sheetActionText}>
                  {fabState === "recording"
                    ? "Stop & transcribe"
                    : fabState === "transcribing"
                    ? "Processing..."
                    : "Tap to speak again"}
                </Text>
              </TouchableOpacity>
            )}

            {voice.error && (
              <Text style={[styles.errorText, { color: colors.destructive }]}>{voice.error}</Text>
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}

// ── Missing ActivityIndicator import fix ──
// We need ActivityIndicator imported. Let me add it to the imports at the top of the file.
// Actually I already included it. Let me double-check...

const HINTS = [
  { text: "I worked 5 hours on Oak Street", icon: "clock" },
  { text: "Mark framing inspection as complete", icon: "check-square" },
  { text: "Log 2h weather delay on Main Street", icon: "alert-triangle" },
  { text: "Create RFI about beam size", icon: "message-square" },
  { text: "We are short on 2x4 studs", icon: "package" },
  { text: "Take a photo of the foundation", icon: "camera" },
];

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    paddingHorizontal: 20,
    paddingTop: 16,
    gap: 10,
    minHeight: 320,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  sheetTitle: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },
  recordingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#FEF2F2",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#FECACA",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  recordingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#DC2626",
  },
  recordingText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: "#DC2626",
  },
  transcriptBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    marginTop: 4,
  },
  transcriptText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    flex: 1,
    lineHeight: 20,
  },
  resultRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  resultLabel: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  resultDetail: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  hintGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 8,
  },
  hintChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 12,
    borderWidth: 1,
  },
  hintText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  sheetActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 8,
  },
  sheetActionText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: "#FFFFFF",
  },
  errorText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    marginTop: 4,
  },
});
