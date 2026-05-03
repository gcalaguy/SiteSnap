import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { ClerkProvider, useAuth, useUser } from "@clerk/clerk-expo";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import * as Notifications from "expo-notifications";
import React, { useEffect } from "react";
import { Platform } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import {
  setBaseUrl,
  setAuthTokenGetter,
  customFetch,
  useGetMe,
  useSyncUser,
} from "@workspace/api-client-react";
import { TermsModal } from "@/components/TermsModal";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { tokenCache } from "@/utils/cache";
import { setSignOut } from "@/utils/auth";
import { OfflineQueueProvider } from "@/context/OfflineQueueContext";

// Set the API base URL at module level (outside any component)
if (process.env.EXPO_PUBLIC_DOMAIN) {
  setBaseUrl(`https://${process.env.EXPO_PUBLIC_DOMAIN}`);
}

// Configure how notifications are handled when the app is in the foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
  },
});

async function registerForPushNotificationsAsync(): Promise<string | null> {
  if (Platform.OS === "web") return null;

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "Site Snap",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#FF6600",
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== "granted") return null;

  try {
    const tokenData = await Notifications.getExpoPushTokenAsync();
    return tokenData.data;
  } catch {
    return null;
  }
}

function AuthSetup() {
  const { getToken, signOut: clerkSignOut, isSignedIn } = useAuth();

  useEffect(() => {
    setAuthTokenGetter(async () => {
      try {
        return await getToken();
      } catch {
        return null;
      }
    });
  }, [getToken]);

  useEffect(() => {
    setSignOut(async () => {
      await clerkSignOut();
    });
  }, [clerkSignOut]);

  // Register for push notifications once the user is signed in
  useEffect(() => {
    if (!isSignedIn) return;

    registerForPushNotificationsAsync()
      .then((token) => {
        if (!token) return;
        customFetch("/api/users/push-token", {
          method: "POST",
          body: JSON.stringify({ token }),
        }).catch(() => {});
      })
      .catch(() => {});
  }, [isSignedIn]);

  return null;
}

function ProtectedNav() {
  const { isSignedIn, isLoaded, user: clerkUser } = useUser();
  const router = useRouter();
  const segments = useSegments();

  const syncUser = useSyncUser();

  // Sync Clerk user into local DB on sign-in so API can resolve companyId
  useEffect(() => {
    if (!isSignedIn || !clerkUser) return;
    syncUser.mutate({
      data: {
        clerkUserId: clerkUser.id,
        email: clerkUser.primaryEmailAddress?.emailAddress ?? "",
        firstName: clerkUser.firstName ?? "",
        lastName: clerkUser.lastName ?? "",
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSignedIn, clerkUser?.id]);

  // Check whether the signed-in user belongs to a company
  const { data: me, isLoading: meLoading } = useGetMe({
    query: { enabled: !!isSignedIn, retry: 4, retryDelay: 1000 },
  });

  useEffect(() => {
    if (!isLoaded) return;
    const inSignIn = segments[0] === "sign-in";
    const inOnboarding = segments[0] === "onboarding";

    if (!isSignedIn) {
      if (!inSignIn) router.replace("/sign-in");
      return;
    }

    // Wait until we know the user's company status before routing
    if (meLoading || !me) return;

    if (!me.companyId) {
      // Signed in but not yet part of a company → onboarding
      if (!inOnboarding) router.replace("/onboarding");
    } else {
      // Has a company → main app
      if (inSignIn || inOnboarding) router.replace("/(tabs)");
    }
  }, [isSignedIn, isLoaded, segments, me, meLoading]);

  const needsTerms = !!me && !me.termsAcceptedAt;

  return (
    <>
      <TermsModal visible={needsTerms} />
      <Stack screenOptions={{ headerBackTitle: "Back" }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="sign-in" options={{ headerShown: false }} />
      <Stack.Screen name="onboarding" options={{ headerShown: false }} />
      <Stack.Screen
        name="project/[id]"
        options={{
          headerShown: true,
          title: "",
          headerStyle: { backgroundColor: "#172034" },
          headerTintColor: "#FFFFFF",
        }}
      />
      <Stack.Screen
        name="notifications"
        options={{
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="rfi/[id]"
        options={{
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="sync-queue"
        options={{
          headerShown: false,
          presentation: "modal",
        }}
      />
    </Stack>
    </>
  );
}

export default function RootLayout() {
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

  if (!fontsLoaded && !fontError) return null;

  return (
    <ClerkProvider
      publishableKey={process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY!}
      tokenCache={tokenCache}
    >
      <SafeAreaProvider>
        <ErrorBoundary>
          <QueryClientProvider client={queryClient}>
            <GestureHandlerRootView style={{ flex: 1 }}>
              <KeyboardProvider>
                <OfflineQueueProvider>
                  <AuthSetup />
                  <ProtectedNav />
                </OfflineQueueProvider>
              </KeyboardProvider>
            </GestureHandlerRootView>
          </QueryClientProvider>
        </ErrorBoundary>
      </SafeAreaProvider>
    </ClerkProvider>
  );
}
