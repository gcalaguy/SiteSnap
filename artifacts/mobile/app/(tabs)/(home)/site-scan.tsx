import React, { useState } from "react";
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
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import { customFetch } from "@workspace/api-client-react";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const CYAN = "#06b6d4";
const SCAN_MIME_TYPES = ["application/octet-stream", "*/*"];

type UploadStep = "idle" | "picking" | "uploading" | "registering" | "done" | "error";

type ScanFile = {
  name: string;
  uri: string;
  size?: number;
  mimeType?: string;
};

type ScanRecord = {
  id: number;
  objectPath: string;
  fileName: string;
  fileSizeBytes: number | null;
  createdAt: string;
};

export default function SiteScanScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [step, setStep] = useState<UploadStep>("idle");
  const [pickedFile, setPickedFile] = useState<ScanFile | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [scan, setScan] = useState<ScanRecord | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const topInsets = Platform.OS === "web" ? 67 : insets.top;

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
        Alert.alert(
          "Unsupported file",
          "Please select a .ply or .sog 3D scan file.",
        );
        setStep("idle");
        return;
      }

      setPickedFile({
        name: asset.name ?? "scan.ply",
        uri: asset.uri,
        size: asset.size,
        mimeType: asset.mimeType ?? "application/octet-stream",
      });
      setStep("idle");
    } catch (e: any) {
      setErrorMsg("Failed to pick file. Please try again.");
      setStep("error");
    }
  }

  async function handleUpload() {
    if (!pickedFile) return;
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setStep("uploading");
    setUploadProgress(0);
    setErrorMsg(null);

    try {
      // 1. Request a presigned upload URL
      const { uploadURL, objectPath } = await customFetch<{
        uploadURL: string;
        objectPath: string;
        metadata: object;
      }>("/api/storage/uploads/request-url", {
        method: "POST",
        body: JSON.stringify({
          name: pickedFile.name,
          size: pickedFile.size ?? 0,
          contentType: pickedFile.mimeType ?? "application/octet-stream",
        }),
      });

      setUploadProgress(30);

      // 2. Upload the file directly to cloud storage
      const fileResponse = await fetch(pickedFile.uri);
      const fileBlob = await fileResponse.blob();

      setUploadProgress(50);

      const uploadRes = await fetch(uploadURL, {
        method: "PUT",
        headers: { "Content-Type": pickedFile.mimeType ?? "application/octet-stream" },
        body: fileBlob,
      });

      if (!uploadRes.ok) {
        throw new Error(`Upload failed: ${uploadRes.status}`);
      }

      setUploadProgress(80);
      setStep("registering");

      // 3. Register the scan record in our DB
      const created = await customFetch<ScanRecord>("/api/scans", {
        method: "POST",
        body: JSON.stringify({
          objectPath,
          fileName: pickedFile.name,
          fileSizeBytes: pickedFile.size,
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

  function formatBytes(b?: number | null): string {
    if (!b) return "Unknown size";
    if (b < 1024) return `${b} B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / (1024 * 1024)).toFixed(1)} MB`;
  }

  const isLoading = step === "picking" || step === "uploading" || step === "registering";

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
          <Text style={styles.headerSub}>Upload a scan file to generate an estimate</Text>
        </View>
        <View style={[styles.headerIcon, { backgroundColor: `${CYAN}22` }]}>
          <Feather name="box" size={20} color={CYAN} />
        </View>
      </View>

      <View style={styles.content}>
        {/* Info banner */}
        <View style={[styles.infoBanner, { backgroundColor: `${CYAN}12`, borderColor: `${CYAN}30` }]}>
          <Feather name="info" size={14} color={CYAN} />
          <Text style={[styles.infoText, { color: colors.mutedForeground }]}>
            Upload a <Text style={{ color: CYAN, fontFamily: "Inter_600SemiBold" }}>.ply</Text> or{" "}
            <Text style={{ color: CYAN, fontFamily: "Inter_600SemiBold" }}>.sog</Text> file from a 3D scanner. The scan ID will be attached to the estimate you generate.
          </Text>
        </View>

        {/* File picker card */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>Scan File</Text>

          {pickedFile ? (
            <View style={[styles.fileRow, { backgroundColor: `${CYAN}10`, borderColor: `${CYAN}30` }]}>
              <View style={[styles.fileIcon, { backgroundColor: `${CYAN}20` }]}>
                <Feather name="file" size={20} color={CYAN} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.fileName, { color: colors.foreground }]} numberOfLines={1}>
                  {pickedFile.name}
                </Text>
                <Text style={[styles.fileMeta, { color: colors.mutedForeground }]}>
                  {formatBytes(pickedFile.size)}
                </Text>
              </View>
              {step === "idle" && (
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
              <Text style={[styles.pickLabel, { color: colors.mutedForeground }]}>Tap to select a .ply or .sog file</Text>
            </TouchableOpacity>
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

        {/* Upload / Done CTA */}
        {step === "done" && scan ? (
          <View style={styles.doneSection}>
            <View style={[styles.doneCard, { backgroundColor: `${CYAN}12`, borderColor: `${CYAN}30` }]}>
              <Feather name="check-circle" size={28} color={CYAN} style={{ marginBottom: 8 }} />
              <Text style={[styles.doneTitle, { color: colors.foreground }]}>Scan uploaded!</Text>
              <Text style={[styles.doneSub, { color: colors.mutedForeground }]}>
                Scan #{scan.id} — {pickedFile?.name}
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: CYAN }]}
              onPress={handleGenerateEstimate}
              activeOpacity={0.8}
            >
              <Feather name="bar-chart-2" size={18} color="#fff" />
              <Text style={styles.primaryBtnText}>Generate Estimate from Scan</Text>
              <Feather name="arrow-right" size={16} color="#fff" />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.secondaryBtn, { borderColor: colors.border }]}
              onPress={() => {
                setStep("idle");
                setPickedFile(null);
                setScan(null);
                setUploadProgress(0);
              }}
              activeOpacity={0.75}
            >
              <Text style={[styles.secondaryBtnText, { color: colors.mutedForeground }]}>Upload another scan</Text>
            </TouchableOpacity>
          </View>
        ) : (
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
              {isLoading ? "Uploading…" : "Upload Scan"}
            </Text>
          </TouchableOpacity>
        )}

        {/* How it works */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, marginTop: 8 }]}>
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>How it works</Text>
          {[
            { icon: "upload-cloud", label: "Upload a .ply or .sog scan file from your 3D scanner" },
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

  infoBanner: {
    flexDirection: "row", alignItems: "flex-start", gap: 10,
    padding: 12, borderRadius: 10, borderWidth: 1,
  },
  infoText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },

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
    borderRadius: 14, borderWidth: 1,
  },
  doneTitle: { fontSize: 18, fontFamily: "Inter_700Bold", marginBottom: 4 },
  doneSub: { fontSize: 13, fontFamily: "Inter_400Regular" },

  primaryBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, paddingVertical: 16, borderRadius: 12,
  },
  primaryBtnText: { fontSize: 16, fontFamily: "Inter_700Bold" },

  secondaryBtn: {
    alignItems: "center", paddingVertical: 14,
    borderRadius: 12, borderWidth: 1,
  },
  secondaryBtnText: { fontSize: 14, fontFamily: "Inter_500Medium" },

  howRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  howIcon: { width: 28, height: 28, borderRadius: 7, alignItems: "center", justifyContent: "center", marginTop: 2 },
  howLabel: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
});
