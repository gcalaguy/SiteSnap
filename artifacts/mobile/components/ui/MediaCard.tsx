import React from "react";
import { Platform, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { useColors } from "@/hooks/useColors";
import { useSignedPhotoUrl } from "@/hooks/useSignedPhotoUrl";
import { elevation, radius, spacing, typography } from "@/constants/theme";

export type MediaCardSize = "hero" | "tile" | "compact";

const HEIGHTS: Record<MediaCardSize, number> = {
  hero: 220,
  tile: 150,
  compact: 108,
};

// `compact` is the grid size (two per row), so its title has to survive a
// half-width column — `heading` wraps to two lines there where `title` would
// overflow.
const TITLE_STYLE: Record<MediaCardSize, object> = {
  hero: typography.display,
  tile: typography.title,
  compact: typography.heading,
};

// Charcoal-to-tinted gradients for cards with no photo. Most records won't have
// one, so the fallback has to look deliberate rather than like a failed image —
// `seed` picks a stable pair so the same project is always the same colour
// instead of shuffling as the list re-renders.
const FALLBACK_GRADIENTS: [string, string][] = [
  ["#232323", "#141414"],
  ["#2A2417", "#151310"],
  ["#1C2426", "#111517"],
  ["#26201F", "#151111"],
  ["#1E2220", "#121514"],
];

interface MediaCardProps {
  /** Storage object path; signed on demand. Falls back to a gradient when absent. */
  objectPath?: string | null;
  /** Stable value (e.g. a record id) that picks the fallback gradient. */
  seed?: number | string;
  /** Watermark icon shown on the fallback gradient. */
  fallbackIcon?: keyof typeof Feather.glyphMap;
  eyebrow?: string;
  title: string;
  meta?: string;
  /** Rendered top-right, above the scrim — status pills, badges, counts. */
  badge?: React.ReactNode;
  /** Rendered below `meta`, inside the scrim — progress bars, chip rows. */
  footer?: React.ReactNode;
  size?: MediaCardSize;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

function seedIndex(seed: MediaCardProps["seed"], length: number): number {
  if (seed == null) return 0;
  if (typeof seed === "number") return Math.abs(Math.trunc(seed)) % length;
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return Math.abs(hash) % length;
}

/**
 * Full-bleed image (or gradient) card with a bottom scrim and overlaid text —
 * the primary "browse" surface: project tiles, tool tiles, the Home spotlight.
 *
 * Signing goes through `useSignedPhotoUrl`, the same hook `SignedImage` uses,
 * so a MediaCard and a thumbnail of the same photo share one cached signed URL
 * rather than requesting it twice.
 */
export function MediaCard({
  objectPath,
  seed,
  fallbackIcon = "image",
  eyebrow,
  title,
  meta,
  badge,
  footer,
  size = "tile",
  onPress,
  style,
}: MediaCardProps) {
  const colors = useColors();
  const { signedUrl } = useSignedPhotoUrl(objectPath);
  const [failed, setFailed] = React.useState(false);

  const showPhoto = !!signedUrl && !failed;
  const gradient = FALLBACK_GRADIENTS[seedIndex(seed, FALLBACK_GRADIENTS.length)];

  function handlePress() {
    if (!onPress) return;
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  }

  const body = (
    <View style={[styles.base, elevation.card, { height: HEIGHTS[size], borderColor: colors.borderSoft }]}>
      {showPhoto ? (
        <Image
          source={{ uri: signedUrl }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={200}
          onError={() => setFailed(true)}
        />
      ) : (
        <>
          <LinearGradient colors={gradient} style={StyleSheet.absoluteFill} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
          <Feather
            name={fallbackIcon}
            size={size === "hero" ? 104 : 72}
            color={colors.primary}
            style={styles.watermark}
          />
        </>
      )}

      {/* Scrim: without it, light photography makes the overlaid title unreadable. */}
      <LinearGradient
        colors={["transparent", "rgba(0,0,0,0.45)", "rgba(0,0,0,0.88)"]}
        locations={[0, 0.45, 1]}
        style={StyleSheet.absoluteFill}
      />

      {badge ? <View style={styles.badge}>{badge}</View> : null}

      <View style={[styles.content, size === "compact" && styles.contentCompact]}>
        {eyebrow ? (
          <Text style={[typography.label, { color: colors.primary }]} numberOfLines={1}>
            {eyebrow.toUpperCase()}
          </Text>
        ) : null}
        <Text style={[TITLE_STYLE[size], styles.title]} numberOfLines={2}>
          {title}
        </Text>
        {meta ? (
          <Text style={[typography.caption, styles.meta]} numberOfLines={1}>
            {meta}
          </Text>
        ) : null}
        {footer}
      </View>
    </View>
  );

  if (!onPress) return <View style={style}>{body}</View>;

  return (
    <Pressable onPress={handlePress} style={({ pressed }) => [style, { opacity: pressed ? 0.88 : 1 }]}>
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: "hidden",
    justifyContent: "flex-end",
  },
  watermark: {
    position: "absolute",
    right: -12,
    bottom: -12,
    opacity: 0.14,
  },
  badge: { position: "absolute", top: spacing.lg, right: spacing.lg },
  content: { padding: spacing.xl, gap: spacing.xs },
  contentCompact: { padding: spacing.lg },
  // Text sits on photography, so it's always light regardless of palette.
  title: { color: "#FFFFFF" },
  meta: { color: "rgba(255,255,255,0.72)" },
});
