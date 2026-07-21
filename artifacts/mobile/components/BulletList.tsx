import React from "react";
import { Text, View } from "react-native";
import { bulletizeText } from "@/utils/bulletize";

export function BulletList({
  text,
  textStyle,
  containerStyle,
}: {
  text: string | null | undefined;
  textStyle?: object;
  containerStyle?: object;
}) {
  const items = bulletizeText(text);
  if (items.length === 0) return null;

  if (items.length === 1) {
    return <Text style={textStyle}>{items[0]}</Text>;
  }

  return (
    <View style={[{ gap: 3 }, containerStyle]}>
      {items.map((item, i) => (
        <View key={i} style={{ flexDirection: "row", gap: 6 }}>
          <Text style={textStyle}>{"•"}</Text>
          <Text style={[textStyle, { flex: 1 }]}>{item}</Text>
        </View>
      ))}
    </View>
  );
}
