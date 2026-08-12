import { BlurView } from "expo-blur";
import { isLiquidGlassAvailable } from "expo-glass-effect";
import { Tabs } from "expo-router";
import { Icon, Label, NativeTabs } from "expo-router/unstable-native-tabs";
import { SymbolView } from "expo-symbols";
import { Feather } from "@expo/vector-icons";
import React from "react";
import { Platform, StyleSheet, View } from "react-native";

import { useColors } from "@/hooks/useColors";
import { useThemePreference } from "@/context/ThemeContext";
import { fontFamily } from "@/constants/theme";

function NativeTabLayout() {
  return (
    <View style={{ flex: 1 }}>
      <NativeTabs>
        <NativeTabs.Trigger name="(home)">
          <Icon sf={{ default: "house", selected: "house.fill" }} />
          <Label>Home</Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="projects">
          <Icon sf={{ default: "folder", selected: "folder.fill" }} />
          <Label>Projects</Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="tools">
          <Icon sf={{ default: "wrench.and.screwdriver", selected: "wrench.and.screwdriver.fill" }} />
          <Label>Browse Tools</Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="profile">
          <Icon sf={{ default: "person", selected: "person.fill" }} />
          <Label>Profile</Label>
        </NativeTabs.Trigger>

        {/* risk/inspect/safety/tradehub/admin-hub are NOT registered here.
            NativeTabs excludes any Trigger marked `hidden` from its rendered
            screen set entirely (see native-tabs/NativeBottomTabs/utils.js
            shouldTabBeVisible), not just from the tab bar strip — so a
            "hidden" Trigger can never be navigated to on Liquid-Glass
            devices, it just silently no-ops. Those screens now live as
            plain Stack.Screen routes at the app root (app/_layout.tsx)
            instead, which has no such limitation. */}
      </NativeTabs>
    </View>
  );
}

function ClassicTabLayout() {
  const colors = useColors();
  const { scheme } = useThemePreference();
  const isDark = scheme === "dark";
  const isIOS = Platform.OS === "ios";
  const isWeb = Platform.OS === "web";

  return (
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        headerShown: false,
        tabBarHideOnKeyboard: true,
        tabBarLabelStyle: { fontFamily: fontFamily.semibold, fontSize: 11, letterSpacing: 0.3 },
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
      <Tabs.Screen
        name="(home)"
        options={{
          title: "Home",
          tabBarIcon: ({ color }) =>
            isIOS ? <SymbolView name="house" tintColor={color} size={24} /> : <Feather name="home" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="projects"
        options={{
          title: "Projects",
          tabBarIcon: ({ color }) =>
            isIOS ? <SymbolView name="folder" tintColor={color} size={24} /> : <Feather name="folder" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="tools"
        options={{
          title: "Browse Tools",
          tabBarIcon: ({ color }) =>
            isIOS ? <SymbolView name="wrench.and.screwdriver" tintColor={color} size={24} /> : <Feather name="tool" size={22} color={color} />,
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

export default function TabLayout() {
  if (isLiquidGlassAvailable()) {
    return <NativeTabLayout />;
  }
  return <ClassicTabLayout />;
}
