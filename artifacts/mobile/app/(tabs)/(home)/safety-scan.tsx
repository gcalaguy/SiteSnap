import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as Location from "expo-location";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useListProjects, customFetch } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { GpsLockedBanner, type GpsLockInfo } from "@/components/GpsLockedBanner";
import { compressPhoto } from "@/utils/compressPhoto";
import { withAiRetry } from "@/src/utils/aiRetry";
import { getAiErrorMessage } from "@/src/utils/aiError";
import { ScreenErrorBoundary } from "@/components/ScreenErrorBoundary";

const MAX_PHOTOS = 8;

interface PhotoItem {
  uri: string;
  mimeType: string;
  fileName: string;
  fileSize: number;
}

interface GpsState {
  lat: number;
  lng: number;
  altitude: number | null;
  accuracyM: number | null;
  capturedAtUtc: string;
  timezone: string;
}

export default function SafetyScanCaptureScreen() {
  return (
    <ScreenErrorBoundary>
      <SafetyScanCaptureScreenInner />
    </ScreenErrorBoundary>
  );
}

function SafetyScanCaptureScreenInner() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: projects = [] } = useListProjects();

  const [projectId, setProjectId] = useState<number | null>(null);
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [gps, setGps] = useState<GpsState | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsDenied, setGpsDenied] = useState(false);
  const [siteAddress, setSiteAddress] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [compressing, setCompressing] = useState(false);

  async function lockGps() {
    setGpsLoading(true);
    setGpsDenied(false);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setGpsDenied(true);
        return;
      }
      const servicesEnabled = await Location.hasServicesEnabledAsync();
      if (!servicesEnabled) {
        setGpsDenied(true);
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const { latitude, longitude, altitude, accuracy } = pos.coords;
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

      let address: string | null = null;
      try {
        const geo = await Location.reverseGeocodeAsync({ latitude, longitude });
        const g = geo[0];
        if (g) {
          address = [g.streetNumber, g.street].filter(Boolean).join(" ") || g.name || null;
          if (g.city) address = address ? `${address}, ${g.city}` : g.city;
        }
      } catch {
        // Reverse geocoding is best-effort — GPS coordinates alone still satisfy the audit trail.
      }

      setGps({
        lat: latitude,
        lng: longitude,
        altitude: altitude ?? null,
        accuracyM: accuracy ?? null,
        capturedAtUtc: new Date().toISOString(),
        timezone,
      });
      setSiteAddress(address);
    } catch {
      // Location services can fail unexpectedly (e.g. disabled mid-request) — the
      // scan must still be allowed to proceed without a GPS tag.
      setGpsDenied(true);
    } finally {
      setGpsLoading(false);
    }
  }

  async function handlePickResult(result: ImagePicker.ImagePickerResult) {
    if (result.canceled || result.assets.length === 0) return;
    setCompressing(true);
    try {
      const newPhotos: PhotoItem[] = await Promise.all(
        result.assets.map(async (a) => {
          const compressed = await compressPhoto(a.uri, { mimeType: a.mimeType, fileSize: a.fileSize });
          return {
            uri: compressed.uri,
            mimeType: compressed.mimeType,
            fileName: a.fileName ?? `safety-scan-${Date.now()}.jpg`,
            fileSize: compressed.fileSize,
          };
        }),
      );
      setPhotos((prev) => [...prev, ...newPhotos].slice(0, MAX_PHOTOS));
      if (!gps && !gpsLoading) lockGps();
    } finally {
      setCompressing(false);
    }
  }

  async function takePhoto() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Camera access is required to take a photo.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.8 });
    handlePickResult(result);
  }

  async function chooseFromLibrary() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Photo library access is required.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.8,
      allowsMultipleSelection: true,
      selectionLimit: MAX_PHOTOS - photos.length,
    });
    handlePickResult(result);
  }

  function pickImage() {
    Alert.alert("Add Site Photos", "Choose a source", [
      { text: "Take Photo", onPress: takePhoto },
      { text: "Choose from Library", onPress: chooseFromLibrary },
      { text: "Cancel", style: "cancel" },
    ]);
  }

  function removePhoto(index: number) {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  }

  async function uploadOne(photo: PhotoItem): Promise<string> {
    return withAiRetry(async () => {
      const { uploadURL, objectPath } = await customFetch<{ uploadURL: string; objectPath: string }>(
        "/api/storage/uploads/request-url",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: photo.fileName, size: photo.fileSize, contentType: photo.mimeType }),
        },
      );
      const dest = new URL(uploadURL);
      if (!dest.protocol.startsWith("https")) throw new Error("Unexpected upload destination");
      const result = await FileSystem.uploadAsync(uploadURL, photo.uri, {
        httpMethod: "PUT",
        uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
        headers: { "Content-Type": photo.mimeType },
      });
      if (result.status < 200 || result.status >= 300) throw new Error(`Upload failed: ${result.status}`);
      return objectPath;
    });
  }

  async function submit() {
    if (!projectId || photos.length === 0) return;
    setSubmitting(true);
    try {
      const objectPaths = await Promise.all(photos.map(uploadOne));
      const scan = await customFetch<{ id: number }>("/api/safety/scans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          objectPaths,
          gps: gps ?? undefined,
          siteAddress: siteAddress ?? undefined,
        }),
      });
      router.replace({ pathname: "/(tabs)/(home)/safety-scan-results", params: { id: String(scan.id) } });
    } catch (err) {
      Alert.alert("Scan Failed", getAiErrorMessage(err, "Could not analyze the photos. Please try again."));
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit = !!projectId && photos.length > 0 && !gpsLoading && !submitting && !compressing;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: insets.top + 16, paddingBottom: 40 }}>
        <View style={styles.topRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Feather name="arrow-left" size={20} color={colors.foreground} />
            <Text style={[styles.backText, { color: colors.foreground }]}>Back</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => router.push("/(tabs)/(home)/safety-scan-history")}
            style={styles.historyBtn}
          >
            <Feather name="clock" size={16} color={colors.primary} />
            <Text style={[styles.historyText, { color: colors.primary }]}>History</Text>
          </TouchableOpacity>
        </View>

        <Text style={[styles.title, { color: colors.foreground }]}>AI Safety Scan</Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          Capture site photos for GPS-tagged PPE & hazard analysis.
        </Text>

        <Text style={[styles.label, { color: colors.mutedForeground }]}>Project</Text>
        <View style={styles.chipRow}>
          {projects.map((p) => (
            <TouchableOpacity
              key={p.id}
              onPress={() => setProjectId(p.id)}
              style={[
                styles.chip,
                {
                  backgroundColor: projectId === p.id ? colors.primary : colors.card,
                  borderColor: projectId === p.id ? colors.primary : colors.border,
                },
              ]}
            >
              <Text style={[styles.chipText, { color: projectId === p.id ? "#fff" : colors.foreground }]}>
                {p.name}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={[styles.label, { color: colors.mutedForeground }]}>
          Photos ({photos.length}/{MAX_PHOTOS})
        </Text>
        <View style={styles.photoGrid}>
          {photos.map((p, i) => (
            <View key={i} style={styles.photoThumbWrap}>
              <Image source={{ uri: p.uri }} style={styles.photoThumb} />
              <TouchableOpacity
                onPress={() => removePhoto(i)}
                style={[styles.removeBtn, { backgroundColor: colors.destructive }]}
              >
                <Feather name="x" size={12} color="#fff" />
              </TouchableOpacity>
            </View>
          ))}
          {compressing ? (
            <View style={[styles.addPhotoBox, { borderColor: colors.border }]}>
              <ActivityIndicator color={colors.mutedForeground} size="small" />
            </View>
          ) : photos.length < MAX_PHOTOS ? (
            <TouchableOpacity onPress={pickImage} style={[styles.addPhotoBox, { borderColor: colors.border }]}>
              <Feather name="camera" size={22} color={colors.mutedForeground} />
            </TouchableOpacity>
          ) : null}
        </View>

        {photos.length > 0 ? (
          <View style={{ marginTop: 12 }}>
            <GpsLockedBanner
              loading={gpsLoading}
              denied={gpsDenied}
              info={gps ? { siteAddress, capturedAt: new Date(gps.capturedAtUtc), timezone: gps.timezone } : null}
            />
          </View>
        ) : null}

        <TouchableOpacity
          onPress={submit}
          disabled={!canSubmit}
          style={[styles.submitBtn, { backgroundColor: canSubmit ? colors.primary : "#ccc" }]}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.submitText}>Run AI Safety Scan</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  backBtn: { flexDirection: "row", alignItems: "center", gap: 6 },
  backText: { fontSize: 14, fontFamily: "NunitoSans_500Medium" },
  historyBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 6, paddingHorizontal: 10 },
  historyText: { fontSize: 14, fontFamily: "NunitoSans_500Medium" },
  title: { fontSize: 28, fontFamily: "NunitoSans_700Bold", marginBottom: 4 },
  subtitle: { fontSize: 14, fontFamily: "NunitoSans_400Regular", marginBottom: 20 },
  label: {
    fontSize: 12,
    fontFamily: "NunitoSans_600SemiBold",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
    marginTop: 16,
  },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 16, borderWidth: 1 },
  chipText: { fontSize: 13, fontFamily: "NunitoSans_500Medium" },
  photoGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  photoThumbWrap: { width: 90, height: 90, borderRadius: 16, overflow: "hidden" },
  photoThumb: { width: "100%", height: "100%" },
  removeBtn: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  addPhotoBox: {
    width: 90,
    height: 90,
    borderRadius: 16,
    borderWidth: 2,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
  },
  submitBtn: { paddingVertical: 14, borderRadius: 16, alignItems: "center", marginTop: 28 },
  submitText: { color: "#fff", fontSize: 15, fontFamily: "NunitoSans_600SemiBold" },
});
