import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { format } from "date-fns";

const COLORS = {
  gold: "#D4AF37",
  dark: "#1a1a1a",
  light: "#666666",
  muted: "#999999",
  border: "#e5e5e5",
  white: "#ffffff",
  red: "#dc2626",
  green: "#16a34a",
  orange: "#d97706",
  blue: "#2563eb",
  amber: "#f59e0b",
};

const styles = StyleSheet.create({
  page: { padding: 32, fontFamily: "Helvetica", fontSize: 10, color: COLORS.dark },
  header: { borderBottomWidth: 2, borderBottomColor: COLORS.gold, paddingBottom: 10, marginBottom: 16 },
  headerBrand: { fontFamily: "Helvetica-Bold", fontSize: 20, color: COLORS.dark },
  headerSubtitle: { fontSize: 9, color: COLORS.light, marginTop: 3 },
  sectionTitle: { fontFamily: "Helvetica-Bold", fontSize: 14, color: COLORS.gold, marginBottom: 8, marginTop: 12 },
  divider: { borderBottomWidth: 1, borderBottomColor: COLORS.border, marginBottom: 10, marginTop: 4 },
  row: { flexDirection: "row", justifyContent: "space-between", marginBottom: 3 },
  label: { fontSize: 9, color: COLORS.light },
  value: { fontSize: 9, color: COLORS.dark, fontFamily: "Helvetica-Bold" },
  card: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 3, padding: 8, marginBottom: 6 },
  cardTitle: { fontFamily: "Helvetica-Bold", fontSize: 10, marginBottom: 2 },
  cardSubtitle: { fontSize: 9, color: COLORS.light, marginBottom: 4 },
  small: { fontSize: 9, color: COLORS.light, lineHeight: 1.3 },
  tiny: { fontSize: 8, color: COLORS.muted },
  badge: { fontSize: 8, paddingHorizontal: 5, paddingVertical: 1, borderRadius: 2, fontFamily: "Helvetica-Bold" },
  grid2: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  gridItem: { width: "48%", marginBottom: 4 },
  empty: { fontSize: 9, color: COLORS.muted, fontStyle: "italic", textAlign: "center", paddingVertical: 8 },
  footer: { position: "absolute", bottom: 20, left: 32, right: 32, borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: 6, flexDirection: "row", justifyContent: "space-between", fontSize: 8, color: COLORS.muted },
});

interface TaskItem {
  id: number;
  title: string;
  description?: string | null;
  status: "todo" | "in_progress" | "done";
  priority: "low" | "medium" | "high";
  dueDate?: string | null;
  assignedToUserId?: number | null;
}

interface ReportItem {
  id: number;
  reportDate: string;
  weather?: string | null;
  temperature?: string | null;
  crewCount: number;
  workPerformed: string;
  materialsUsed?: string | null;
  equipment?: string | null;
  issues?: string | null;
  notes?: string | null;
  aiSummary?: string | null;
  submittedBy?: { firstName?: string | null; lastName?: string | null } | null;
}

interface RfiItem {
  id: number;
  rfiNumber: string;
  subject: string;
  description: string;
  status: string;
  priority: string;
  response?: string | null;
  dueDate?: string | null;
  closedAt?: string | null;
}

interface MemberItem {
  id: number;
  firstName: string;
  lastName: string;
}

interface ProjectLiteProps {
  project: {
    name: string;
    status: string;
    address: string;
    city: string;
    province: string;
    startDate?: string | null;
    endDate?: string | null;
    budget?: string | number | null;
    description?: string | null;
  };
  summary?: {
    totalBudget?: number | null;
    totalSpent?: number | null;
    budgetUtilizationPercent?: number | null;
    openRFICount?: number | null;
    closedRFICount?: number | null;
    taskTotal?: number | null;
    taskTodoCount?: number | null;
    taskInProgressCount?: number | null;
    taskDoneCount?: number | null;
  } | null;
  tasks: TaskItem[];
  reports: ReportItem[];
  rfis: RfiItem[];
  members: MemberItem[];
  sections: Record<string, boolean>;
}

const statusColors: Record<string, { bg: string; text: string; label: string }> = {
  todo: { bg: "#f3f4f6", text: "#374151", label: "To Do" },
  in_progress: { bg: "#FEF3C7", text: "#92400e", label: "In Progress" },
  done: { bg: "#DCFCE7", text: "#166534", label: "Done" },
};

const priorityColors: Record<string, string> = {
  low: COLORS.light,
  medium: COLORS.amber,
  high: COLORS.red,
};

const rfiStatusColors: Record<string, { bg: string; text: string }> = {
  open: { bg: "#FEF3C7", text: "#92400e" },
  in_review: { bg: "#DBEAFE", text: "#1e40af" },
  answered: { bg: "#DCFCE7", text: "#166534" },
  closed: { bg: "#f3f4f6", text: "#374151" },
};

