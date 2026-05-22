import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
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
  if (!dateStr) return "No expiry";
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? "No expiry" : d.toLocaleDateString("en-CA");
}
function isExpired(dateStr: string | null): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  return d.getTime() < Date.now();
}

export default function VaultScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [showUpload, setShowUpload] = useState(false);
  const [docType, setDocType] = useState(DOC_TYPES[0]);
  const [expiry, setExpiry] = useState("");
  const [fileUrl, setFileUrl] = useState("");
  const [filePath, setFilePath] = useState("");
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

  async function handleSave() {
    if (!fileUrl.trim()) {
      Alert.alert("Missing file", "Enter a file URL or upload a file first.");
      return;
    }
    setUploading(true);
    try {
      await customFetch("/api/worker/vault/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentType: docType,
          fileUrl: fileUrl.trim(),
          filePath: filePath.trim() || undefined,
          expirationDate: expiry || undefined,
        }),
      });
      queryClient.invalidateQueries({ queryKey: ["vault-my-docs"] });
      setShowUpload(false);
      setFileUrl("");
      setFilePath("");
      setExpiry("");
      Alert.alert("Saved", "Document added to your vault.");
    } catch (err: any) {
      Alert.alert("Error", err?.message ?? "Failed to save document.");
    } finally {
      setUploading(false);
    }
  }

  function renderDoc({ item }: { item: WorkerDoc }) {
    const expired = isExpired(item.expirationDate);
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
              { backgroundColor: expired ? "#FEE2E2" : `${colors.primary}18` },
            ]}
          >
            <Feather name="file-text" size={18} color={expired ? "#EF4444" : colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.docType, { color: colors.foreground }]}>
              {item.documentType}
            </Text>
            <Text style={[styles.docMeta, { color: colors.mutedForeground }]}>
              Expires: {formatDate(item.expirationDate)}
              {expired ? "  \u2022 EXPIRED" : ""}
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
          <Text style={styles.headerTitle}>Compliance Vault</Text>
          <Text style={styles.headerSub}>My Documents</Text>
        </View>
        <TouchableOpacity
          style={[styles.newBtn, { backgroundColor: colors.primary }]}
          onPress={() => setShowUpload(true)}
          hitSlop={8}
        >
          <Feather name="plus" size={18} color="#FFFFFF" />
        </TouchableOpacity>
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
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 24 }]}
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
                Tap + to add your first certificate or ID
              </Text>
            </View>
          }
        />
      )}

      {/* Upload Sheet */}
      {showUpload && (
        <View style={[styles.sheetOverlay, { backgroundColor: "rgba(0,0,0,0.4)" }]}>
          <View style={[styles.sheet, { backgroundColor: colors.background }]}>
            <View style={[styles.sheetHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.sheetTitle, { color: colors.foreground }]}>Add Document</Text>
              <TouchableOpacity onPress={() => setShowUpload(false)} hitSlop={10}>
                <Feather name="x" size={22} color={colors.foreground} />
              </TouchableOpacity>
            </View>

            <View style={styles.sheetBody}>
              {/* Type */}
              <Text style={[styles.label, { color: colors.mutedForeground }]}>Document Type</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 6, marginBottom: 16 }}>
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

              {/* Expiry */}
              <Text style={[styles.label, { color: colors.mutedForeground }]}>Expiration (optional)</Text>
              <TextInput
                value={expiry}
                onChangeText={setExpiry}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={colors.mutedForeground}
                style={[
                  styles.input,
                  { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card },
                ]}
              />

              {/* File URL */}
              <Text style={[styles.label, { color: colors.mutedForeground, marginTop: 12 }]}>File URL</Text>
              <TextInput
                value={fileUrl}
                onChangeText={setFileUrl}
                placeholder="https://... or /objects/..."
                placeholderTextColor={colors.mutedForeground}
                style={[
                  styles.input,
                  { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card },
                ]}
              />

              {/* Save */}
              <TouchableOpacity
                onPress={handleSave}
                disabled={uploading}
                style={[styles.uploadBtn, { backgroundColor: colors.primary, opacity: uploading ? 0.6 : 1 }]}
              >
                {uploading ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <>
                    <Feather name="save" size={18} color="#FFFFFF" />
                    <Text style={{ color: "#FFFFFF", fontFamily: "Inter_600SemiBold", fontSize: 15 }}>
                      Save Document
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
  newBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
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
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  typeChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  uploadBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    marginTop: 16,
  },
});
