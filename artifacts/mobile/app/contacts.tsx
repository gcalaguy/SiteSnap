import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Platform,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Modal,
  KeyboardAvoidingView,
  TouchableOpacity,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import {
  useGetMe,
  useListContacts,
  useCreateContact,
  useUpdateContact,
  useDeleteContact,
  getListContactsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

type ContactType = "client" | "worker" | "subcontractor" | "supplier";

const TYPE_CONFIG: Record<ContactType, { label: string; color: string; bg: string }> = {
  client:        { label: "Client",        color: "#2563EB", bg: "#DBEAFE" },
  worker:        { label: "Worker",        color: "#16A34A", bg: "#DCFCE7" },
  subcontractor: { label: "Subcontractor", color: "#7C3AED", bg: "#EDE9FE" },
  supplier:      { label: "Supplier",      color: "#D97706", bg: "#FEF3C7" },
};

const ALL_TYPES: (ContactType | "all")[] = ["all", "client", "worker", "subcontractor", "supplier"];

type ContactForm = {
  name: string;
  company: string;
  phone: string;
  email: string;
  type: ContactType;
  notes: string;
};

const EMPTY_FORM: ContactForm = {
  name: "",
  company: "",
  phone: "",
  email: "",
  type: "client",
  notes: "",
};

function ContactCard({
  contact,
  onPress,
  onDelete,
}: {
  contact: any;
  onPress: () => void;
  onDelete: () => void;
}) {
  const colors = useColors();
  const cfg = TYPE_CONFIG[contact.type as ContactType] ?? TYPE_CONFIG.client;

  return (
    <Pressable
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.8 : 1 },
      ]}
      onPress={onPress}
      onLongPress={() => {
        if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        Alert.alert("Delete Contact", `Remove "${contact.name}"?`, [
          { text: "Cancel", style: "cancel" },
          { text: "Delete", style: "destructive", onPress: onDelete },
        ]);
      }}
    >
      <View style={styles.cardTop}>
        <View style={[styles.avatar, { backgroundColor: cfg.bg }]}>
          <Text style={[styles.avatarText, { color: cfg.color }]}>
            {(contact.name?.[0] ?? "?").toUpperCase()}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.cardName, { color: colors.foreground }]} numberOfLines={1}>
            {contact.name}
          </Text>
          {contact.company && (
            <Text style={[styles.cardCompany, { color: colors.mutedForeground }]} numberOfLines={1}>
              {contact.company}
            </Text>
          )}
        </View>
        <View style={[styles.typeBadge, { backgroundColor: cfg.bg }]}>
          <Text style={[styles.typeBadgeText, { color: cfg.color }]}>{cfg.label}</Text>
        </View>
      </View>

      {(contact.phone || contact.email) && (
        <View style={styles.cardInfo}>
          {contact.phone && (
            <View style={styles.infoRow}>
              <Feather name="phone" size={12} color={colors.mutedForeground} />
              <Text style={[styles.infoText, { color: colors.mutedForeground }]}>{contact.phone}</Text>
            </View>
          )}
          {contact.email && (
            <View style={styles.infoRow}>
              <Feather name="mail" size={12} color={colors.mutedForeground} />
              <Text style={[styles.infoText, { color: colors.mutedForeground }]}>{contact.email}</Text>
            </View>
          )}
        </View>
      )}
    </Pressable>
  );
}

