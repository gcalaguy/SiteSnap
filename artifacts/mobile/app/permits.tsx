import React, { useMemo, useState, useCallback } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as WebBrowser from "expo-web-browser";
import { useColors } from "@/hooks/useColors";
import { customFetch, useGetMe, useListProjects } from "@workspace/api-client-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

interface Permit {
  id: string;
  companyId: number;
  projectId: number;
  projectName?: string;
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

/** Days until expiration; negative = expired, null = no expiry. */
function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return Math.ceil((d.getTime() - Date.now()) / 86_400_000);
}

interface PermitForm {
  projectId: number | null;
  title: string;
  status: string;
  expirationDate: string; // YYYY-MM-DD or ""
}

const EMPTY_FORM: PermitForm = { projectId: null, title: "", status: "active", expirationDate: "" };

export default function PermitsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: me, isLoading: meLoading } = useGetMe();
  const { data: projects = [] } = useListProjects();

  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Permit | null>(null);
  const [form, setForm] = useState<PermitForm>(EMPTY_FORM);
  const [attachedFile, setAttachedFile] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [saving, setSaving] = useState(false);
  const [openingFileId, setOpeningFileId] = useState<string | null>(null);

  // Owner-only screen: the company-wide global permit view.
  const isOwner = me?.role === "owner" || me?.systemRole === "super_admin";

  const {
    data: permits = [],
    isLoading,
    refetch,
    isRefetching,
    isError,
  } = useQuery<Permit[]>({
    queryKey: ["permits", "global"],
    queryFn: () => customFetch<Permit[]>("/api/permits/global"),
    enabled: !!me && isOwner,
  });

  const deletePermit = useMutation({
    mutationFn: (id: string) => customFetch(`/api/permits/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["permits"] }),
    onError: (e: any) => Alert.alert("Delete failed", e?.message ?? "Could not delete permit."),
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return permits;
    return permits.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        p.status.toLowerCase().includes(q) ||
        (p.projectName ?? "").toLowerCase().includes(q),
    );
  }, [permits, search]);

  const expiringSoon = permits.filter((p) => {
    const d = daysUntil(p.expirationDate);
    return d !== null && d >= 0 && d <= 30;
  }).length;
  const expired = permits.filter((p) => {
    const d = daysUntil(p.expirationDate);
    return d !== null && d < 0;
  }).length;

  const openCreate = useCallback(() => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setAttachedFile(null);
    setShowForm(true);
  }, []);

  const openEdit = useCallback((permit: Permit) => {
    setEditing(permit);
    setForm({
      projectId: permit.projectId,
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
    if (!result.canceled && result.assets.length) {
      setAttachedFile(result.assets[0]);
    }
  }, []);

  /** Upload the attached image via presigned URL; returns the /objects/... path. */
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
    if (!editing && !form.projectId) { Alert.alert("Missing project", "Select a project for this permit."); return; }
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
          body: JSON.stringify({ ...payload, projectId: form.projectId }),
        });
      }

      queryClient.invalidateQueries({ queryKey: ["permits"] });
      setShowForm(false);
    } catch (err: any) {
      Alert.alert(editing ? "Update failed" : "Create failed", err?.message ?? "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }, [form, editing, attachedFile, uploadAttachment, queryClient]);

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

  const renderPermit = useCallback(({ item }: { item: Permit }) => {
    const days = daysUntil(item.expirationDate);
    const statusColor = STATUS_COLORS[item.status] ?? colors.primary;
    const expiryColor = days === null ? colors.mutedForeground : days < 0 ? "#EF4444" : days <= 30 ? "#F59E0B" : colors.mutedForeground;
    const expiryLabel =
      days === null ? "No expiry" :
      days < 0 ? `Expired ${formatDate(item.expirationDate)}` :
      days <= 30 ? `Expires ${formatDate(item.expirationDate)} (${days}d)` :
      `Expires ${formatDate(item.expirationDate)}`;

    return (
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.cardRow}>
          <View style={[styles.cardIcon, { backgroundColor: `${statusColor}18` }]}>
            <Feather name="award" size={18} color={statusColor} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.cardTitle, { color: colors.foreground }]} numberOfLines={2}>
              {item.title}
            </Text>
            <Text style={[styles.cardMeta, { color: colors.mutedForeground }]} numberOfLines={1}>
              {item.projectName ?? `Project #${item.projectId}`}
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
                <Feather name="external-link" size={15} color={colors.primary} />
              )}
              <Text style={[styles.actionText, { color: colors.primary }]}>View File</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.actionBtn}>
              <Text style={[styles.actionText, { color: colors.mutedForeground }]}>No file</Text>
            </View>
          )}
          <TouchableOpacity style={styles.actionBtn} onPress={() => openEdit(item)} hitSlop={8}>
            <Feather name="edit-2" size={15} color={colors.mutedForeground} />
            <Text style={[styles.actionText, { color: colors.mutedForeground }]}>Edit</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={() => confirmDelete(item)} hitSlop={8}>
            <Feather name="trash-2" size={15} color="#EF4444" />
            <Text style={[styles.actionText, { color: "#EF4444" }]}>Delete</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }, [colors, openingFileId, openFile, openEdit, confirmDelete]);

  // ── Non-owner guard ─────────────────────────────────────────────────────────
  if (!meLoading && me && !isOwner) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Header insets={insets} colors={colors} onBack={() => router.back()} />
        <View style={styles.center}>
          <Feather name="lock" size={40} color={colors.border} />
          <Text style={[styles.emptyTitle, { color: colors.mutedForeground, marginTop: 12 }]}>
            Owners only
          </Text>
          <Text style={[styles.emptySub, { color: colors.mutedForeground, textAlign: "center" }]}>
            The company-wide permit view is restricted to owners.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Header insets={insets} colors={colors} onBack={() => router.back()} />

      {isLoading || meLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : isError ? (
        <View style={styles.center}>
          <Feather name="alert-triangle" size={36} color={colors.mutedForeground} />
          <Text style={[styles.emptyTitle, { color: colors.mutedForeground, marginTop: 12 }]}>
            Could not load permits
          </Text>
          <TouchableOpacity onPress={() => refetch()} style={[styles.retryBtn, { backgroundColor: colors.primary }]}>
            <Text style={{ color: "#FFFFFF", fontFamily: "Inter_600SemiBold", fontSize: 14 }}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          renderItem={renderPermit}
          removeClippedSubviews
          maxToRenderPerBatch={10}
          windowSize={10}
          initialNumToRender={15}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 100 }]}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />
          }
          ListHeaderComponent={
            <View style={{ gap: 10, marginBottom: 4 }}>
              {/* Stats */}
              <View style={styles.statsRow}>
                <StatCard label="Total" value={permits.length} color={colors.foreground} colors={colors} />
                <StatCard label="Expiring 30d" value={expiringSoon} color="#F59E0B" colors={colors} />
                <StatCard label="Expired" value={expired} color="#EF4444" colors={colors} />
              </View>
              {/* Search */}
              <View style={[styles.searchBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Feather name="search" size={16} color={colors.mutedForeground} />
                <TextInput
                  style={[styles.searchInput, { color: colors.foreground }]}
                  placeholder="Search permits..."
                  placeholderTextColor={colors.mutedForeground}
                  value={search}
                  onChangeText={setSearch}
                  autoCapitalize="none"
                />
              </View>
            </View>
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Feather name="award" size={40} color={colors.border} />
              <Text style={[styles.emptyTitle, { color: colors.mutedForeground }]}>No permits yet</Text>
              <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
                Tap New Permit to add your first one
              </Text>
            </View>
          }
        />
      )}

      {/* Floating New Permit Button */}
      {isOwner && !showForm && (
        <TouchableOpacity
          style={[styles.fab, { backgroundColor: colors.primary, bottom: insets.bottom + 20 }]}
          onPress={openCreate}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="New permit"
        >
          <Feather name="plus" size={20} color="#FFFFFF" />
          <Text style={styles.fabText}>New Permit</Text>
        </TouchableOpacity>
      )}

      {/* Create / Edit Sheet */}
      {showForm && (
        <View style={[styles.sheetOverlay, { backgroundColor: "rgba(0,0,0,0.4)" }]}>
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
              {!editing && (
                <>
                  <Text style={[styles.label, { color: colors.mutedForeground }]}>Project</Text>
                  <View style={styles.chipWrap}>
                    {(projects as any[]).map((p) => {
                      const active = form.projectId === p.id;
                      return (
                        <TouchableOpacity
                          key={p.id}
                          onPress={() => setForm((f) => ({ ...f, projectId: p.id }))}
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
                              color: active ? colors.primary : colors.mutedForeground,
                            }}
                            numberOfLines={1}
                          >
                            {p.name}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </>
              )}

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
            </ScrollView>
          </View>
        </View>
      )}
    </View>
  );
}

