import React from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator, FlatList } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { useListProjectCommunicationTimeline, type CommunicationTimelineEvent } from "@workspace/api-client-react";
import { commsStyles as cs } from "./styles";

const EVENT_ICON: Record<string, keyof typeof Feather.glyphMap> = {
  permit_submitted: "file-text",
  permit_approved: "check-circle",
  permit_rejected: "x-circle",
  inspection_scheduled: "calendar",
  inspection_passed: "check-circle",
  inspection_failed: "x-circle",
  change_order_received: "edit-3",
  change_order_approved: "check-circle",
  invoice_sent: "send",
  invoice_paid: "dollar-sign",
  payment_requested: "dollar-sign",
  quote_sent: "send",
  quote_accepted: "check-circle",
  other: "circle",
};

const EVENT_LABEL: Record<string, string> = {
  permit_submitted: "Permit Submitted",
  permit_approved: "Permit Approved",
  permit_rejected: "Permit Rejected",
  inspection_scheduled: "Inspection Scheduled",
  inspection_passed: "Inspection Passed",
  inspection_failed: "Inspection Failed",
  change_order_received: "Change Order Received",
  change_order_approved: "Change Order Approved",
  invoice_sent: "Invoice Sent",
  invoice_paid: "Invoice Paid",
  payment_requested: "Payment Requested",
  quote_sent: "Quote Sent",
  quote_accepted: "Quote Accepted",
  other: "Event",
};

function dateLabel(iso: string | null | undefined) {
  if (!iso) return "Date unknown";
  return new Date(iso).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" });
}

function EventRow({ event, onPress }: { event: CommunicationTimelineEvent; onPress: () => void }) {
  const colors = useColors();
  return (
    <Pressable onPress={onPress} style={[cs.row, { backgroundColor: colors.card, borderColor: colors.border, alignItems: "flex-start" }]}>
      <View style={[cs.rowIcon, { backgroundColor: colors.muted }]}>
        <Feather name={EVENT_ICON[event.eventType] ?? "circle"} size={15} color={colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[cs.rowTitle, { color: colors.foreground }]}>{EVENT_LABEL[event.eventType] ?? event.eventType}</Text>
        <Text style={[cs.rowMeta, { color: colors.mutedForeground }]}>{event.description}</Text>
        <Text style={[s.dateText, { color: colors.mutedForeground }]}>{dateLabel(event.eventDate)}</Text>
      </View>
      <Feather name="mail" size={14} color={colors.mutedForeground} />
    </Pressable>
  );
}

export function TimelinePanel({ projectId, onOpenThread }: { projectId: number; onOpenThread: (threadId: number) => void }) {
  const colors = useColors();
  const { data, isLoading, isError, refetch } = useListProjectCommunicationTimeline(projectId);
  const events = data?.data ?? [];

  if (isLoading) return <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />;

  if (isError) {
    return (
      <View style={[cs.emptyBox, { borderColor: colors.border }]}>
        <Feather name="alert-circle" size={26} color={colors.mutedForeground} />
        <Text style={[cs.emptyTitle, { color: colors.foreground }]}>Failed to load timeline</Text>
        <Pressable style={[cs.retryBtn, { borderColor: colors.border }]} onPress={() => refetch()}>
          <Feather name="refresh-cw" size={14} color={colors.mutedForeground} />
          <Text style={[cs.retryText, { color: colors.mutedForeground }]}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  if (events.length === 0) {
    return (
      <View style={[cs.emptyBox, { borderColor: colors.border }]}>
        <Feather name="clock" size={26} color={colors.mutedForeground} />
        <Text style={[cs.emptyTitle, { color: colors.foreground }]}>No timeline events yet</Text>
        <Text style={[cs.emptySubText, { color: colors.mutedForeground }]}>
          Milestones like permit approvals, inspections, and change orders will appear here as they're
          detected in synced emails.
        </Text>
      </View>
    );
  }

  return (
    <FlatList
      data={events}
      keyExtractor={(e) => String(e.id)}
      scrollEnabled={false}
      renderItem={({ item }) => <EventRow event={item} onPress={() => onOpenThread(item.threadId)} />}
      ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
    />
  );
}

const s = StyleSheet.create({
  dateText: { fontSize: 11, fontFamily: "NunitoSans_400Regular", marginTop: 4 },
});
