import React, { useState, useCallback } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as WebBrowser from "expo-web-browser";
import { customFetch, useGetMe } from "@workspace/api-client-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";

interface Permit {
  id: string;
  companyId: number;
  projectId: number;
  title: string;
  status: string;
  expirationDate: string | null;
  fileUrl: string | null;
  createdAt: string;
}

const STATUS_OPTIONS = ["active", "pending", "approved", "expired", "closed"];

const STATUS_COLORS: Record<string, string> = {
  active: "#10B981",
  approved: "#10B981",
  pending: "#F59E0B",
  expired: "#EF4444",
  closed: "#9CA3AF",
};

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-CA");
}

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return Math.ceil((d.getTime() - Date.now()) / 86_400_000);
}

interface PermitForm {
  title: string;
  status: string;
  expirationDate: string;
}

const EMPTY_FORM: PermitForm = { title: "", status: "active", expirationDate: "" };

/**
 * Project-scoped Permits tab. Owners can create (pre-scoped to this project),
 * edit and delete; foremen see the same list read-only — the API enforces both
 * the role gate and project assignment server-side.
 */
export function PermitsTab({ projectId }: { projectId: number }) {
  const colors = useColors();
  const queryClient = useQueryClient();
  const { data: me } = useGetMe();
  const isOwner = me?.role === "owner" || me?.systemRole === "super_admin";

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Permit | null>(null);
  const [form, setForm] = useState<PermitForm>(EMPTY_FORM);
  const [attachedFile, setAttachedFile] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [saving, setSaving] = useState(false);
  const [openingFileId, setOpeningFileId] = useState<string | null>(null);

  const {
    data: permits = [],
    isLoading,
    error,
    isError,
  } = useQuery<Permit[]>({
    queryKey: ["permits", "project", projectId],
    queryFn: () => customFetch<Permit[]>(`/api/permits/project/${projectId}`),
    enabled: !!me && !!projectId,
    retry: false,
  });

  const deletePermit = useMutation({
    mutationFn: (id: string) => customFetch(`/api/permits/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["permits"] }),
    onError: (e: any) => Alert.alert("Delete failed", e?.message ?? "Could not delete permit."),
  });

  const openCreate = useCallback(() => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setAttachedFile(null);
    setShowForm(true);
  }, []);

  const openEdit = useCallback((permit: Permit) => {
    setEditing(permit);
    setForm({
      title: permit.title,
      status: permit.status,
      expirationDate: permit.expirationDate
        ? new Date(permit.expirationDate).toISOString().slice(0, 10)
        : "",
    });
    setAttachedFile(null);
    setShowForm(true);
  }, []);

  const pickFile = useCallback(async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission needed", "Allow photo library access in Settings to attach a permit document.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: false,
      quality: 0.85,
    });
    if (!result.canceled && result.assets.length) setAttachedFile(result.assets[0]);
  }, []);

  const uploadAttachment = useCallback(async (asset: ImagePicker.ImagePickerAsset): Promise<string> => {
    const ext = (asset.fileName?.split(".").pop() ?? "jpg").toLowerCase();
    const mimeType = asset.mimeType ?? `image/${ext}`;
    const filename = asset.fileName ?? `permit_${Date.now()}.${ext}`;

    const { uploadURL, objectPath } = (await customFetch("/api/storage/uploads/request-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: filename, size: asset.fileSize ?? 0, contentType: mimeType }),
    })) as { uploadURL: string; objectPath: string };

    const dest = new URL(uploadURL);
    if (!dest.protocol.startsWith("https")) throw new Error("Unexpected upload destination");

    let lastErr: Error | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      const res = await FileSystem.uploadAsync(uploadURL, asset.uri, {
        httpMethod: "PUT",
        uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
        headers: { "Content-Type": mimeType },
      });
      if (res.status >= 200 && res.status < 300) { lastErr = null; break; }
      lastErr = new Error(`Upload failed: ${res.status}`);
      if (attempt < 2) await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }
    if (lastErr) throw lastErr;
    return objectPath;
  }, []);

  const handleSave = useCallback(async () => {
    const title = form.title.trim();
    if (!title) { Alert.alert("Missing title", "Enter a permit title."); return; }
    if (form.expirationDate && !/^\d{4}-\d{2}-\d{2}$/.test(form.expirationDate)) {
      Alert.alert("Invalid date", "Use YYYY-MM-DD format for the expiration date.");
      return;
    }

    setSaving(true);
    try {
      let fileUrl: string | undefined;
      if (attachedFile) fileUrl = await uploadAttachment(attachedFile);

      const payload: Record<string, unknown> = {
        title,
        status: form.status,
        expirationDate: form.expirationDate || (editing ? null : undefined),
        ...(fileUrl ? { fileUrl } : {}),
      };

      if (editing) {
        await customFetch(`/api/permits/${editing.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        await customFetch("/api/permits", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, projectId }),
        });
      }

      queryClient.invalidateQueries({ queryKey: ["permits"] });
      setShowForm(false);
    } catch (err: any) {
      Alert.alert(editing ? "Update failed" : "Create failed", err?.message ?? "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }, [form, editing, attachedFile, projectId, uploadAttachment, queryClient]);

  const openFile = useCallback(async (permit: Permit) => {
    if (!permit.fileUrl) return;
    setOpeningFileId(permit.id);
    try {
      const normalized = permit.fileUrl.replace(/^\//, "");
      const rest = normalized.startsWith("objects/")
        ? normalized.replace(/^objects\//, "")
        : normalized.replace(/^api\/storage\/objects\//, "");
      const { url } = (await customFetch(`/api/storage/objects/${rest}/signed-url`)) as { url: string };
      await WebBrowser.openBrowserAsync(url);
    } catch {
      Alert.alert("Could not open file", "The permit document is unavailable.");
    } finally {
      setOpeningFileId(null);
    }
  }, []);

  const confirmDelete = useCallback((permit: Permit) => {
    Alert.alert("Delete Permit", `Remove "${permit.title}" permanently?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => deletePermit.mutate(permit.id) },
    ]);
  }, [deletePermit]);

  const accessDenied = isError && (error as any)?.status === 403;

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>Permits</Text>
        {isOwner && (
          <TouchableOpacity
            onPress={openCreate}
            style={[styles.addBtn, { backgroundColor: colors.primary }]}
            hitSlop={8}
          >
            <Feather name="plus" size={14} color="#FFFFFF" />
            <Text style={styles.addBtnText}>New Permit</Text>
          </TouchableOpacity>
        )}
      </View>

      {isLoading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : accessDenied ? (
        <View style={[styles.emptyBox, { borderColor: colors.border }]}>
          <Feather name="lock" size={28} color={colors.border} />
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
            You're not assigned to this project, so its permits are hidden.
          </Text>
        </View>
      ) : isError ? (
        <View style={[styles.emptyBox, { borderColor: colors.border }]}>
          <Feather name="alert-triangle" size={28} color={colors.border} />
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
            Could not load permits
          </Text>
        </View>
      ) : permits.length === 0 ? (
        <View style={[styles.emptyBox, { borderColor: colors.border }]}>
          <Feather name="award" size={28} color={colors.border} />
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
            {isOwner ? "No permits yet — tap New Permit to add one." : "No permits for this project yet."}
          </Text>
        </View>
      ) : (
        permits.map((item) => {
          const days = daysUntil(item.expirationDate);
          const statusColor = STATUS_COLORS[item.status] ?? colors.primary;
          const expiryColor =
            days === null ? colors.mutedForeground : days < 0 ? "#EF4444" : days <= 30 ? "#F59E0B" : colors.mutedForeground;
          const expiryLabel =
            days === null ? "No expiry" :
            days < 0 ? `Expired ${formatDate(item.expirationDate)}` :
            days <= 30 ? `Expires ${formatDate(item.expirationDate)} (${days}d)` :
            `Expires ${formatDate(item.expirationDate)}`;

          return (
            <View key={item.id} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.cardRow}>
                <View style={[styles.cardIcon, { backgroundColor: `${statusColor}18` }]}>
                  <Feather name="award" size={16} color={statusColor} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.cardTitle, { color: colors.foreground }]} numberOfLines={2}>
                    {item.title}
                  </Text>
                  <View style={styles.cardBadges}>
                    <View style={[styles.statusChip, { backgroundColor: `${statusColor}18` }]}>
                      <Text style={[styles.statusChipText, { color: statusColor }]}>{item.status}</Text>
                    </View>
                    <Text style={[styles.expiryText, { color: expiryColor }]}>{expiryLabel}</Text>
                  </View>
                </View>
              </View>
              <View style={[styles.cardActions, { borderTopColor: colors.border }]}>
                {item.fileUrl ? (
                  <TouchableOpacity style={styles.actionBtn} onPress={() => openFile(item)} hitSlop={8}>
                    {openingFileId === item.id ? (
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : (
                      <Feather name="external-link" size={14} color={colors.primary} />
                    )}
                    <Text style={[styles.actionText, { color: colors.primary }]}>View File</Text>
                  </TouchableOpacity>
                ) : (
                  <View style={styles.actionBtn}>
                    <Text style={[styles.actionText, { color: colors.mutedForeground }]}>No file</Text>
                  </View>
                )}
                {isOwner && (
                  <>
                    <TouchableOpacity style={styles.actionBtn} onPress={() => openEdit(item)} hitSlop={8}>
                      <Feather name="edit-2" size={14} color={colors.mutedForeground} />
                      <Text style={[styles.actionText, { color: colors.mutedForeground }]}>Edit</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.actionBtn} onPress={() => confirmDelete(item)} hitSlop={8}>
                      <Feather name="trash-2" size={14} color="#EF4444" />
                      <Text style={[styles.actionText, { color: "#EF4444" }]}>Delete</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            </View>
          );
        })
      )}

      {/* Create / Edit Modal (owner only) */}
      <Modal visible={showForm} animationType="slide" transparent onRequestClose={() => !saving && setShowForm(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.sheet, { backgroundColor: colors.background }]}>
            <View style={[styles.sheetHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.sheetTitle, { color: colors.foreground }]}>
                {editing ? "Edit Permit" : "New Permit"}
              </Text>
              <TouchableOpacity onPress={() => setShowForm(false)} hitSlop={10} disabled={saving}>
                <Feather name="x" size={22} color={colors.foreground} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.sheetBody} keyboardShouldPersistTaps="handled">
              <Text style={[styles.label, { color: colors.mutedForeground }]}>Title</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
                placeholder="e.g. Building Permit #BP-2026-0142"
                placeholderTextColor={colors.mutedForeground}
                value={form.title}
                onChangeText={(t) => setForm((f) => ({ ...f, title: t }))}
              />

              <Text style={[styles.label, { color: colors.mutedForeground }]}>Status</Text>
              <View style={styles.chipWrap}>
                {STATUS_OPTIONS.map((s) => {
                  const active = form.status === s;
                  return (
                    <TouchableOpacity
                      key={s}
                      onPress={() => setForm((f) => ({ ...f, status: s }))}
                      style={[
                        styles.chip,
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
                          textTransform: "capitalize",
                          color: active ? colors.primary : colors.mutedForeground,
                        }}
                      >
                        {s}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={[styles.label, { color: colors.mutedForeground }]}>Expiration date (YYYY-MM-DD)</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
                placeholder="2026-12-31"
                placeholderTextColor={colors.mutedForeground}
                value={form.expirationDate}
                onChangeText={(t) => setForm((f) => ({ ...f, expirationDate: t }))}
                keyboardType={Platform.OS === "web" ? undefined : "numbers-and-punctuation"}
                autoCapitalize="none"
              />

              <Text style={[styles.label, { color: colors.mutedForeground }]}>
                Permit document {editing ? "(replace)" : "(optional)"}
              </Text>
              <TouchableOpacity
                onPress={pickFile}
                style={[styles.attachBtn, { borderColor: colors.border, backgroundColor: colors.card }]}
              >
                <Feather name="paperclip" size={16} color={colors.primary} />
                <Text style={{ fontSize: 13, fontFamily: "Inter_500Medium", color: colors.foreground }} numberOfLines={1}>
                  {attachedFile ? (attachedFile.fileName ?? "Photo selected") : "Attach from library"}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleSave}
                disabled={saving}
                style={[styles.saveBtn, { backgroundColor: colors.primary, opacity: saving ? 0.6 : 1 }]}
              >
                {saving ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={{ color: "#FFFFFF", fontFamily: "Inter_600SemiBold", fontSize: 15 }}>
                    {editing ? "Save Changes" : "Create Permit"}
                  </Text>
                )}
              </TouchableOpacity>
              <View style={{ height: 30 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { paddingHorizontal: 20, marginBottom: 24 },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 18,
  },
  addBtnText: { color: "#FFFFFF", fontSize: 12, fontFamily: "Inter_600SemiBold" },
  centerBox: { paddingVertical: 30, alignItems: "center" },
  emptyBox: {
    borderWidth: 1,
    borderRadius: 12,
    borderStyle: "dashed",
    padding: 28,
    alignItems: "center",
    gap: 10,
  },
  emptyText: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center" },
  card: { borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 10 },
  cardRow: { flexDirection: "row", gap: 12 },
  cardIcon: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  cardTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  cardBadges: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 6, flexWrap: "wrap" },
  statusChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  statusChipText: { fontSize: 11, fontFamily: "Inter_600SemiBold", textTransform: "capitalize" },
  expiryText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  cardActions: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
  },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 2, paddingHorizontal: 8 },
  actionText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  modalOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.4)" },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "85%", paddingBottom: 20 },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  sheetTitle: { fontSize: 17, fontFamily: "Inter_700Bold" },
  sheetBody: { paddingHorizontal: 20, paddingTop: 12 },
  label: { fontSize: 13, fontFamily: "Inter_600SemiBold", marginTop: 14, marginBottom: 6 },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  input: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  attachBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  saveBtn: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 14,
    marginTop: 20,
  },
});
