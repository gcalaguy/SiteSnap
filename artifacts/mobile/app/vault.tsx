import React, { useState, useCallback } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import { useColors } from "@/hooks/useColors";
import { customFetch } from "@workspace/api-client-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

const DOC_TYPES = [
  "Driver License",
  "OSHA 10",
  "OSHA 30",
  "Working at Heights",
  "WHMIS",
  "First Aid",
  "Fall Protection",
  "Confined Space",
  "Electrical Safety",
  "Other",
];

interface WorkerDoc {
  id: number;
  workerId: number;
  companyId: number;
  documentType: string;
  fileUrl: string;
  filePath: string | null;
  expirationDate: string | null;
  status: string;
  createdAt: string;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-CA");
}

export default function VaultScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [showUpload, setShowUpload] = useState(false);
  const [docType, setDocType] = useState(DOC_TYPES[0]);
  const [uploading, setUploading] = useState(false);

  const {
    data: docs = [],
    isLoading,
    refetch,
    isRefetching,
    error,
    isError,
  } = useQuery<WorkerDoc[]>({
    queryKey: ["vault-my-docs"],
    queryFn: () => customFetch<WorkerDoc[]>("/api/worker/vault/my-documents"),
  });

  const deleteDoc = useMutation({
    mutationFn: (id: number) =>
      customFetch(`/api/worker/vault/documents/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["vault-my-docs"] }),
  });

  const handlePickAndUpload = useCallback(async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission needed", "Allow photo library access in Settings to upload documents.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: false,
      quality: 0.85,
    });

    if (result.canceled || !result.assets.length) return;
    const asset = result.assets[0];

    setUploading(true);
    try {
      const ext = (asset.fileName?.split(".").pop() ?? "jpg").toLowerCase();
      const mimeType = asset.mimeType ?? `image/${ext}`;
      const filename = asset.fileName ?? `doc_${Date.now()}.${ext}`;
      const fileSize = asset.fileSize ?? 0;

      // 1. Request presigned upload URL
      const { uploadURL, objectPath } = await customFetch("/api/storage/uploads/request-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: filename, size: fileSize, contentType: mimeType }),
      }) as { uploadURL: string; objectPath: string };

      // 2. Upload binary to storage
      await FileSystem.uploadAsync(uploadURL, asset.uri, {
        httpMethod: "PUT",
        uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
        headers: { "Content-Type": mimeType },
      });

      // 3. Save vault entry
      const objectId = objectPath.replace("/objects/", "");
      await customFetch("/api/worker/vault/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentType: docType,
          fileUrl: `/api/storage/objects/${objectId}`,
          filePath: objectPath,
        }),
      });

      queryClient.invalidateQueries({ queryKey: ["vault-my-docs"] });
      setShowUpload(false);
      Alert.alert("Uploaded", `${docType} saved to your vault.`);
    } catch (err: any) {
      Alert.alert("Upload failed", err?.message ?? "Could not upload document.");
    } finally {
      setUploading(false);
    }
  }, [docType, queryClient]);

  function renderDoc({ item }: { item: WorkerDoc }) {
    return (
      <View
        style={[
          styles.card,
          { backgroundColor: colors.card, borderColor: colors.border },
        ]}
      >
        <View style={styles.docRow}>
          <View
            style={[
              styles.docIcon,
              { backgroundColor: `${colors.primary}18` },
            ]}
          >
            <Feather name="file-text" size={18} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.docType, { color: colors.foreground }]}>
              {item.documentType}
            </Text>
            <Text style={[styles.docMeta, { color: colors.mutedForeground }]}>
              Uploaded {formatDate(item.createdAt)}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() =>
              Alert.alert("Delete Document", "Remove this from your vault?", [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Delete",
                  style: "destructive",
                  onPress: () => deleteDoc.mutate(item.id),
                },
              ])
            }
            hitSlop={10}
          >
            <Feather name="trash-2" size={16} color={colors.mutedForeground} />
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View
        style={[
          styles.header,
          {
            paddingTop: Platform.OS === "web" ? 67 : insets.top + 12,
            backgroundColor: colors.sidebar,
          },
        ]}
      >
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color="#FFFFFF" />
        </TouchableOpacity>
        <View>
          <Text style={styles.headerTitle}>Document Vault</Text>
          <Text style={styles.headerSub}>My Documents</Text>
        </View>
        <View style={{ width: 38 }} />
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : isError ? (
        <View style={styles.center}>
          <Feather name="alert-triangle" size={36} color={colors.mutedForeground} />
          <Text
            style={[styles.emptyTitle, { color: colors.mutedForeground, marginTop: 12 }]}
          >
            Could not load vault
          </Text>
          <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
            {error instanceof Error ? error.message : "Something went wrong"}
          </Text>
          <TouchableOpacity
            onPress={() => refetch()}
            style={[styles.retryBtn, { backgroundColor: colors.primary }]}
          >
            <Text style={{ color: "#FFFFFF", fontFamily: "Inter_600SemiBold", fontSize: 14 }}>
              Retry
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={docs}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderDoc}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 100 }]}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Feather name="shield" size={40} color={colors.border} />
              <Text style={[styles.emptyTitle, { color: colors.mutedForeground }]}>
                No documents yet
              </Text>
              <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
                Tap Upload to add your first certificate or ID
              </Text>
            </View>
          }
        />
      )}

      {/* Floating Upload Button */}
      <TouchableOpacity
        style={[
          styles.fab,
          { backgroundColor: colors.primary, bottom: insets.bottom + 20 },
        ]}
        onPress={() => {
          setDocType(DOC_TYPES[0]);
          setShowUpload(true);
        }}
        activeOpacity={0.85}
      >
        <Feather name="upload" size={20} color="#FFFFFF" />
        <Text style={styles.fabText}>Upload</Text>
      </TouchableOpacity>

      {/* Upload Sheet */}
      {showUpload && (
        <View style={[styles.sheetOverlay, { backgroundColor: "rgba(0,0,0,0.4)" }]}>
          <View style={[styles.sheet, { backgroundColor: colors.background }]}>
            <View style={[styles.sheetHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.sheetTitle, { color: colors.foreground }]}>Upload Document</Text>
              <TouchableOpacity onPress={() => setShowUpload(false)} hitSlop={10}>
                <Feather name="x" size={22} color={colors.foreground} />
              </TouchableOpacity>
            </View>

            <View style={styles.sheetBody}>
              <Text style={[styles.label, { color: colors.mutedForeground }]}>
                What type of document?
              </Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 6, marginBottom: 20 }}>
                {DOC_TYPES.map((t) => {
                  const active = docType === t;
                  return (
                    <TouchableOpacity
                      key={t}
                      onPress={() => setDocType(t)}
                      style={[
                        styles.typeChip,
                        {
                          borderColor: active ? colors.primary : colors.border,
                          backgroundColor: active ? `${colors.primary}18` : colors.card,
                        },
                      ]}
                    >
                      <Text
                        style={{
                          fontSize: 12,
                          fontFamily: "Inter_500Medium",
                          color: active ? colors.primary : colors.mutedForeground,
                        }}
                      >
                        {t}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <TouchableOpacity
                onPress={handlePickAndUpload}
                disabled={uploading}
                style={[styles.uploadBtn, { backgroundColor: colors.primary, opacity: uploading ? 0.6 : 1 }]}
              >
                {uploading ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <>
                    <Feather name="image" size={18} color="#FFFFFF" />
                    <Text style={{ color: "#FFFFFF", fontFamily: "Inter_600SemiBold", fontSize: 15 }}>
                      Choose from Library
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  backBtn: { width: 38, height: 38, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 18, fontFamily: "Inter_700Bold", color: "#FFFFFF" },
  headerSub: { fontSize: 12, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.6)", marginTop: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  list: { padding: 12, gap: 10 },
  card: { borderRadius: 14, borderWidth: 1, padding: 14 },
  docRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  docIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  docType: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  docMeta: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  empty: { alignItems: "center", justifyContent: "center", paddingVertical: 60, gap: 10 },
  emptyTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  emptySub: { fontSize: 13, fontFamily: "Inter_400Regular" },
  retryBtn: { marginTop: 16, paddingHorizontal: 24, paddingVertical: 10, borderRadius: 20 },
  fab: {
    position: "absolute",
    right: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 30,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
  fabText: { color: "#FFFFFF", fontFamily: "Inter_700Bold", fontSize: 15 },
  sheetOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "flex-end",
  },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 40 },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  sheetTitle: { fontSize: 17, fontFamily: "Inter_700Bold" },
  sheetBody: { paddingHorizontal: 20, paddingTop: 16 },
  label: { fontSize: 13, fontFamily: "Inter_600SemiBold", marginBottom: 6 },
  typeChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  uploadBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
  },
});
