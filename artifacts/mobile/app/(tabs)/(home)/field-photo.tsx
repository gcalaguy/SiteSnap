import {
  useListProjects,
  useCreateSitePhoto,
} from "@workspace/api-client-react";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
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
import * as ImagePicker from "expo-image-picker";

export default function FieldPhotoScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: projects = [] } = useListProjects();
  const [projectId, setProjectId] = useState<number | null>(null);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [roomLocation, setRoomLocation] = useState("");

  const createPhoto = useCreateSitePhoto({
    mutation: {
      onSuccess: () => router.back(),
    },
  });

  async function pickImage() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.8,
    });
    if (!result.canceled && result.assets.length > 0) {
      setImageUri(result.assets[0].uri);
    }
  }

  function submit() {
    if (!projectId || !imageUri) return;
    // In production, upload image first, then pass URL. Here we pass the local URI as a placeholder.
    createPhoto.mutate({
      data: { projectId, imageUrl: imageUri, markupData: null, roomLocation: roomLocation || null },
    });
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingTop: insets.top + 16, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
      >
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={20} color={colors.foreground} />
          <Text style={[styles.backText, { color: colors.foreground }]}>Back</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.foreground }]}>Site Photo</Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          Snap a photo and add a location tag.
        </Text>

        {/* Project selector */}
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

        {/* Photo picker */}
        <TouchableOpacity onPress={pickImage} style={[styles.photoBox, { borderColor: colors.border }]}>
          {imageUri ? (
            <Image source={{ uri: imageUri }} style={styles.photo} />
          ) : (
            <View style={styles.photoPlaceholder}>
              <Feather name="camera" size={32} color={colors.mutedForeground} />
              <Text style={[styles.photoPlaceholderText, { color: colors.mutedForeground }]}>
                Tap to choose a photo
              </Text>
            </View>
          )}
        </TouchableOpacity>

        {/* Location tag */}
        <Text style={[styles.label, { color: colors.mutedForeground }]}>Room / Location</Text>
        <TextInput
          style={[
            styles.input,
            { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground },
          ]}
          placeholder="e.g. Kitchen, Foundation, 2nd Floor"
          placeholderTextColor={colors.mutedForeground}
          value={roomLocation}
          onChangeText={setRoomLocation}
        />

        {/* Submit */}
        <TouchableOpacity
          onPress={submit}
          disabled={!projectId || !imageUri || createPhoto.isPending}
          style={[
            styles.submitBtn,
            {
              backgroundColor: !projectId || !imageUri || createPhoto.isPending ? "#ccc" : colors.primary,
            },
          ]}
        >
          <Text style={styles.submitText}>
            {createPhoto.isPending ? "Saving..." : "Save Photo"}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  backBtn: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 },
  backText: { fontSize: 14, fontFamily: "Inter_500Medium" },
  title: { fontSize: 28, fontFamily: "Inter_700Bold", marginBottom: 4 },
  subtitle: { fontSize: 14, fontFamily: "Inter_400Regular", marginBottom: 20 },
  label: { fontSize: 12, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8, marginTop: 16 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, borderWidth: 1 },
  chipText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  photoBox: { width: "100%", aspectRatio: 4 / 3, borderWidth: 2, borderStyle: "dashed", borderRadius: 12, overflow: "hidden", marginTop: 8, justifyContent: "center", alignItems: "center" },
  photo: { width: "100%", height: "100%" },
  photoPlaceholder: { alignItems: "center", gap: 8 },
  photoPlaceholderText: { fontSize: 14, fontFamily: "Inter_500Medium" },
  input: { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 14, fontFamily: "Inter_400Regular" },
  submitBtn: { paddingVertical: 14, borderRadius: 12, alignItems: "center", marginTop: 24 },
  submitText: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" },
});
