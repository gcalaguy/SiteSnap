import React from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { Image, type ImageContentFit } from "expo-image";
import { useColors } from "@/hooks/useColors";
import { useSignedPhotoUrl } from "@/hooks/useSignedPhotoUrl";
import { Feather } from "@expo/vector-icons";

// Legacy React Native resizeMode values that don't exist in expo-image's
// ImageContentFit — map them to the nearest equivalent.
const RN_TO_CONTENT_FIT: Record<string, ImageContentFit> = {
  cover: "cover",
  contain: "contain",
  stretch: "fill",   // RN "stretch" = scale to fill without preserving ratio
  center: "none",    // RN "center" = original size, centered (no scaling)
};

interface SignedImageProps {
  objectPath: string | null | undefined;
  style?: any;
  resizeMode?: "cover" | "contain" | "stretch" | "center";
  onPress?: () => void;
}

export function SignedImage({
  objectPath,
  style,
  resizeMode = "cover",
  onPress,
}: SignedImageProps) {
  const colors = useColors();
  const { signedUrl, isLoading, isError } = useSignedPhotoUrl(objectPath);

  if (isLoading) {
    return (
      <View style={[style, styles.center]}>
        <ActivityIndicator size="small" color={colors.primary} />
      </View>
    );
  }

  if (isError || !signedUrl) {
    return (
      <View style={[style, styles.center]}>
        <Feather name="image" size={18} color={colors.mutedForeground} />
      </View>
    );
  }

  return (
    <Image
      source={{ uri: signedUrl }}
      style={style}
      contentFit={RN_TO_CONTENT_FIT[resizeMode] ?? "cover"}
    />
  );
}

const styles = StyleSheet.create({
  center: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f5f5f5",
  },
});
