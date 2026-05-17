import { View, Text, Image } from "@react-pdf/renderer";
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

export interface SubmissionPhoto {
  id: number;
  url: string;
  filename?: string;
}

export interface SafetySubmissionsSectionProps {
  submissions: FormSubmissionRecord[];
  category?: string;
  title?: string;
  photosMap?: Record<number, SubmissionPhoto[]>;
  showSeverity?: boolean;
}

function extractSeverity(data: Record<string, unknown>, aiSummary?: string | null): string | null {
  const text = [
    aiSummary ?? "",
    ...Object.values(data).map((v) => String(v ?? "")),
  ].join(" ").toLowerCase();

  if (text.includes("severe") || text.includes("high")) return "Severe";
  if (text.includes("moderate") || text.includes("medium")) return "Moderate";
  if (text.includes("minor") || text.includes("low")) return "Minor";
  return null;
}

const SEVERITY_COLORS: Record<string, string> = {
  Severe: COLORS.red,
  Moderate: COLORS.amber,
  Minor: COLORS.green,
};

export default function SafetySubmissionsSection({
  submissions,
  category,
  title,
  photosMap,
  showSeverity,
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
        const formData = (sub.data ?? {}) as Record<string, unknown>;
        const dataEntries = Object.entries(formData).filter(
          ([, v]) => v !== null && v !== undefined && v !== ""
        );
        const severity = showSeverity ? extractSeverity(formData, sub.aiSummary) : null;
        const photos = photosMap?.[sub.id] ?? [];

        return (
          <View key={sub.id} style={styles.card}>
            <View style={[styles.row, { marginBottom: 6 }]}>
              <Text style={styles.cardTitle}>
                {sub.templateName ?? "Safety Form"}
              </Text>
              <View style={{ flexDirection: "row", gap: 4 }}>
                {severity && (
                  <Text
                    style={[
                      styles.badge,
                      { backgroundColor: `${SEVERITY_COLORS[severity]}15`, color: SEVERITY_COLORS[severity] },
                    ]}
                  >
                    {severity}
                  </Text>
                )}
                <Text
                  style={[
                    styles.badge,
                    { backgroundColor: `${statusColor}15`, color: statusColor },
                  ]}
                >
                  {sub.status}
                </Text>
              </View>
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

            {/* Photo thumbnails */}
            {photos.length > 0 && (
              <View style={{ marginTop: 8 }}>
                <Text style={[styles.smallText, { fontFamily: "Helvetica-Bold", marginBottom: 4 }]}>
                  Photos ({photos.length})
                </Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}>
                  {photos.slice(0, 6).map((photo) => (
                    <View key={photo.id} style={{ width: 60, height: 60, borderRadius: 3, overflow: "hidden" }}>
                      <Image
                        src={photo.url}
                        style={{ width: 60, height: 60, objectFit: "cover" }}
                      />
                    </View>
                  ))}
                  {photos.length > 6 && (
                    <View
                      style={{
                        width: 60,
                        height: 60,
                        borderRadius: 3,
                        backgroundColor: "#f3f4f6",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Text style={styles.tinyText}>+{photos.length - 6}</Text>
                    </View>
                  )}
                </View>
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}
