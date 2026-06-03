import React, { useState } from "react";
import { Pressable, View, Image, ActivityIndicator, StyleSheet, Modal } from "react-native";
import { useSignedPhotoUrl } from "@/hooks/useSignedPhotoUrl";
import { useColors } from "@/hooks/useColors";
import { Feather } from "@expo/vector-icons";

interface PhotoThumbnailProps {
  objectPath: string | null | undefined;
  size?: number;
  onPress?: () => void;
}

export function PhotoThumbnail({ objectPath, size = 80, onPress }: PhotoThumbnailProps) {
  const colors = useColors();
  const { signedUrl, isLoading } = useSignedPhotoUrl(objectPath);

  return (
    <Pressable
      onPress={onPress}
      style={{
        width: size,
        height: size,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: colors.border,
        overflow: "hidden",
        backgroundColor: "#f5f5f5",
        marginRight: 8,
      }}
    >
      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      ) : signedUrl ? (
        <Image source={{ uri: signedUrl }} style={{ width: size, height: size }} resizeMode="cover" />
      ) : (
        <View style={styles.center}>
          <Feather name="image" size={18} color={colors.mutedForeground} />
        </View>
      )}
    </Pressable>
  );
}

interface PhotoLightboxProps {
  signedUrl: string | null;
  visible: boolean;
  onClose: () => void;
}

export function PhotoLightbox({ signedUrl, visible, onClose }: PhotoLightboxProps) {
  const [loading, setLoading] = useState(true);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.92)", alignItems: "center", justifyContent: "center" }}
        onPress={onClose}
      >
        {signedUrl && (
          <>
            {loading && (
              <View style={{ position: "absolute", alignItems: "center", justifyContent: "center" }}>
                <ActivityIndicator size="large" color="#fff" />
              </View>
            )}
            <Image
              source={{ uri: signedUrl }}
              style={{ width: "95%", height: "75%", borderRadius: 10 }}
              resizeMode="contain"
              onLoad={() => setLoading(false)}
            />
          </>
        )}
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
