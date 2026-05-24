import { BlurView } from "expo-blur";
import { isLiquidGlassAvailable } from "expo-glass-effect";
import { Tabs } from "expo-router";
import { Icon, Label, NativeTabs } from "expo-router/unstable-native-tabs";
import { SymbolView } from "expo-symbols";
import { Feather } from "@expo/vector-icons";
import React from "react";
import { Platform, StyleSheet, Text, View, useColorScheme } from "react-native";

import { useColors } from "@/hooks/useColors";
import { useOfflineQueue } from "@/context/OfflineQueueContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useGetMe } from "@workspace/api-client-react";

function NativeTabLayout() {
  const perms = usePermissions();
  const { data: me } = useGetMe();
  const isOwner = me?.role === "owner";
  return (
    <View style={{ flex: 1 }}>
      <NativeTabs>
        <NativeTabs.Trigger name="(home)">
          <Icon sf={{ default: "house", selected: "house.fill" }} />
          <Label>Home</Label>
        </NativeTabs.Trigger>
        {perms.viewRiskTab && (
          <NativeTabs.Trigger name="risk">
            <Icon sf={{ default: "exclamationmark.triangle", selected: "exclamationmark.triangle.fill" }} />
            <Label>Risk</Label>
          </NativeTabs.Trigger>
        )}
        {perms.viewInspectTab && (
          <NativeTabs.Trigger name="inspect">
            <Icon sf={{ default: "checkmark.shield", selected: "checkmark.shield.fill" }} />
            <Label>Inspections</Label>
          </NativeTabs.Trigger>
        )}
        {perms.viewSafetyTab && (
          <NativeTabs.Trigger name="safety">
            <Icon sf={{ default: "cross.case", selected: "cross.case.fill" }} />
            <Label>Safety</Label>
          </NativeTabs.Trigger>
        )}
        <NativeTabs.Trigger name="tradehub">
          <Icon sf={{ default: "globe", selected: "globe.fill" }} />
          <Label>TradeHub</Label>
        </NativeTabs.Trigger>
        {isOwner && (
          <NativeTabs.Trigger name="admin-hub">
            <Icon sf={{ default: "gearshape.2", selected: "gearshape.2.fill" }} />
            <Label>Admin Hub</Label>
          </NativeTabs.Trigger>
        )}
        <NativeTabs.Trigger name="profile">
          <Icon sf={{ default: "person", selected: "person.fill" }} />
          <Label>Profile</Label>
        </NativeTabs.Trigger>
      </NativeTabs>
    </View>
  );
}

function PendingBadge({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <View style={styles.badge}>
      <Text style={styles.badgeText}>{count > 9 ? "9+" : count}</Text>
    </View>
  );
}

function ClassicTabLayout() {
  const colors = useColors();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const isIOS = Platform.OS === "ios";
  const isWeb = Platform.OS === "web";
  const { pendingCount } = useOfflineQueue();
  const perms = usePermissions();
  const { data: me } = useGetMe();
  const isOwner = me?.role === "owner";

  return (
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        headerShown: false,
        tabBarHideOnKeyboard: true,
        tabBarStyle: {
          position: "absolute",
          backgroundColor: isIOS ? "transparent" : colors.background,
          borderTopWidth: isWeb ? 1 : 0,
          borderTopColor: colors.border,
          elevation: 0,
          ...(isWeb ? { height: 84 } : {}),
        },
        tabBarBackground: () =>
          isIOS ? (
            <BlurView
              intensity={100}
              tint={isDark ? "dark" : "light"}
              style={StyleSheet.absoluteFill}
            />
          ) : isWeb ? (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.background }]} />
          ) : null,
      }}
    >
      {/* ── Visible tabs ── */}
      <Tabs.Screen
        name="(home)"
        options={{
          title: "Home",
          tabBarIcon: ({ color }) =>
            isIOS ? <SymbolView name="house" tintColor={color} size={24} /> : <Feather name="home" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="risk"
        options={{
          href: perms.viewRiskTab ? undefined : null,
          tabBarItemStyle: perms.viewRiskTab ? {} : { display: "none" },
          title: "Risk",
          tabBarIcon: ({ color }) =>
            isIOS ? <SymbolView name="exclamationmark.triangle" tintColor={color} size={24} /> : <Feather name="alert-triangle" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="inspect"
        options={{
          href: perms.viewInspectTab ? undefined : null,
          tabBarItemStyle: perms.viewInspectTab ? {} : { display: "none" },
          title: "Inspections",
          tabBarIcon: ({ color, focused }) => (
            <View style={{ position: "relative" }}>
              {isIOS ? <SymbolView name="checkmark.shield" tintColor={color} size={24} /> : <Feather name="shield" size={22} color={color} />}
              <PendingBadge count={pendingCount} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="safety"
        options={{
          href: perms.viewSafetyTab ? undefined : null,
          tabBarItemStyle: perms.viewSafetyTab ? {} : { display: "none" },
          title: "Safety",
          tabBarIcon: ({ color }) =>
            isIOS ? <SymbolView name="cross.case" tintColor={color} size={24} /> : <Feather name="alert-circle" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="tradehub"
        options={{
          title: "TradeHub",
          tabBarIcon: ({ color }) =>
            isIOS ? <SymbolView name="globe" tintColor={color} size={24} /> : <Feather name="globe" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="admin-hub"
        options={{
          href: isOwner ? undefined : null,
          tabBarItemStyle: isOwner ? {} : { display: "none" },
          title: "Admin Hub",
          tabBarIcon: ({ color }) =>
            isIOS ? <SymbolView name="gearshape.2" tintColor={color} size={24} /> : <Feather name="grid" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color }) =>
            isIOS ? <SymbolView name="person" tintColor={color} size={24} /> : <Feather name="user" size={22} color={color} />,
        }}
      />

    </Tabs>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    position: "absolute",
    top: -4,
    right: -8,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#EF4444",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  badgeText: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    color: "#FFFFFF",
    lineHeight: 13,
  },
});

export default function TabLayout() {
  if (isLiquidGlassAvailable()) {
    return <NativeTabLayout />;
  }
  return <ClassicTabLayout />;
}
