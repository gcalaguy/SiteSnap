import React, { useRef, useState, useCallback } from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  PanResponder,
  GestureResponderEvent,
  Dimensions,
} from "react-native";
import Svg, { Path } from "react-native-svg";
import { useColors } from "@/hooks/useColors";
import { Feather } from "@expo/vector-icons";

interface SignatureCanvasProps {
  visible: boolean;
  onClose: () => void;
  onSave: (base64: string) => void;
}

type Point = { x: number; y: number };

type Stroke = Point[];

export default function SignatureCanvas({ visible, onClose, onSave }: SignatureCanvasProps) {
  const colors = useColors();
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [currentStroke, setCurrentStroke] = useState<Stroke>([]);
  const canvasRef = useRef<View>(null);
  const [canvasLayout, setCanvasLayout] = useState({ x: 0, y: 0, width: 0, height: 0 });

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt: GestureResponderEvent) => {
        const { locationX, locationY } = evt.nativeEvent;
        setCurrentStroke([{ x: locationX, y: locationY }]);
      },
      onPanResponderMove: (evt: GestureResponderEvent) => {
        const { locationX, locationY } = evt.nativeEvent;
        setCurrentStroke((prev) => [...prev, { x: locationX, y: locationY }]);
      },
      onPanResponderRelease: () => {
        setCurrentStroke((stroke) => {
          if (stroke.length > 0) {
            setStrokes((prev) => [...prev, stroke]);
          }
          return [];
        });
      },
    }),
  ).current;

  const clear = useCallback(() => {
    setStrokes([]);
    setCurrentStroke([]);
  }, []);

  const toSvgPath = (points: Point[]): string => {
    if (points.length === 0) return "";
    let d = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      d += ` L ${points[i].x} ${points[i].y}`;
    }
    return d;
  };

  const allPaths = [...strokes, currentStroke].filter((s) => s.length > 0);

  const handleSave = useCallback(() => {
    if (allPaths.length === 0) {
      onClose();
      return;
    }
    const { width, height } = canvasLayout;
    const svgString = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
        <rect width="100%" height="100%" fill="white"/>
        ${allPaths
          .map(
            (stroke) =>
              `<path d="${toSvgPath(stroke)}" stroke="#000000" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
          )
          .join("\n")}
      </svg>`;
    const base64 = "data:image/svg+xml;base64," + btoa(svgString);
    onSave(base64);
    setStrokes([]);
    setCurrentStroke([]);
    onClose();
  }, [allPaths, canvasLayout, onSave, onClose]);

  const screenW = Dimensions.get("window").width;
  const padW = screenW - 48;
  const padH = Math.min(220, Dimensions.get("window").height * 0.35);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={[styles.overlay, { backgroundColor: "rgba(0,0,0,0.5)" }]}>
        <View style={[styles.card, { backgroundColor: colors.card }]}
          onLayout={(e) => {
            const { x, y, width, height } = e.nativeEvent.layout;
            setCanvasLayout({ x, y, width, height });
          }}
        >
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.foreground }]}>Client Signature</Text>
            <TouchableOpacity onPress={onClose}>
              <Feather name="x" size={24} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>

          <View
            ref={canvasRef}
            {...panResponder.panHandlers}
            style={[
              styles.canvas,
              { width: padW, height: padH, backgroundColor: "#FFFFFF", borderColor: colors.border },
            ]}
          >
            <Svg width={padW} height={padH}>
              {allPaths.map((stroke, i) => (
                <Path
                  key={i}
                  d={toSvgPath(stroke)}
                  stroke="#000000"
                  strokeWidth={3}
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ))}
            </Svg>
            {allPaths.length === 0 && (
              <View style={styles.hintBox}>
                <Text style={[styles.hint, { color: colors.mutedForeground }]}>
                  Sign here with your finger
                </Text>
              </View>
            )}
          </View>

          <View style={styles.actions}>
            <TouchableOpacity
              onPress={clear}
              style={[styles.btnOutline, { borderColor: colors.border }]}
            >
              <Feather name="trash-2" size={16} color={colors.destructive} />
              <Text style={[styles.btnText, { color: colors.destructive }]}>Clear</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleSave}
              style={[styles.btnPrimary, { backgroundColor: colors.primary }]}
            >
              <Feather name="check" size={16} color="#fff" />
              <Text style={[styles.btnText, { color: "#fff" }]}>Save Signature</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  card: {
    borderRadius: 16,
    padding: 20,
    width: "100%",
    maxWidth: 480,
    alignSelf: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 10,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
  },
  canvas: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
    alignSelf: "center",
    position: "relative",
  },
  hintBox: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    pointerEvents: "none",
  },
  hint: {
    fontSize: 14,
    fontStyle: "italic",
    opacity: 0.5,
  },
  actions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 16,
    justifyContent: "flex-end",
  },
  btnOutline: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  btnPrimary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
  },
  btnText: {
    fontSize: 14,
    fontWeight: "600",
  },
});
