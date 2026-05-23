import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Platform } from "react-native";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";

export default function ScheduleScreen() {
  const router = useRouter();
  const colors = useColors();

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={styles.content}>
      <Text style={[styles.title, { color: colors.foreground }]}>Assigned Schedule</Text>
      <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>Your scheduled work will appear here.</Text>

      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Feather name="calendar" size={28} color={colors.primary} />
        <Text style={[styles.cardTitle, { color: colors.foreground }]}>No schedule loaded yet</Text>
        <Text style={[styles.cardText, { color: colors.mutedForeground }]}>Check back once assignments are published.</Text>
      </View>

      <TouchableOpacity
        style={[styles.button, { backgroundColor: colors.primary }]}
        onPress={() => {
          if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          router.back();
        }}
        activeOpacity={0.8}
      >
        <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>Go Back</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, paddingTop: 64, gap: 16 },
  title: { fontSize: 28, fontWeight: "800" },
  subtitle: { fontSize: 14 },
  card: { borderWidth: 1, borderRadius: 20, padding: 20, gap: 10, alignItems: "flex-start" },
  cardTitle: { fontSize: 18, fontWeight: "700" },
  cardText: { fontSize: 14, lineHeight: 20 },
  button: { borderRadius: 14, paddingVertical: 14, alignItems: "center" },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});