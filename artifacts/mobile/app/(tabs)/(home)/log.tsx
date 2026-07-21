import {
  useListProjects,
  useCreateDailyReport,
  useGenerateDailyReportAI,
  useAddReportPhoto,
  useGetMe,
  customFetch,
} from "@workspace/api-client-react";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import * as FileSystem from "expo-file-system/legacy";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { useVoiceRecorder } from "@/hooks/useVoiceRecorder";
import { useOfflineQueue, type QueuePhoto } from "@/context/OfflineQueueContext";
import { useFormDraft, clearFormDraft } from "@/hooks/useFormDraft";
import { DraftBanner } from "@/components/DraftBanner";
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { Feather } from "@expo/vector-icons";

const today = () => new Date().toISOString().split("T")[0];
const MAX_PHOTOS = 6;

interface PhotoItem extends QueuePhoto {
  uploading?: boolean;
}

const PHOTO_CATEGORIES: { value: NonNullable<QueuePhoto["category"]>; label: string }[] = [
  { value: "progress", label: "Progress" },
  { value: "issue", label: "Issue" },
  { value: "site_condition", label: "Site" },
];

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 20 },
  backBtn: { marginBottom: 8, alignSelf: "flex-start" },
  title: { fontSize: 28, fontFamily: "Inter_700Bold" },
  subtitle: { fontSize: 14, fontFamily: "Inter_400Regular", marginTop: 4 },
  section: { paddingHorizontal: 20, marginBottom: 20 },
  label: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  projectList: { gap: 8 },
  projectChip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  projectChipText: { fontSize: 14, fontFamily: "Inter_500Medium", flex: 1 },
  row: { flexDirection: "row", gap: 12 },
  inputBox: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    flex: 1,
  },
  textArea: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    minHeight: 100,
    textAlignVertical: "top",
  },
  aiBox: {
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: "dashed",
    padding: 16,
    minHeight: 80,
  },
  aiText: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 22 },
  aiButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    marginTop: 10,
    justifyContent: "center",
  },
  aiButtonText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  submitButton: {
    marginHorizontal: 20,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    marginBottom: 12,
  },
  submitText: { fontSize: 16, fontFamily: "Inter_700Bold" },
  noProjectsText: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", paddingVertical: 20 },
  divider: { height: 1, marginHorizontal: 20, marginBottom: 20 },
  micButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  recordingBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 8,
  },
  recordingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#DC2626",
  },
  photoStrip: { marginTop: 12, gap: 8 },
  photoThumb: {
    width: 80,
    height: 80,
    borderRadius: 10,
    overflow: "hidden",
    position: "relative",
  },
  photoThumbImg: { width: 80, height: 80 },
  photoRemoveBtn: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
  photoOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  addPhotoBtn: {
    width: 80,
    height: 80,
    borderRadius: 10,
    borderWidth: 1.5,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  addPhotoBtnText: { fontSize: 11, fontFamily: "Inter_500Medium" },
  banner: {
    marginHorizontal: 20,
    marginBottom: 14,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  bannerText: { fontSize: 13, fontFamily: "Inter_500Medium", flex: 1 },
  bannerAction: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
});

