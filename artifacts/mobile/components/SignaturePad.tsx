import React, { useRef, useState, useCallback } from "react";
import {
  GestureResponderEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from "react-native";
import Svg, { Path } from "react-native-svg";
import * as Haptics from "expo-haptics";

export interface MobileSignaturePadProps {
  onChange?: (svgDataUrl: string, paths: string[]) => void;
  height?: number;
  strokeColor?: string;
  strokeWidth?: number;
  style?: ViewStyle;
  disabled?: boolean;
}

/**
 * Mobile signature pad using react-native-svg + GestureResponder.
 * Emits an SVG-based PNG-equivalent data URL via `onChange(svgDataUrl, paths)`.
 * The dataUrl is `data:image/svg+xml;base64,...` which is accepted by all our
 * backends (validated as a data URL string up to 2MB).
 */
export function MobileSignaturePad({
  onChange,
  height = 180,
  strokeColor = "#0a0a0a",
  strokeWidth = 2.4,
  style,
  disabled = false,
}: MobileSignaturePadProps) {
  const [paths, setPaths] = useState<string[]>([]);
  const [current, setCurrent] = useState<string>("");
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 0, h: height });
  const startedRef = useRef(false);

  const buildSvg = useCallback(
    (allPaths: string[]) => {
      const w = Math.max(1, size.w);
      const h = Math.max(1, size.h);
      const body = allPaths
        .map(
          (d) =>
            `<path d="${d}" stroke="${strokeColor}" stroke-width="${strokeWidth}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
        )
        .join("");
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"><rect width="100%" height="100%" fill="#ffffff"/>${body}</svg>`;
      // base64 encode
      // React Native's global has no `btoa`; use a tiny inline encoder.
      const bytes = utf8ToBytes(svg);
      const b64 = bytesToBase64(bytes);
      return `data:image/svg+xml;base64,${b64}`;
    },
    [size, strokeColor, strokeWidth],
  );

  const handleStart = (e: GestureResponderEvent) => {
    if (disabled) return;
    const { locationX, locationY } = e.nativeEvent;
    startedRef.current = true;
    setCurrent(`M ${locationX.toFixed(1)} ${locationY.toFixed(1)}`);
    if (paths.length === 0) {
      Haptics.selectionAsync().catch(() => undefined);
    }
  };
  const handleMove = (e: GestureResponderEvent) => {
    if (!startedRef.current || disabled) return;
    const { locationX, locationY } = e.nativeEvent;
    setCurrent((d) => `${d} L ${locationX.toFixed(1)} ${locationY.toFixed(1)}`);
  };
  const handleEnd = () => {
    if (!startedRef.current || !current) return;
    startedRef.current = false;
    const next = [...paths, current];
    setPaths(next);
    setCurrent("");
    onChange?.(buildSvg(next), next);
  };

  const clear = () => {
    setPaths([]);
    setCurrent("");
    onChange?.("", []);
  };

  return (
    <View style={[styles.wrapper, style]}>
      <View
        style={[styles.canvas, disabled && { opacity: 0.6 }]}
        onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: height })}
        onStartShouldSetResponder={() => !disabled}
        onMoveShouldSetResponder={() => !disabled}
        onResponderGrant={handleStart}
        onResponderMove={handleMove}
        onResponderRelease={handleEnd}
        onResponderTerminate={handleEnd}
      >
        <Svg width="100%" height={height} pointerEvents="none">
          {paths.map((d, i) => (
            <Path key={i} d={d} stroke={strokeColor} strokeWidth={strokeWidth} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          ))}
          {current ? (
            <Path d={current} stroke={strokeColor} strokeWidth={strokeWidth} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          ) : null}
        </Svg>
        {paths.length === 0 && !current && (
          <Text style={styles.placeholder}>Sign here</Text>
        )}
      </View>
      <View style={styles.actions}>
        <Text style={styles.helpText}>By signing, you agree this electronic signature is legally binding.</Text>
        <Pressable onPress={clear} disabled={disabled || (paths.length === 0 && !current)} style={({ pressed }) => [styles.clearBtn, pressed && { opacity: 0.6 }]}>
          <Text style={styles.clearText}>Clear</Text>
        </Pressable>
      </View>
    </View>
  );
}

function utf8ToBytes(str: string): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < str.length; i++) {
    let c = str.charCodeAt(i);
    if (c < 0x80) out.push(c);
    else if (c < 0x800) {
      out.push(0xc0 | (c >> 6));
      out.push(0x80 | (c & 0x3f));
    } else if (c < 0xd800 || c >= 0xe000) {
      out.push(0xe0 | (c >> 12));
      out.push(0x80 | ((c >> 6) & 0x3f));
      out.push(0x80 | (c & 0x3f));
    } else {
      i++;
      const c2 = str.charCodeAt(i);
      const cp = 0x10000 + (((c & 0x3ff) << 10) | (c2 & 0x3ff));
      out.push(0xf0 | (cp >> 18));
      out.push(0x80 | ((cp >> 12) & 0x3f));
      out.push(0x80 | ((cp >> 6) & 0x3f));
      out.push(0x80 | (cp & 0x3f));
    }
  }
  return new Uint8Array(out);
}

function bytesToBase64(bytes: Uint8Array): string {
  const ALPHA = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let out = "";
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out += ALPHA[(n >> 18) & 63] + ALPHA[(n >> 12) & 63] + ALPHA[(n >> 6) & 63] + ALPHA[n & 63];
  }
  if (i < bytes.length) {
    const rem = bytes.length - i;
    const n = bytes[i] << 16 | (rem === 2 ? bytes[i + 1] << 8 : 0);
    out += ALPHA[(n >> 18) & 63] + ALPHA[(n >> 12) & 63];
    out += rem === 2 ? ALPHA[(n >> 6) & 63] : "=";
    out += "=";
  }
  return out;
}

const styles = StyleSheet.create({
  wrapper: { width: "100%" },
  canvas: {
    backgroundColor: "#fff",
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: "rgba(0,0,0,0.18)",
    borderRadius: 10,
    overflow: "hidden",
    position: "relative",
  },
  placeholder: {
    position: "absolute",
    top: "50%",
    left: 0,
    right: 0,
    textAlign: "center",
    color: "rgba(0,0,0,0.35)",
    fontSize: 14,
    transform: [{ translateY: -10 }],
  },
  actions: { marginTop: 8, flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  helpText: { flex: 1, fontSize: 11, color: "#6b7280" },
  clearBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, backgroundColor: "#f3f4f6" },
  clearText: { fontSize: 12, color: "#374151", fontWeight: "600" },
});

export default MobileSignaturePad;
