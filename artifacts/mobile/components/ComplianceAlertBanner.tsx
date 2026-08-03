import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";

// Maps targetFormId → safety tab category key
const FORM_CATEGORY_MAP: Record<string, string> = {
  toolbox_talk: "toolbox",
  site_inspection: "safety",
  hazard_id: "hazard",
  incident_investigation: "injury",
  training_record: "safety",
  audit_prep: "safety",
};

interface Directive {
  id: number;
  projectId: number;
  targetFormId: string;
  urgency: "HIGH" | "MEDIUM" | "LOW";
  workerDirective: string;
  status: string;
  createdAt: string;
}

const URGENCY_CFG = {
  HIGH: {
    bg: "#FEF2F2",
    border: "#EF4444",
    icon: "alert-octagon" as const,
    iconColor: "#EF4444",
    badgeColor: "#EF4444",
    label: "HIGH PRIORITY",
  },
  MEDIUM: {
    bg: "#FFFBEB",
    border: "#F59E0B",
    icon: "alert-triangle" as const,
    iconColor: "#F59E0B",
    badgeColor: "#F59E0B",
    label: "ADVISORY",
  },
  LOW: {
    bg: "#F0FDF4",
    border: "#22C55E",
    icon: "info" as const,
    iconColor: "#22C55E",
    badgeColor: "#22C55E",
    label: "NOTICE",
  },
};

interface Props {
  projectId?: number;
  /** When true, shows only the highest-urgency directive (dashboard mode). */
  compact?: boolean;
}

export function ComplianceAlertBanner({ projectId, compact = false }: Props) {
  const router = useRouter();
  const qc = useQueryClient();

  const queryKey = ["compliance-directives", projectId ?? "all"];

  const { data: directives = [] } = useQuery<Directive[]>({
    queryKey,
    queryFn: () => {
      const qs = projectId
        ? `?status=PENDING&projectId=${projectId}`
        : "?status=PENDING";
      return customFetch<Directive[]>(`/api/compliance/directives${qs}`);
    },
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });

  const dismissMutation = useMutation({
    mutationFn: (id: number) =>
      customFetch(`/api/compliance/directives/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "DISMISSED" }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  if (directives.length === 0) return null;

  // In compact mode pick the single highest-urgency directive
  const priority: Directive["urgency"][] = ["HIGH", "MEDIUM", "LOW"];
  const toShow = compact
    ? [
        directives.find((d) => d.urgency === "HIGH") ??
          directives.find((d) => d.urgency === "MEDIUM") ??
          directives[0],
      ]
    : directives;

  function handleAction(directive: Directive) {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    const category = FORM_CATEGORY_MAP[directive.targetFormId] ?? "safety";
    router.push({
      pathname: "/safety",
      params: { initCategory: category, initTab: "new" },
    } as any);
  }

  function handleDismiss(id: number) {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    dismissMutation.mutate(id);
  }

  return (
    <View style={compact ? styles.compactWrap : styles.wrap}>
      {!compact && (
        <View style={styles.sectionHeader}>
          <Feather name="shield" size={14} color="#EF4444" />
          <Text style={styles.sectionTitle}>AI Compliance Alerts</Text>
          <View style={styles.countBadge}>
            <Text style={styles.countText}>{directives.length}</Text>
          </View>
        </View>
      )}

      {toShow.map((directive) => {
        if (!directive) return null;
        const cfg = URGENCY_CFG[directive.urgency] ?? URGENCY_CFG.MEDIUM;
        return (
          <View
            key={directive.id}
            style={[
              styles.card,
              { backgroundColor: cfg.bg, borderColor: cfg.border },
            ]}
          >
            {/* Top row: icon + text + dismiss */}
            <View style={styles.cardTop}>
              <View
                style={[
                  styles.iconWrap,
                  { backgroundColor: `${cfg.border}18` },
                ]}
              >
                <Feather name={cfg.icon} size={20} color={cfg.iconColor} />
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.badgeRow}>
                  <View
                    style={[
                      styles.urgencyBadge,
                      { backgroundColor: cfg.badgeColor },
                    ]}
                  >
                    <Text style={styles.urgencyText}>{cfg.label}</Text>
                  </View>
                  <Text style={[styles.formLabel, { color: cfg.iconColor }]}>
                    {directive.targetFormId.replace(/_/g, " ")}
                  </Text>
                </View>
                <Text
                  style={styles.directive}
                  numberOfLines={compact ? 2 : undefined}
                >
                  {directive.workerDirective}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => handleDismiss(directive.id)}
                hitSlop={10}
                style={styles.dismissBtn}
                accessibilityLabel="Dismiss alert"
              >
                <Feather name="x" size={16} color="#6B7280" />
              </TouchableOpacity>
            </View>

            {/* Action button */}
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: cfg.border }]}
              onPress={() => handleAction(directive)}
              activeOpacity={0.82}
            >
              <Feather name="shield" size={14} color="#FFFFFF" />
              <Text style={styles.actionText}>Open Safety Form</Text>
              <Feather name="chevron-right" size={14} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        );
      })}

      {/* Compact overflow link */}
      {compact && directives.length > 1 && (
        <TouchableOpacity
          style={styles.viewAllBtn}
          onPress={() => router.push("/safety" as any)}
        >
          <Text style={styles.viewAllText}>
            +{directives.length - 1} more alert
            {directives.length - 1 > 1 ? "s" : ""} — view all
          </Text>
          <Feather name="chevron-right" size={13} color="#EF4444" />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginHorizontal: 16, marginBottom: 16, gap: 10 },
  compactWrap: { marginHorizontal: 16, marginBottom: 12 },

  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 6,
  },
  sectionTitle: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    color: "#EF4444",
    flex: 1,
  },
  countBadge: {
    backgroundColor: "#EF4444",
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  countText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontFamily: "Inter_700Bold",
  },

  card: {
    borderRadius: 14,
    borderWidth: 1.5,
    padding: 14,
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 6,
    elevation: 2,
  },

  cardTop: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },

  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  urgencyBadge: {
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  urgencyText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
  },
  formLabel: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    textTransform: "capitalize",
  },

  directive: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 19,
    color: "#111827",
  },

  dismissBtn: {
    padding: 4,
    marginLeft: 4,
    flexShrink: 0,
  },

  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  actionText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    flex: 1,
  },

  viewAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 4,
    marginTop: 2,
  },
  viewAllText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: "#EF4444",
  },
});
