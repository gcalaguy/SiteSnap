import { useGetMe, useListProjects, customFetch } from "@workspace/api-client-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { Feather } from "@expo/vector-icons";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ElementScore {
  ihsaElement: string;
  ihsaElementName: string;
  averageScore: number;
  entryCount: number;
  failCount: number;
}

interface CorDashboard {
  project: { id: number; name: string };
  overallScore: number;
  totalEntries: number;
  scoreByElement: ElementScore[];
  recentFindings: CorFinding[];
}

interface CorFinding {
  id: number;
  ihsaElement: string;
  ihsaElementName: string;
  findingType: "pass" | "fail";
  findingDescription: string;
  complianceScore: number;
  createdAt: string;
}

interface WorkerCredential {
  id: number;
  credentialType: string;
  status: string;
  expirationDate: string | null;
  certificateNumber: string | null;
}

type DocType = "swp" | "jha" | "company_rules" | "policy";

interface PolicyDocument {
  id: number;
  documentType: DocType;
  title: string;
  description: string | null;
  fileUrl: string | null;
  contentText: string | null;
  ihsaElement: string;
  requiresAnnualRenewal: boolean;
}

const DOC_TYPE_LABELS: Record<DocType, string> = {
  swp: "Safe Work Procedure",
  jha: "Job Hazard Analysis",
  company_rules: "Company Rules",
  policy: "Policy",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function scoreColor(score: number): string {
  if (score >= 80) return "#22c55e"; // green
  if (score >= 60) return "#f59e0b"; // amber
  return "#ef4444";                  // red
}

function credentialStatusColor(status: string, expirationDate: string | null): string {
  if (status === "revoked" || status === "expired") return "#ef4444";
  if (expirationDate) {
    const daysLeft = (new Date(expirationDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    if (daysLeft < 30) return "#f59e0b";
  }
  if (status === "active") return "#22c55e";
  return "#94a3b8"; // pending / unknown
}

function formatCredentialLabel(type: string): string {
  return type
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// ── Sign-off modal ────────────────────────────────────────────────────────────

function SignoffModal({
  doc,
  onClose,
  onSigned,
}: {
  doc: PolicyDocument;
  onClose: () => void;
  onSigned: () => void;
}) {
  const colors = useColors();
  const queryClient = useQueryClient();
  const [confirmed, setConfirmed] = useState(false);

  const signMutation = useMutation({
    mutationFn: () =>
      customFetch(`/api/cor/policy-documents/${doc.id}/sign`, {
        method: "POST",
        body: JSON.stringify({}),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cor-pending-signoffs"] });
      queryClient.invalidateQueries({ queryKey: ["cor-my-signoffs"] });
      onSigned();
      onClose();
      Alert.alert("Signed", `You have acknowledged: "${doc.title}"`);
    },
    onError: () => Alert.alert("Error", "Could not submit sign-off. Please try again."),
  });

  const s = StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.7)",
      justifyContent: "flex-end",
    },
    sheet: {
      backgroundColor: colors.card,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      padding: 20,
      maxHeight: "80%",
    },
    handle: {
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.border,
      alignSelf: "center",
      marginBottom: 16,
    },
    title: { fontSize: 17, fontWeight: "700", color: colors.text, marginBottom: 4 },
    meta: { fontSize: 12, color: colors.textSecondary, marginBottom: 16 },
    content: {
      fontSize: 13,
      color: colors.text,
      lineHeight: 20,
      maxHeight: 200,
      marginBottom: 16,
    },
    checkRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 12,
      padding: 12,
      borderRadius: 10,
      backgroundColor: colors.background,
      marginBottom: 16,
    },
    checkbox: {
      width: 22,
      height: 22,
      borderRadius: 6,
      borderWidth: 2,
      borderColor: confirmed ? "#C9A84C" : colors.border,
      backgroundColor: confirmed ? "#C9A84C" : "transparent",
      alignItems: "center",
      justifyContent: "center",
      marginTop: 1,
    },
    checkboxInner: { color: "#000", fontSize: 14, fontWeight: "700" },
    confirmText: { flex: 1, fontSize: 13, color: colors.text, lineHeight: 19 },
    signBtn: {
      backgroundColor: confirmed ? "#C9A84C" : colors.border,
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: "center",
    },
    signBtnText: {
      color: confirmed ? "#000" : colors.textSecondary,
      fontWeight: "700",
      fontSize: 15,
    },
    cancelBtn: { alignItems: "center", marginTop: 10, paddingVertical: 8 },
    cancelText: { color: colors.textSecondary, fontSize: 14 },
  });

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={s.overlay}>
        <ScrollView style={s.sheet} showsVerticalScrollIndicator={false}>
          <View style={s.handle} />
          <Text style={s.title}>{doc.title}</Text>
          <Text style={s.meta}>
            {DOC_TYPE_LABELS[doc.documentType]}
            {doc.requiresAnnualRenewal ? "  ·  Annual renewal required" : ""}
          </Text>

          {doc.description ? (
            <Text style={s.content}>{doc.description}</Text>
          ) : null}
          {doc.contentText ? (
            <ScrollView style={{ maxHeight: 200, marginBottom: 16 }} nestedScrollEnabled>
              <Text style={{ fontSize: 13, color: colors.textSecondary, lineHeight: 20 }}>
                {doc.contentText}
              </Text>
            </ScrollView>
          ) : null}

          <TouchableOpacity style={s.checkRow} onPress={() => setConfirmed((v) => !v)}>
            <View style={s.checkbox}>
              {confirmed && <Text style={s.checkboxInner}>✓</Text>}
            </View>
            <Text style={s.confirmText}>
              I confirm that I have read, understood, and agree to comply with this{" "}
              {DOC_TYPE_LABELS[doc.documentType]}. My acknowledgement constitutes a digital sign-off.
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={s.signBtn}
            disabled={!confirmed || signMutation.isPending}
            onPress={() => signMutation.mutate()}
          >
            <Text style={s.signBtnText}>
              {signMutation.isPending ? "Signing…" : "Sign & Acknowledge"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={s.cancelBtn} onPress={onClose}>
            <Text style={s.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </Modal>
  );
}

// ── Score ring (simple text-based gauge) ─────────────────────────────────────

function ScoreRing({ score, size = 80 }: { score: number; size?: number }) {
  const colors = useColors();
  const color = scoreColor(score);
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: 4,
        borderColor: color,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: colors.card,
      }}
    >
      <Text style={{ fontSize: size * 0.28, fontWeight: "700", color }}>{score}</Text>
      <Text style={{ fontSize: 9, color: colors.textSecondary }}>/ 100</Text>
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function CorDashboardScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const { data: me } = useGetMe();
  const { data: projectsData } = useListProjects();
  const projects = projectsData?.projects ?? [];

  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [signDoc, setSignDoc] = useState<PolicyDocument | null>(null);
  const projectId = selectedProjectId ?? projects[0]?.id ?? null;
  const isWorker = me?.role === "worker";

  // COR compliance dashboard (owner/foreman only)
  const dashboardQuery = useQuery<CorDashboard>({
    queryKey: ["cor-dashboard", projectId],
    queryFn: () => customFetch(`/api/cor/projects/${projectId}/dashboard`),
    enabled: !isWorker && projectId != null,
  });

  // Worker's own credentials
  const credentialsQuery = useQuery<WorkerCredential[]>({
    queryKey: ["cor-credentials-self", me?.id],
    queryFn: () => customFetch(`/api/cor/credentials/${me?.id}`),
    enabled: me?.id != null,
  });

  // Worker's own voice logs
  const myVoiceLogsQuery = useQuery<CorFinding[]>({
    queryKey: ["cor-voice-logs-self"],
    queryFn: () => customFetch(`/api/cor/voice-log`),
    enabled: isWorker,
  });

  // Pending sign-offs (all roles can have pending docs)
  const pendingSignoffsQuery = useQuery<{ pending: PolicyDocument[] }>({
    queryKey: ["cor-pending-signoffs", me?.id],
    queryFn: () => customFetch("/api/cor/policy-signoffs/pending"),
    enabled: me?.id != null,
  });

  const s = styles(colors);

  return (
    <ScrollView
      style={s.container}
      contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Feather name="arrow-left" size={20} color={colors.text} />
        </TouchableOpacity>
        <Text style={s.title}>COR Compliance</Text>
      </View>

      {/* Project selector (owner/foreman) */}
      {!isWorker && projects.length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ marginBottom: 12 }}
          contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
        >
          {projects.map((p: { id: number; name: string }) => (
            <TouchableOpacity
              key={p.id}
              onPress={() => setSelectedProjectId(p.id)}
              style={[s.projectChip, projectId === p.id && s.projectChipActive]}
            >
              <Text style={[s.projectChipText, projectId === p.id && s.projectChipTextActive]}>
                {p.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Overall score card (owner/foreman) */}
      {!isWorker && (
        <View style={s.card}>
          <Text style={s.cardTitle}>Overall COR Score</Text>
          {dashboardQuery.isLoading ? (
            <ActivityIndicator color={colors.primary} style={{ marginVertical: 16 }} />
          ) : dashboardQuery.data ? (
            <View style={s.scoreRow}>
              <ScoreRing score={dashboardQuery.data.overallScore} size={88} />
              <View style={{ flex: 1, marginLeft: 16 }}>
                <Text style={s.scoreLabel}>
                  {dashboardQuery.data.totalEntries} evidence entries across{" "}
                  {dashboardQuery.data.scoreByElement.length} IHSA elements
                </Text>
                <Text style={[s.scoreSubLabel, { color: scoreColor(dashboardQuery.data.overallScore) }]}>
                  {dashboardQuery.data.overallScore >= 80
                    ? "Compliant"
                    : dashboardQuery.data.overallScore >= 60
                    ? "Needs Attention"
                    : "Non-Compliant"}
                </Text>
              </View>
            </View>
          ) : (
            <Text style={s.emptyText}>No COR data for this project yet.</Text>
          )}
        </View>
      )}

      {/* Element breakdown (owner/foreman) */}
      {!isWorker && dashboardQuery.data?.scoreByElement.length ? (
        <View style={s.card}>
          <Text style={s.cardTitle}>IHSA Element Breakdown</Text>
          {dashboardQuery.data.scoreByElement.map((el) => (
            <View key={el.ihsaElement} style={s.elementRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.elementName} numberOfLines={1}>
                  {el.ihsaElementName}
                </Text>
                <Text style={s.elementMeta}>
                  {el.entryCount} entries · {el.failCount} fail
                </Text>
              </View>
              <View
                style={[
                  s.elementBadge,
                  { backgroundColor: scoreColor(el.averageScore) + "22" },
                ]}
              >
                <Text style={[s.elementBadgeText, { color: scoreColor(el.averageScore) }]}>
                  {el.averageScore}
                </Text>
              </View>
            </View>
          ))}
        </View>
      ) : null}

      {/* Recent findings (owner/foreman) */}
      {!isWorker && dashboardQuery.data?.recentFindings.length ? (
        <View style={s.card}>
          <Text style={s.cardTitle}>Recent Findings</Text>
          {dashboardQuery.data.recentFindings.slice(0, 5).map((f) => (
            <View key={f.id} style={s.findingRow}>
              <View
                style={[
                  s.findingDot,
                  { backgroundColor: f.findingType === "fail" ? "#ef4444" : "#22c55e" },
                ]}
              />
              <View style={{ flex: 1 }}>
                <Text style={s.findingDesc} numberOfLines={2}>
                  {f.findingDescription}
                </Text>
                <Text style={s.findingMeta}>{f.ihsaElementName}</Text>
              </View>
            </View>
          ))}
        </View>
      ) : null}

      {/* Pending sign-offs */}
      {signDoc && (
        <SignoffModal
          doc={signDoc}
          onClose={() => setSignDoc(null)}
          onSigned={() => setSignDoc(null)}
        />
      )}

      {(() => {
        const pending = pendingSignoffsQuery.data?.pending ?? [];
        if (!pendingSignoffsQuery.data && !pendingSignoffsQuery.isLoading) return null;
        return (
          <View style={s.card}>
            <Text style={s.cardTitle}>Pending Sign-offs</Text>
            {pendingSignoffsQuery.isLoading ? (
              <ActivityIndicator color="#C9A84C" style={{ marginVertical: 12 }} />
            ) : pending.length === 0 ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Text style={{ fontSize: 16, color: "#22c55e" }}>✓</Text>
                <Text style={{ fontSize: 13, color: "#22c55e", fontWeight: "600" }}>
                  All documents signed
                </Text>
              </View>
            ) : (
              <View style={{ gap: 10 }}>
                {pending.map((doc) => (
                  <TouchableOpacity
                    key={doc.id}
                    onPress={() => setSignDoc(doc)}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 12,
                      backgroundColor: "#C9A84C18",
                      borderRadius: 10,
                      padding: 12,
                      borderWidth: 1,
                      borderColor: "#C9A84C40",
                    }}
                  >
                    <View style={{
                      width: 36,
                      height: 36,
                      borderRadius: 8,
                      backgroundColor: "#C9A84C22",
                      alignItems: "center",
                      justifyContent: "center",
                    }}>
                      <Feather name="file-text" size={18} color="#C9A84C" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: "600", color: "#e5e5e5" }} numberOfLines={1}>
                        {doc.title}
                      </Text>
                      <Text style={{ fontSize: 11, color: "#a1a1aa", marginTop: 2 }}>
                        {DOC_TYPE_LABELS[doc.documentType]}
                        {doc.requiresAnnualRenewal ? "  ·  Annual renewal" : ""}
                      </Text>
                    </View>
                    <View style={{
                      paddingHorizontal: 10,
                      paddingVertical: 5,
                      backgroundColor: "#C9A84C",
                      borderRadius: 6,
                    }}>
                      <Text style={{ color: "#000", fontSize: 12, fontWeight: "700" }}>Sign</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        );
      })()}

      {/* Credential status (all roles) */}
      <View style={s.card}>
        <Text style={s.cardTitle}>My Credentials</Text>
        {credentialsQuery.isLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginVertical: 12 }} />
        ) : credentialsQuery.data?.length ? (
          credentialsQuery.data.map((cred) => {
            const dotColor = credentialStatusColor(cred.status, cred.expirationDate);
            return (
              <View key={cred.id} style={s.credRow}>
                <View style={[s.credDot, { backgroundColor: dotColor }]} />
                <View style={{ flex: 1 }}>
                  <Text style={s.credType}>{formatCredentialLabel(cred.credentialType)}</Text>
                  {cred.expirationDate && (
                    <Text style={s.credMeta}>
                      Expires {new Date(cred.expirationDate).toLocaleDateString()}
                    </Text>
                  )}
                  {cred.certificateNumber && (
                    <Text style={s.credMeta}>Cert #{cred.certificateNumber}</Text>
                  )}
                </View>
                <Text style={[s.credStatus, { color: dotColor }]}>
                  {cred.status.charAt(0).toUpperCase() + cred.status.slice(1)}
                </Text>
              </View>
            );
          })
        ) : (
          <Text style={s.emptyText}>No training credentials on file.</Text>
        )}
      </View>

      {/* My voice logs (worker) */}
      {isWorker && (
        <View style={s.card}>
          <Text style={s.cardTitle}>My Voice Observations</Text>
          {myVoiceLogsQuery.isLoading ? (
            <ActivityIndicator color={colors.primary} style={{ marginVertical: 12 }} />
          ) : myVoiceLogsQuery.data?.length ? (
            (myVoiceLogsQuery.data as any[]).map((log: any) => (
              <View key={log.id} style={s.findingRow}>
                <View
                  style={[
                    s.findingDot,
                    {
                      backgroundColor:
                        log.riskLevel === "critical" || log.riskLevel === "high"
                          ? "#ef4444"
                          : log.riskLevel === "medium"
                          ? "#f59e0b"
                          : "#22c55e",
                    },
                  ]}
                />
                <View style={{ flex: 1 }}>
                  <Text style={s.findingDesc} numberOfLines={2}>
                    {log.rawTranscript}
                  </Text>
                  <Text style={s.findingMeta}>
                    {log.riskLevel?.toUpperCase()} · {new Date(log.createdAt).toLocaleDateString()}
                  </Text>
                </View>
              </View>
            ))
          ) : (
            <Text style={s.emptyText}>No voice observations submitted yet.</Text>
          )}
        </View>
      )}
    </ScrollView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

