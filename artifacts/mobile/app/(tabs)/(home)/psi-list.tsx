import { customFetch } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { Feather } from "@expo/vector-icons";
import type { PsiListRow } from "@/constants/psi";

export default function PsiListScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const listQuery = useQuery<PsiListRow[]>({
    queryKey: ["psi-checklists"],
    queryFn: () => customFetch("/api/psi"),
  });

  const s = styles(colors);
  const rows = listQuery.data ?? [];

  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      <View style={[s.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Feather name="arrow-left" size={20} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[s.title, { color: colors.foreground }]}>Pre-Inspections</Text>
        <TouchableOpacity onPress={() => router.push("/(tabs)/(home)/psi-checklist")} style={[s.newBtn, { backgroundColor: colors.primary }]}>
          <Feather name="plus" size={18} color="#fff" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }} showsVerticalScrollIndicator={false}>
        {listQuery.isLoading && (
          <View style={{ paddingVertical: 40, alignItems: "center" }}>
            <ActivityIndicator color={colors.primary} />
          </View>
        )}

        {!listQuery.isLoading && rows.length === 0 && (
          <View style={{ paddingVertical: 40, alignItems: "center" }}>
            <Feather name="clipboard" size={28} color={colors.mutedForeground} style={{ opacity: 0.4 }} />
            <Text style={[s.emptyText, { color: colors.mutedForeground }]}>No pre-inspection checklists yet.</Text>
          </View>
        )}

        {rows.map((row) => {
          const isDraft = row.psi.status === "draft";
          return (
            <TouchableOpacity
              key={row.psi.id}
              onPress={() =>
                router.push(
                  isDraft
                    ? `/(tabs)/(home)/psi-checklist?id=${row.psi.id}`
                    : `/(tabs)/(home)/psi-detail?id=${row.psi.id}`,
                )
              }
              style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <View style={[s.statusBadge, { backgroundColor: isDraft ? colors.draft : colors.success }]}>
                  <Text style={s.statusBadgeText}>{isDraft ? "Draft" : "Submitted"}</Text>
                </View>
                <Text style={[s.dateText, { color: colors.mutedForeground }]}>{row.psi.date}</Text>
              </View>
              <Text style={[s.projectText, { color: colors.foreground }]} numberOfLines={1}>
                {row.project?.name ?? "Unknown project"}
                {row.psi.tradeDescription ? ` — ${row.psi.tradeDescription}` : ""}
              </Text>
              <Text style={[s.metaText, { color: colors.mutedForeground }]}>
                {row.creator ? `${row.creator.firstName} ${row.creator.lastName}` : "Unknown"}
                {" · "}{row.signatureCount} signature{row.signatureCount === 1 ? "" : "s"}
                {" · "}{row.approvalCount} approval{row.approvalCount === 1 ? "" : "s"}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = (colors: ReturnType<typeof useColors>) =>
  StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 12, gap: 12 },
    backBtn: { padding: 4 },
    title: { flex: 1, fontSize: 20, fontFamily: "Inter_700Bold" },
    newBtn: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
    emptyText: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 8 },
    card: { borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 10 },
    statusBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
    statusBadgeText: { color: "#fff", fontSize: 11, fontFamily: "Inter_700Bold" },
    dateText: { fontSize: 12, fontFamily: "Inter_400Regular" },
    projectText: { fontSize: 14, fontFamily: "Inter_600SemiBold", marginBottom: 2 },
    metaText: { fontSize: 12, fontFamily: "Inter_400Regular" },
  });
