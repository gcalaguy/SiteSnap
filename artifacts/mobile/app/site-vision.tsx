import React, { useState, useCallback } from "react";
import {
  Alert,
  ActivityIndicator,
  FlatList,
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
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as Haptics from "expo-haptics";
import { Feather } from "@expo/vector-icons";
import { useListProjects, customFetch } from "@workspace/api-client-react";

import { useColors } from "@/hooks/useColors";
import { getAiErrorMessage } from "@/src/utils/aiError";

const GOLD = "#C9A84C";
const MAX_PHOTOS = 8;

interface PhotoItem {
  uri: string;
  mimeType: string;
  fileName: string;
}

interface AISummaryResult {
  summary: string | null;
  progress: string[];
  safetyFlags: string[];
  materialsSpotted: string[];
  weatherConditions: string | null;
  recommendations: string[];
  confidence: "high" | "medium" | "low";
  imageCount: number;
}

function ConfidenceBadge({ level }: { level: string }) {
  const map: Record<string, { label: string; bg: string; text: string }> = {
    high:   { label: "High confidence",   bg: "#16a34a22", text: "#16a34a" },
    medium: { label: "Medium confidence", bg: "#d9770622", text: "#d97706" },
    low:    { label: "Low confidence",    bg: "#dc262622", text: "#dc2626" },
  };
  const c = map[level] ?? map.medium;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      <View style={{ backgroundColor: c.bg, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20 }}>
        <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: c.text }}>{c.label}</Text>
      </View>
    </View>
  );
}

