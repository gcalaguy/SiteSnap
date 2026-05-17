import { View, Text, Image } from "@react-pdf/renderer";
import { styles, COLORS } from "./theme";
import { format } from "date-fns";

interface ReportPhoto {
  id: number;
  objectPath: string;
  caption?: string | null;
}

interface DailyReport {
  id: number;
  reportDate: string;
  weather?: string | null;
  temperature?: string | null;
  crewCount: number;
  workPerformed: string;
  materialsUsed?: string | null;
  equipment?: string | null;
  issues?: string | null;
  aiSummary?: string | null;
  photos?: ReportPhoto[];
  submittedBy?: {
    firstName?: string | null;
    lastName?: string | null;
  } | null;
}

interface DailyReportsSectionProps {
  reports: DailyReport[];
}

function photoUrl(path: string) {
  if (!path) return "";
  if (path.startsWith("http")) return path;
  return path.replace(/^\/objects\//, "/api/storage/objects/");
}

export default function DailyReportsSection({ reports }: DailyReportsSectionProps) {
  if (!reports || reports.length === 0) {
    return (
      <View>
        <Text style={styles.sectionTitle}>Daily Reports</Text>
        <View style={styles.sectionDivider} />
        <Text style={styles.emptyState}>No daily reports recorded for this project.</Text>
      </View>
    );
  }

  return (
    <View>
      <Text style={styles.sectionTitle}>Daily Reports</Text>
      <View style={styles.sectionDivider} />
      {reports.map((report) => (
        <View key={report.id} style={styles.card}>
          <View style={[styles.row, { marginBottom: 6 }]}>
            <Text style={styles.cardTitle}>
              {format(new Date(report.reportDate), "MMM d, yyyy")}
            </Text>
            <Text style={styles.smallText}>Crew: {report.crewCount}</Text>
          </View>

          {report.submittedBy && (
            <Text style={styles.smallText}>
              Submitted by: {report.submittedBy.firstName ?? ""} {report.submittedBy.lastName ?? ""}
            </Text>
          )}

          <Text style={[styles.text, { marginTop: 6 }]}>{report.workPerformed}</Text>

          {(report.weather || report.temperature) && (
            <View style={[styles.row, { marginTop: 4 }]}>
              {report.weather && <Text style={styles.smallText}>Weather: {report.weather}</Text>}
              {report.temperature && <Text style={styles.smallText}>Temp: {report.temperature}</Text>}
            </View>
          )}

          {report.materialsUsed && (
            <View style={{ marginTop: 4 }}>
              <Text style={styles.label}>Materials Used</Text>
              <Text style={styles.smallText}>{report.materialsUsed}</Text>
            </View>
          )}

          {report.equipment && (
            <View style={{ marginTop: 4 }}>
              <Text style={styles.label}>Equipment</Text>
              <Text style={styles.smallText}>{report.equipment}</Text>
            </View>
          )}

          {report.issues && (
            <View style={{ marginTop: 4, backgroundColor: "#FEF3C7", padding: 6, borderRadius: 3 }}>
              <Text style={[styles.smallText, { color: COLORS.orange, fontFamily: "Helvetica-Bold" }]}>
                Issues / Delays
              </Text>
              <Text style={[styles.smallText, { color: COLORS.orange }]}>{report.issues}</Text>
            </View>
          )}

          {report.aiSummary && (
            <View style={{ marginTop: 6, backgroundColor: "#f0f9ff", padding: 6, borderRadius: 3 }}>
              <Text style={[styles.smallText, { color: COLORS.blue, fontFamily: "Helvetica-Bold" }]}>
                AI Summary
              </Text>
              <Text style={[styles.smallText, { color: COLORS.blue }]}>{report.aiSummary}</Text>
            </View>
          )}

          {report.photos && report.photos.length > 0 && (
            <View style={{ marginTop: 8, flexDirection: "row", flexWrap: "wrap" }}>
              {report.photos.slice(0, 6).map((photo) => (
                <Image key={photo.id} src={photoUrl(photo.objectPath)} style={styles.image} />
              ))}
              {report.photos.length > 6 && (
                <Text style={[styles.tinyText, { alignSelf: "center" }]}>
                  +{report.photos.length - 6} more
                </Text>
              )}
            </View>
          )}
        </View>
      ))}
    </View>
  );
}
