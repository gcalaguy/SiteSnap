import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { CameraView, useCameraPermissions, useMicrophonePermissions } from "expo-camera";

const CYAN = "#06b6d4";
const RED = "#ef4444";

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

export default function ScanCameraScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [micPermission, requestMicPermission] = useMicrophonePermissions();
  const [isRecording, setIsRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [isStarting, setIsStarting] = useState(false);

  const cameraRef = useRef<CameraView>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const handleRequestPermissions = useCallback(async () => {
    const cam = await requestCameraPermission();
    const mic = await requestMicPermission();
    if (!cam.granted || !mic.granted) {
      Alert.alert(
        "Permissions required",
        "Camera and microphone access are needed to record a site scan.",
      );
    }
  }, [requestCameraPermission, requestMicPermission]);

  useEffect(() => {
    if (!cameraPermission?.granted || !micPermission?.granted) {
      handleRequestPermissions();
    }
  }, []);

  async function startRecording() {
    if (!cameraRef.current || isRecording || isStarting) return;
    setIsStarting(true);
    setElapsed(0);
    try {
      setIsRecording(true);
      setIsStarting(false);
      timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);

      const video = await cameraRef.current.recordAsync({ maxDuration: 300 });

      if (timerRef.current) clearInterval(timerRef.current);

      if (video?.uri) {
        router.navigate({
          pathname: "/site-scan" as any,
          params: { videoUri: video.uri, videoName: `site-scan-${Date.now()}.mp4` },
        });
      } else {
        router.back();
      }
    } catch {
      setIsRecording(false);
      setIsStarting(false);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  }

  function stopRecording() {
    cameraRef.current?.stopRecording();
    setIsRecording(false);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  if (!cameraPermission || !micPermission) {
    return (
      <View style={[styles.centered, { backgroundColor: "#000" }]}>
        <Text style={styles.permText}>Checking permissions…</Text>
      </View>
    );
  }

  if (!cameraPermission.granted || !micPermission.granted) {
    return (
      <View style={[styles.centered, { backgroundColor: "#000", padding: 32 }]}>
        <Feather name="camera-off" size={48} color={CYAN} style={{ marginBottom: 16 }} />
        <Text style={[styles.permText, { marginBottom: 8 }]}>Camera access required</Text>
        <Text style={[styles.permSub, { marginBottom: 24 }]}>
          Grant camera and microphone permissions to record a site scan.
        </Text>
        <Pressable style={styles.permBtn} onPress={handleRequestPermissions}>
          <Text style={styles.permBtnText}>Grant Permissions</Text>
        </Pressable>
        <Pressable style={[styles.cancelLink, { marginTop: 16 }]} onPress={() => router.back()}>
          <Text style={styles.cancelLinkText}>Cancel</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing="back"
        mode="video"
        videoQuality="720p"
      />

      {/* Top bar */}
      <View style={[styles.topBar, { paddingTop: Platform.OS === "web" ? 16 : insets.top + 8 }]}>
        <Pressable
          style={styles.cancelBtn}
          onPress={() => {
            if (isRecording) stopRecording();
            router.back();
          }}
          hitSlop={12}
        >
          <Feather name="x" size={22} color="#fff" />
        </Pressable>

        {isRecording && (
          <View style={styles.timerPill}>
            <View style={styles.recDot} />
            <Text style={styles.timerText}>{formatDuration(elapsed)}</Text>
          </View>
        )}

        <View style={{ width: 40 }} />
      </View>

      {/* Centre instruction (shown only when idle) */}
      {!isRecording && !isStarting && (
        <View style={styles.instructionWrap}>
          <View style={styles.instructionPill}>
            <Feather name="info" size={14} color={CYAN} />
            <Text style={styles.instructionText}>
              Slowly walk around the entire site. Keep the camera steady.
            </Text>
          </View>
        </View>
      )}

      {/* Bottom controls */}
      <View style={[styles.bottomBar, { paddingBottom: Platform.OS === "web" ? 24 : insets.bottom + 16 }]}>
        {isRecording ? (
          <Pressable style={styles.stopBtn} onPress={stopRecording}>
            <View style={styles.stopSquare} />
          </Pressable>
        ) : (
          <Pressable
            style={[styles.recordBtn, isStarting && { opacity: 0.6 }]}
            onPress={startRecording}
            disabled={isStarting}
          >
            <View style={styles.recordDot} />
          </Pressable>
        )}
        <Text style={styles.hintText}>
          {isRecording ? "Tap to stop recording" : isStarting ? "Starting…" : "Tap to start recording"}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },

  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  cancelBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center", justifyContent: "center",
  },
  timerPill: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: "rgba(0,0,0,0.55)", paddingHorizontal: 12,
    paddingVertical: 6, borderRadius: 20,
  },
  recDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: RED },
  timerText: { fontSize: 15, fontFamily: "Inter_700Bold", color: "#fff" },

  instructionWrap: {
    flex: 1, alignItems: "center", justifyContent: "flex-end", paddingBottom: 120,
  },
  instructionPill: {
    flexDirection: "row", alignItems: "flex-start", gap: 8,
    backgroundColor: "rgba(0,0,0,0.65)", paddingHorizontal: 16,
    paddingVertical: 10, borderRadius: 14, maxWidth: 300,
  },
  instructionText: {
    flex: 1, fontSize: 13, fontFamily: "Inter_400Regular",
    color: "#fff", lineHeight: 18,
  },

  bottomBar: {
    alignItems: "center", paddingTop: 16, gap: 10,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  recordBtn: {
    width: 72, height: 72, borderRadius: 36,
    borderWidth: 4, borderColor: "#fff",
    alignItems: "center", justifyContent: "center",
  },
  recordDot: { width: 48, height: 48, borderRadius: 24, backgroundColor: RED },
  stopBtn: {
    width: 72, height: 72, borderRadius: 36,
    borderWidth: 4, borderColor: "#fff",
    alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  stopSquare: { width: 28, height: 28, borderRadius: 4, backgroundColor: RED },
  hintText: { fontSize: 13, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.8)" },

  permText: { fontSize: 18, fontFamily: "Inter_700Bold", color: "#fff", textAlign: "center" },
  permSub: { fontSize: 14, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.7)", textAlign: "center" },
  permBtn: {
    backgroundColor: CYAN, paddingHorizontal: 28, paddingVertical: 14,
    borderRadius: 12,
  },
  permBtnText: { fontSize: 15, fontFamily: "Inter_700Bold", color: "#fff" },
  cancelLink: { padding: 8 },
  cancelLinkText: { fontSize: 14, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.6)" },
});