function styles(colors: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 16,
      paddingBottom: 12,
    },
    backBtn: { padding: 4, marginRight: 12 },
    title: { fontSize: 20, fontWeight: "700", color: colors.text },
    card: {
      marginHorizontal: 16,
      marginBottom: 12,
      backgroundColor: colors.card,
      borderRadius: 12,
      padding: 16,
    },
    cardTitle: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.textSecondary,
      textTransform: "uppercase",
      letterSpacing: 0.6,
      marginBottom: 12,
    },
    scoreRow: { flexDirection: "row", alignItems: "center" },
    scoreLabel: { fontSize: 13, color: colors.textSecondary, marginBottom: 4 },
    scoreSubLabel: { fontSize: 15, fontWeight: "700" },
    projectChip: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 16,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
    },
    projectChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    projectChipText: { fontSize: 13, color: colors.textSecondary },
    projectChipTextActive: { color: "#fff", fontWeight: "600" },
    elementRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 8,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    elementName: { fontSize: 14, color: colors.text, fontWeight: "500" },
    elementMeta: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
    elementBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
    elementBadgeText: { fontSize: 14, fontWeight: "700" },
    findingRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      paddingVertical: 8,
      gap: 10,
    },
    findingDot: { width: 8, height: 8, borderRadius: 4, marginTop: 4 },
    findingDesc: { fontSize: 13, color: colors.text },
    findingMeta: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
    credRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 10,
      gap: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    credDot: { width: 10, height: 10, borderRadius: 5 },
    credType: { fontSize: 14, color: colors.text, fontWeight: "500" },
    credMeta: { fontSize: 12, color: colors.textSecondary, marginTop: 1 },
    credStatus: { fontSize: 12, fontWeight: "600" },
    emptyText: { fontSize: 13, color: colors.textSecondary, fontStyle: "italic" },
  });
}
