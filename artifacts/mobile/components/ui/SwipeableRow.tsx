import React, { useRef } from "react";
import { Animated, Platform, StyleSheet, Text, View } from "react-native";
import { Swipeable } from "react-native-gesture-handler";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";


// Full-swipe-to-act, not reveal-then-tap: dragging past the threshold fires
// the action immediately (haptic + callback) and the row snaps shut, the way
// swiping a Change Order right instantly approves it rather than exposing a
// button you still have to tap. A short drag that doesn't cross the
// threshold just previews the action and springs back.
export interface SwipeAction {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  color: string;
  onTrigger: () => void;
}

interface SwipeableRowProps {
  children: React.ReactNode;
  leftAction?: SwipeAction;
  rightAction?: SwipeAction;
  disabled?: boolean;
}

const ACTION_WIDTH = 96;

function ActionPanel({ action, progress, side }: { action: SwipeAction; progress: Animated.AnimatedInterpolation<number>; side: "left" | "right" }) {
  const scale = progress.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1], extrapolate: "clamp" });
  return (
    <View style={[styles.actionPanel, { width: ACTION_WIDTH, backgroundColor: action.color }, side === "left" ? styles.actionLeft : styles.actionRight]}>
      <Animated.View style={{ alignItems: "center", gap: 4, transform: [{ scale }] }}>
        <Feather name={action.icon} size={20} color="#FFFFFF" />
        <Text style={styles.actionLabel}>{action.label}</Text>
      </Animated.View>
    </View>
  );
}

export function SwipeableRow({ children, leftAction, rightAction, disabled = false }: SwipeableRowProps) {
  const ref = useRef<Swipeable>(null);

  if (disabled || (!leftAction && !rightAction)) return <>{children}</>;

  function handleOpen(direction: "left" | "right") {
    const action = direction === "left" ? leftAction : rightAction;
    if (!action) return;
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    action.onTrigger();
    ref.current?.close();
  }

  return (
    <Swipeable
      ref={ref}
      leftThreshold={ACTION_WIDTH * 0.6}
      rightThreshold={ACTION_WIDTH * 0.6}
      overshootLeft={false}
      overshootRight={false}
      onSwipeableOpen={handleOpen}
      renderLeftActions={leftAction ? (progress) => <ActionPanel action={leftAction} progress={progress} side="left" /> : undefined}
      renderRightActions={rightAction ? (progress) => <ActionPanel action={rightAction} progress={progress} side="right" /> : undefined}
    >
      {children}
    </Swipeable>
  );
}

const styles = StyleSheet.create({
  actionPanel: { justifyContent: "center", alignItems: "center" },
  actionLeft: { borderTopLeftRadius: 14, borderBottomLeftRadius: 14 },
  actionRight: { borderTopRightRadius: 14, borderBottomRightRadius: 14 },
  actionLabel: { color: "#FFFFFF", fontSize: 11, fontFamily: "Inter_600SemiBold" },
});
