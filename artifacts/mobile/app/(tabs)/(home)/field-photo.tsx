import {
  useListProjects,
  useCreateSitePhoto,
  customFetch,
} from "@workspace/api-client-react";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Image } from "expo-image";
import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { Feather } from "@expo/vector-icons";

export default function FieldPhotoScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: projects = [] } = useListProjects();
  const [projectId, setProjectId] = useState<number | null>(null);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [roomLocation, setRoomLocation] = useState("");
  const [uploading, setUploading] = useState(false);

  const createPhoto = useCreateSitePhoto({
    mutation: {
      onSuccess: () => router.back(),
    },
  });

  const [pickedAsset, setPickedAsset] = useState<ImagePicker.ImagePickerAsset | null>(null);

  function handlePickResult(result: ImagePicker.ImagePickerResult) {
    if (result.canceled || result.assets.length === 0) return;
    setPickedAsset(result.assets[0]);
    setImageUri(result.assets[0].uri);
  }

  async function takePhoto() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Camera access is required to take a photo.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      quality: 0.8,
    });
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
      allowsEditing: true,
      quality: 0.8,
    });
    handlePickResult(result);
  }

  function pickImage() {
    Alert.alert("Add Site Photo", "Choose a source", [
      { text: "Take Photo", onPress: takePhoto },
      { text: "Choose from Library", onPress: chooseFromLibrary },
      { text: "Cancel", style: "cancel" },
    ]);
  }

  async function uploadToStorage(uri: string): Promise<string | null> {
    try {
      // M-S6 fix: use actual MIME type from picker, not hardcoded "image/jpeg"
      const mimeType = pickedAsset?.mimeType ?? "image/jpeg";
      const fileName = pickedAsset?.fileName ?? `site-photo-${Date.now()}.jpg`;
      const fileSize = pickedAsset?.fileSize ?? 0;

      // Get presigned URL with real content type
      const { uploadURL, objectPath } = await customFetch<{ uploadURL: string; objectPath: string }>(
        "/api/storage/uploads/request-url",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: fileName, size: fileSize, contentType: mimeType }),
        },
      );

      // M-S4: validate destination, M-P1: stream from disk
      const dest = new URL(uploadURL);
      if (!dest.protocol.startsWith("https")) throw new Error("Unexpected upload destination");

      const result = await FileSystem.uploadAsync(uploadURL, uri, {
        httpMethod: "PUT",
        uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
        headers: { "Content-Type": mimeType },
      });
      if (result.status < 200 || result.status >= 300) throw new Error(`Upload failed: ${result.status}`);

      return objectPath;
    } catch {
      return null;
    }
  }

  async function submit() {
    if (!projectId || !imageUri) return;
    setUploading(true);
    const objectPath = await uploadToStorage(imageUri);
    setUploading(false);
    if (!objectPath) {
      Alert.alert("Upload Failed", "Could not upload the photo. Please check your connection and try again.");
      return;
    }
    createPhoto.mutate({
      data: {
        projectId,
        imageUrl: objectPath,
        markupData: null,
        roomLocation: roomLocation || null,
      },
    });
  }

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
          Site Photo
        </Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          Snap a photo and add a location tag.
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

        {/* Photo picker */}
        <TouchableOpacity
          onPress={pickImage}
          style={[
            styles.photoBox,
            { borderColor: colors.border },
          ]}
        >
          {imageUri ? (
            <Image source={{ uri: imageUri }} style={styles.photo} contentFit="cover" />
          ) : (
            <View style={styles.photoPlaceholder}>
              <Feather
                name="camera"
                size={32}
                color={colors.mutedForeground}
              />
              <Text
                style={[
                  styles.photoPlaceholderText,
                  { color: colors.mutedForeground },
                ]}
              >
                Tap to choose a photo
              </Text>
            </View>
          )}
        </TouchableOpacity>

        {/* Location tag */}
        <Text style={[styles.label, { color: colors.mutedForeground }]}>
          Room / Location
        </Text>
        <TextInput
          style={[
            styles.input,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              color: colors.foreground,
            },
          ]}
          placeholder="e.g. Kitchen, Foundation, 2nd Floor"
          placeholderTextColor={colors.mutedForeground}
          value={roomLocation}
          onChangeText={setRoomLocation}
        />

        {/* Submit */}
        <TouchableOpacity
          onPress={submit}
          disabled={
            !projectId ||
            !imageUri ||
            uploading ||
            createPhoto.isPending
          }
          style={[
            styles.submitBtn,
            {
              backgroundColor:
                !projectId ||
                !imageUri ||
                uploading ||
                createPhoto.isPending
                  ? "#ccc"
                  : colors.primary,
            },
          ]}
        >
          <Text style={styles.submitText}>
            {uploading
              ? "Uploading..."
              : createPhoto.isPending
                ? "Saving..."
                : "Save Photo"}
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
  photoBox: {
    width: "100%",
    aspectRatio: 4 / 3,
    borderWidth: 2,
    borderStyle: "dashed",
    borderRadius: 12,
    overflow: "hidden",
    marginTop: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  photo: { width: "100%", height: "100%" },
  photoPlaceholder: { alignItems: "center", gap: 8 },
  photoPlaceholderText: { fontSize: 14, fontFamily: "Inter_500Medium" },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  submitBtn: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 24,
  },
  submitText: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" },
});
