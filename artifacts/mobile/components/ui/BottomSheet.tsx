import React, { useEffect, useState } from "react";
import { Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";

import { useColors } from "@/hooks/useColors";
import { elevation, motion, radius, spacing, typography } from "@/constants/theme";

// Slide-up-from-viewport-base primitive standing in for the full-page Modal
// forms/filters this redesign is replacing (see finance.tsx's old
// presentationStyle="pageSheet" flows). Drag-to-dismiss is only wired to the
// handle/header row, not the whole card — the same reason Slack's action
// sheets do it that way: a ScrollView full of form fields underneath needs
// its own vertical pan gesture uncontested.
const OFFSCREEN = 900;
const SPRING = { damping: 22, stiffness: 260, mass: 0.9 } as const;
const DISMISS_DISTANCE = 100;
const DISMISS_VELOCITY = 800;

interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  /** Wrap children in a ScrollView (default true — set false if children manage their own scrolling). */
  scrollable?: boolean;
}

export function BottomSheet({ visible, onClose, title, children, scrollable = true }: BottomSheetProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [mounted, setMounted] = useState(visible);
  const translateY = useSharedValue(OFFSCREEN);
  const backdropOpacity = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      translateY.value = withSpring(0, SPRING);
      backdropOpacity.value = withTiming(1, { duration: motion.duration.standard });
    } else {
      translateY.value = withTiming(OFFSCREEN, { duration: motion.duration.standard }, (finished) => {
        if (finished) runOnJS(setMounted)(false);
      });
      backdropOpacity.value = withTiming(0, { duration: motion.duration.standard });
    }
  }, [visible]);

  function requestClose() {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onClose();
  }

  const pan = Gesture.Pan()
    .onUpdate((e) => {
      translateY.value = Math.max(0, e.translationY);
    })
    .onEnd((e) => {
      if (e.translationY > DISMISS_DISTANCE || e.velocityY > DISMISS_VELOCITY) {
        runOnJS(requestClose)();
      } else {
        translateY.value = withSpring(0, SPRING);
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  if (!mounted) return null;

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={requestClose}>
      <View style={StyleSheet.absoluteFill}>
        <Animated.View style={[StyleSheet.absoluteFill, backdropStyle]}>
          <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay }]} onPress={requestClose} />
        </Animated.View>

        <Animated.View
          style={[
            styles.sheet,
            elevation.sheet,
            { backgroundColor: colors.card, paddingBottom: insets.bottom + spacing.lg },
            sheetStyle,
          ]}
        >
          <GestureDetector gesture={pan}>
            <View>
              <View style={styles.handleRow}>
                <View style={[styles.handle, { backgroundColor: colors.sheetHandle }]} />
              </View>
              {title ? (
                <View style={styles.header}>
                  <Text style={[typography.heading, { color: colors.foreground }]}>{title}</Text>
                  <Pressable onPress={requestClose} hitSlop={10}>
                    <Feather name="x" size={20} color={colors.mutedForeground} />
                  </Pressable>
                </View>
              ) : null}
            </View>
          </GestureDetector>

          {scrollable ? (
            // KeyboardAwareScrollView (not a plain ScrollView) so a focused field
            // low in the sheet — e.g. Description — auto-scrolls clear of the
            // keyboard instead of being hidden behind it.
            <KeyboardAwareScrollView
              style={styles.scrollBody}
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="interactive"
              bottomOffset={insets.bottom + spacing.lg}
            >
              {children}
            </KeyboardAwareScrollView>
          ) : (
            children
          )}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: "88%",
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
  },
  handleRow: { alignItems: "center", paddingTop: spacing.sm, paddingBottom: spacing.xs },
  handle: { width: 36, height: 4, borderRadius: 2 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xs,
    paddingBottom: spacing.md,
  },
  scrollBody: { flexGrow: 0 },
  scrollContent: { paddingHorizontal: spacing.xl, paddingBottom: spacing.lg },
});
