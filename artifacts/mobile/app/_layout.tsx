import React, { useEffect, useRef, useState } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { ClerkProvider, useAuth, useUser } from "@clerk/clerk-expo";
import { useGetMe, useSyncUser, getGetMeQueryKey } from "@workspace/api-client-react";
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from "@expo-google-fonts/inter";
import * as SplashScreen from "expo-splash-screen";
import { TermsModal } from "@/components/TermsModal";
import * as SecureStore from "expo-secure-store";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { hydrateQueryCache, startCachePersistence } from "@/utils/queryPersister";

const tokenCache = {
  async getToken(key: string) {
    return SecureStore.getItemAsync(key);
  },
  async saveToken(key: string, value: string) {
    return SecureStore.setItemAsync(key, value);
  },
};

try { SplashScreen.preventAutoHideAsync(); } catch {}

function RootLayoutNav() {
  const { isLoaded, isSignedIn } = useAuth();
  const { user: clerkUser } = useUser();
  const queryClient = useQueryClient();
  const syncUser = useSyncUser();
  const syncedRef = useRef(false);
  const [synced, setSynced] = useState(false);

  // Always fetch once Clerk is loaded and user is signed in so the query
  // observer is active and invalidateQueries/refetchQueries can actually fire.
  const { data: me, isLoading: meLoading, isFetching: meFetching } = useGetMe({
    query: { enabled: isLoaded && !!isSignedIn },
  });

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
      try { SplashScreen.hideAsync(); } catch {}
    }
  }, [fontsLoaded, fontError]);

  // Auto-sync DB user when Clerk session is available
  useEffect(() => {
    if (!isLoaded || !isSignedIn || !clerkUser || syncedRef.current) return;
    syncedRef.current = true;
    syncUser.mutate(
      {
        data: {
          clerkUserId: clerkUser.id,
          email: clerkUser.primaryEmailAddress?.emailAddress ?? "",
          firstName: clerkUser.firstName ?? "",
          lastName: clerkUser.lastName ?? "",
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
          setSynced(true);
        },
        onError: () => {
          setSynced(true);
        },
      },
    );
  }, [isLoaded, isSignedIn, clerkUser]);

  // Reset sync state when user signs out
  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      syncedRef.current = false;
      setSynced(false);
    }
  }, [isLoaded, isSignedIn]);

  useEffect(() => {
    if (!isLoaded) return;
    const inSignIn = segments[0] === "sign-in";
    const inOnboarding = segments[0] === "onboarding";

    if (!isSignedIn) {
      if (!inSignIn) router.replace("/sign-in");
      return;
    }

    // Wait for sync + me query to fully settle before routing.
    // meFetching covers the background refetch window after invalidateQueries.
    const syncPending = isSignedIn && !synced;
    if (syncPending || meLoading || meFetching) return;

    if (!me?.companyId) {
      if (!inOnboarding) router.replace("/onboarding");
    } else if (inSignIn || inOnboarding) {
      router.replace("/");
    }
  }, [isSignedIn, isLoaded, segments, me, meLoading, meFetching, synced, router]);

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

export default function RootLayout() {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
  }));

  useEffect(() => {
    let stop: (() => void) | undefined;
    hydrateQueryCache(queryClient).finally(() => {
      stop = startCachePersistence(queryClient);
    });
    return () => { stop?.(); };
  }, [queryClient]);

  return (
    <ClerkProvider
      publishableKey={process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY!}
      tokenCache={tokenCache as any}
    >
      <QueryClientProvider client={queryClient}>
        <RootLayoutNav />
      </QueryClientProvider>
    </ClerkProvider>
  );
}
