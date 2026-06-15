import { View, Text } from "@react-pdf/renderer";
import { styles } from "./theme";
import { format } from "date-fns";

interface ChangeOrder {
  id: number;
  title: string;
  description?: string | null;
  status: string;
  amount?: string | number | null;
  notes?: string | null;
  approvedAt?: string | null;
  createdAt: string;
}

interface ChangeOrdersSectionProps {
  changeOrders: ChangeOrder[];
}

const statusConfig: Record<string, { bg: string; text: string }> = {
  pending: { bg: "#FEF3C7", text: "#92400e" },
  approved: { bg: "#DCFCE7", text: "#166534" },
  rejected: { bg: "#FEE2E2", text: "#991b1b" },
};

export default function ChangeOrdersSection({ changeOrders }: ChangeOrdersSectionProps) {
  if (!changeOrders || changeOrders.length === 0) {
    return (
      <View>
        <Text style={styles.sectionTitle}>Change Orders</Text>
        <View style={styles.sectionDivider} />
        <Text style={styles.emptyState}>No change orders for this project.</Text>
      </View>
    );
  }

  return (
    <View>
      <Text style={styles.sectionTitle}>Change Orders</Text>
      <View style={styles.sectionDivider} />
      {changeOrders.map((co) => {
        const sc = statusConfig[co.status] || statusConfig.pending;
        const amount = co.amount != null ? (typeof co.amount === "string" ? parseFloat(co.amount) : Number(co.amount)) : null;
        return (
          <View key={co.id} style={styles.card}>
            <View style={[styles.row, { marginBottom: 4 }]}>
              <Text style={{ fontSize: 10, fontFamily: "Helvetica-Bold", flex: 1 }}>{co.title}</Text>
              <View style={[styles.badge, { backgroundColor: sc.bg }]}>
                <Text style={[styles.badge, { color: sc.text, backgroundColor: "transparent" }]}>
                  {co.status.toUpperCase()}
                </Text>
              </View>
            </View>
            {co.description && <Text style={[styles.smallText, { marginBottom: 4 }]}>{co.description}</Text>}
            <View style={[styles.row, { marginTop: 2 }]}>
              {amount != null && (
                <Text style={styles.value}>${amount.toLocaleString()}</Text>
              )}
              <Text style={styles.tinyText}>{format(new Date(co.createdAt), "MMM d, yyyy")}</Text>
            </View>
            {co.notes && <Text style={[styles.smallText, { marginTop: 2, fontStyle: "italic" }]}>{co.notes}</Text>}
            {co.approvedAt && (
              <Text style={[styles.tinyText, { marginTop: 2 }]}>
                Approved: {format(new Date(co.approvedAt), "MMM d, yyyy")}
              </Text>
            )}
          </View>
        );
      })}
    </View>
  );
}
