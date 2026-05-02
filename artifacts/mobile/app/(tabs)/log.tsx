import {
  useListProjects,
  useCreateDailyReport,
  useGenerateDailyReportAI,
  useAddReportPhoto,
  customFetch,
} from "@workspace/api-client-react";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import React, { useState } from "react";
import { useVoiceRecorder } from "@/hooks/useVoiceRecorder";
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

interface PhotoItem {
  uri: string;
  mimeType: string;
  fileName: string;
  fileSize: number;
  uploading?: boolean;
  error?: string;
  objectPath?: string;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 20 },
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
  submitText: { fontSize: 16, fontFamily: "Inter_700Bold", color: "#FFFFFF" },
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
  photoStrip: {
    marginTop: 12,
    gap: 8,
  },
  photoThumb: {
    width: 80,
    height: 80,
    borderRadius: 10,
    overflow: "hidden",
    position: "relative",
  },
  photoThumbImg: {
    width: 80,
    height: 80,
  },
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
    inset: 0,
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
});

export default function LogScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const { data: projects, isLoading: projectsLoading } = useListProjects();
  const createReport = useCreateDailyReport();
  const generateAI = useGenerateDailyReportAI();
  const addPhoto = useAddReportPhoto();

  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [crewCount, setCrewCount] = useState("1");
  const [weather, setWeather] = useState("");
  const [notes, setNotes] = useState("");
  const [aiSummary, setAiSummary] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [uploading, setUploading] = useState(false);

  const voice = useVoiceRecorder((transcript) => {
    setNotes((prev) => (prev.trim() ? `${prev.trimEnd()} ${transcript}` : transcript));
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  });

  const selectedProject = (projects ?? []).find(p => p.id === selectedProjectId);

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
            Alert.alert("Permission needed", "Photo library access is required to select site photos.");
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

  function handlePickResult(result: ImagePicker.ImagePickerResult) {
    if (result.canceled) return;
    const incoming = result.assets.slice(0, MAX_PHOTOS - photos.length).map<PhotoItem>(a => ({
      uri: a.uri,
      mimeType: a.mimeType ?? "image/jpeg",
      fileName: a.fileName ?? `photo_${Date.now()}.jpg`,
      fileSize: a.fileSize ?? 0,
    }));
    setPhotos(prev => [...prev, ...incoming]);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }

  function removePhoto(index: number) {
    setPhotos(prev => prev.filter((_, i) => i !== index));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }

  async function uploadSinglePhoto(photo: PhotoItem): Promise<string | null> {
    try {
      const res = await customFetch("/api/storage/uploads/request-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: photo.fileName,
          size: photo.fileSize,
          contentType: photo.mimeType,
        }),
      });
      if (!res.ok) throw new Error("Failed to get upload URL");
      const { uploadURL, objectPath } = await res.json() as { uploadURL: string; objectPath: string };

      const fileRes = await fetch(photo.uri);
      const blob = await fileRes.blob();

      const putRes = await fetch(uploadURL, {
        method: "PUT",
        headers: { "Content-Type": photo.mimeType },
        body: blob,
      });
      if (!putRes.ok) throw new Error("Failed to upload photo");

      return objectPath;
    } catch {
      return null;
    }
  }

  const handleGenerateAI = async () => {
    if (!selectedProject || !notes.trim()) return;
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

    createReport.mutate(
      {
        projectId: selectedProjectId,
        data: {
          reportDate: today(),
          weather: weather || undefined,
          crewCount: parseInt(crewCount, 10) || 1,
          workPerformed: notes,
          aiSummary: aiSummary || undefined,
        },
      },
      {
        onSuccess: async (report) => {
          if (photos.length > 0) {
            setUploading(true);
            for (const photo of photos) {
              const objectPath = await uploadSinglePhoto(photo);
              if (objectPath) {
                try {
                  await addPhoto.mutateAsync({
                    projectId: selectedProjectId!,
                    reportId: report.id,
                    data: { objectPath },
                  });
                } catch {
                }
              }
            }
            setUploading(false);
          }

          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          setSubmitted(true);
          setNotes("");
          setAiSummary("");
          setWeather("");
          setCrewCount("1");
          setPhotos([]);
          setTimeout(() => setSubmitted(false), 3000);
        },
        onError: () => {
          Alert.alert("Error", "Could not save the report. Please try again.");
        },
      }
    );
  };

  const topInsets = Platform.OS === "web" ? 67 : insets.top;
  const activeProjects = (projects ?? []).filter(p => p.status === "active");
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
        <Text style={[styles.title, { color: colors.foreground }]}>Log Report</Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          {new Date().toLocaleDateString("en-CA", { weekday: "long", month: "long", day: "numeric" })}
        </Text>
      </View>

      {submitted && (
        <View style={{ marginHorizontal: 20, marginBottom: 16, backgroundColor: "#D1FAE5", borderRadius: 10, padding: 14, flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Feather name="check-circle" size={18} color="#22C55E" />
          <Text style={{ color: "#166534", fontFamily: "Inter_600SemiBold", fontSize: 14 }}>Report submitted!</Text>
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
            {activeProjects.map(p => (
              <Pressable
                key={p.id}
                style={[
                  styles.projectChip,
                  {
                    backgroundColor: selectedProjectId === p.id ? `${colors.primary}15` : colors.card,
                    borderColor: selectedProjectId === p.id ? colors.primary : colors.border,
                  },
                ]}
                onPress={() => {
                  setSelectedProjectId(p.id);
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
              >
                <Text style={[styles.projectChipText, { color: selectedProjectId === p.id ? colors.primary : colors.foreground }]}>
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
              style={[styles.inputBox, { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.border }]}
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
              style={[styles.inputBox, { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.border }]}
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
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <Text style={[styles.label, { color: colors.mutedForeground, marginBottom: 0 }]}>What happened today?</Text>
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
          <Text style={{ color: colors.destructive, fontSize: 12, fontFamily: "Inter_400Regular", marginBottom: 6 }}>
            {voice.error}
          </Text>
        )}

        <TextInput
          style={[styles.textArea, { color: colors.foreground, backgroundColor: colors.card, borderColor: voice.state === "recording" ? "#EF4444" : colors.border }]}
          value={notes}
          onChangeText={setNotes}
          placeholder="Poured foundation concrete on north wing. Crew of 8. Rebar inspection completed..."
          placeholderTextColor={colors.mutedForeground}
          multiline
          returnKeyType="default"
        />

        {/* Photo strip */}
        {(photos.length > 0 || photos.length < MAX_PHOTOS) && (
          <View style={styles.photoStrip}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {photos.map((photo, i) => (
                <View key={i} style={styles.photoThumb}>
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
              ))}

              {photos.length < MAX_PHOTOS && (
                <TouchableOpacity
                  style={[styles.addPhotoBtn, { borderColor: colors.border, backgroundColor: colors.card }]}
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
        )}

        {/* AI generate */}
        <TouchableOpacity
          style={[
            styles.aiButton,
            {
              backgroundColor: (notes.trim() && selectedProject) ? `${colors.primary}12` : colors.muted,
              borderColor: (notes.trim() && selectedProject) ? colors.primary : colors.border,
            },
          ]}
          onPress={handleGenerateAI}
          disabled={!notes.trim() || !selectedProject || generateAI.isPending}
          activeOpacity={0.8}
        >
          {generateAI.isPending ? (
            <ActivityIndicator color={colors.primary} size="small" />
          ) : (
            <Feather name="zap" size={16} color={(notes.trim() && selectedProject) ? colors.primary : colors.mutedForeground} />
          )}
          <Text style={[styles.aiButtonText, { color: (notes.trim() && selectedProject) ? colors.primary : colors.mutedForeground }]}>
            {generateAI.isPending ? "Generating..." : "Generate AI Summary"}
          </Text>
        </TouchableOpacity>
      </View>

      {/* AI Summary */}
      {(aiSummary || generateAI.isPending) && (
        <View style={styles.section}>
          <Text style={[styles.label, { color: colors.mutedForeground }]}>AI Summary</Text>
          <View style={[styles.aiBox, { backgroundColor: `${colors.primary}08`, borderColor: colors.primary }]}>
            {generateAI.isPending ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <>
                <Text style={[styles.aiText, { color: colors.foreground }]}>{aiSummary}</Text>
                <TouchableOpacity onPress={() => setAiSummary("")} style={{ marginTop: 8 }}>
                  <Text style={{ color: colors.mutedForeground, fontSize: 12, fontFamily: "Inter_400Regular" }}>Remove</Text>
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
            backgroundColor: (selectedProjectId && notes.trim()) ? colors.primary : colors.muted,
          },
        ]}
        onPress={handleSubmit}
        disabled={!selectedProjectId || !notes.trim() || isBusy}
        activeOpacity={0.85}
      >
        {isBusy ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <ActivityIndicator color="#FFFFFF" />
            <Text style={styles.submitText}>
              {uploading ? `Uploading ${photos.length} photo${photos.length !== 1 ? "s" : ""}…` : "Saving…"}
            </Text>
          </View>
        ) : (
          <Text style={[styles.submitText, { color: (selectedProjectId && notes.trim()) ? "#FFFFFF" : colors.mutedForeground }]}>
            {`Submit Report${photos.length > 0 ? ` + ${photos.length} Photo${photos.length !== 1 ? "s" : ""}` : ""}`}
          </Text>
        )}
      </TouchableOpacity>
    </KeyboardAwareScrollView>
  );
}
