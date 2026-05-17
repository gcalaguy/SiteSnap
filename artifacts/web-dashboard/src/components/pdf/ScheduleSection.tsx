import { View, Text } from "@react-pdf/renderer";
import { styles } from "./theme";
import { format } from "date-fns";

interface Assignment {
  id: number;
  userFirstName?: string | null;
  userLastName?: string | null;
  userRole?: string | null;
  startDate: string;
  endDate: string;
  notes?: string | null;
}

interface ScheduleSectionProps {
  assignments: Assignment[];
}

export default function ScheduleSection({ assignments }: ScheduleSectionProps) {
  if (!assignments || assignments.length === 0) {
    return (
      <View>
        <Text style={styles.sectionTitle}>Worker Schedule</Text>
        <View style={styles.sectionDivider} />
        <Text style={styles.emptyState}>No workers scheduled on this project.</Text>
      </View>
    );
  }

  return (
    <View>
      <Text style={styles.sectionTitle}>Worker Schedule</Text>
      <View style={styles.sectionDivider} />
      {assignments.map((a) => (
        <View key={a.id} style={styles.card}>
          <Text style={styles.cardTitle}>
            {a.userFirstName} {a.userLastName}
            {a.userRole && (
              <Text style={styles.cardSubtitle}> ({a.userRole})</Text>
            )}
          </Text>
          <Text style={styles.smallText}>
            {format(new Date(a.startDate), "MMM d, yyyy")} – {format(new Date(a.endDate), "MMM d, yyyy")}
          </Text>
          {a.notes && <Text style={[styles.smallText, { marginTop: 2, fontStyle: "italic" }]}>{a.notes}</Text>}
        </View>
      ))}
    </View>
  );
}
