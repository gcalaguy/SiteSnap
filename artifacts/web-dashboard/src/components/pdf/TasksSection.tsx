import { View, Text } from "@react-pdf/renderer";
import { styles, COLORS } from "./theme";
import { format } from "date-fns";

interface Task {
  id: number;
  title: string;
  description?: string | null;
  status: "todo" | "in_progress" | "done";
  priority: "low" | "medium" | "high";
  dueDate?: string | null;
  assignedToUserId?: number | null;
}

interface Member {
  id: number;
  firstName: string;
  lastName: string;
}

interface TasksSectionProps {
  tasks: Task[];
  members: Member[];
}

const statusColors: Record<string, { bg: string; text: string; label: string }> = {
  todo: { bg: "#f3f4f6", text: "#374151", label: "To Do" },
  in_progress: { bg: "#FEF3C7", text: "#92400e", label: "In Progress" },
  done: { bg: "#DCFCE7", text: "#166534", label: "Done" },
};

const priorityColors: Record<string, string> = {
  low: COLORS.lightText,
  medium: COLORS.amber,
  high: COLORS.red,
};

export default function TasksSection({ tasks, members }: TasksSectionProps) {
  if (!tasks || tasks.length === 0) {
    return (
      <View>
        <Text style={styles.sectionTitle}>Tasks</Text>
        <View style={styles.sectionDivider} />
        <Text style={styles.emptyState}>No tasks recorded for this project.</Text>
      </View>
    );
  }

  const byStatus = (status: Task["status"]) => tasks.filter((t) => t.status === status);

  return (
    <View>
      <Text style={styles.sectionTitle}>Tasks</Text>
      <View style={styles.sectionDivider} />
      {(["todo", "in_progress", "done"] as Task["status"][]).map((status) => {
        const list = byStatus(status);
        if (list.length === 0) return null;
        const cfg = statusColors[status];
        return (
          <View key={status} style={{ marginBottom: 10 }}>
            <View style={[styles.row, { marginBottom: 6 }]}>
              <Text style={[styles.cardTitle, { fontSize: 12 }]}>
                {cfg.label} ({list.length})
              </Text>
            </View>
            {list.map((task) => {
              const assignee = members.find((m) => m.id === task.assignedToUserId);
              return (
                <View key={task.id} style={[styles.card, { paddingVertical: 6 }]}>
                  <View style={[styles.row, { marginBottom: 2 }]}>
                    <Text style={{ fontSize: 10, fontFamily: "Helvetica-Bold", flex: 1 }}>
                      {task.title}
                    </Text>
                    <View
                      style={[
                        styles.badge,
                        { backgroundColor: cfg.bg },
                      ]}
                    >
                      <Text style={[styles.badge, { color: cfg.text, backgroundColor: "transparent" }]}>
                        {cfg.label}
                      </Text>
                    </View>
                  </View>
                  {task.description && (
                    <Text style={[styles.smallText, { marginBottom: 3 }]}>{task.description}</Text>
                  )}
                  <View style={[styles.row, { marginTop: 2 }]}>
                    <Text style={[styles.tinyText, { color: priorityColors[task.priority] }]}>
                      {task.priority.toUpperCase()}
                    </Text>
                    {task.dueDate && (
                      <Text style={styles.tinyText}>
                        Due {format(new Date(task.dueDate), "MMM d, yyyy")}
                      </Text>
                    )}
                    {assignee && (
                      <Text style={styles.tinyText}>
                        Assigned: {assignee.firstName} {assignee.lastName}
                      </Text>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        );
      })}
    </View>
  );
}
