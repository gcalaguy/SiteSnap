import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Feather } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import { customFetch } from "@workspace/api-client-react";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const CYAN = "#06b6d4";
const SCAN_MIME_TYPES = ["application/octet-stream", "*/*"];

type UploadStep = "idle" | "picking" | "uploading" | "registering" | "done" | "error";
type ScanMode = "choose" | "camera" | "file";

type ScanFile = {
  name: string;
  uri: string;
  size?: number;
  mimeType?: string;
  sourceType: "file" | "video_capture";
};

type ScanRecord = {
  id: number;
  objectPath: string;
  fileName: string;
  fileSizeBytes: number | null;
  sourceType: string;
  status: string;
  createdAt: string;
};

export default function SiteScanScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ videoUri?: string; videoName?: string }>();

  const [mode, setMode] = useState<ScanMode>("choose");
  const [step, setStep] = useState<UploadStep>("idle");
  const [pickedFile, setPickedFile] = useState<ScanFile | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [scan, setScan] = useState<ScanRecord | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const topInsets = Platform.OS === "web" ? 67 : insets.top;

  useEffect(() => {
    if (params.videoUri && params.videoUri !== "") {
      const uri = params.videoUri;
      const name = params.videoName ?? `site-scan-${Date.now()}.mp4`;
      setPickedFile({ name, uri, mimeType: "video/mp4", sourceType: "video_capture" });
      setMode("file");
      setStep("idle");
    }
  }, [params.videoUri, params.videoName]);

  async function handlePickFile() {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setStep("picking");
    setErrorMsg(null);

    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: SCAN_MIME_TYPES,
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (result.canceled || !result.assets?.[0]) {
        setStep("idle");
        return;
      }

      const asset = result.assets[0]!;
      const ext = (asset.name ?? "").toLowerCase();
      if (!ext.endsWith(".ply") && !ext.endsWith(".sog")) {
        Alert.alert("Unsupported file", "Please select a .ply or .sog 3D scan file.");
        setStep("idle");
        return;
      }

      setPickedFile({
        name: asset.name ?? "scan.ply",
        uri: asset.uri,
        size: asset.size,
        mimeType: asset.mimeType ?? "application/octet-stream",
        sourceType: "file",
      });
      setStep("idle");
    } catch {
      setErrorMsg("Failed to pick file. Please try again.");
      setStep("error");
    }
  }

  function handleOpenCamera() {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push("/scan-camera" as any);
  }

  async function handleUpload() {
    if (!pickedFile) return;
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setStep("uploading");
    setUploadProgress(0);
    setErrorMsg(null);

    try {
      const contentType = pickedFile.mimeType ?? "application/octet-stream";

      const { uploadURL, objectPath } = await customFetch<{
        uploadURL: string;
        objectPath: string;
        metadata: object;
      }>("/api/storage/uploads/request-url", {
        method: "POST",
        body: JSON.stringify({
          name: pickedFile.name,
          size: pickedFile.size ?? 0,
          contentType,
        }),
      });

      setUploadProgress(30);

      const fileResponse = await fetch(pickedFile.uri);
      const fileBlob = await fileResponse.blob();

      setUploadProgress(50);

      const uploadRes = await fetch(uploadURL, {
        method: "PUT",
        headers: { "Content-Type": contentType },
        body: fileBlob,
      });

      if (!uploadRes.ok) throw new Error(`Upload failed: ${uploadRes.status}`);

      setUploadProgress(80);
      setStep("registering");

      const created = await customFetch<ScanRecord>("/api/scans", {
        method: "POST",
        body: JSON.stringify({
          objectPath,
          fileName: pickedFile.name,
          fileSizeBytes: pickedFile.size,
          sourceType: pickedFile.sourceType,
        }),
      });

      setScan(created);
      setUploadProgress(100);
      setStep("done");
    } catch (e: any) {
      setErrorMsg(e?.message ?? "Upload failed. Please try again.");
      setStep("error");
    }
  }

  function handleGenerateEstimate() {
    if (!scan) return;
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push({ pathname: "/estimator", params: { scanId: String(scan.id), scanName: pickedFile?.name ?? "" } } as any);
  }

  function handleReset() {
    setMode("choose");
    setStep("idle");
    setPickedFile(null);
    setScan(null);
    setUploadProgress(0);
    setErrorMsg(null);
  }

  function formatBytes(b?: number | null): string {
    if (!b) return "Unknown size";
    if (b < 1024) return `${b} B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / (1024 * 1024)).toFixed(1)} MB`;
  }

  const isLoading = step === "picking" || step === "uploading" || step === "registering";
  const isVideoCapture = pickedFile?.sourceType === "video_capture";

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: topInsets + 8, backgroundColor: colors.sidebar }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>3D Site Scan</Text>
          <Text style={styles.headerSub}>Capture or upload a scan to generate an estimate</Text>
        </View>
        <View style={[styles.headerIcon, { backgroundColor: `${CYAN}22` }]}>
          <Feather name="box" size={20} color={CYAN} />
        </View>
      </View>

      <View style={styles.content}>

        {/* ── Mode chooser ── */}
        {mode === "choose" && step === "idle" && (
          <>
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
              How do you want to capture the scan?
            </Text>

            {/* Camera option */}
            {Platform.OS !== "web" ? (
              <TouchableOpacity
                style={[styles.modeCard, { backgroundColor: colors.card, borderColor: `${CYAN}40` }]}
                onPress={handleOpenCamera}
                activeOpacity={0.8}
              >
                <View style={[styles.modeIconWrap, { backgroundColor: `${CYAN}18` }]}>
                  <Feather name="video" size={26} color={CYAN} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.modeTitle, { color: colors.foreground }]}>Capture with Camera</Text>
                  <Text style={[styles.modeSub, { color: colors.mutedForeground }]}>
                    Record a walkthrough video of the site. Best for quick field scans.
                  </Text>
                </View>
                <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
              </TouchableOpacity>
            ) : (
              <View style={[styles.modeCard, { backgroundColor: colors.card, borderColor: colors.border, opacity: 0.5 }]}>
                <View style={[styles.modeIconWrap, { backgroundColor: `${CYAN}18` }]}>
                  <Feather name="video" size={26} color={CYAN} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.modeTitle, { color: colors.foreground }]}>Capture with Camera</Text>
                  <Text style={[styles.modeSub, { color: colors.mutedForeground }]}>
                    Available on the mobile app only.
                  </Text>
                </View>
              </View>
            )}

            {/* File upload option */}
            <TouchableOpacity
              style={[styles.modeCard, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => { setMode("file"); handlePickFile(); }}
              activeOpacity={0.8}
            >
              <View style={[styles.modeIconWrap, { backgroundColor: `${CYAN}18` }]}>
                <Feather name="upload-cloud" size={26} color={CYAN} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.modeTitle, { color: colors.foreground }]}>Upload Scan File</Text>
                <Text style={[styles.modeSub, { color: colors.mutedForeground }]}>
                  Import a <Text style={{ color: CYAN }}>.ply</Text> or <Text style={{ color: CYAN }}>.sog</Text> file from a dedicated 3D scanner.
                </Text>
              </View>
              <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
            </TouchableOpacity>
          </>
        )}

        {/* ── File / video ready to upload ── */}
        {(mode === "file" || mode === "camera") && step !== "done" && (
          <>
            {/* File info card */}
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.cardTitle, { color: colors.foreground }]}>
                {isVideoCapture ? "Recorded Video" : "Scan File"}
              </Text>

              {pickedFile ? (
                <View style={[styles.fileRow, { backgroundColor: `${CYAN}10`, borderColor: `${CYAN}30` }]}>
                  <View style={[styles.fileIcon, { backgroundColor: `${CYAN}20` }]}>
                    <Feather name={isVideoCapture ? "film" : "file"} size={20} color={CYAN} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.fileName, { color: colors.foreground }]} numberOfLines={1}>
                      {pickedFile.name}
                    </Text>
                    <Text style={[styles.fileMeta, { color: colors.mutedForeground }]}>
                      {isVideoCapture ? "Video · " : ""}{formatBytes(pickedFile.size)}
                    </Text>
                  </View>
                  {step === "idle" && !isVideoCapture && (
                    <TouchableOpacity onPress={handlePickFile} hitSlop={8}>
                      <Feather name="refresh-cw" size={16} color={colors.mutedForeground} />
                    </TouchableOpacity>
                  )}
                </View>
              ) : (
                <TouchableOpacity
                  style={[styles.pickBtn, { borderColor: colors.border }]}
                  onPress={handlePickFile}
                  disabled={isLoading}
                  activeOpacity={0.75}
                >
                  <Feather name="upload" size={24} color={colors.mutedForeground} style={{ marginBottom: 8 }} />
                  <Text style={[styles.pickLabel, { color: colors.mutedForeground }]}>
                    Tap to select a .ply or .sog file
                  </Text>
                </TouchableOpacity>
              )}

              {/* Processing note for video */}
              {isVideoCapture && step === "idle" && pickedFile && (
                <View style={[styles.infoBanner, { backgroundColor: `${CYAN}12`, borderColor: `${CYAN}30` }]}>
                  <Feather name="info" size={13} color={CYAN} />
                  <Text style={[styles.infoText, { color: colors.mutedForeground }]}>
                    The video will be uploaded and queued for 3D processing. You'll see a "Processing" badge until it's ready.
                  </Text>
                </View>
              )}

              {/* Progress bar */}
              {(step === "uploading" || step === "registering") && (
                <View style={styles.progressWrap}>
                  <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
                    <View style={[styles.progressFill, { width: `${uploadProgress}%` as any, backgroundColor: CYAN }]} />
                  </View>
                  <Text style={[styles.progressLabel, { color: colors.mutedForeground }]}>
                    {step === "uploading" ? `Uploading… ${uploadProgress}%` : "Registering scan…"}
                  </Text>
                </View>
              )}

              {/* Error */}
              {step === "error" && errorMsg && (
                <View style={[styles.errorRow, { backgroundColor: "#ef444415", borderColor: "#ef444430" }]}>
                  <Feather name="alert-circle" size={14} color="#ef4444" />
                  <Text style={styles.errorText}>{errorMsg}</Text>
                </View>
              )}
            </View>

            {/* Upload CTA */}
            <TouchableOpacity
              style={[
                styles.primaryBtn,
                { backgroundColor: pickedFile && !isLoading ? CYAN : colors.border },
              ]}
              onPress={handleUpload}
              disabled={!pickedFile || isLoading}
              activeOpacity={0.8}
            >
              {isLoading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Feather name="upload-cloud" size={18} color={pickedFile ? "#fff" : colors.mutedForeground} />
              )}
              <Text style={[styles.primaryBtnText, { color: pickedFile && !isLoading ? "#fff" : colors.mutedForeground }]}>
                {isLoading ? "Uploading…" : isVideoCapture ? "Upload Recording" : "Upload Scan"}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.secondaryBtn, { borderColor: colors.border }]}
              onPress={handleReset}
              disabled={isLoading}
              activeOpacity={0.75}
            >
              <Text style={[styles.secondaryBtnText, { color: colors.mutedForeground }]}>← Back</Text>
            </TouchableOpacity>
          </>
        )}

        {/* ── Done ── */}
        {step === "done" && scan && (
          <View style={styles.doneSection}>
            <View style={[styles.doneCard, { backgroundColor: `${CYAN}12`, borderColor: `${CYAN}30` }]}>
              <Feather name="check-circle" size={32} color={CYAN} style={{ marginBottom: 10 }} />
              <Text style={[styles.doneTitle, { color: colors.foreground }]}>
                {scan.status === "processing" ? "Video uploaded!" : "Scan uploaded!"}
              </Text>
              <Text style={[styles.doneSub, { color: colors.mutedForeground }]}>
                {scan.status === "processing"
                  ? "Your recording is queued for 3D processing."
                  : `Scan #${scan.id} — ${pickedFile?.name}`}
              </Text>
              {scan.status === "processing" && (
                <View style={[styles.processingBadge, { backgroundColor: "#f59e0b20", borderColor: "#f59e0b40" }]}>
                  <Feather name="clock" size={12} color="#f59e0b" />
                  <Text style={styles.processingBadgeText}>Processing</Text>
                </View>
              )}
            </View>

            {scan.status !== "processing" && (
              <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: CYAN }]}
                onPress={handleGenerateEstimate}
                activeOpacity={0.8}
              >
                <Feather name="bar-chart-2" size={18} color="#fff" />
                <Text style={styles.primaryBtnText}>Generate Estimate from Scan</Text>
                <Feather name="arrow-right" size={16} color="#fff" />
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[styles.secondaryBtn, { borderColor: colors.border }]}
              onPress={handleReset}
              activeOpacity={0.75}
            >
              <Text style={[styles.secondaryBtnText, { color: colors.mutedForeground }]}>Scan another site</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* How it works */}
        {mode === "choose" && (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, marginTop: 4 }]}>
            <Text style={[styles.cardTitle, { color: colors.foreground }]}>How it works</Text>
            {[
              { icon: "video", label: "Record a site walkthrough with your camera, or upload a .ply / .sog file" },
              { icon: "link", label: "The scan is securely stored and linked to your estimate" },
              { icon: "bar-chart-2", label: "Generate an estimate — pricing comes from the Pricing DB" },
              { icon: "monitor", label: "View the 3D scan alongside your estimate on the web dashboard" },
            ].map((item, i) => (
              <View key={i} style={styles.howRow}>
                <View style={[styles.howIcon, { backgroundColor: `${CYAN}18` }]}>
                  <Feather name={item.icon as any} size={14} color={CYAN} />
                </View>
                <Text style={[styles.howLabel, { color: colors.mutedForeground }]}>{item.label}</Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 20, fontFamily: "Inter_700Bold", color: "#fff" },
  headerSub: { fontSize: 12, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.55)", marginTop: 2 },
  headerIcon: { width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  content: { padding: 16, gap: 14 },

  sectionLabel: { fontSize: 13, fontFamily: "Inter_500Medium" },

  modeCard: {
    flexDirection: "row", alignItems: "center", gap: 14,
    borderRadius: 14, padding: 16, borderWidth: 1.5,
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 1,
  },
  modeIconWrap: { width: 48, height: 48, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  modeTitle: { fontSize: 15, fontFamily: "Inter_700Bold", marginBottom: 2 },
  modeSub: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 17 },

  infoBanner: {
    flexDirection: "row", alignItems: "flex-start", gap: 8,
    padding: 10, borderRadius: 8, borderWidth: 1,
  },
  infoText: { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 17 },

  card: {
    borderRadius: 14, padding: 16, borderWidth: 1, gap: 12,
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 1,
  },
  cardTitle: { fontSize: 15, fontFamily: "Inter_700Bold" },

  pickBtn: {
    borderWidth: 1.5, borderStyle: "dashed", borderRadius: 10,
    paddingVertical: 32, alignItems: "center", justifyContent: "center",
  },
  pickLabel: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },

  fileRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    padding: 12, borderRadius: 10, borderWidth: 1,
  },
  fileIcon: { width: 40, height: 40, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  fileName: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  fileMeta: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },

  progressWrap: { gap: 6 },
  progressTrack: { height: 4, borderRadius: 2, overflow: "hidden" },
  progressFill: { height: 4, borderRadius: 2 },
  progressLabel: { fontSize: 12, fontFamily: "Inter_400Regular" },

  errorRow: {
    flexDirection: "row", alignItems: "center", gap: 8,
    padding: 10, borderRadius: 8, borderWidth: 1,
  },
  errorText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", color: "#ef4444" },

  doneSection: { gap: 12 },
  doneCard: {
    alignItems: "center", padding: 24,
    borderRadius: 14, borderWidth: 1, gap: 6,
  },
  doneTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  doneSub: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center" },

  processingBadge: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 20, borderWidth: 1, marginTop: 8,
  },
  processingBadgeText: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: "#f59e0b" },

  primaryBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, paddingVertical: 16, borderRadius: 12,
  },
  primaryBtnText: { fontSize: 16, fontFamily: "Inter_700Bold", color: "#fff" },

  secondaryBtn: {
    alignItems: "center", paddingVertical: 14,
    borderRadius: 12, borderWidth: 1,
  },
  secondaryBtnText: { fontSize: 14, fontFamily: "Inter_500Medium" },

  howRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  howIcon: { width: 28, height: 28, borderRadius: 7, alignItems: "center", justifyContent: "center", marginTop: 2 },
  howLabel: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
});
