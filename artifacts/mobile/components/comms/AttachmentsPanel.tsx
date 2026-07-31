import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator, FlatList, Linking, Alert } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import {
  useListProjectCommunicationAttachments,
  getProjectCommunicationAttachmentUrl,
  type ProjectAttachment,
} from "@workspace/api-client-react";
import { commsStyles as cs } from "./styles";

const CATEGORY_ICON: Record<string, keyof typeof Feather.glyphMap> = {
  pdf: "file-text",
  word: "file-text",
  excel: "grid",
  image: "image",
  cad: "layers",
  blueprint: "layers",
  quote: "file",
  invoice: "dollar-sign",
  inspection_report: "clipboard",
  permit: "shield",
  other: "paperclip",
};

const CATEGORY_LABEL: Record<string, string> = {
  pdf: "PDF",
  word: "Word",
  excel: "Excel",
  image: "Image",
  cad: "CAD",
  blueprint: "Blueprint",
  quote: "Quote",
  invoice: "Invoice",
  inspection_report: "Inspection Report",
  permit: "Permit",
  other: "Other",
};

function AttachmentRow({ projectId, attachment }: { projectId: number; attachment: ProjectAttachment }) {
  const colors = useColors();
  const [opening, setOpening] = useState(false);
  const category = attachment.category ?? "other";

  async function handleOpen() {
    setOpening(true);
    try {
      const result = await getProjectCommunicationAttachmentUrl(projectId, attachment.id);
      await Linking.openURL(result.url);
    } catch {
      Alert.alert("Failed", "Could not open this attachment. Please try again.");
    } finally {
      setOpening(false);
    }
  }

  return (
    <Pressable onPress={handleOpen} disabled={opening} style={[cs.row, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={[cs.rowIcon, { backgroundColor: colors.muted }]}>
        {opening ? (
          <ActivityIndicator size="small" color={colors.mutedForeground} />
        ) : (
          <Feather name={CATEGORY_ICON[category] ?? "paperclip"} size={15} color={colors.primary} />
        )}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[cs.rowTitle, { color: colors.foreground }]} numberOfLines={1}>
          {attachment.filename}
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 }}>
          <View style={[cs.badge, { backgroundColor: colors.muted }]}>
            <Text style={[cs.badgeText, { color: colors.mutedForeground }]}>{CATEGORY_LABEL[category] ?? category}</Text>
          </View>
          {attachment.documentId != null && (
            <View style={[cs.badge, { backgroundColor: `${colors.primary}18` }]}>
              <Feather name="folder" size={9} color={colors.primary} />
              <Text style={[cs.badgeText, { color: colors.primary }]}>In Documents</Text>
            </View>
          )}
        </View>
      </View>
      <Feather name="external-link" size={14} color={colors.mutedForeground} />
    </Pressable>
  );
}

export function AttachmentsPanel({ projectId }: { projectId: number }) {
  const colors = useColors();
  const { data, isLoading, isError, refetch } = useListProjectCommunicationAttachments(projectId);
  const attachments = data?.data ?? [];

  if (isLoading) return <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />;

  if (isError) {
    return (
      <View style={[cs.emptyBox, { borderColor: colors.border }]}>
        <Feather name="alert-circle" size={26} color={colors.mutedForeground} />
        <Text style={[cs.emptyTitle, { color: colors.foreground }]}>Failed to load attachments</Text>
        <Pressable style={[cs.retryBtn, { borderColor: colors.border }]} onPress={() => refetch()}>
          <Feather name="refresh-cw" size={14} color={colors.mutedForeground} />
          <Text style={[cs.retryText, { color: colors.mutedForeground }]}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  if (attachments.length === 0) {
    return (
      <View style={[cs.emptyBox, { borderColor: colors.border }]}>
        <Feather name="paperclip" size={26} color={colors.mutedForeground} />
        <Text style={[cs.emptyTitle, { color: colors.foreground }]}>No attachments yet</Text>
        <Text style={[cs.emptySubText, { color: colors.mutedForeground }]}>
          Attachments from emails assigned to this project will show up here, automatically categorized.
        </Text>
      </View>
    );
  }

  return (
    <FlatList
      data={attachments}
      keyExtractor={(a) => String(a.id)}
      scrollEnabled={false}
      renderItem={({ item }) => <AttachmentRow projectId={projectId} attachment={item} />}
      ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
    />
  );
}
