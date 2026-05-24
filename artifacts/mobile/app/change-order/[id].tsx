import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { useRelativeTime } from "@/hooks/useRelativeTime";
import {
  customFetch,
  useGetChangeOrder,
  useApproveChangeOrder,
  useRejectChangeOrder,
  useGetMe,
  getGetChangeOrderQueryKey,
  getListChangeOrdersQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import SignatureCanvas from "@/components/SignatureCanvas";

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
};
const STATUS_COLORS: Record<string, string> = {
  pending: "#F59E0B",
  approved: "#22C55E",
  rejected: "#EF4444",
};

function fmtCAD(v: string | number) {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(Number(v));
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const colors = useColors();
  return (
    <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>{title}</Text>
      {children}
    </View>
  );
}

function InfoRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  const colors = useColors();
  return (
    <View style={styles.infoRow}>
      <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <Text style={[styles.infoValue, { color: highlight ? colors.primary : colors.foreground }]}>{value}</Text>
    </View>
  );
}

export default function ChangeOrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const changeOrderId = parseInt(id ?? "0");
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();

  const { data: me } = useGetMe();
  const isAuthorized = me?.role === "owner" || me?.role === "foreman";
  const { data: changeOrder, isLoading, dataUpdatedAt } = useGetChangeOrder(changeOrderId);
  const updatedLabel = useRelativeTime(dataUpdatedAt || null);

  const approveChangeOrder = useApproveChangeOrder();
  const rejectChangeOrder = useRejectChangeOrder();

  const [showSig, setShowSig] = useState(false);
  const [savingSig, setSavingSig] = useState(false);

  function invalidate() {
    qc.invalidateQueries({ queryKey: getGetChangeOrderQueryKey(changeOrderId) });
    qc.invalidateQueries({ queryKey: getListChangeOrdersQueryKey() });
  }

  async function handleSaveSignature(base64: string) {
    setSavingSig(true);
    try {
      await customFetch(`/api/change-orders/${changeOrderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientSignatureData: base64, signedAt: new Date().toISOString() }),
      });
      invalidate();
      setShowSig(false);
      Alert.alert("Signature saved");
    } catch {
      Alert.alert("Failed to save signature");
    } finally {
      setSavingSig(false);
    }
  }

  const topInsets = Platform.OS === "web" ? 67 : insets.top;

  const handleApproveCO = () => {
    if (!isAuthorized) return;
    Alert.alert("Approve Change Order?", "This will mark the change order as approved.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Approve", onPress: () => {
          approveChangeOrder.mutate({ id: changeOrderId }, {
            onSuccess: () => { invalidate(); Alert.alert("Approved", "Change order has been approved."); },
            onError: () => Alert.alert("Failed to approve change order"),
          });
        },
      },
    ]);
  };

  const handleRejectCO = () => {
    if (!isAuthorized) return;
    Alert.alert("Reject Change Order?", "This will reject the change order.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Reject", style: "destructive", onPress: () => {
          rejectChangeOrder.mutate({ id: changeOrderId }, {
            onSuccess: () => { invalidate(); Alert.alert("Rejected", "Change order has been rejected."); },
            onError: () => Alert.alert("Failed to reject change order"),
          });
        },
      },
    ]);
  };

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { paddingTop: topInsets + 8, backgroundColor: colors.sidebar }]}>
          <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={10}>
            <Feather name="arrow-left" size={22} color="#FFFFFF" />
          </Pressable>
          <Text style={styles.headerTitle}>Change Order</Text>
          <View style={{ width: 36 }} />
        </View>
        <View style={styles.center}><ActivityIndicator color={colors.primary} size="large" /></View>
      </View>
    );
  }

  if (!changeOrder) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { paddingTop: topInsets + 8, backgroundColor: colors.sidebar }]}>
          <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={10}>
            <Feather name="arrow-left" size={22} color="#FFFFFF" />
          </Pressable>
          <Text style={styles.headerTitle}>Change Order</Text>
          <View style={{ width: 36 }} />
        </View>
        <View style={styles.center}>
          <Text style={{ color: colors.mutedForeground }}>Change order not found</Text>
        </View>
      </View>
    );
  }

  const statusColor = STATUS_COLORS[changeOrder.status] ?? "#F59E0B";
  const statusLabel = STATUS_LABELS[changeOrder.status] ?? changeOrder.status;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topInsets + 8, backgroundColor: colors.sidebar }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={10}>
          <Feather name="arrow-left" size={22} color="#FFFFFF" />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>Change Order</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Title Card */}
        <View style={[styles.titleCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
            <Text style={[styles.cardTitle, { color: colors.foreground, flex: 1, marginRight: 8 }]}>
              {changeOrder.title}
            </Text>
            <View style={[styles.statusBadge, { backgroundColor: `${statusColor}18` }]}>
              <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
            </View>
          </View>
          <Text style={[styles.amount, { color: colors.primary }]}>{fmtCAD(changeOrder.amount)}</Text>
          {!!updatedLabel && (
            <Text style={[styles.updatedLabel, { color: colors.mutedForeground }]}>{updatedLabel}</Text>
          )}
          {(changeOrder as any).signedAt && (
            <View style={[styles.signedBanner, { backgroundColor: "#DCFCE7", borderColor: "#86EFAC" }]}>
              <Feather name="check-circle" size={13} color="#16A34A" />
              <Text style={[styles.signedBannerText, { color: "#15803D" }]}>
                Client Signed · {new Date((changeOrder as any).signedAt).toLocaleDateString("en-CA")}
              </Text>
            </View>
          )}
        </View>

        {/* Details */}
        <Section title="DETAILS">
          <InfoRow label="Project" value={`Project #${changeOrder.projectId}`} />
          <InfoRow label="Status" value={statusLabel} />
          <InfoRow label="Amount" value={fmtCAD(changeOrder.amount)} highlight />
          <InfoRow
            label="Requested"
            value={new Date((changeOrder as any).createdAt).toLocaleDateString("en-CA", {
              year: "numeric", month: "long", day: "numeric",
            })}
          />
          {(changeOrder as any).approvedAt && (
            <InfoRow
              label={changeOrder.status === "approved" ? "Approved" : "Decided"}
              value={new Date((changeOrder as any).approvedAt).toLocaleDateString("en-CA", {
                year: "numeric", month: "long", day: "numeric",
              })}
            />
          )}
        </Section>

        {(changeOrder as any).description ? (
          <Section title="DESCRIPTION">
            <Text style={[styles.bodyText, { color: colors.foreground }]}>
              {(changeOrder as any).description}
            </Text>
          </Section>
        ) : null}

        {(changeOrder as any).notes ? (
          <Section title="NOTES">
            <Text style={[styles.bodyText, { color: colors.foreground }]}>
              {(changeOrder as any).notes}
            </Text>
          </Section>
        ) : null}

        {/* Owner/Foreman approval actions */}
        {changeOrder.status === "pending" && isAuthorized && (
          <View style={[styles.actionGroup, { borderColor: colors.border }]}>
            <Text style={[styles.actionGroupTitle, { color: colors.mutedForeground }]}>REVIEW</Text>
            <View style={{ flexDirection: "row", gap: 12, padding: 14, borderTopWidth: 1, borderTopColor: colors.border }}>
              <Pressable
                style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 12, backgroundColor: "#DCFCE7", borderRadius: 10, borderWidth: 1, borderColor: "#86EFAC" }}
                onPress={handleApproveCO}
                disabled={approveChangeOrder.isPending}
              >
                {approveChangeOrder.isPending ? <ActivityIndicator color="#16A34A" size="small" /> : <Feather name="check-circle" size={18} color="#16A34A" />}
                <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#16A34A" }}>Approve</Text>
              </Pressable>
              <Pressable
                style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 12, backgroundColor: "#FEF2F2", borderRadius: 10, borderWidth: 1, borderColor: "#FECACA" }}
                onPress={handleRejectCO}
                disabled={rejectChangeOrder.isPending}
              >
                {rejectChangeOrder.isPending ? <ActivityIndicator color="#DC2626" size="small" /> : <Feather name="x-circle" size={18} color="#DC2626" />}
                <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#DC2626" }}>Reject</Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* Owner/Foreman modify action — only for pending change orders */}
        {isAuthorized && changeOrder.status === "pending" && (
          <View style={[styles.actionGroup, { borderColor: colors.border }]}>
            <Text style={[styles.actionGroupTitle, { color: colors.mutedForeground }]}>MANAGE</Text>
            <Pressable
              style={[styles.actionBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => Alert.alert("Modify Change Order", "Direct editing is coming soon. Please contact support for now.")}
            >
              <Feather name="edit-2" size={18} color={colors.primary} />
              <Text style={[styles.actionBtnText, { color: colors.foreground }]}>Modify Change Order</Text>
            </Pressable>
          </View>
        )}

        {(changeOrder as any).clientSignatureData ? (
          <Section title="CLIENT SIGNATURE">
            <Image
              source={{ uri: (changeOrder as any).clientSignatureData }}
              style={{
                width: "100%",
                height: 80,
                resizeMode: "contain",
                backgroundColor: "#fff",
                borderRadius: 6,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            />
            {(changeOrder as any).signedAt && (
              <Text style={[styles.signedMeta, { color: colors.mutedForeground }]}>
                Signed {new Date((changeOrder as any).signedAt).toUTCString()}
              </Text>
            )}
          </Section>
        ) : null}

        {changeOrder.status === "approved" && !(changeOrder as any).clientSignatureData && (
          <View style={[styles.actionGroup, { borderColor: colors.border }]}>
            <Text style={[styles.actionGroupTitle, { color: colors.mutedForeground }]}>ACTIONS</Text>
            <Pressable
              style={[styles.actionBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => setShowSig(true)}
              disabled={savingSig}
            >
              {savingSig
                ? <ActivityIndicator color={colors.primary} size="small" />
                : <Feather name="edit-3" size={18} color={colors.primary} />}
              <Text style={[styles.actionBtnText, { color: colors.foreground }]}>Collect Client Signature</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>

      <SignatureCanvas
        visible={showSig}
        onClose={() => setShowSig(false)}
        onSave={handleSaveSignature}
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
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  backBtn: { width: 36 },
  headerTitle: { fontSize: 17, fontFamily: "Inter_700Bold", color: "#FFFFFF", flex: 1, textAlign: "center" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: { padding: 16, gap: 12 },
  titleCard: { borderRadius: 12, padding: 16, borderWidth: 1 },
  cardTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  amount: { fontSize: 22, fontFamily: "Inter_700Bold", marginTop: 6 },
  updatedLabel: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 6 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  statusText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  signedBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 12,
  },
  signedBannerText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  section: { borderRadius: 12, padding: 16, borderWidth: 1 },
  sectionTitle: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  infoRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", paddingVertical: 4 },
  infoLabel: { fontSize: 13, fontFamily: "Inter_400Regular", flex: 1 },
  infoValue: { fontSize: 13, fontFamily: "Inter_500Medium", textAlign: "right", flex: 1 },
  bodyText: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 22 },
  signedMeta: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 6 },
  actionGroup: { borderRadius: 12, borderWidth: 1, overflow: "hidden" },
  actionGroupTitle: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderTopWidth: 1,
  },
  actionBtnText: { fontSize: 14, fontFamily: "Inter_500Medium" },
});