function ContactFormModal({
  visible,
  onClose,
  initial,
  editId,
}: {
  visible: boolean;
  onClose: () => void;
  initial: ContactForm;
  editId: number | null;
}) {
  const colors = useColors();
  const qc = useQueryClient();
  const [form, setForm] = useState<ContactForm>(initial);

  React.useEffect(() => {
    setForm(initial);
  }, [initial, visible]);

  const create = useCreateContact({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListContactsQueryKey() });
        onClose();
      },
      onError: () => Alert.alert("Failed to create contact", "Please try again."),
    },
  });

  const update = useUpdateContact({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListContactsQueryKey() });
        onClose();
      },
      onError: () => Alert.alert("Failed to update contact", "Please try again."),
    },
  });

  const isSaving = create.isPending || update.isPending;

  function handleSave() {
    if (!form.name.trim()) {
      Alert.alert("Name required", "Please enter a contact name.");
      return;
    }
    const payload = {
      name: form.name.trim(),
      company: form.company.trim() || undefined,
      phone: form.phone.trim() || undefined,
      email: form.email.trim() || undefined,
      type: form.type,
      notes: form.notes.trim() || undefined,
    };
    if (editId != null) {
      update.mutate({ contactId: editId, data: payload });
    } else {
      create.mutate({ data: payload });
    }
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={[styles.modal, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={onClose} hitSlop={10}>
              <Feather name="x" size={22} color={colors.foreground} />
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>
              {editId != null ? "Edit Contact" : "New Contact"}
            </Text>
            <Pressable onPress={handleSave} disabled={isSaving}>
              {isSaving ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Text style={[styles.saveBtn, { color: colors.primary }]}>Save</Text>
              )}
            </Pressable>
          </View>

          <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Name</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
              placeholder="e.g. John Smith"
              placeholderTextColor={colors.mutedForeground}
              value={form.name}
              onChangeText={(t) => setForm((p) => ({ ...p, name: t }))}
              returnKeyType="next"
            />

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginTop: 14 }]}>Type</Text>
            <View style={styles.typeRow}>
              {ALL_TYPES.filter((t) => t !== "all").map((t) => {
                const cfg = TYPE_CONFIG[t as ContactType];
                const active = form.type === t;
                return (
                  <TouchableOpacity
                    key={t}
                    onPress={() => setForm((p) => ({ ...p, type: t as ContactType }))}
                    style={[
                      styles.typeChip,
                      {
                        borderColor: active ? cfg.color : colors.border,
                        backgroundColor: active ? cfg.bg : colors.card,
                      },
                    ]}
                  >
                    <Text style={[styles.typeChipText, { color: active ? cfg.color : colors.mutedForeground }]}>
                      {cfg.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginTop: 14 }]}>Company</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
              placeholder="e.g. Maple Construction Ltd."
              placeholderTextColor={colors.mutedForeground}
              value={form.company}
              onChangeText={(t) => setForm((p) => ({ ...p, company: t }))}
              returnKeyType="next"
            />

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginTop: 14 }]}>Phone</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
              placeholder="e.g. (416) 555-1234"
              placeholderTextColor={colors.mutedForeground}
              value={form.phone}
              onChangeText={(t) => setForm((p) => ({ ...p, phone: t }))}
              keyboardType="phone-pad"
              returnKeyType="next"
            />

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginTop: 14 }]}>Email</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
              placeholder="e.g. john@example.com"
              placeholderTextColor={colors.mutedForeground}
              value={form.email}
              onChangeText={(t) => setForm((p) => ({ ...p, email: t }))}
              keyboardType="email-address"
              autoCapitalize="none"
              returnKeyType="next"
            />

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginTop: 14 }]}>Notes</Text>
            <TextInput
              style={[styles.input, styles.bodyInput, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
              placeholder="Add any notes..."
              placeholderTextColor={colors.mutedForeground}
              value={form.notes}
              onChangeText={(t) => setForm((p) => ({ ...p, notes: t }))}
              multiline
              textAlignVertical="top"
            />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export default function ContactsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();

  const { data: me } = useGetMe();
  const isWorker = me?.role === "worker";

  React.useEffect(() => {
    if (me && isWorker) {
      router.replace("/(tabs)/(home)");
    }
  }, [me, isWorker]);

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<ContactType | "all">("all");
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<ContactForm>(EMPTY_FORM);

  const {
    data: contactsData,
    isLoading,
    refetch,
    isRefetching,
  } = useListContacts({
    search: search || undefined,
    type: typeFilter !== "all" ? (typeFilter as any) : undefined,
  });

  const contacts = (contactsData ?? []) as any[];

  const remove = useDeleteContact({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListContactsQueryKey() });
      },
      onError: () => Alert.alert("Failed to delete", "Please try again."),
    },
  });

  const topInset = Platform.OS === "web" ? 67 : insets.top;

  function openCreate() {
    setEditId(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  }

  function openEdit(contact: any) {
    setEditId(contact.id);
    setForm({
      name: contact.name ?? "",
      company: contact.company ?? "",
      phone: contact.phone ?? "",
      email: contact.email ?? "",
      type: (contact.type as ContactType) ?? "client",
      notes: contact.notes ?? "",
    });
    setShowForm(true);
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topInset + 12, backgroundColor: colors.sidebar }]}>
        <View style={styles.headerLeft}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={10} style={styles.backBtn}>
            <Feather name="arrow-left" size={22} color="#FFFFFF" />
          </TouchableOpacity>
          <View>
            <Text style={styles.headerTitle}>Contacts</Text>
            <Text style={styles.headerSub}>Clients, workers, subcontractors & suppliers</Text>
          </View>
        </View>
        <TouchableOpacity
          style={[styles.newBtn, { backgroundColor: colors.primary }]}
          onPress={openCreate}
          hitSlop={8}
        >
          <Feather name="plus" size={18} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      {/* Search */}
      <View style={[styles.searchWrap, { borderBottomColor: colors.border }]}>
        <View style={[styles.searchInputWrap, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Feather name="search" size={14} color={colors.mutedForeground} />
          <TextInput
            style={[styles.searchInput, { color: colors.foreground }]}
            placeholder="Search name, email, company..."
            placeholderTextColor={colors.mutedForeground}
            value={search}
            onChangeText={setSearch}
            returnKeyType="search"
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch("")} hitSlop={6}>
              <Feather name="x" size={14} color={colors.mutedForeground} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Type filter */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={[styles.filterRow, { borderBottomColor: colors.border }]}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 8, paddingVertical: 10 }}
      >
        {ALL_TYPES.map((t) => {
          const active = typeFilter === t;
          const label = t === "all" ? "All" : TYPE_CONFIG[t as ContactType]?.label ?? t;
          const color = t === "all" ? colors.primary : TYPE_CONFIG[t as ContactType]?.color ?? colors.primary;
          return (
            <TouchableOpacity
              key={t}
              onPress={() => setTypeFilter(t)}
              style={[
                styles.filterChip,
                { borderColor: active ? color : colors.border, backgroundColor: active ? `${color}15` : colors.card },
              ]}
            >
              <Text style={[styles.filterChipText, { color: active ? color : colors.mutedForeground }]}>{label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* List */}
      {isLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : contacts.length === 0 ? (
        <View style={styles.empty}>
          <Feather name="book" size={40} color={colors.border} />
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
            {search || typeFilter !== "all" ? "No contacts match your filters" : "No contacts yet"}
          </Text>
          <Text style={[styles.emptyHint, { color: colors.mutedForeground }]}>
            {search || typeFilter !== "all" ? "Try adjusting your search or filter" : "Tap + to add your first contact"}
          </Text>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />
          }
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24, gap: 10 }}
        >
          {contacts.map((c) => (
            <ContactCard
              key={c.id}
              contact={c}
              onPress={() => openEdit(c)}
              onDelete={() => remove.mutate({ contactId: c.id })}
            />
          ))}
        </ScrollView>
      )}

      <ContactFormModal
        visible={showForm}
        onClose={() => setShowForm(false)}
        initial={form}
        editId={editId}
      />
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
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 10, flexShrink: 1 },
  backBtn: { width: 34, height: 34, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 18, fontFamily: "Inter_700Bold", color: "#FFFFFF" },
  headerSub: { fontSize: 12, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.6)", marginTop: 1 },
  newBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  searchWrap: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  searchInputWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    paddingVertical: 2,
  },
  filterRow: { borderBottomWidth: 1 },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  filterChipText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 60, gap: 10 },
  emptyText: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  emptyHint: { fontSize: 13, fontFamily: "Inter_400Regular" },

  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontSize: 16, fontFamily: "Inter_700Bold" },
  cardName: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  cardCompany: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
  typeBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  typeBadgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  cardInfo: { gap: 4, marginTop: 2 },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  infoText: { fontSize: 12, fontFamily: "Inter_400Regular" },

  modal: { flex: 1 },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  modalTitle: { fontSize: 17, fontFamily: "Inter_700Bold" },
  saveBtn: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  modalScroll: { flex: 1 },
  modalContent: { padding: 20, gap: 4 },
  fieldLabel: { fontSize: 13, fontFamily: "Inter_500Medium", marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
  bodyInput: { minHeight: 100 },
  typeRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  typeChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  typeChipText: { fontSize: 13, fontFamily: "Inter_500Medium" },
});
