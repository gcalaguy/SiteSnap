import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";

interface DraftBannerProps {
  visible: boolean;
  onRestore: () => void;
  onDiscard: () => void;
  accentColor?: string;
}

export function DraftBanner({ visible, onRestore, onDiscard, accentColor = "#D97706" }: DraftBannerProps) {
  if (!visible) return null;

  return (
    <View style={[styles.banner, { borderColor: accentColor, backgroundColor: `${accentColor}12` }]}>
      <Feather name="save" size={18} color={accentColor} />
      <Text style={[styles.text, { color: accentColor }]}>
        Unsaved draft detected.
      </Text>
      <TouchableOpacity onPress={onRestore} activeOpacity={0.75}>
        <Text style={[styles.action, { color: accentColor }]}>Restore Draft</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={onDiscard} activeOpacity={0.75}>
        <Text style={[styles.action, { color: "#991B1B" }]}>Discard</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 10,
    borderWidth: 1.5,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginHorizontal: 20,
    marginBottom: 14,
  },
  text: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  action: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    textDecorationLine: "underline",
  },
});
