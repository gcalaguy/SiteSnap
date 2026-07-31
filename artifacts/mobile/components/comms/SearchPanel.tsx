import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable, TextInput, ActivityIndicator, Alert } from "react-native";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import {
  useSearchCommunications,
  type CommunicationSearchCriteria,
  type StructuredEmailSearchResult,
} from "@workspace/api-client-react";
import { commsStyles as cs } from "./styles";

const ATTACHMENT_TYPES: { value: NonNullable<CommunicationSearchCriteria["attachmentTypes"]>[number]; label: string }[] = [
  { value: "pdf", label: "PDF" },
  { value: "invoice", label: "Invoice" },
  { value: "quote", label: "Quote" },
  { value: "permit", label: "Permit" },
  { value: "inspection_report", label: "Inspection" },
  { value: "image", label: "Images" },
];

function relativeDateLabel(iso: string | null | undefined) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-CA", { month: "short", day: "numeric" });
}

/**
 * Embedded, project-scoped slice of the full Advanced Search Builder
 * (app/communications-search.tsx) — keywords + attachment-type filters
 * fixed to this project via criteria.projectId. Deliberately a smaller
 * surface than the full-screen builder (no saved templates, no Ask AI, no
 * nested condition tree) rather than a shared-component refactor of that
 * already-working screen — a "More search options" link routes there for
 * anything beyond this.
 */
export function SearchPanel({ projectId }: { projectId: number }) {
  const colors = useColors();
  const router = useRouter();
  const [keywords, setKeywords] = useState("");
  const [attachmentTypes, setAttachmentTypes] = useState<NonNullable<CommunicationSearchCriteria["attachmentTypes"]>>([]);
  const [results, setResults] = useState<StructuredEmailSearchResult[] | null>(null);

  const { mutateAsync: runSearch, isPending: searching } = useSearchCommunications();

  function toggleType(type: NonNullable<CommunicationSearchCriteria["attachmentTypes"]>[number]) {
    setAttachmentTypes((prev) => (prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]));
  }

  async function handleSearch() {
    try {
      const result = await runSearch({
        data: { keywords: keywords.trim() || undefined, attachmentTypes: attachmentTypes.length ? attachmentTypes : undefined, projectId },
        params: { limit: 30 },
      });
      setResults(result.results);
    } catch {
      Alert.alert("Search failed", "Please try again.");
    }
  }

  return (
    <View style={{ gap: 12 }}>
      <View style={[s.searchBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Feather name="search" size={15} color={colors.mutedForeground} />
        <TextInput
          style={s.searchInput}
          value={keywords}
          onChangeText={setKeywords}
          placeholder="Keywords…"
          placeholderTextColor={colors.mutedForeground}
          autoCapitalize="none"
          onSubmitEditing={handleSearch}
        />
      </View>

      <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
        {ATTACHMENT_TYPES.map((opt) => {
          const active = attachmentTypes.includes(opt.value);
          return (
            <Pressable
              key={opt.value}
              onPress={() => toggleType(opt.value)}
              style={[s.chip, { backgroundColor: active ? colors.primary : colors.muted, borderColor: colors.border }]}
            >
              <Text style={[s.chipText, { color: active ? "#FFFFFF" : colors.foreground }]}>{opt.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <Pressable onPress={handleSearch} disabled={searching} style={[s.searchBtn, { backgroundColor: colors.primary }]}>
        {searching ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={s.searchBtnText}>Search</Text>}
      </Pressable>

      <Pressable onPress={() => router.push("/communications-search")}>
        <Text style={[s.moreLink, { color: colors.primary }]}>More search options (Advanced, Ask AI, saved templates) →</Text>
      </Pressable>

      {results != null && (
        <View style={{ gap: 8 }}>
          <Text style={[cs.rowMeta, { color: colors.mutedForeground }]}>{results.length} result{results.length === 1 ? "" : "s"}</Text>
          {results.length === 0 ? (
            <View style={[cs.emptyBox, { borderColor: colors.border }]}>
              <Feather name="search" size={22} color={colors.mutedForeground} />
              <Text style={[cs.emptyTitle, { color: colors.foreground }]}>No matches</Text>
            </View>
          ) : (
            results.map((r) => (
              <View key={r.id} style={[s.resultCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[cs.rowTitle, { color: colors.foreground }]} numberOfLines={1}>
                  {r.subject || "(no subject)"}
                </Text>
                <Text style={[cs.rowMeta, { color: colors.mutedForeground }]} numberOfLines={1}>
                  {r.from_name || r.from_email || ""} · {relativeDateLabel(r.sent_at)}
                </Text>
              </View>
            ))
          )}
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  searchBar: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10 },
  searchInput: { flex: 1, fontSize: 14, fontFamily: "NunitoSans_400Regular" },
  chip: { borderRadius: 16, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 7 },
  chipText: { fontSize: 12, fontFamily: "NunitoSans_600SemiBold" },
  searchBtn: { alignItems: "center", justifyContent: "center", borderRadius: 16, paddingVertical: 12 },
  searchBtnText: { fontSize: 14, fontFamily: "NunitoSans_600SemiBold", color: "#FFFFFF" },
  moreLink: { fontSize: 12, fontFamily: "NunitoSans_600SemiBold", textAlign: "center" },
  resultCard: { borderWidth: 1, borderRadius: 14, padding: 12, gap: 2 },
});
