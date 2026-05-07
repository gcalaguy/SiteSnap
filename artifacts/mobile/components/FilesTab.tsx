import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Alert,
  ScrollView,
} from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { customFetch } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { openStorageFile } from "@/utils/openStorageFile";

const GOLD = "#C9A84C";

type FileAttachment = {
  id: number;
  entityType: string;
  entityId: number;
  filename: string;
  fileType: string | null;
  fileSize: number | null;
  objectPath: string;
  uploadedByUserId: number | null;
  companyId: number;
  createdAt: string;
  uploadedBy?: { firstName: string | null; lastName: string | null; email: string } | null;
};

function formatSize(bytes: number | null) {
  if (!bytes) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileIcon(fileType: string | null) {
  const t = (fileType ?? "").toLowerCase();
  if (t.includes("pdf")) return "file-text";
  if (t.includes("image") || t.includes("png") || t.includes("jpg") || t.includes("jpeg")) return "image";
  if (t.includes("sheet") || t.includes("xlsx") || t.includes("csv")) return "grid";
  if (t.includes("word") || t.includes("doc")) return "file-text";
  return "paperclip";
}

function relativeDateLabel(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString("en-CA", { month: "short", day: "numeric" });
}

type Props = { projectId: number };

export function FilesTab({ projectId }: Props) {
  const colors = useColors();
  const qc = useQueryClient();
  const [openingId, setOpeningId] = useState<number | null>(null);

  const { data: files, isLoading, isError, refetch } = useQuery<FileAttachment[]>({
    queryKey: ["project-files", projectId],
    queryFn: () =>
      customFetch<FileAttachment[]>(`/api/files?entityType=project&entityId=${projectId}`),
    staleTime: 30_000,
  });

  const handleOpen = useCallback(async (file: FileAttachment) => {
    setOpeningId(file.id);
    try {
      await openStorageFile(file.objectPath, file.filename, file.fileType);
    } finally {
      setOpeningId(null);
    }
  }, []);

  if (isLoading) {
    return (
      <View style={[s.section, { alignItems: "center", paddingVertical: 48 }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (isError) {
    return (
      <View style={s.section}>
        <View style={[s.emptyBox, { borderColor: colors.border }]}>
          <Feather name="alert-circle" size={28} color={colors.mutedForeground} />
          <Text style={[s.emptyText, { color: colors.mutedForeground }]}>Failed to load files</Text>
          <Pressable
            style={[s.retryBtn, { borderColor: colors.border }]}
            onPress={() => refetch()}
          >
            <Feather name="refresh-cw" size={14} color={colors.mutedForeground} />
            <Text style={[s.retryText, { color: colors.mutedForeground }]}>Retry</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const list = files ?? [];

  return (
    <View style={s.section}>
      <View style={s.headerRow}>
        <Text style={[s.sectionTitle, { color: colors.mutedForeground }]}>Project Files</Text>
        <Pressable
          onPress={() => qc.invalidateQueries({ queryKey: ["project-files", projectId] })}
          hitSlop={12}
        >
          <Feather name="refresh-cw" size={14} color={colors.mutedForeground} />
        </Pressable>
      </View>

      {list.length === 0 ? (
        <View style={[s.emptyBox, { borderColor: colors.border }]}>
          <Feather name="paperclip" size={28} color={colors.mutedForeground} />
          <Text style={[s.emptyText, { color: colors.mutedForeground }]}>No files attached yet</Text>
          <Text style={[s.emptySubText, { color: colors.mutedForeground }]}>
            Files attached to this project from the web dashboard appear here.
          </Text>
        </View>
      ) : (
        list.map((file) => {
          const isOpening = openingId === file.id;
          const uploader = file.uploadedBy
            ? `${file.uploadedBy.firstName ?? ""} ${file.uploadedBy.lastName ?? ""}`.trim() || file.uploadedBy.email
            : null;
          return (
            <Pressable
              key={file.id}
              style={({ pressed }) => [
                s.fileRow,
                { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.85 : 1 },
              ]}
              onPress={() => handleOpen(file)}
            >
              <View style={[s.fileIcon, { backgroundColor: `${GOLD}18` }]}>
                <Feather name={fileIcon(file.fileType) as any} size={20} color={GOLD} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[s.filename, { color: colors.foreground }]} numberOfLines={1}>
                  {file.filename}
                </Text>
                <View style={s.fileMeta}>
                  {formatSize(file.fileSize) && (
                    <Text style={[s.metaText, { color: colors.mutedForeground }]}>
                      {formatSize(file.fileSize)}
                    </Text>
                  )}
                  {uploader && (
                    <>
                      <Text style={[s.metaDot, { color: colors.mutedForeground }]}>·</Text>
                      <Text style={[s.metaText, { color: colors.mutedForeground }]} numberOfLines={1}>
                        {uploader}
                      </Text>
                    </>
                  )}
                  <Text style={[s.metaDot, { color: colors.mutedForeground }]}>·</Text>
                  <Text style={[s.metaText, { color: colors.mutedForeground }]}>
                    {relativeDateLabel(file.createdAt)}
                  </Text>
                </View>
              </View>
              {isOpening ? (
                <ActivityIndicator size="small" color={GOLD} />
              ) : (
                <Feather name="external-link" size={16} color={colors.mutedForeground} />
              )}
            </Pressable>
          );
        })
      )}
    </View>
  );
}

const s = StyleSheet.create({
  section: { paddingHorizontal: 20, marginBottom: 16 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  sectionTitle: { fontSize: 12, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.5 },
  emptyBox: { alignItems: "center", paddingVertical: 32, gap: 8, borderWidth: 1, borderRadius: 12, borderStyle: "dashed" },
  emptyText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  emptySubText: { fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center", paddingHorizontal: 20 },
  retryBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, borderWidth: 1, marginTop: 4 },
  retryText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  fileRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: 12, borderWidth: 1, marginBottom: 8 },
  fileIcon: { width: 44, height: 44, borderRadius: 10, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  filename: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  fileMeta: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 4, marginTop: 3 },
  metaText: { fontSize: 11, fontFamily: "Inter_400Regular" },
  metaDot: { fontSize: 11, fontFamily: "Inter_400Regular" },
});