function Section({ title, icon, items, color }: { title: string; icon: string; items: string[]; color?: string }) {
  const colors = useColors();
  if (!items.length) return null;
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Feather name={icon as any} size={14} color={color ?? GOLD} />
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{title}</Text>
      </View>
      {items.map((item, i) => (
        <View key={i} style={styles.bulletRow}>
          <View style={[styles.bullet, { backgroundColor: color ?? GOLD }]} />
          <Text style={[styles.bulletText, { color: colors.foreground }]}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

export default function SiteVisionScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const { data: projects } = useListProjects();
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [context, setContext] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AISummaryResult | null>(null);

  const selectedProject = projects?.find((p) => p.id === selectedProjectId);

  const pickPhoto = useCallback(() => {
    if (photos.length >= MAX_PHOTOS) {
      Alert.alert("Limit reached", `You can analyze up to ${MAX_PHOTOS} photos at once.`);
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
            quality: 0.7,
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
            quality: 0.7,
            allowsMultipleSelection: true,
            selectionLimit: MAX_PHOTOS - photos.length,
          });
          handlePickResult(result);
        },
      },
      { text: "Cancel", style: "cancel" },
    ]);
  }, [photos.length]);

  function handlePickResult(result: ImagePicker.ImagePickerResult) {
    if (result.canceled) return;
    const incoming = result.assets.slice(0, MAX_PHOTOS - photos.length).map<PhotoItem>((a) => ({
      uri: a.uri,
      mimeType: a.mimeType ?? "image/jpeg",
      fileName: a.fileName ?? `photo_${Date.now()}.jpg`,
    }));
    setPhotos((prev) => [...prev, ...incoming]);
    setResult(null);
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }

  function removePhoto(index: number) {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
    setResult(null);
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }

  async function analyze() {
    if (photos.length === 0) {
      Alert.alert("No photos", "Add at least one site photo to analyze.");
      return;
    }
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setLoading(true);
    setResult(null);

    try {
      const imagePayloads = await Promise.all(
        photos.map(async (photo) => {
          const base64 = await FileSystem.readAsStringAsync(photo.uri, {
            encoding: FileSystem.EncodingType.Base64,
          });
          return { base64, mimeType: photo.mimeType };
        }),
      );

      const body: Record<string, unknown> = { images: imagePayloads };
      if (selectedProject) body.projectName = selectedProject.name;
      if (context.trim()) body.context = context.trim();

      const data = await customFetch<AISummaryResult>("/api/ai/photo-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      setResult(data);
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      Alert.alert("Analysis failed", getAiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  const topInsets = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topInsets + 8, backgroundColor: colors.sidebar }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={12}>
          <Feather name="arrow-left" size={22} color="#fff" />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Site Vision AI</Text>
          <Text style={styles.headerSub}>AI analysis of your site photos</Text>
        </View>
        <View style={[styles.headerIcon, { backgroundColor: `${GOLD}22` }]}>
          <Feather name="camera" size={18} color={GOLD} />
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 100 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Photo strip */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.cardHeader}>
            <Feather name="image" size={14} color={GOLD} />
            <Text style={[styles.cardTitle, { color: colors.foreground }]}>
              Site Photos ({photos.length}/{MAX_PHOTOS})
            </Text>
          </View>

          <FlatList
            data={[...photos, { uri: "__add__", mimeType: "", fileName: "" }]}
            horizontal
            keyExtractor={(_, i) => String(i)}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8, paddingVertical: 4 }}
            renderItem={({ item, index }) => {
              if (item.uri === "__add__") {
                return (
                  <TouchableOpacity
                    onPress={pickPhoto}
                    style={[styles.photoAdd, { borderColor: colors.border, backgroundColor: `${GOLD}10` }]}
                    activeOpacity={0.7}
                  >
                    <Feather name="plus" size={22} color={GOLD} />
                    <Text style={[styles.photoAddLabel, { color: GOLD }]}>Add</Text>
                  </TouchableOpacity>
                );
              }
              return (
                <View style={styles.photoThumb}>
                  <Image source={{ uri: item.uri }} style={styles.photoImg} resizeMode="cover" />
                  <TouchableOpacity style={styles.photoRemove} onPress={() => removePhoto(index)} hitSlop={6}>
                    <Feather name="x" size={11} color="#fff" />
                  </TouchableOpacity>
                </View>
              );
            }}
          />
        </View>

        {/* Project selector */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.cardHeader}>
            <Feather name="folder" size={14} color={GOLD} />
            <Text style={[styles.cardTitle, { color: colors.foreground }]}>Project (optional)</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingTop: 4 }}>
            <TouchableOpacity
              onPress={() => setSelectedProjectId(null)}
              style={[
                styles.projectPill,
                {
                  backgroundColor: selectedProjectId === null ? GOLD : `${GOLD}15`,
                  borderColor: selectedProjectId === null ? GOLD : colors.border,
                },
              ]}
            >
              <Text style={[styles.projectPillText, { color: selectedProjectId === null ? "#111" : colors.mutedForeground }]}>
                No project
              </Text>
            </TouchableOpacity>
            {(projects ?? []).map((p) => (
              <TouchableOpacity
                key={p.id}
                onPress={() => setSelectedProjectId(p.id)}
                style={[
                  styles.projectPill,
                  {
                    backgroundColor: selectedProjectId === p.id ? GOLD : `${GOLD}15`,
                    borderColor: selectedProjectId === p.id ? GOLD : colors.border,
                  },
                ]}
              >
                <Text style={[styles.projectPillText, { color: selectedProjectId === p.id ? "#111" : colors.foreground }]}>
                  {p.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Context */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.cardHeader}>
            <Feather name="edit-3" size={14} color={GOLD} />
            <Text style={[styles.cardTitle, { color: colors.foreground }]}>Notes for AI (optional)</Text>
          </View>
          <TextInput
            value={context}
            onChangeText={setContext}
            placeholder="e.g. Foundation pour complete, checking rebar spacing before inspection…"
            placeholderTextColor={colors.mutedForeground}
            style={[styles.contextInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
            multiline
            numberOfLines={3}
          />
        </View>

        {/* Analyze button */}
        <TouchableOpacity
          onPress={analyze}
          disabled={loading || photos.length === 0}
          activeOpacity={0.8}
          style={[
            styles.analyzeBtn,
            { backgroundColor: photos.length === 0 || loading ? colors.muted : GOLD, opacity: loading ? 0.85 : 1 },
          ]}
        >
          {loading ? (
            <ActivityIndicator color="#111" size="small" />
          ) : (
            <Feather name="zap" size={18} color="#111" />
          )}
          <Text style={styles.analyzeBtnText}>
            {loading ? "Analyzing…" : `Analyze ${photos.length > 0 ? `${photos.length} Photo${photos.length > 1 ? "s" : ""}` : "Photos"}`}
          </Text>
        </TouchableOpacity>

        {/* Results */}
        {result && (
          <View style={[styles.resultsContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {/* Header row */}
            <View style={styles.resultsHeader}>
              <View style={[styles.resultsBadge, { backgroundColor: `${GOLD}18` }]}>
                <Feather name="zap" size={14} color={GOLD} />
                <Text style={[styles.resultsBadgeText, { color: GOLD }]}>AI Analysis</Text>
              </View>
              <ConfidenceBadge level={result.confidence} />
            </View>

            {/* Overall summary */}
            {result.summary && (
              <View style={[styles.summaryBox, { backgroundColor: `${GOLD}10`, borderColor: `${GOLD}30` }]}>
                <Text style={[styles.summaryText, { color: colors.foreground }]}>{result.summary}</Text>
              </View>
            )}

            {/* Weather / conditions */}
            {result.weatherConditions && (
              <View style={[styles.section]}>
                <View style={styles.sectionHeader}>
                  <Feather name="cloud" size={14} color="#60a5fa" />
                  <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Site Conditions</Text>
                </View>
                <Text style={[styles.bulletText, { color: colors.foreground, marginLeft: 16 }]}>{result.weatherConditions}</Text>
              </View>
            )}

            <Section title="Progress Observed" icon="check-circle" items={result.progress} color="#22c55e" />
            <Section title="Safety Concerns" icon="alert-triangle" items={result.safetyFlags} color="#ef4444" />
            <Section title="Materials & Equipment" icon="package" items={result.materialsSpotted} color={GOLD} />
            <Section title="Recommendations" icon="arrow-right-circle" items={result.recommendations} color="#a855f7" />

            <Text style={[styles.footerNote, { color: colors.mutedForeground }]}>
              Based on {result.imageCount} photo{result.imageCount > 1 ? "s" : ""} · AI-generated, verify on-site
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 16, paddingBottom: 14,
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 18, fontFamily: "Inter_700Bold", color: "#fff" },
  headerSub: { fontSize: 12, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.55)", marginTop: 1 },
  headerIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },

  card: {
    borderRadius: 14, borderWidth: 1,
    padding: 14, marginBottom: 12,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 10 },
  cardTitle: { fontSize: 13, fontFamily: "Inter_600SemiBold" },

  photoAdd: {
    width: 80, height: 80, borderRadius: 10, borderWidth: 2, borderStyle: "dashed",
    alignItems: "center", justifyContent: "center", gap: 4,
  },
  photoAddLabel: { fontSize: 10, fontFamily: "Inter_500Medium" },
  photoThumb: { width: 80, height: 80, borderRadius: 10, overflow: "hidden", position: "relative" },
  photoImg: { width: 80, height: 80 },
  photoRemove: {
    position: "absolute", top: 4, right: 4,
    backgroundColor: "rgba(0,0,0,0.6)", borderRadius: 8,
    width: 16, height: 16, alignItems: "center", justifyContent: "center",
  },

  projectPill: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1,
  },
  projectPillText: { fontSize: 12, fontFamily: "Inter_500Medium" },

  contextInput: {
    borderWidth: 1, borderRadius: 8, padding: 10,
    fontSize: 13, fontFamily: "Inter_400Regular", minHeight: 72,
    textAlignVertical: "top",
  },

  analyzeBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, paddingVertical: 15, borderRadius: 14, marginBottom: 16,
  },
  analyzeBtnText: { fontSize: 15, fontFamily: "Inter_700Bold", color: "#111111" },

  resultsContainer: { borderRadius: 14, borderWidth: 1, padding: 16 },
  resultsHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  resultsBadge: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  resultsBadgeText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },

  summaryBox: { borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 14 },
  summaryText: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 21 },

  section: { marginBottom: 14 },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 },
  sectionTitle: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  bulletRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginBottom: 6, paddingLeft: 4 },
  bullet: { width: 6, height: 6, borderRadius: 3, marginTop: 5, flexShrink: 0 },
  bulletText: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19, flex: 1 },

  footerNote: { fontSize: 11, fontFamily: "Inter_400Regular", textAlign: "center", marginTop: 8 },
});
