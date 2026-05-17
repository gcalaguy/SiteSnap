import { View, Text } from "@react-pdf/renderer";
import { styles, COLORS } from "./theme";
import { format } from "date-fns";

interface SafetySubmission {
  id: number;
  templateName?: string | null;
  templateCategory?: string | null;
  workerName?: string | null;
  status: string;
  aiSummary?: string | null;
  createdAt: string;
}

interface SafetySectionProps {
  submissions: SafetySubmission[];
}

const statusConfig: Record<string, { bg: string; text: string }> = {
  draft: { bg: "#f3f4f6", text: "#374151" },
  submitted: { bg: "#DBEAFE", text: "#1e40af" },
  reviewed: { bg: "#EDE9FE", text: "#5b21b6" },
  approved: { bg: "#DCFCE7", text: "#166534" },
};

const categoryConfig: Record<string, { label: string; color: string }> = {
  injury: { label: "Injury", color: COLORS.red },
  safety: { label: "Safety", color: COLORS.blue },
  hazard: { label: "Hazard", color: COLORS.orange },
  toolbox: { label: "Toolbox", color: COLORS.green },
};

export default function SafetySection({ submissions }: SafetySectionProps) {
  if (!submissions || submissions.length === 0) {
    return (
      <View>
        <Text style={styles.sectionTitle}>Safety & Inspections</Text>
        <View style={styles.sectionDivider} />
        <Text style={styles.emptyState}>No safety submissions or inspections for this project.</Text>
      </View>
    );
  }

  return (
    <View>
      <Text style={styles.sectionTitle}>Safety & Inspections</Text>
      <View style={styles.sectionDivider} />
      {submissions.map((s) => {
        const sc = statusConfig[s.status] || statusConfig.draft;
        const cat = categoryConfig[s.templateCategory || ""];
        return (
          <View key={s.id} style={styles.card}>
            <View style={[styles.row, { marginBottom: 4 }]}>
              <Text style={{ fontSize: 10, fontFamily: "Helvetica-Bold", flex: 1 }}>
                {s.templateName || "Safety Form"}
              </Text>
              <View style={[styles.badge, { backgroundColor: sc.bg }]}>
                <Text style={[styles.badge, { color: sc.text, backgroundColor: "transparent" }]}>
                  {(s.status || "draft").toUpperCase()}
                </Text>
              </View>
            </View>
            <View style={[styles.row, { marginBottom: 4 }]}>
              {cat && (
                <Text style={[styles.tinyText, { color: cat.color, fontFamily: "Helvetica-Bold" }]}>
                  {cat.label}
                </Text>
              )}
              {s.workerName && <Text style={styles.tinyText}>By: {s.workerName}</Text>}
            </View>
            {s.aiSummary && (
              <Text style={[styles.smallText, { fontStyle: "italic", marginBottom: 4 }]}>
                {s.aiSummary}
              </Text>
            )}
            <Text style={styles.tinyText}>
              {format(new Date(s.createdAt), "MMM d, yyyy 'at' h:mm a")}
            </Text>
          </View>
        );
      })}
    </View>
  );
}