export default function ProjectLiteDocument({
  project,
  summary,
  tasks,
  reports,
  rfis,
  members,
  sections,
}: ProjectLiteProps) {
  const budgetVal = summary?.totalBudget ?? project.budget;
  const budgetNum = typeof budgetVal === "string" ? parseFloat(budgetVal) : budgetVal;

  const filteredTasks = tasks ?? [];
  const filteredReports = reports ?? [];
  const filteredRfis = rfis ?? [];

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header} fixed>
          <Text style={styles.headerBrand}>Site Snap</Text>
          <Text style={styles.headerSubtitle}>
            {project.name} — {format(new Date(), "MMM d, yyyy")}
          </Text>
        </View>

        {/* Project Overview */}
        <View>
          <View style={[styles.row, { marginBottom: 6 }]}>
            <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 13 }}>{project.name}</Text>
            <View style={[styles.badge, { backgroundColor: COLORS.gold + "20" }]}>
              <Text style={{ fontSize: 8, fontFamily: "Helvetica-Bold", color: COLORS.gold }}>
                {project.status.replace("_", " ").toUpperCase()}
              </Text>
            </View>
          </View>
          <Text style={styles.small}>{project.address}, {project.city}, {project.province}</Text>

          <View style={[styles.grid2, { marginTop: 10, marginBottom: 6 }]}>
            {project.startDate && (
              <View style={styles.gridItem}>
                <Text style={styles.label}>Start Date</Text>
                <Text style={styles.value}>{format(new Date(project.startDate), "MMM d, yyyy")}</Text>
              </View>
            )}
            {project.endDate && (
              <View style={styles.gridItem}>
                <Text style={styles.label}>End Date</Text>
                <Text style={styles.value}>{format(new Date(project.endDate), "MMM d, yyyy")}</Text>
              </View>
            )}
            {budgetNum != null && (
              <View style={styles.gridItem}>
                <Text style={styles.label}>Budget</Text>
                <Text style={styles.value}>${Number(budgetNum).toLocaleString()}</Text>
              </View>
            )}
            {summary?.totalSpent != null && (
              <View style={styles.gridItem}>
                <Text style={styles.label}>Total Spent</Text>
                <Text style={styles.value}>${summary.totalSpent.toLocaleString()}</Text>
              </View>
            )}
            {summary?.budgetUtilizationPercent != null && (
              <View style={styles.gridItem}>
                <Text style={styles.label}>Utilized</Text>
                <Text style={styles.value}>{summary.budgetUtilizationPercent.toFixed(1)}%</Text>
              </View>
            )}
            {summary?.taskTotal != null && (
              <View style={styles.gridItem}>
                <Text style={styles.label}>Tasks</Text>
                <Text style={styles.value}>{summary.taskTotal} total</Text>
              </View>
            )}
            {summary?.openRFICount != null && (
              <View style={styles.gridItem}>
                <Text style={styles.label}>Open RFIs</Text>
                <Text style={styles.value}>{summary.openRFICount}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Tasks */}
        {sections.tasks && (
          <View>
            <Text style={styles.sectionTitle}>Tasks</Text>
            <View style={styles.divider} />
            {filteredTasks.length === 0 ? (
              <Text style={styles.empty}>No tasks for this project.</Text>
            ) : (
              filteredTasks.map((task) => {
                const cfg = statusColors[task.status];
                const assignee = members.find((m) => m.id === task.assignedToUserId);
                return (
                  <View key={task.id} style={styles.card}>
                    <View style={[styles.row, { marginBottom: 2 }]}>
                      <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 10, flex: 1 }}>{task.title}</Text>
                      <View style={[styles.badge, { backgroundColor: cfg.bg }]}>
                        <Text style={[styles.badge, { color: cfg.text, backgroundColor: "transparent" }]}>
                          {cfg.label}
                        </Text>
                      </View>
                    </View>
                    {task.description && <Text style={styles.small}>{task.description}</Text>}
                    <View style={[styles.row, { marginTop: 2 }]}>
                      <Text style={[styles.tiny, { color: priorityColors[task.priority] }]}>
                        {task.priority.toUpperCase()}
                      </Text>
                      {task.dueDate && <Text style={styles.tiny}>Due {format(new Date(task.dueDate), "MMM d")}</Text>}
                      {assignee && (
                        <Text style={styles.tiny}>
                          {assignee.firstName} {assignee.lastName}
                        </Text>
                      )}
                    </View>
                  </View>
                );
              })
            )}
          </View>
        )}

        {/* Daily Reports */}
        {sections.reports && (
          <View>
            <Text style={styles.sectionTitle}>Daily Reports</Text>
            <View style={styles.divider} />
            {filteredReports.length === 0 ? (
              <Text style={styles.empty}>No daily reports for this project.</Text>
            ) : (
              filteredReports.map((report) => (
                <View key={report.id} style={styles.card}>
                  <View style={[styles.row, { marginBottom: 4 }]}>
                    <Text style={styles.cardTitle}>{format(new Date(report.reportDate), "MMM d, yyyy")}</Text>
                    <Text style={styles.small}>Crew: {report.crewCount}</Text>
                  </View>
                  {report.submittedBy && (
                    <Text style={styles.small}>
                      By: {report.submittedBy.firstName ?? ""} {report.submittedBy.lastName ?? ""}
                    </Text>
                  )}
                  <Text style={{ fontSize: 10, marginTop: 4, lineHeight: 1.3 }}>{report.workPerformed}</Text>
                  {report.notes && (
                    <View style={{ marginTop: 3, backgroundColor: "#eff6ff", padding: 4, borderRadius: 2 }}>
                      <Text style={{ fontSize: 9, color: "#2563eb", fontFamily: "Helvetica-Bold" }}>Notes</Text>
                      <Text style={{ fontSize: 9, color: "#1e3a8a" }}>{report.notes}</Text>
                    </View>
                  )}
                  {(report.weather || report.temperature) && (
                    <View style={[styles.row, { marginTop: 3 }]}>
                      {report.weather && <Text style={styles.small}>Weather: {report.weather}</Text>}
                      {report.temperature && <Text style={styles.small}>Temp: {report.temperature}</Text>}
                    </View>
                  )}
                  {report.materialsUsed && (
                    <View style={{ marginTop: 2 }}>
                      <Text style={styles.label}>Materials</Text>
                      <Text style={styles.small}>{report.materialsUsed}</Text>
                    </View>
                  )}
                  {report.equipment && (
                    <View style={{ marginTop: 2 }}>
                      <Text style={styles.label}>Equipment</Text>
                      <Text style={styles.small}>{report.equipment}</Text>
                    </View>
                  )}
                  {report.issues && (
                    <View style={{ marginTop: 3, backgroundColor: "#FEF3C7", padding: 4, borderRadius: 2 }}>
                      <Text style={[styles.small, { color: COLORS.orange, fontFamily: "Helvetica-Bold" }]}>
                        Issues
                      </Text>
                      <Text style={[styles.small, { color: COLORS.orange }]}>{report.issues}</Text>
                    </View>
                  )}
                  {report.aiSummary && (
                    <View style={{ marginTop: 3, backgroundColor: "#f0f9ff", padding: 4, borderRadius: 2 }}>
                      <Text style={[styles.small, { color: COLORS.blue, fontFamily: "Helvetica-Bold" }]}>
                        AI Summary
                      </Text>
                      <Text style={[styles.small, { color: COLORS.blue }]}>{report.aiSummary}</Text>
                    </View>
                  )}
                </View>
              ))
            )}
          </View>
        )}

        {/* RFIs */}
        {sections.rfis && (
          <View>
            <Text style={styles.sectionTitle}>RFIs</Text>
            <View style={styles.divider} />
            {filteredRfis.length === 0 ? (
              <Text style={styles.empty}>No RFIs for this project.</Text>
            ) : (
              filteredRfis.map((rfi) => {
                const sc = rfiStatusColors[rfi.status] || rfiStatusColors.open;
                return (
                  <View key={rfi.id} style={styles.card}>
                    <View style={[styles.row, { marginBottom: 3 }]}>
                      <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 10, flex: 1 }}>
                        {rfi.rfiNumber} — {rfi.subject}
                      </Text>
                      <View style={[styles.badge, { backgroundColor: sc.bg }]}>
                        <Text style={[styles.badge, { color: sc.text, backgroundColor: "transparent" }]}>
                          {rfi.status.replace("_", " ").toUpperCase()}
                        </Text>
                      </View>
                    </View>
                    <Text style={[styles.small, { marginBottom: 3 }]}>{rfi.description}</Text>
                    <View style={[styles.row]}>
                      <Text style={[styles.tiny, { color: priorityColors[rfi.priority] || COLORS.light }]}>
                        Priority: {rfi.priority.toUpperCase()}
                      </Text>
                      {rfi.dueDate && <Text style={styles.tiny}>Due {format(new Date(rfi.dueDate), "MMM d")}</Text>}
                    </View>
                    {rfi.response && (
                      <View style={{ marginTop: 4, borderTopWidth: 0.5, borderTopColor: COLORS.border, paddingTop: 3 }}>
                        <Text style={[styles.small, { fontFamily: "Helvetica-Bold" }]}>Response</Text>
                        <Text style={styles.small}>{rfi.response}</Text>
                      </View>
                    )}
                  </View>
                );
              })
            )}
          </View>
        )}

        {/* Footer */}
        <View style={styles.footer} fixed>
          <Text>Generated by Site Snap</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