function Header({ insets, colors, onBack }: { insets: { top: number }; colors: any; onBack: () => void }) {
  return (
    <View
      style={[
        styles.header,
        {
          paddingTop: Platform.OS === "web" ? 67 : insets.top + 12,
          backgroundColor: colors.sidebar,
        },
      ]}
    >
      <TouchableOpacity onPress={onBack} hitSlop={12} style={styles.backBtn}>
        <Feather name="arrow-left" size={22} color="#FFFFFF" />
      </TouchableOpacity>
      <View>
        <Text style={styles.headerTitle}>Permits</Text>
        <Text style={styles.headerSub}>Company-wide permit registry</Text>
      </View>
      <View style={{ width: 38 }} />
    </View>
  );
}

function StatCard({ label, value, color, colors }: { label: string; value: number; color: string; colors: any }) {
  return (
    <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{label}</Text>
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
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 },
  list: { padding: 12, gap: 10 },
  statsRow: { flexDirection: "row", gap: 8 },
  statCard: { flex: 1, borderRadius: 12, borderWidth: 1, padding: 12, alignItems: "flex-start" },
  statValue: { fontSize: 20, fontFamily: "Inter_700Bold" },
  statLabel: { fontSize: 11, fontFamily: "Inter_500Medium", marginTop: 2 },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === "web" ? 10 : 8,
  },
  searchInput: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular", padding: 0 },
  card: { borderRadius: 14, borderWidth: 1, padding: 14 },
  cardRow: { flexDirection: "row", gap: 12 },
  cardIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  cardTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  cardMeta: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  cardBadges: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 8, flexWrap: "wrap" },
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
  actionText: { fontSize: 13, fontFamily: "Inter_500Medium" },
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
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 40, maxHeight: "85%" },
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
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1, maxWidth: "100%" },
  input: { borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, fontFamily: "Inter_400Regular" },
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
