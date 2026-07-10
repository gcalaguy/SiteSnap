import React, { useState } from "react";
import { Pressable, View, ActivityIndicator, StyleSheet, Modal, Alert } from "react-native";
import { Image } from "expo-image";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { useSignedPhotoUrl } from "@/hooks/useSignedPhotoUrl";
import { useColors } from "@/hooks/useColors";
import { Feather } from "@expo/vector-icons";

interface PhotoThumbnailProps {
  objectPath: string | null | undefined;
  size?: number;
  onPress?: () => void;
  style?: object;
}

export function PhotoThumbnail({ objectPath, size = 80, onPress, style }: PhotoThumbnailProps) {
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
    </Pressable>
  );
}

interface PhotoLightboxProps {
  objectPath: string | null;
  visible: boolean;
  onClose: () => void;
}

export function PhotoLightbox({ objectPath, visible, onClose }: PhotoLightboxProps) {
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
        <View style={{ position: "absolute", top: 52, right: 20 }}>
          <Feather name="x" size={28} color="#fff" />
        </View>
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
