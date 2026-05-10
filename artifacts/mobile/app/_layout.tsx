import React, { useEffect } from "react";
import { View } from "react-native";
import { Stack, useRouter, useSegments } from "expo-router";
import { useAuth } from "@clerk/clerk-expo";
import { useGetMe } from "@workspace/api-client-react";
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from "@expo-google-fonts/inter";
import * as SplashScreen from "expo-splash-screen";
import TermsModal from "@/components/TermsModal";

export default function RootLayoutNav() {
  const { isLoaded, isSignedIn } = useAuth();
  const { data: me, isLoading: meLoading } = useGetMe();
  const router = useRouter();
  const segments = useSegments();
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  useEffect(() => {
    if (!isLoaded || meLoading || isSignedIn === undefined) return;
    const inSignIn = segments[0] === "sign-in";
    const inOnboarding = segments[0] === "onboarding";
    if (!isSignedIn) {
      if (!inSignIn) router.replace("/sign-in");
    } else if (!me?.companyId) {
      if (!inOnboarding) router.replace("/onboarding");
    } else if (inSignIn || inOnboarding) {
      router.replace("/(tabs)");
    }
  }, [isSignedIn, isLoaded, segments, me, meLoading, router]);

  const needsTerms = !!me && !me.termsAcceptedAt;

  return (
    <>
      <TermsModal visible={needsTerms} />
      <Stack screenOptions={{ headerBackTitle: "Back" }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="sign-in" options={{ headerShown: false }} />
        <Stack.Screen name="onboarding" options={{ headerShown: false }} />
        <Stack.Screen name="project/[id]" options={{ headerShown: true, title: "", headerStyle: { backgroundColor: "#0A0A0A" }, headerTintColor: "#FFFFFF" }} />
        <Stack.Screen name="notifications" options={{ headerShown: false }} />
        <Stack.Screen name="rfi/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="sync-queue" options={{ headerShown: false, presentation: "modal" }} />
        <Stack.Screen name="schedule" options={{ headerShown: true, title: "Assigned Schedule", headerStyle: { backgroundColor: "#0A0A0A" }, headerTintColor: "#FFFFFF" }} />
      </Stack>
    </>
  );
}
