import { View, Text } from "@react-pdf/renderer";
import { styles, COLORS } from "./theme";
import { format } from "date-fns";

interface RFI {
  id: number;
  rfiNumber: string;
  subject: string;
  description: string;
  status: string;
  priority: string;
  response?: string | null;
  aiDraftResponse?: string | null;
  dueDate?: string | null;
  closedAt?: string | null;
}

interface RFIsSectionProps {
  rfis: RFI[];
}

const statusConfig: Record<string, { bg: string; text: string }> = {
  open: { bg: "#FEF3C7", text: "#92400e" },
  in_review: { bg: "#DBEAFE", text: "#1e40af" },
  answered: { bg: "#DCFCE7", text: "#166534" },
  closed: { bg: "#f3f4f6", text: "#374151" },
};

const priorityConfig: Record<string, string> = {
  low: COLORS.lightText,
  medium: COLORS.amber,
  high: COLORS.orange,
  urgent: COLORS.red,
};

export default function RFIsSection({ rfis }: RFIsSectionProps) {
  if (!rfis || rfis.length === 0) {
    return (
      <View>
        <Text style={styles.sectionTitle}>RFIs</Text>
        <View style={styles.sectionDivider} />
        <Text style={styles.emptyState}>No RFIs recorded for this project.</Text>
      </View>
    );
  }

  return (
    <View>
      <Text style={styles.sectionTitle}>RFIs</Text>
      <View style={styles.sectionDivider} />
      {rfis.map((rfi) => {
        const sc = statusConfig[rfi.status] || statusConfig.open;
        return (
          <View key={rfi.id} style={styles.card}>
            <View style={[styles.row, { marginBottom: 4 }]}>
              <Text style={{ fontSize: 10, fontFamily: "Helvetica-Bold", flex: 1 }}>
                {rfi.rfiNumber} — {rfi.subject}
              </Text>
              <View style={[styles.badge, { backgroundColor: sc.bg }]}>
                <Text style={[styles.badge, { color: sc.text, backgroundColor: "transparent" }]}>
                  {rfi.status.replace("_", " ").toUpperCase()}
                </Text>
              </View>
            </View>
            <Text style={[styles.smallText, { color: priorityConfig[rfi.priority] || COLORS.lightText, marginBottom: 4 }]}>
              Priority: {rfi.priority.toUpperCase()}
            </Text>
            <Text style={[styles.text, { marginBottom: 4 }]}>{rfi.description}</Text>
            {rfi.dueDate && (
              <Text style={styles.tinyText}>Due: {format(new Date(rfi.dueDate), "MMM d, yyyy")}</Text>
            )}
            {rfi.response && (
              <View style={{ marginTop: 6, borderTopWidth: 0.5, borderTopColor: COLORS.border, paddingTop: 4 }}>
                <Text style={[styles.smallText, { fontFamily: "Helvetica-Bold" }]}>Response</Text>
                <Text style={styles.smallText}>{rfi.response}</Text>
              </View>
            )}
            {rfi.aiDraftResponse && (
              <View style={{ marginTop: 6, backgroundColor: "#f0f9ff", padding: 6, borderRadius: 3 }}>
                <Text style={[styles.smallText, { color: COLORS.blue, fontFamily: "Helvetica-Bold" }]}>
                  AI Draft Response
                </Text>
                <Text style={[styles.smallText, { color: COLORS.blue }]}>{rfi.aiDraftResponse}</Text>
              </View>
            )}
            {rfi.closedAt && (
              <Text style={[styles.tinyText, { marginTop: 4 }]}>
                Closed: {format(new Date(rfi.closedAt), "MMM d, yyyy")}
              </Text>
            )}
          </View>
        );
      })}
    </View>
  );
}
