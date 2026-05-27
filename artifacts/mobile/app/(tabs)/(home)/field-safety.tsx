import {
  useListProjects,
  useCreateSafetySignoff,
  customFetch,
} from "@workspace/api-client-react";
import { useRouter } from "expo-router";
import React, { useState, useRef, useEffect } from "react";
import * as FileSystem from "expo-file-system/legacy";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  PanResponder,
  Dimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { Feather } from "@expo/vector-icons";
import Svg, { Path } from "react-native-svg";
import NetInfo from "@react-native-community/netinfo";
import { queueOffline, flushOfflineQueue } from "@/utils/offlineQueue";

const QUESTIONS = [
  "Did you inspect all PPE before starting work?",
  "Are all tools and equipment in safe working condition?",
  "Is the work area free of hazards and clearly marked?",
];

const CANVAS_W = Dimensions.get("window").width - 40;
const CANVAS_H = 160;

// ---------------------------------------------------------------------------
// Finite State Machine type
// ---------------------------------------------------------------------------
//
// The form submission lifecycle is modelled as a strict FSM with five states:
//
//   idle           – initial state; the user can fill in the form and submit.
//   submitting     – an upload or API call is in flight; the button is locked.
//   success        – the API accepted the submission; navigation happens next.
//   error          – the API rejected the submission with a server-side error.
//   offline_queued – no network (or timeout); the payload was queued locally.
//
// Valid transitions:
//   idle           → submitting   (user presses Submit)
//   submitting     → success      (mutateAsync resolves)
//   submitting     → error        (mutateAsync rejects with a server error)
//   submitting     → offline_queued (device offline or request timed out)
//   error          → submitting   (user retries)
//   offline_queued → submitting   (user retries after regaining connectivity)
//   success        → (component unmounts via router.back())
//
type FormState =
  | "idle"
  | "submitting"
  | "success"
  | "error"
  | "offline_queued";

// How long (ms) to wait for the API before treating the request as a timeout.
const SUBMIT_TIMEOUT_MS = 10_000;

function pointsToSvgPath(points: Array<{ x: number; y: number }>): string {
  if (points.length === 0) return "";
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    d += ` L ${points[i].x} ${points[i].y}`;
  }
  return d;
}

