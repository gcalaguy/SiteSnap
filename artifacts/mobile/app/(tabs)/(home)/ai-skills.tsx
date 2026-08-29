import React from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useGetMe, useListAiSkills } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { safeNavigate } from "@/utils/safeNavigate";
import { spacing, typography } from "@/constants/theme";

export default function AiSkillsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { data: me } = useGetMe();
  const { data: skills = [], isLoading } = useListAiSkills();

  const canGenerate = me?.role === "owner" || me?.role === "foreman" || (me?.permissions as any)?.useAiSkills === true;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 90 }}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10} style={{ marginBottom: 8 }}>
          <Feather name="arrow-left" size={20} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[typography.display, { color: colors.foreground }]}>AI Document Skills</Text>
        <Text style={[typography.body, { color: colors.mutedForeground, marginTop: 2 }]}>
          Draft RFIs, daily reports, punch lists, safety writeups and more from your field notes.
        </Text>
        {!canGenerate && (
          <View style={styles.lockRow}>
            <Feather name="lock" size={12} color={colors.mutedForeground} />
            <Text style={[styles.lockText, { color: colors.mutedForeground }]}>
              You can view drafts for your assigned projects. Generating new drafts requires owner/foreman access.
            </Text>
          </View>
        )}
      </View>

      {isLoading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : (
        <View style={styles.list}>
          {skills.map((skill) => (
            <TouchableOpacity
              key={skill.key}
              style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => safeNavigate(router, `/(tabs)/(home)/ai-skills-generate?skillKey=${skill.key}`, `ai-skills:${skill.key}`)}
              activeOpacity={0.85}
            >
              <View style={[styles.iconWrap, { backgroundColor: `${colors.primary}1F` }]}>
                <Feather name="file-text" size={18} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.cardTitleRow}>
                  <Text style={[styles.cardTitle, { color: colors.foreground }]}>{skill.name}</Text>
                  {skill.requiresApproval && (
                    <View style={[styles.badge, { borderColor: colors.border }]}>
                      <Text style={[styles.badgeText, { color: colors.mutedForeground }]}>Needs approval</Text>
                    </View>
                  )}
                </View>
                <Text style={[styles.cardSubtitle, { color: colors.mutedForeground }]} numberOfLines={2}>
                  {skill.description}
                </Text>
              </View>
              <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
            </TouchableOpacity>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: spacing.xl, marginBottom: spacing.lg },
  lockRow: { flexDirection: "row", alignItems: "flex-start", gap: 6, marginTop: 10 },
  lockText: { flex: 1, fontSize: 12, fontFamily: "NunitoSans_400Regular", lineHeight: 16 },
  list: { paddingHorizontal: spacing.xl, gap: spacing.sm },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
  },
  iconWrap: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  cardTitleRow: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  cardTitle: { fontSize: 15, fontFamily: "NunitoSans_600SemiBold" },
  cardSubtitle: { fontSize: 12, fontFamily: "NunitoSans_400Regular", marginTop: 2, lineHeight: 16 },
  badge: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  badgeText: { fontSize: 10, fontFamily: "NunitoSans_500Medium" },
});
