import { View, Text } from "@react-pdf/renderer";
import { styles, COLORS, FONTS } from "./theme";
import { format } from "date-fns";

interface ProjectInfoSectionProps {
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
}

export default function ProjectInfoSection({ project, summary }: ProjectInfoSectionProps) {
  const budgetVal = summary?.totalBudget ?? project.budget;
  const budgetNum = typeof budgetVal === "string" ? parseFloat(budgetVal) : budgetVal;

  return (
    <View>
      <Text style={styles.sectionTitle}>Project Overview</Text>
      <View style={styles.sectionDivider} />

      <View style={[styles.row, { marginBottom: 8 }]}>
        <Text style={{ fontFamily: FONTS.bold, fontSize: 16 }}>{project.name}</Text>
        <View style={[styles.badge, { backgroundColor: COLORS.gold + "20", color: COLORS.gold }]}>
          <Text style={{ fontSize: 8, fontFamily: FONTS.bold, color: COLORS.gold }}>
            {project.status.replace("_", " ").toUpperCase()}
          </Text>
        </View>
      </View>

      <Text style={styles.smallText}>{project.address}, {project.city}, {project.province}</Text>

      <View style={[styles.grid2, { marginTop: 10, marginBottom: 8 }]}>
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
            <Text style={styles.label}>Budget Utilized</Text>
            <Text style={styles.value}>{summary.budgetUtilizationPercent.toFixed(1)}%</Text>
          </View>
        )}
      </View>

      {project.description && (
        <View style={{ marginTop: 6 }}>
          <Text style={styles.label}>Description</Text>
          <Text style={[styles.text, { marginTop: 2 }]}>{project.description}</Text>
        </View>
      )}

      {(summary?.taskTotal != null || summary?.openRFICount != null) && (
        <View style={[styles.grid2, { marginTop: 10 }]}>
          {summary?.taskTotal != null && (
            <View style={styles.gridItem}>
              <Text style={styles.label}>Tasks</Text>
              <Text style={styles.value}>
                {summary.taskTotal} total ({summary.taskDoneCount ?? 0} done, {summary.taskInProgressCount ?? 0} in progress, {summary.taskTodoCount ?? 0} to do)
              </Text>
            </View>
          )}
          {summary?.openRFICount != null && (
            <View style={styles.gridItem}>
              <Text style={styles.label}>RFIs</Text>
              <Text style={styles.value}>
                {summary.openRFICount} open / {summary.closedRFICount ?? 0} closed
              </Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}
