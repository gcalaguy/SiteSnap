import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";

/**
 * Generic field/operator/value condition-row builder — extracted from
 * email-filing-rules.tsx's RuleEditorModal (Phase 2) so the Advanced Search
 * Builder (Phase 4, communications-search.tsx) doesn't fork the same
 * interaction pattern. Field/operator option lists and the row shape are
 * fully parameterized by the caller; this component only owns the chip/card
 * layout and add/remove interactions.
 */

export interface ConditionRow<F extends string, O extends string> {
  field: F;
  operator: O;
  value: string;
}

export function ChipRow<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const colors = useColors();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View style={{ flexDirection: "row", gap: 6 }}>
        {options.map((opt) => (
          <Pressable
            key={opt.value}
            onPress={() => onChange(opt.value)}
            style={[
              s.chip,
              { backgroundColor: value === opt.value ? colors.primary : colors.muted, borderColor: colors.border },
            ]}
          >
            <Text style={[s.chipText, { color: value === opt.value ? "#FFFFFF" : colors.foreground }]}>
              {opt.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

export function ConditionBuilder<F extends string, O extends string>({
  conditions,
  onChange,
  fieldOptions,
  operatorOptions,
  logic,
  onLogicChange,
  minConditions = 1,
}: {
  conditions: ConditionRow<F, O>[];
  onChange: (conditions: ConditionRow<F, O>[]) => void;
  fieldOptions: { value: F; label: string }[];
  operatorOptions: { value: O; label: string }[];
  logic: "AND" | "OR";
  onLogicChange: (logic: "AND" | "OR") => void;
  minConditions?: number;
}) {
  const colors = useColors();

  function updateCondition(index: number, patch: Partial<ConditionRow<F, O>>) {
    onChange(conditions.map((c, i) => (i === index ? { ...c, ...patch } : c)));
  }

  function removeCondition(index: number) {
    onChange(conditions.filter((_, i) => i !== index));
  }

  function addCondition() {
    onChange([...conditions, { field: fieldOptions[0].value, operator: operatorOptions[0].value, value: "" }]);
  }

  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text style={[s.subLabel, { color: colors.mutedForeground }]}>Conditions</Text>
        <ChipRow
          options={[
            { value: "AND" as const, label: "Match ALL (AND)" },
            { value: "OR" as const, label: "Match ANY (OR)" },
          ]}
          value={logic}
          onChange={onLogicChange}
        />
      </View>
      {conditions.map((cond, i) => (
        <View key={i} style={[s.conditionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={[s.subLabel, { color: colors.mutedForeground }]}>IF</Text>
            {conditions.length > minConditions && (
              <Pressable onPress={() => removeCondition(i)} hitSlop={8}>
                <Feather name="x" size={16} color={colors.mutedForeground} />
              </Pressable>
            )}
          </View>
          <ChipRow options={fieldOptions} value={cond.field} onChange={(v) => updateCondition(i, { field: v })} />
          <ChipRow options={operatorOptions} value={cond.operator} onChange={(v) => updateCondition(i, { operator: v })} />
          <TextInput
            style={[s.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
            value={cond.value}
            onChangeText={(v) => updateCondition(i, { value: v })}
            placeholder="Value to match"
            placeholderTextColor={colors.mutedForeground}
            autoCapitalize="none"
          />
        </View>
      ))}
      <Pressable onPress={addCondition} style={s.addRow}>
        <Feather name="plus" size={14} color={colors.primary} />
        <Text style={[s.addRowText, { color: colors.primary }]}>Add condition</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  chip: { borderRadius: 16, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 7 },
  chipText: { fontSize: 12, fontFamily: "NunitoSans_600SemiBold" },
  subLabel: { fontSize: 11, fontFamily: "NunitoSans_600SemiBold", textTransform: "uppercase", letterSpacing: 0.6 },
  conditionCard: { borderWidth: 1, borderRadius: 14, padding: 10, gap: 8 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, fontFamily: "NunitoSans_400Regular" },
  addRow: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start" },
  addRowText: { fontSize: 13, fontFamily: "NunitoSans_600SemiBold" },
});
