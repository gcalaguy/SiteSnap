import React, { useState } from "react";
import { Pressable, View, Text, ActivityIndicator, StyleSheet, Modal, Alert } from "react-native";
import { Image } from "expo-image";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { useSignedPhotoUrl } from "@/hooks/useSignedPhotoUrl";
import { useColors } from "@/hooks/useColors";
import { Feather } from "@expo/vector-icons";

export type PhotoCategory = "progress" | "issue" | "site_condition";

const CATEGORY_LABELS: Record<PhotoCategory, string> = {
  progress: "Progress",
  issue: "Issue",
  site_condition: "Site",
};

const CATEGORY_COLORS: Record<PhotoCategory, string> = {
  progress: "#2563EB",
  issue: "#D97706",
  site_condition: "#475569",
};

export function CategoryPill({ category }: { category?: PhotoCategory | null }) {
  const key = category ?? "progress";
  return (
    <View style={{ backgroundColor: CATEGORY_COLORS[key], paddingHorizontal: 5, paddingVertical: 1.5, borderRadius: 4 }}>
      <Text style={{ fontSize: 9, fontFamily: "Inter_600SemiBold", color: "#FFFFFF" }}>{CATEGORY_LABELS[key]}</Text>
    </View>
  );
}

interface PhotoThumbnailProps {
  objectPath: string | null | undefined;
  category?: PhotoCategory | null;
  size?: number;
  onPress?: () => void;
  style?: object;
}

export function PhotoThumbnail({ objectPath, category, size = 80, onPress, style }: PhotoThumbnailProps) {
  const colors = useColors();
  const { signedUrl, isLoading } = useSignedPhotoUrl(objectPath);

  return (
    <Pressable
      onPress={onPress}
      style={[
        {
          width: size,
          height: size,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: colors.border,
          overflow: "hidden",
          backgroundColor: "#f5f5f5",
          marginRight: 8,
        },
        style,
      ]}
    >
      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      ) : signedUrl ? (
        <Image source={{ uri: signedUrl }} style={{ width: size, height: size }} contentFit="cover" />
      ) : (
        <View style={styles.center}>
          <Feather name="image" size={18} color={colors.mutedForeground} />
        </View>
      )}
      {category && (
        <View style={{ position: "absolute", bottom: 3, left: 3 }}>
          <CategoryPill category={category} />
        </View>
      )}
    </Pressable>
  );
}

interface PhotoLightboxProps {
  objectPath: string | null;
  visible: boolean;
  onClose: () => void;
  category?: PhotoCategory | null;
  uploaderName?: string | null;
  uploadedAt?: string | null;
  onDelete?: () => void;
}

export function PhotoLightbox({ objectPath, visible, onClose, category, uploaderName, uploadedAt, onDelete }: PhotoLightboxProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { signedUrl, isLoading } = useSignedPhotoUrl(objectPath);

  async function saveToDevice() {
    if (!signedUrl || saving) return;
    setSaving(true);
    try {
      const ext = signedUrl.split("?")[0].split(".").pop()?.toLowerCase();
      const safeExt = ext && /^[a-z0-9]{2,4}$/.test(ext) ? ext : "jpg";
      const dest = `${FileSystem.cacheDirectory}site-photo-${Date.now()}.${safeExt}`;
      const { uri } = await FileSystem.downloadAsync(signedUrl, dest);
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri);
      } else {
        Alert.alert("Sharing is not available on this device.");
      }
    } catch {
      Alert.alert("Could not save photo", "Please check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.92)", alignItems: "center", justifyContent: "center" }}
        onPress={onClose}
      >
        {isLoading ? (
          <ActivityIndicator size="large" color="#fff" />
        ) : signedUrl ? (
          <>
            {loading && (
              <View style={{ position: "absolute", alignItems: "center", justifyContent: "center" }}>
                <ActivityIndicator size="large" color="#fff" />
              </View>
            )}
            <Image
              source={{ uri: signedUrl }}
              style={{ width: "95%", height: "75%", borderRadius: 10 }}
              contentFit="contain"
              onLoad={() => setLoading(false)}
            />
          </>
        ) : (
          <View style={{ alignItems: "center" }}>
            <Feather name="image" size={48} color="rgba(255,255,255,0.4)" />
          </View>
        )}
        {signedUrl ? (
          <Pressable
            onPress={saveToDevice}
            disabled={saving}
            hitSlop={12}
            style={{ position: "absolute", top: 52, left: 20, opacity: saving ? 0.5 : 1 }}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Feather name="share" size={24} color="#fff" />
            )}
          </Pressable>
        ) : null}
        {onDelete ? (
          <Pressable
            onPress={() => { onDelete(); onClose(); }}
            hitSlop={12}
            style={{ position: "absolute", top: 52, left: 60 }}
          >
            <Feather name="trash-2" size={22} color="#fff" />
          </Pressable>
        ) : null}
        <View style={{ position: "absolute", top: 52, right: 20 }}>
          <Feather name="x" size={28} color="#fff" />
        </View>
        {signedUrl && (category || uploaderName || uploadedAt) ? (
          <View style={{
            position: "absolute", bottom: 40, left: 20, right: 20,
            flexDirection: "row", alignItems: "center", justifyContent: "space-between",
          }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              {category && <CategoryPill category={category} />}
              {uploaderName && (
                <Text style={{ color: "rgba(255,255,255,0.8)", fontSize: 12, fontFamily: "Inter_500Medium" }}>
                  {uploaderName}
                </Text>
              )}
            </View>
            {uploadedAt && (
              <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 11, fontFamily: "Inter_400Regular" }}>
                {new Date(uploadedAt).toLocaleString("en-CA", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true })}
              </Text>
            )}
          </View>
        ) : null}
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
