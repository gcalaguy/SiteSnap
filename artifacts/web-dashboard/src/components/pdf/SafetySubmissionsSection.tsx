import { View, Text } from "@react-pdf/renderer";
import { styles, COLORS } from "./theme";
import { format } from "date-fns";
import type { FormSubmissionRecord } from "@workspace/api-client-react";

const CATEGORY_LABELS: Record<string, string> = {
  safety: "Inspections",
  injury: "Incident Reports",
  hazard: "Hazard Log",
  toolbox: "Toolbox Talks",
};

const STATUS_COLORS: Record<string, string> = {
  draft: COLORS.mutedText,
  submitted: COLORS.blue,
  reviewed: COLORS.amber,
  approved: COLORS.green,
};

interface SafetySubmissionsSectionProps {
  submissions: FormSubmissionRecord[];
  category?: string;
  title?: string;
}

export default function SafetySubmissionsSection({
  submissions,
  category,
  title,
}: SafetySubmissionsSectionProps) {
  const filtered = category
    ? submissions.filter((s) => s.templateCategory === category)
    : submissions;

  const sectionTitle = title ?? CATEGORY_LABELS[category ?? ""] ?? "Safety Submissions";

  if (!filtered || filtered.length === 0) {
    return (
      <View>
        <Text style={styles.sectionTitle}>{sectionTitle}</Text>
        <View style={styles.sectionDivider} />
        <Text style={styles.emptyState}>No {sectionTitle.toLowerCase()} recorded.</Text>
      </View>
    );
  }

  return (
    <View>
      <Text style={styles.sectionTitle}>{sectionTitle}</Text>
      <View style={styles.sectionDivider} />

      {filtered.map((sub) => {
        const statusColor = STATUS_COLORS[sub.status] ?? COLORS.mutedText;
        const formData = sub.data ?? {};
        const dataEntries = Object.entries(formData).filter(
          ([, v]) => v !== null && v !== undefined && v !== ""
        );

        return (
          <View key={sub.id} style={styles.card}>
            <View style={[styles.row, { marginBottom: 6 }]}>
              <Text style={styles.cardTitle}>
                {sub.templateName ?? "Safety Form"}
              </Text>
              <Text
                style={[
                  styles.badge,
                  { backgroundColor: `${statusColor}15`, color: statusColor },
                ]}
              >
                {sub.status}
              </Text>
            </View>

            {sub.workerName && (
              <Text style={styles.smallText}>Submitted by: {sub.workerName}</Text>
            )}
            <Text style={styles.smallText}>
              {format(new Date(sub.createdAt), "MMM d, yyyy 'at' h:mm a")}
            </Text>

            {sub.aiSummary && (
              <View style={{ marginTop: 6, backgroundColor: "#f0f9ff", padding: 6, borderRadius: 3 }}>
                <Text style={[styles.smallText, { color: COLORS.blue, fontFamily: "Helvetica-Bold" }]}>
                  AI Summary
                </Text>
                <Text style={[styles.smallText, { color: COLORS.blue }]}>{sub.aiSummary}</Text>
              </View>
            )}

            {dataEntries.length > 0 && (
              <View style={{ marginTop: 6 }}>
                <Text style={[styles.smallText, { fontFamily: "Helvetica-Bold", marginBottom: 4 }]}>
                  Form Responses
                </Text>
                {dataEntries.slice(0, 10).map(([key, value]) => (
                  <View key={key} style={{ flexDirection: "row", marginBottom: 2 }}>
                    <Text style={[styles.tinyText, { width: "40%" }]}>
                      {key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                    </Text>
                    <Text style={[styles.smallText, { flex: 1 }]}>
                      {typeof value === "boolean"
                        ? value
                          ? "Yes"
                          : "No"
                        : String(value).slice(0, 200)}
                    </Text>
                  </View>
                ))}
                {dataEntries.length > 10 && (
                  <Text style={styles.tinyText}>
                    +{dataEntries.length - 10} more fields
                  </Text>
                )}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}
