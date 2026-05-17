import { View, Text } from "@react-pdf/renderer";
import { styles, COLORS } from "./theme";
import { format } from "date-fns";

interface CostAnalysis {
  id: number;
  periodLabel: string;
  labourCost: number;
  materialsCost: number;
  equipmentCost: number;
  otherCost: number;
  totalCost: number;
  notes?: string | null;
  aiAnalysis?: string | null;
  createdAt: string;
}

interface CostSummarySectionProps {
  costAnalyses: CostAnalysis[];
}

export default function CostSummarySection({ costAnalyses }: CostSummarySectionProps) {
  if (!costAnalyses || costAnalyses.length === 0) {
    return (
      <View>
        <Text style={styles.sectionTitle}>Cost Analysis</Text>
        <View style={styles.sectionDivider} />
        <Text style={styles.emptyState}>No cost records for this project.</Text>
      </View>
    );
  }

  const totalLabour = costAnalyses.reduce((s, c) => s + Number(c.labourCost), 0);
  const totalMaterials = costAnalyses.reduce((s, c) => s + Number(c.materialsCost), 0);
  const totalEquipment = costAnalyses.reduce((s, c) => s + Number(c.equipmentCost), 0);
  const totalOther = costAnalyses.reduce((s, c) => s + Number(c.otherCost), 0);
  const grandTotal = costAnalyses.reduce((s, c) => s + Number(c.totalCost), 0);

  return (
    <View>
      <Text style={styles.sectionTitle}>Cost Analysis</Text>
      <View style={styles.sectionDivider} />

      <View style={[styles.card, { marginBottom: 12, backgroundColor: COLORS.lightBg }]}>
        <Text style={[styles.cardTitle, { fontSize: 12 }]}>Total Spend Summary</Text>
        <View style={[styles.grid2, { marginTop: 6 }]}>
          <View style={styles.gridItem}>
            <Text style={styles.label}>Labour</Text>
            <Text style={styles.value}>${totalLabour.toLocaleString()}</Text>
          </View>
          <View style={styles.gridItem}>
            <Text style={styles.label}>Materials</Text>
            <Text style={styles.value}>${totalMaterials.toLocaleString()}</Text>
          </View>
          <View style={styles.gridItem}>
            <Text style={styles.label}>Equipment</Text>
            <Text style={styles.value}>${totalEquipment.toLocaleString()}</Text>
          </View>
          <View style={styles.gridItem}>
            <Text style={styles.label}>Other</Text>
            <Text style={styles.value}>${totalOther.toLocaleString()}</Text>
          </View>
        </View>
        <View style={{ marginTop: 8, borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: 6 }}>
          <Text style={[styles.value, { fontSize: 14 }]}>Grand Total: ${grandTotal.toLocaleString()}</Text>
        </View>
      </View>

      {costAnalyses.map((cost) => (
        <View key={cost.id} style={styles.card}>
          <View style={[styles.row, { marginBottom: 4 }]}>
            <Text style={styles.cardTitle}>{cost.periodLabel}</Text>
            <Text style={[styles.value, { color: COLORS.red }]}>
              ${Number(cost.totalCost).toLocaleString()}
            </Text>
          </View>
          <View style={[styles.grid2, { marginBottom: 4 }]}>
            <View style={styles.gridItem}>
              <Text style={styles.label}>Labour</Text>
              <Text style={styles.smallText}>${Number(cost.labourCost).toLocaleString()}</Text>
            </View>
            <View style={styles.gridItem}>
              <Text style={styles.label}>Materials</Text>
              <Text style={styles.smallText}>${Number(cost.materialsCost).toLocaleString()}</Text>
            </View>
            <View style={styles.gridItem}>
              <Text style={styles.label}>Equipment</Text>
              <Text style={styles.smallText}>${Number(cost.equipmentCost).toLocaleString()}</Text>
            </View>
            <View style={styles.gridItem}>
              <Text style={styles.label}>Other</Text>
              <Text style={styles.smallText}>${Number(cost.otherCost).toLocaleString()}</Text>
            </View>
          </View>
          {cost.notes && <Text style={[styles.smallText, { marginTop: 2 }]}>{cost.notes}</Text>}
          {cost.aiAnalysis && (
            <View style={{ marginTop: 4, backgroundColor: "#f0f9ff", padding: 6, borderRadius: 3 }}>
              <Text style={[styles.smallText, { color: COLORS.blue, fontFamily: "Helvetica-Bold" }]}>
                AI Insight
              </Text>
              <Text style={[styles.smallText, { color: COLORS.blue }]}>{cost.aiAnalysis}</Text>
            </View>
          )}
        </View>
      ))}
    </View>
  );
}
