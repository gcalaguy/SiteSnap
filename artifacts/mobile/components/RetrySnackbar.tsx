import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface RetrySnackbarProps {
  visible: boolean;
  message?: string;
}

/**
 * A non-blocking animated snackbar that slides up from the bottom of the
 * screen while an AI request is retrying. It disappears automatically once
 * `visible` becomes false, so callers only need to toggle the flag.
 */
export function RetrySnackbar({
  visible,
  message = "Poor connection detected, retrying…",
}: RetrySnackbarProps) {
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(80)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: true,
          tension: 80,
          friction: 12,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: 80,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: 180,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, translateY, opacity]);

  return (
    <Animated.View
      style={[
        styles.snackbar,
        {
          bottom: insets.bottom + 12,
          transform: [{ translateY }],
          opacity,
        },
      ]}
      pointerEvents="none"
    >
      <View style={styles.iconWrap}>
        <Feather name="wifi-off" size={14} color="#FFFFFF" />
      </View>
      <Text style={styles.message}>{message}</Text>
      <View style={styles.dot} />
      <View style={[styles.dot, { opacity: 0.6 }]} />
      <View style={[styles.dot, { opacity: 0.3 }]} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  snackbar: {
    position: "absolute",
    left: 16,
    right: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#1E293B",
    borderRadius: 12,
    paddingVertical: 11,
    paddingHorizontal: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 999,
  },
  iconWrap: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  message: {
    flex: 1,
    fontSize: 13,
    color: "#F1F5F9",
    fontFamily: "Inter_500Medium",
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#94A3B8",
  },
});
