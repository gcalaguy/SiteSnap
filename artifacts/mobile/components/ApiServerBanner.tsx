import React from "react";
import { View, Text, StyleSheet, ActivityIndicator, Platform } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApiServerStatus } from "@/hooks/useApiServerStatus";

/**
 * Fixed top banner shown when the API server is unreachable.
 * Automatically dismisses once the server recovers.
 */
export function ApiServerBanner() {
  const { isDown } = useApiServerStatus();
  const insets = useSafeAreaInsets();

  if (!isDown) return null;

  const topPadding = insets.top + (Platform.OS === "android" ? 4 : 6);

  return (
    <View
      style={[styles.banner, { paddingTop: topPadding }]}
      accessibilityRole="alert"
      accessibilityLiveRegion="assertive"
    >
      <Feather name="alert-circle" size={14} color="#fff" />
      <Text style={styles.text}>Server temporarily unavailable — reconnecting</Text>
      <ActivityIndicator size="small" color="rgba(255,255,255,0.8)" style={styles.spinner} />
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#F97316",
    paddingBottom: 8,
    paddingHorizontal: 16,
  },
  text: {
    color: "#fff",
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    flexShrink: 1,
  },
  spinner: {
    marginLeft: 2,
    transform: [{ scale: 0.75 }],
  },
});
