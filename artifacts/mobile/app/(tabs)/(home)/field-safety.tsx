import {
  useListProjects,
  useCreateSafetySignoff,
  customFetch,
} from "@workspace/api-client-react";
import { useRouter } from "expo-router";
import React, { useState, useRef } from "react";
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

const QUESTIONS = [
  "Did you inspect all PPE before starting work?",
  "Are all tools and equipment in safe working condition?",
  "Is the work area free of hazards and clearly marked?",
];

const CANVAS_W = Dimensions.get("window").width - 40;
const CANVAS_H = 160;

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
  const [currentPath, setCurrentPath] = useState<Array<{ x: number; y: number }>>([]);
  const [uploading, setUploading] = useState(false);

  const createSignoff = useCreateSafetySignoff({
    mutation: {
      onSuccess: () => router.back(),
    },
  });

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
    }),
  ).current;

  function buildSignatureSvg(): string {
    const all = [...signaturePaths];
    if (currentPath.length > 1) {
      all.push(pointsToSvgPath(currentPath));
    }
    if (all.length === 0) return "";
    const paths = all
      .map((d) => `<path d="${d}" fill="none" stroke="#000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`)
      .join("");
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS_W}" height="${CANVAS_H}" viewBox="0 0 ${CANVAS_W} ${CANVAS_H}">${paths}</svg>`;
  }

  async function uploadSignatureSvg(svg: string): Promise<string | null> {
    try {
      const { uploadURL, objectPath } = await customFetch<{
        uploadURL: string;
        objectPath: string;
      }>("/api/storage/uploads/request-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `signature-${Date.now()}.svg`,
          size: svg.length,
          contentType: "image/svg+xml",
        }),
      });

      // Write SVG to a temp file then upload via expo-file-system
      const tmpFile = `${FileSystem.cacheDirectory}sig_${Date.now()}.svg`;
      await FileSystem.writeAsStringAsync(tmpFile, svg, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      const uploadRes = await FileSystem.uploadAsync(uploadURL, tmpFile, {
        httpMethod: "PUT",
        uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
        headers: { "Content-Type": "image/svg+xml" },
      });
      // Clean up temp file
      await FileSystem.deleteAsync(tmpFile, { idempotent: true }).catch(() => {});
      if (uploadRes.status >= 400) throw new Error("Upload failed");
      return objectPath;
    } catch {
      return null;
    }
  }

  async function submit() {
    if (!projectId) return;
    const svg = buildSignatureSvg();
    let signatureUrl: string | null = null;

    if (svg && signaturePaths.length > 0) {
      setUploading(true);
      signatureUrl = await uploadSignatureSvg(svg);
      setUploading(false);
    }

    const responses: Record<string, string> = {};
    QUESTIONS.forEach((q, i) => {
      responses[q] = answers[i] ?? "no";
    });

    createSignoff.mutate({
      data: {
        projectId,
        responses,
        signatureUrl,
      },
    });
  }

  const allAnswered = QUESTIONS.every((_, i) => answers[i] !== undefined);
  const hasSignature = signaturePaths.length > 0 || currentPath.length > 0;

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
          disabled={
            !projectId || !allAnswered || !hasSignature || uploading || createSignoff.isPending
          }
          style={[
            styles.submitBtn,
            {
              backgroundColor:
                !projectId || !allAnswered || !hasSignature || uploading || createSignoff.isPending
                  ? "#ccc"
                  : colors.primary,
            },
          ]}
        >
          <Text style={styles.submitText}>
            {uploading
              ? "Uploading..."
              : createSignoff.isPending
                ? "Submitting..."
                : "Complete Safety Check"}
          </Text>
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