export default function LogScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { data: me } = useGetMe();

  const { data: projects, isLoading: projectsLoading } = useListProjects();
  const createReport = useCreateDailyReport();
  const generateAI = useGenerateDailyReportAI();
  const addPhoto = useAddReportPhoto();
  const router = useRouter();
  const { isOnline, isSyncing, pendingCount, failedCount, enqueueReport: enqueue, syncQueue, retryFailed, clearFailed } = useOfflineQueue();

  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [crewCount, setCrewCount] = useState("1");
  const [weather, setWeather] = useState("");
  const [notes, setNotes] = useState("");
  const [aiSummary, setAiSummary] = useState("");
  const [submitted, setSubmitted] = useState<"none" | "online" | "offline">("none");
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [uploading, setUploading] = useState(false);

  // ── Draft recovery ────────────────────────────────────────────────────────
  const draftPayload = {
    selectedProjectId,
    crewCount,
    weather,
    notes,
    aiSummary,
    photos: photos.map((p) => ({
      uri: p.uri,
      mimeType: p.mimeType,
      fileName: p.fileName,
      fileSize: p.fileSize,
    })),
  };

  const setDraftPayload = React.useCallback((saved: typeof draftPayload) => {
    setSelectedProjectId(saved.selectedProjectId ?? null);
    setCrewCount(saved.crewCount ?? "1");
    setWeather(saved.weather ?? "");
    setNotes(saved.notes ?? "");
    setAiSummary(saved.aiSummary ?? "");
    setPhotos(
      (saved.photos ?? []).map((p: any) => ({
        uri: p.uri,
        mimeType: p.mimeType ?? "image/jpeg",
        fileName: p.fileName ?? `photo_${Date.now()}.jpg`,
        fileSize: p.fileSize ?? 0,
      })),
    );
  }, []);

  const voice = useVoiceRecorder((transcript) => {
    setNotes((prev) => (prev.trim() ? `${prev.trimEnd()} ${transcript}` : transcript));
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  });

  const selectedProject = (projects ?? []).find((p) => p.id === selectedProjectId);

  const resetForm = React.useCallback(() => {
    setNotes("");
    setAiSummary("");
    setWeather("");
    setCrewCount("1");
    setPhotos([]);
  }, []);

  const { hasDraft, restore, discard } = useFormDraft(
    me?.id,
    "daily-report",
    draftPayload,
    setDraftPayload,
    resetForm,
  );

  async function pickPhoto() {
    if (photos.length >= MAX_PHOTOS) {
      Alert.alert("Limit reached", `You can attach up to ${MAX_PHOTOS} photos per report.`);
      return;
    }
    Alert.alert("Add Site Photo", "Choose a source", [
      {
        text: "Camera",
        onPress: async () => {
          const { status } = await ImagePicker.requestCameraPermissionsAsync();
          if (status !== "granted") {
            Alert.alert("Permission needed", "Camera access is required to take site photos.");
            return;
          }
          const result = await ImagePicker.launchCameraAsync({
            mediaTypes: ["images"],
            quality: 0.8,
            allowsEditing: false,
          });
          handlePickResult(result);
        },
      },
      {
        text: "Photo Library",
        onPress: async () => {
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
        },
      },
      { text: "Cancel", style: "cancel" },
    ]);
  }

  async function handlePickResult(result: ImagePicker.ImagePickerResult) {
    if (result.canceled) return;
    // M-P3 fix: resize photos to max 1920px wide before adding to queue
    const incoming: PhotoItem[] = await Promise.all(
      result.assets.slice(0, MAX_PHOTOS - photos.length).map(async (a) => {
        try {
          const compressed = await ImageManipulator.manipulateAsync(
            a.uri,
            [{ resize: { width: 1920 } }],
            { compress: 0.75, format: ImageManipulator.SaveFormat.JPEG },
          );
          const info = await FileSystem.getInfoAsync(compressed.uri);
          return {
            uri: compressed.uri,
            mimeType: "image/jpeg",
            fileName: a.fileName ?? `photo_${Date.now()}.jpg`,
            fileSize: info.exists && "size" in info ? (info.size ?? 0) : 0,
            category: "progress" as const,
          };
        } catch {
          // Fallback to original if manipulation fails
          return {
            uri: a.uri,
            mimeType: a.mimeType ?? "image/jpeg",
            fileName: a.fileName ?? `photo_${Date.now()}.jpg`,
            fileSize: a.fileSize ?? 0,
            category: "progress" as const,
          };
        }
      }),
    );
    setPhotos((prev) => [...prev, ...incoming]);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }

  function removePhoto(index: number) {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }

  function setPhotoCategory(index: number, category: NonNullable<QueuePhoto["category"]>) {
    setPhotos((prev) => prev.map((p, i) => (i === index ? { ...p, category } : p)));
  }

  async function uploadSinglePhoto(photo: PhotoItem): Promise<string | null> {
    try {
      const { uploadURL, objectPath } = await customFetch<{
        uploadURL: string;
        objectPath: string;
      }>("/api/storage/uploads/request-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: photo.fileName,
          size: photo.fileSize,
          contentType: photo.mimeType,
        }),
      });

      // M-S4 fix: validate upload destination
      const dest = new URL(uploadURL);
      if (!dest.protocol.startsWith("https")) throw new Error("Unexpected upload destination");

      // M-P1 fix: stream from disk — never load blob into JS heap
      const result = await FileSystem.uploadAsync(uploadURL, photo.uri, {
        httpMethod: "PUT",
        uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
        headers: { "Content-Type": photo.mimeType },
      });
      if (result.status < 200 || result.status >= 300) throw new Error(`Upload HTTP ${result.status}`);

      return objectPath;
    } catch {
      return null;
    }
  }

  const handleGenerateAI = async () => {
    if (!selectedProject) {
      Alert.alert("No Project Selected", "Please select a project before generating an AI summary.");
      return;
    }
    if (!notes.trim()) {
      Alert.alert("No Notes", "Please describe what happened today before generating a summary.");
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    generateAI.mutate(
      {
        data: {
          projectName: selectedProject.name,
          rawInput: notes,
          reportDate: today(),
          crewCount: parseInt(crewCount, 10) || 1,
        },
      },
      {
        onSuccess: (res) => {
          setAiSummary(res.summary ?? "");
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        },
        onError: () => {
          Alert.alert("AI Error", "Could not generate summary. Please try again.");
        },
      }
    );
  };

  const handleSubmit = async () => {
    if (!selectedProjectId) {
      Alert.alert("No Project", "Please select a project first.");
      return;
    }
    if (!notes.trim()) {
      Alert.alert("No Notes", "Please describe what happened today.");
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

    const reportData = {
      reportDate: today(),
      weather: weather || undefined,
      crewCount: parseInt(crewCount, 10) || 1,
      workPerformed: notes,
      notes: notes || undefined,
      aiSummary: aiSummary || undefined,
    };

    if (!isOnline) {
      await enqueue(selectedProjectId, reportData, photos);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      setSubmitted("offline");
      resetForm();
      clearFormDraft(me?.id, "daily-report").catch(() => {});
      setTimeout(() => setSubmitted("none"), 5000);
      return;
    }

    createReport.mutate(
      { projectId: selectedProjectId, data: reportData },
      {
        onSuccess: async (report) => {
          if (photos.length > 0) {
            setUploading(true);
            // M-P2 fix: upload 2 photos concurrently — faster than serial, safe on weak networks
            const CONCURRENCY = 2;
            for (let i = 0; i < photos.length; i += CONCURRENCY) {
              const batch = photos.slice(i, i + CONCURRENCY);
              await Promise.all(
                batch.map(async (photo) => {
                  const objectPath = await uploadSinglePhoto(photo);
                  if (objectPath) {
                    await addPhoto
                      .mutateAsync({
                        projectId: selectedProjectId!,
                        reportId: report.id,
                        data: { objectPath, category: photo.category },
                      })
                      .catch(() => {});
                  }
                }),
              );
            }
            setUploading(false);
          }
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          setSubmitted("online");
          resetForm();
          clearFormDraft(me?.id, "daily-report").catch(() => {});
          setTimeout(() => setSubmitted("none"), 3000);
        },
        onError: async () => {
          await enqueue(selectedProjectId!, reportData, photos);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          setSubmitted("offline");
          resetForm();
          setTimeout(() => setSubmitted("none"), 5000);
        },
      }
    );
  };

  const topInsets = Platform.OS === "web" ? 67 : insets.top;
  const activeProjects = (projects ?? []).filter(
    (p) => p.status !== "completed" && p.status !== "cancelled"
  );
  const isBusy = createReport.isPending || uploading;

  return (
    <KeyboardAwareScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={{
        paddingBottom: Platform.OS === "web" ? 34 : insets.bottom + 100,
      }}
      bottomOffset={20}
      keyboardShouldPersistTaps="handled"
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: topInsets + 16 }]}>
        <Pressable
          onPress={() => router.back()}
          style={styles.backBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.title, { color: colors.foreground }]}>Log Report</Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          {new Date().toLocaleDateString("en-CA", { weekday: "long", month: "long", day: "numeric" })}
        </Text>
      </View>

      {/* Draft recovery banner */}
      <DraftBanner visible={hasDraft} onRestore={restore} onDiscard={discard} />

      {/* Offline / syncing / failed banners */}
      {!isOnline && (
        <View style={[styles.banner, { backgroundColor: "#FFFBEB", borderColor: "#FDE68A" }]}>
          <Feather name="wifi-off" size={16} color="#D97706" />
          <Text style={[styles.bannerText, { color: "#92400E" }]}>
            No internet — reports will be saved and sent when you reconnect
          </Text>
        </View>
      )}
      {isOnline && isSyncing && (
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => router.push("/sync-queue")}
          style={[styles.banner, { backgroundColor: `${colors.primary}12`, borderColor: `${colors.primary}40` }]}
        >
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={[styles.bannerText, { color: colors.primary }]}>
            Syncing {pendingCount} queued report{pendingCount !== 1 ? "s" : ""}…
          </Text>
          <Feather name="chevron-right" size={15} color={colors.primary} />
        </TouchableOpacity>
      )}
      {isOnline && !isSyncing && pendingCount > 0 && (
        <View style={[styles.banner, { backgroundColor: `${colors.primary}12`, borderColor: `${colors.primary}40` }]}>
          <Feather name="clock" size={16} color={colors.primary} />
          <Text style={[styles.bannerText, { color: colors.primary }]}>
            {pendingCount} report{pendingCount !== 1 ? "s" : ""} queued to sync
          </Text>
          <TouchableOpacity onPress={() => syncQueue()}>
            <Text style={[styles.bannerAction, { color: colors.primary }]}>Sync</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push("/sync-queue")}>
            <Text style={[styles.bannerAction, { color: colors.primary }]}>View</Text>
          </TouchableOpacity>
        </View>
      )}
      {failedCount > 0 && (
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => router.push("/sync-queue")}
          style={[styles.banner, { backgroundColor: "#FEF2F2", borderColor: "#FECACA" }]}
        >
          <Feather name="alert-circle" size={16} color="#DC2626" />
          <Text style={[styles.bannerText, { color: "#991B1B" }]}>
            {failedCount} report{failedCount !== 1 ? "s" : ""} failed to sync — tap to manage
          </Text>
          <Feather name="chevron-right" size={15} color="#DC2626" />
        </TouchableOpacity>
      )}

      {/* Submission result banners */}
      {submitted === "online" && (
        <View style={[styles.banner, { backgroundColor: "#D1FAE5", borderColor: "#6EE7B7" }]}>
          <Feather name="check-circle" size={18} color="#22C55E" />
          <Text style={[styles.bannerText, { color: "#166534", fontFamily: "Inter_600SemiBold" }]}>
            Report submitted!
          </Text>
        </View>
      )}
      {submitted === "offline" && (
        <View style={[styles.banner, { backgroundColor: "#FFFBEB", borderColor: "#FDE68A" }]}>
          <Feather name="save" size={18} color="#D97706" />
          <Text style={[styles.bannerText, { color: "#92400E", fontFamily: "Inter_600SemiBold" }]}>
            Saved offline — will sync when connected
          </Text>
        </View>
      )}

      {/* Project selector */}
      <View style={styles.section}>
        <Text style={[styles.label, { color: colors.mutedForeground }]}>Project</Text>
        {projectsLoading ? (
          <ActivityIndicator color={colors.primary} />
        ) : activeProjects.length === 0 ? (
          <Text style={[styles.noProjectsText, { color: colors.mutedForeground }]}>
            No active projects found
          </Text>
        ) : (
          <View style={styles.projectList}>
            {activeProjects.map((p) => (
              <Pressable
                key={p.id}
                style={[
                  styles.projectChip,
                  {
                    backgroundColor:
                      selectedProjectId === p.id ? `${colors.primary}15` : colors.card,
                    borderColor:
                      selectedProjectId === p.id ? colors.primary : colors.border,
                  },
                ]}
                onPress={() => {
                  setSelectedProjectId(p.id);
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
              >
                <Text
                  style={[
                    styles.projectChipText,
                    { color: selectedProjectId === p.id ? colors.primary : colors.foreground },
                  ]}
                >
                  {p.name}
                </Text>
                {selectedProjectId === p.id && (
                  <Feather name="check" size={16} color={colors.primary} />
                )}
              </Pressable>
            ))}
          </View>
        )}
      </View>

      <View style={[styles.divider, { backgroundColor: colors.border }]} />

      {/* Crew + Weather */}
      <View style={styles.section}>
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>Crew</Text>
            <TextInput
              style={[
                styles.inputBox,
                { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.border },
              ]}
              value={crewCount}
              onChangeText={setCrewCount}
              keyboardType="number-pad"
              placeholder="1"
              placeholderTextColor={colors.mutedForeground}
            />
          </View>
          <View style={{ flex: 2 }}>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>Weather</Text>
            <TextInput
              style={[
                styles.inputBox,
                { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.border },
              ]}
              value={weather}
              onChangeText={setWeather}
              placeholder="Sunny, 18°C"
              placeholderTextColor={colors.mutedForeground}
            />
          </View>
        </View>
      </View>

      {/* Work notes */}
      <View style={styles.section}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 8,
          }}
        >
          <Text style={[styles.label, { color: colors.mutedForeground, marginBottom: 0 }]}>
            What happened today?
          </Text>
          <TouchableOpacity
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              voice.toggle();
            }}
            disabled={voice.state === "transcribing"}
            style={[
              styles.micButton,
              {
                backgroundColor:
                  voice.state === "recording"
                    ? "#EF4444"
                    : voice.state === "transcribing"
                      ? colors.muted
                      : `${colors.primary}18`,
              },
            ]}
            activeOpacity={0.75}
          >
            {voice.state === "transcribing" ? (
              <ActivityIndicator size="small" color={colors.mutedForeground} />
            ) : (
              <Feather
                name={voice.state === "recording" ? "mic-off" : "mic"}
                size={16}
                color={voice.state === "recording" ? "#FFFFFF" : colors.primary}
              />
            )}
          </TouchableOpacity>
        </View>

        {voice.state === "recording" && (
          <View style={[styles.recordingBanner, { backgroundColor: "#FEF2F2", borderColor: "#FECACA" }]}>
            <View style={styles.recordingDot} />
            <Text style={{ color: "#DC2626", fontFamily: "Inter_500Medium", fontSize: 13 }}>
              Recording… tap mic to stop & transcribe
            </Text>
          </View>
        )}
        {voice.error && (
          <Text
            style={{
              color: colors.destructive,
              fontSize: 12,
              fontFamily: "Inter_400Regular",
              marginBottom: 6,
            }}
          >
            {voice.error}
          </Text>
        )}

        <TextInput
          style={[
            styles.textArea,
            {
              color: colors.foreground,
              backgroundColor: colors.card,
              borderColor: voice.state === "recording" ? "#EF4444" : colors.border,
            },
          ]}
          value={notes}
          onChangeText={setNotes}
          placeholder="Poured foundation concrete on north wing. Crew of 8. Rebar inspection completed..."
          placeholderTextColor={colors.mutedForeground}
          multiline
          returnKeyType="default"
        />

        {/* Photo strip */}
        <View style={styles.photoStrip}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8 }}
          >
            {photos.map((photo, i) => (
              <View key={i} style={{ gap: 4 }}>
                <View style={styles.photoThumb}>
                  <Image source={{ uri: photo.uri }} style={styles.photoThumbImg} resizeMode="cover" />
                  {photo.uploading && (
                    <View style={styles.photoOverlay}>
                      <ActivityIndicator color="#FFFFFF" size="small" />
                    </View>
                  )}
                  <TouchableOpacity style={styles.photoRemoveBtn} onPress={() => removePhoto(i)}>
                    <Feather name="x" size={12} color="#FFFFFF" />
                  </TouchableOpacity>
                </View>
                <View style={{ flexDirection: "row", gap: 3 }}>
                  {PHOTO_CATEGORIES.map((c) => {
                    const active = (photo.category ?? "progress") === c.value;
                    return (
                      <TouchableOpacity
                        key={c.value}
                        onPress={() => setPhotoCategory(i, c.value)}
                        style={{
                          paddingHorizontal: 5,
                          paddingVertical: 2,
                          borderRadius: 5,
                          backgroundColor: active ? colors.primary : colors.muted,
                        }}
                      >
                        <Text style={{ fontSize: 9, fontFamily: "Inter_600SemiBold", color: active ? "#FFFFFF" : colors.mutedForeground }}>
                          {c.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            ))}
            {photos.length < MAX_PHOTOS && (
              <TouchableOpacity
                style={[
                  styles.addPhotoBtn,
                  { borderColor: colors.border, backgroundColor: colors.card },
                ]}
                onPress={pickPhoto}
                activeOpacity={0.7}
              >
                <Feather name="camera" size={20} color={colors.primary} />
                <Text style={[styles.addPhotoBtnText, { color: colors.mutedForeground }]}>
                  {photos.length === 0 ? "Add Photo" : "Add More"}
                </Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        </View>

        {/* AI generate */}
        <TouchableOpacity
          style={[
            styles.aiButton,
            {
              backgroundColor: generateAI.isPending ? colors.muted : `${colors.primary}12`,
              borderColor: generateAI.isPending ? colors.border : colors.primary,
            },
          ]}
          onPress={handleGenerateAI}
          disabled={generateAI.isPending}
          activeOpacity={0.8}
        >
          {generateAI.isPending ? (
            <ActivityIndicator color={colors.primary} size="small" />
          ) : (
            <Feather name="zap" size={16} color={colors.primary} />
          )}
          <Text style={[styles.aiButtonText, { color: colors.primary }]}>
            {generateAI.isPending ? "Generating..." : "Generate AI Summary"}
          </Text>
        </TouchableOpacity>
      </View>

      {/* AI Summary */}
      {(aiSummary || generateAI.isPending) && (
        <View style={styles.section}>
          <Text style={[styles.label, { color: colors.mutedForeground }]}>AI Summary</Text>
          <View
            style={[
              styles.aiBox,
              { backgroundColor: `${colors.primary}08`, borderColor: colors.primary },
            ]}
          >
            {generateAI.isPending ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <>
                <Text style={[styles.aiText, { color: colors.foreground }]}>{aiSummary}</Text>
                <TouchableOpacity onPress={() => setAiSummary("")} style={{ marginTop: 8 }}>
                  <Text
                    style={{ color: colors.mutedForeground, fontSize: 12, fontFamily: "Inter_400Regular" }}
                  >
                    Remove
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      )}

      {/* Submit */}
      <TouchableOpacity
        style={[
          styles.submitButton,
          {
            backgroundColor: isBusy ? colors.muted : (!isOnline ? "#D97706" : colors.primary),
          },
        ]}
        onPress={handleSubmit}
        disabled={isBusy}
        activeOpacity={0.85}
      >
        {isBusy ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <ActivityIndicator color="#FFFFFF" />
            <Text style={[styles.submitText, { color: "#FFFFFF" }]}>
              {uploading
                ? `Uploading ${photos.length} photo${photos.length !== 1 ? "s" : ""}…`
                : "Saving…"}
            </Text>
          </View>
        ) : (
          <Text style={[styles.submitText, { color: "#FFFFFF" }]}>
            {!isOnline
              ? `Save Offline${photos.length > 0 ? ` + ${photos.length} Photo${photos.length !== 1 ? "s" : ""}` : ""}`
              : `Submit Report${photos.length > 0 ? ` + ${photos.length} Photo${photos.length !== 1 ? "s" : ""}` : ""}`}
          </Text>
        )}
      </TouchableOpacity>
    </KeyboardAwareScrollView>
  );
}
