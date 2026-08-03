import React, { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { Dimensions, PanResponder, StyleSheet, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";

export interface SignaturePadHandle {
  hasSignature: boolean;
  getSvg: () => string;
  clear: () => void;
}

interface SignaturePadProps {
  onChange?: (hasSignature: boolean) => void;
  // Fired while a stroke is in progress — callers embedding this inside a
  // ScrollView should disable scrolling for the duration so the gesture
  // isn't stolen mid-draw (see field-safety.tsx's original implementation).
  onSigningChange?: (isSigning: boolean) => void;
  height?: number;
}

const DEFAULT_HEIGHT = 160;

function pointsToSvgPath(points: Array<{ x: number; y: number }>): string {
  if (points.length === 0) return "";
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    d += ` L ${points[i].x} ${points[i].y}`;
  }
  return d;
}

const SignaturePad = forwardRef<SignaturePadHandle, SignaturePadProps>(function SignaturePad(
  { onChange, onSigningChange, height = DEFAULT_HEIGHT },
  ref,
) {
  const colors = useColors();
  const canvasWidth = Dimensions.get("window").width - 40;
  const [signaturePaths, setSignaturePaths] = useState<string[]>([]);
  const [currentPath, setCurrentPath] = useState<Array<{ x: number; y: number }>>([]);
  const currentPathRef = useRef<Array<{ x: number; y: number }>>([]);

  const commitStroke = useRef((stroke: Array<{ x: number; y: number }>) => {
    if (stroke.length > 1) {
      setSignaturePaths((sp) => {
        const next = [...sp, pointsToSvgPath(stroke)];
        onChange?.(true);
        return next;
      });
    }
    currentPathRef.current = [];
    setCurrentPath([]);
    onSigningChange?.(false);
  }).current;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponderCapture: () => true,
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
      onPanResponderGrant: (evt) => {
        const { locationX, locationY } = evt.nativeEvent;
        currentPathRef.current = [{ x: locationX, y: locationY }];
        setCurrentPath(currentPathRef.current);
        onSigningChange?.(true);
      },
      onPanResponderMove: (evt) => {
        const { locationX, locationY } = evt.nativeEvent;
        currentPathRef.current = [...currentPathRef.current, { x: locationX, y: locationY }];
        setCurrentPath(currentPathRef.current);
      },
      onPanResponderRelease: () => commitStroke(currentPathRef.current),
      onPanResponderTerminate: () => commitStroke(currentPathRef.current),
    }),
  ).current;

  function buildSignatureSvg(): string {
    const all = [...signaturePaths];
    if (currentPath.length > 1) all.push(pointsToSvgPath(currentPath));
    if (all.length === 0) return "";
    const paths = all
      .map(
        (d) =>
          `<path d="${d}" fill="none" stroke="#000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
      )
      .join("");
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasWidth}" height="${height}" viewBox="0 0 ${canvasWidth} ${height}">${paths}</svg>`;
  }

  const hasSignature = signaturePaths.length > 0 || currentPath.length > 0;

  useImperativeHandle(ref, () => ({
    hasSignature,
    getSvg: buildSignatureSvg,
    clear: () => {
      setSignaturePaths([]);
      setCurrentPath([]);
      currentPathRef.current = [];
      onChange?.(false);
    },
  }));

  return (
    <View>
      <View
        style={[
          styles.canvas,
          {
            height,
            borderColor: hasSignature ? "#22C55E" : colors.border,
            backgroundColor: "#FFFFFF",
          },
        ]}
      >
        <View style={StyleSheet.absoluteFill} {...panResponder.panHandlers}>
          <Svg width={canvasWidth} height={height}>
            {signaturePaths.map((d, i) => (
              <Path key={`p-${i}`} d={d} fill="none" stroke="#000" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            ))}
            {currentPath.length > 1 && (
              <Path d={pointsToSvgPath(currentPath)} fill="none" stroke="#000" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            )}
          </Svg>
        </View>
        {!hasSignature && (
          <View style={styles.placeholder}>
            <Feather name="edit-3" size={24} color={colors.mutedForeground} />
            <Text style={[styles.placeholderText, { color: colors.mutedForeground }]}>Sign here</Text>
          </View>
        )}
      </View>
      {hasSignature && (
        <Text
          onPress={() => {
            setSignaturePaths([]);
            setCurrentPath([]);
            currentPathRef.current = [];
            onChange?.(false);
          }}
          style={styles.clearText}
        >
          Clear signature
        </Text>
      )}
    </View>
  );
});

export default SignaturePad;

const styles = StyleSheet.create({
  canvas: {
    width: "100%",
    borderWidth: 2,
    borderStyle: "dashed",
    borderRadius: 16,
    overflow: "hidden",
    justifyContent: "center",
    alignItems: "center",
  },
  placeholder: { position: "absolute", alignItems: "center", gap: 6 },
  placeholderText: { fontSize: 14, fontFamily: "NunitoSans_500Medium" },
  clearText: { alignSelf: "flex-end", marginTop: 6, color: "#EF4444", fontSize: 13 },
});