export default function FieldSafetyScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: projects = [] } = useListProjects();
  const [projectId, setProjectId] = useState<number | null>(null);
  const [answers, setAnswers] = useState<Record<number, "yes" | "no">>({});
  const [signaturePaths, setSignaturePaths] = useState<string[]>([]);
  const [currentPath, setCurrentPath] = useState<
    Array<{ x: number; y: number }>
  >([]);

  // Single FSM state replaces the old `uploading` + `pendingTimedOut` pair.
  // Starting in 'idle' – the form is ready for user input.
  const [formState, setFormState] = useState<FormState>("idle");

  // useCreateSafetySignoff is kept for its mutateAsync; onSuccess navigation
  // is now handled explicitly inside submit() after the FSM transitions to
  // 'success', so no mutation-level callback is needed here.
  const createSignoff = useCreateSafetySignoff();

  // ---------------------------------------------------------------------------
  // On mount: flush any safety forms that were queued while offline.
  //
  // We pass a wrapper that calls mutateAsync so the offline queue utility has
  // access to the API without knowing about React Query internals.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    flushOfflineQueue(async (data) => {
      // data is the raw payload that was passed to queueOffline().
      // It matches the shape expected by useCreateSafetySignoff exactly.
      await createSignoff.mutateAsync({ data });
    });
    // createSignoff.mutateAsync is stable across renders; omitting from deps
    // is intentional – we only want to flush once when the screen mounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleAnswer(index: number, value: "yes" | "no") {
    setAnswers((prev) => ({ ...prev, [index]: value }));
  }

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (_evt, _gestureState) => {
        setCurrentPath([]);
      },
      onPanResponderMove: (evt) => {
        const { locationX, locationY } = evt.nativeEvent;
        setCurrentPath((prev) => [...prev, { x: locationX, y: locationY }]);
      },
      onPanResponderRelease: () => {
        setCurrentPath((prev) => {
          if (prev.length > 1) {
            setSignaturePaths((sp) => [...sp, pointsToSvgPath(prev)]);
          }
          return [];
        });
      },
    })
  ).current;

  function buildSignatureSvg(): string {
    const all = [...signaturePaths];
    if (currentPath.length > 1) {
      all.push(pointsToSvgPath(currentPath));
    }
    if (all.length === 0) return "";
    const paths = all
      .map(
        (d) =>
          `<path d="${d}" fill="none" stroke="#000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`
      )
      .join("");
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS_W}" height="${CANVAS_H}" viewBox="0 0 ${CANVAS_W} ${CANVAS_H}">${paths}</svg>`;
  }

  async function uploadSignatureSvg(svg: string): Promise<string | null> {
    try {
      // Write SVG to a temp file so we can POST it as multipart/form-data
      const tmpFile = `${FileSystem.cacheDirectory}sig_${Date.now()}.svg`;
      await FileSystem.writeAsStringAsync(tmpFile, svg, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      const formData = new FormData();
      formData.append("file", {
        uri: tmpFile,
        name: `signature-${Date.now()}.svg`,
        type: "image/svg+xml",
      } as unknown as Blob);
      const { objectPath } = await customFetch<{ objectPath: string }>(
        "/api/storage/uploads/file",
        { method: "POST", body: formData }
      );
      await FileSystem.deleteAsync(tmpFile, { idempotent: true }).catch(
        () => {}
      );
      return objectPath;
    } catch {
      return null;
    }
  }

  // ---------------------------------------------------------------------------
  // submit() – drives the FSM through each state transition.
  // ---------------------------------------------------------------------------
  async function submit() {
    if (!projectId) return;

    // ── Transition: idle | error | offline_queued → submitting ──────────────
    // Lock the UI as soon as the user initiates a submission attempt.
    setFormState("submitting");

    // Build the SVG blob and upload it first (this is a precondition for the
    // API call, not an FSM state itself – if the upload fails we still proceed
    // with signatureUrl = null rather than aborting the whole submission).
    const svg = buildSignatureSvg();
    let signatureUrl: string | null = null;

    if (svg && signaturePaths.length > 0) {
      signatureUrl = await uploadSignatureSvg(svg);
      // uploadSignatureSvg already swallows its own errors (returns null).
    }

    const responses: Record<string, string> = {};
    QUESTIONS.forEach((q, i) => {
      responses[q] = answers[i] ?? "no";
    });

    const payload = { projectId, responses, signatureUrl };

    // ── Pre-flight connectivity check ────────────────────────────────────────
    // Check NetInfo before even attempting the API call.  If the device is
    // already offline we skip the round-trip entirely and go straight to
    // offline_queued.
    const netState = await NetInfo.fetch();
    if (!netState.isConnected) {
      // ── Transition: submitting → offline_queued (no connectivity) ──────────
      // Persist the payload so flushOfflineQueue can retry when reconnected.
      await queueOffline(payload);
      setFormState("offline_queued");
      return;
    }

    // ── API call with a hard timeout ─────────────────────────────────────────
    // Race the real mutation against a timeout promise.  Whichever settles
    // first determines the next state transition.
    try {
      await Promise.race([
        createSignoff.mutateAsync({ data: payload }),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error("timeout")),
            SUBMIT_TIMEOUT_MS
          )
        ),
      ]);

      // ── Transition: submitting → success ────────────────────────────────────
      // The API accepted the submission.  Navigate away immediately.
      setFormState("success");
      router.back();
    } catch (err) {
      // Distinguish between a network/timeout failure and a hard server error.
      const isTimeout =
        err instanceof Error && err.message === "timeout";

      // Re-check connectivity in case the network dropped mid-request.
      const netStateAfter = await NetInfo.fetch();
      const isOffline = !netStateAfter.isConnected;

      if (isTimeout || isOffline) {
        // ── Transition: submitting → offline_queued (timeout or loss of net) ──
        // The request could not complete.  Queue it for automatic retry.
        await queueOffline(payload);
        setFormState("offline_queued");
      } else {
        // ── Transition: submitting → error (server-side rejection) ─────────────
        // The server was reachable but returned an error (e.g. 400/500).
        // The user can read the error and retry from the idle-like error state.
        setFormState("error");
      }
    }
  }

  const allAnswered = QUESTIONS.every((_, i) => answers[i] !== undefined);
  const hasSignature = signaturePaths.length > 0 || currentPath.length > 0;

  // The button is disabled while a submission is in flight, after success
  // (navigating away), or when the payload is already queued offline.
  const isDisabled =
    !projectId ||
    !allAnswered ||
    !hasSignature ||
    formState === "submitting" ||
    formState === "success" ||
    formState === "offline_queued";

  // Map each FSM state to the label the user sees on the submit button.
  const submitLabel: Record<FormState, string> = {
    idle: "Complete Safety Check",
    submitting: "Submitting...",
    success: "Complete Safety Check",
    error: "Complete Safety Check",
    offline_queued: "Queued Offline",
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={{
          padding: 20,
          paddingTop: insets.top + 16,
          paddingBottom: 40,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
        >
          <Feather name="arrow-left" size={20} color={colors.foreground} />
          <Text style={[styles.backText, { color: colors.foreground }]}>
            Back
          </Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.foreground }]}>
          Morning Gatekeeper
        </Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          Answer all safety questions and sign before starting work.
        </Text>

        {/* Project selector */}
        <Text style={[styles.label, { color: colors.mutedForeground }]}>
          Project
        </Text>
        <View style={styles.chipRow}>
          {projects.map((p) => (
            <TouchableOpacity
              key={p.id}
              onPress={() => setProjectId(p.id)}
              style={[
                styles.chip,
                {
                  backgroundColor:
                    projectId === p.id ? colors.primary : colors.card,
                  borderColor:
                    projectId === p.id ? colors.primary : colors.border,
                },
              ]}
            >
              <Text
                style={[
                  styles.chipText,
                  {
                    color:
                      projectId === p.id ? "#fff" : colors.foreground,
                  },
                ]}
              >
                {p.name}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Questions */}
        <Text style={[styles.label, { color: colors.mutedForeground }]}>
          Safety Checklist
        </Text>
        {QUESTIONS.map((q, i) => (
          <View
            key={i}
            style={[
              styles.questionCard,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
              },
            ]}
          >
            <Text style={[styles.questionText, { color: colors.foreground }]}>
              {q}
            </Text>
            <View style={styles.answerRow}>
              <TouchableOpacity
                onPress={() => toggleAnswer(i, "yes")}
                style={[
                  styles.answerBtn,
                  {
                    backgroundColor:
                      answers[i] === "yes" ? "#22C55E" : "#eee",
                  },
                ]}
              >
                <Text
                  style={[
                    styles.answerText,
                    {
                      color: answers[i] === "yes" ? "#fff" : "#555",
                    },
                  ]}
                >
                  Yes
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => toggleAnswer(i, "no")}
                style={[
                  styles.answerBtn,
                  {
                    backgroundColor:
                      answers[i] === "no" ? "#EF4444" : "#eee",
                  },
                ]}
              >
                <Text
                  style={[
                    styles.answerText,
                    {
                      color: answers[i] === "no" ? "#fff" : "#555",
                    },
                  ]}
                >
                  No
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}

        {/* Signature canvas */}
        <Text style={[styles.label, { color: colors.mutedForeground }]}>
          Digital Signature
        </Text>
        <View
          style={[
            styles.signatureCanvas,
            {
              borderColor: hasSignature ? "#22C55E" : colors.border,
              backgroundColor: colors.card,
            },
          ]}
        >
          <View style={StyleSheet.absoluteFill} {...panResponder.panHandlers}>
            <Svg width={CANVAS_W} height={CANVAS_H}>
              {signaturePaths.map((d, i) => (
                <Path
                  key={`p-${i}`}
                  d={d}
                  fill="none"
                  stroke="#000"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ))}
              {currentPath.length > 1 && (
                <Path
                  d={pointsToSvgPath(currentPath)}
                  fill="none"
                  stroke="#000"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}
            </Svg>
          </View>
          {!hasSignature && (
            <View style={styles.canvasPlaceholder}>
              <Feather
                name="edit-3"
                size={24}
                color={colors.mutedForeground}
              />
              <Text
                style={[
                  styles.canvasPlaceholderText,
                  { color: colors.mutedForeground },
                ]}
              >
                Sign here
              </Text>
            </View>
          )}
        </View>
        {hasSignature && (
          <TouchableOpacity
            onPress={() => {
              setSignaturePaths([]);
              setCurrentPath([]);
            }}
            style={{ alignSelf: "flex-end", marginTop: 6 }}
          >
            <Text style={{ color: "#EF4444", fontSize: 13 }}>
              Clear signature
            </Text>
          </TouchableOpacity>
        )}

        {/* Submit */}
        <TouchableOpacity
          onPress={submit}
          disabled={isDisabled}
          style={[
            styles.submitBtn,
            {
              backgroundColor: isDisabled ? "#ccc" : colors.primary,
            },
          ]}
        >
          <Text style={styles.submitText}>{submitLabel[formState]}</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
  },
  backText: { fontSize: 14, fontFamily: "Inter_500Medium" },
  title: { fontSize: 28, fontFamily: "Inter_700Bold", marginBottom: 4 },
  subtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    marginBottom: 20,
  },
  label: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
    marginTop: 16,
  },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  chipText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  questionCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  questionText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    marginBottom: 10,
  },
  answerRow: { flexDirection: "row", gap: 10 },
  answerBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: "center",
  },
  answerText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  signatureCanvas: {
    width: CANVAS_W,
    height: CANVAS_H,
    borderWidth: 2,
    borderStyle: "dashed",
    borderRadius: 12,
    overflow: "hidden",
    justifyContent: "center",
    alignItems: "center",
  },
  canvasPlaceholder: {
    position: "absolute",
    alignItems: "center",
    gap: 6,
  },
  canvasPlaceholderText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  submitBtn: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 24,
  },
  submitText: {
    color: "#fff",
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
});
