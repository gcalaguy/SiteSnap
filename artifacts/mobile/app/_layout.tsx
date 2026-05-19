import React, { useEffect, useRef, useState } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { View } from "react-native";
import { ClerkProvider, useAuth, useUser } from "@clerk/clerk-expo";
import { useGetMe, useSyncUser, getGetMeQueryKey, setAuthTokenGetter, setBaseUrl, setTenantIdGetter } from "@workspace/api-client-react";
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from "@expo-google-fonts/inter";
import * as SplashScreen from "expo-splash-screen";
import { TermsModal } from "@/components/TermsModal";
import { GlobalVoiceCommandFAB } from "@/components/GlobalVoiceCommandFAB";
import * as SecureStore from "expo-secure-store";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { hydrateQueryCache, startCachePersistence } from "@/utils/queryPersister";
import { setTokenGetter, setSignOut } from "@/utils/auth";

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
  const { isLoaded, isSignedIn, getToken, signOut: clerkSignOut } = useAuth();
  const { user: clerkUser } = useUser();
  const queryClient = useQueryClient();

  // Keep a stable ref to the latest getToken so we can register the setter
  // once (no cleanup/re-register cycle) while always calling the freshest token.
  const getTokenRef = useRef(getToken);
  useEffect(() => { getTokenRef.current = getToken; }, [getToken]);

  // Keep a stable ref to queryClient / signOut too, so sign-out effect deps
  // don't cause unnecessary re-runs.
  const queryClientRef = useRef(queryClient);
  useEffect(() => { queryClientRef.current = queryClient; }, [queryClient]);
  const clerkSignOutRef = useRef(clerkSignOut);
  useEffect(() => { clerkSignOutRef.current = clerkSignOut; }, [clerkSignOut]);

  // Configure base URL once on mount — it never changes between renders.
  useEffect(() => {
    const domain = process.env.EXPO_PUBLIC_DOMAIN;
    if (domain) setBaseUrl(`https://${domain}`);
    return () => setBaseUrl(null);
  }, []);

  // Register auth getter once — uses ref to always call the latest getToken.
  // Mirroring the web dashboard's ClerkAuthTokenSetter pattern (useLayoutEffect +
  // stable ref) prevents the brief null-auth window that occurs when
  // getToken changes reference and the old effect cleanup fires.
  useEffect(() => {
    const getter = async () => {
      try { return await getTokenRef.current(); } catch { return null; }
    };
    setAuthTokenGetter(getter);
    setTokenGetter(getter);
    return () => {
      setAuthTokenGetter(null);
      setTokenGetter(async () => null);
    };
  }, []); // empty deps — stable via ref

  // Wire sign-out separately so its deps don't affect the auth getter.
  useEffect(() => {
    setSignOut(async () => {
      queryClientRef.current.clear();
      await clerkSignOutRef.current();
    });
    return () => setSignOut(async () => {});
  }, []);

  const syncUser = useSyncUser();
  const syncedRef = useRef(false);
  const [synced, setSynced] = useState(false);

  // Always fetch once Clerk is loaded and user is signed in so the query
  // observer is active and invalidateQueries/refetchQueries can actually fire.
  const { data: me, isLoading: meLoading, isFetching: meFetching } = useGetMe({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    query: { enabled: isLoaded && !!isSignedIn } as any,
  });

  // Phase 3: Set tenant id getter for x-tenant-id header on API requests
  useEffect(() => {
    const activeCompanyId = me?.activeCompanyId;
    if (activeCompanyId != null) {
      setTenantIdGetter(() => activeCompanyId);
    } else {
      setTenantIdGetter(null);
    }
    return () => setTenantIdGetter(null);
  }, [me?.activeCompanyId]);

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
        onSuccess: async () => {
          // Await the refetch so setSynced(true) only fires once we have
          // confirmed fresh data — eliminating the stale-cache routing race.
          try {
            await queryClient.refetchQueries({ queryKey: getGetMeQueryKey() });
          } catch {}
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

    // Phase 2: use activeCompanyId as source of truth; fallback to legacy companyId
    const hasCompany = !!me?.activeCompanyId;
    if (!hasCompany) {
      if (!inOnboarding) router.replace("/onboarding");
    } else if (inSignIn || inOnboarding) {
      router.replace("/");
    }
  }, [isSignedIn, isLoaded, segments, me, meLoading, meFetching, synced, router]);

  const needsTerms = !!me && !me.termsAcceptedAt;

  return (
    <>
      <TermsModal visible={needsTerms} />
      <View style={{ flex: 1 }}>
        <Stack screenOptions={{ headerBackTitle: "Back" }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="sign-in" options={{ headerShown: false }} />
        <Stack.Screen name="onboarding" options={{ headerShown: false }} />
        <Stack.Screen name="project/[id]" options={{ headerShown: true, title: "", headerStyle: { backgroundColor: "#0A0A0A" }, headerTintColor: "#FFFFFF" }} />
        <Stack.Screen name="notifications" options={{ headerShown: false }} />
        <Stack.Screen name="rfi/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="sync-queue" options={{ headerShown: false, presentation: "modal" }} />
        <Stack.Screen name="schedule" options={{ headerShown: true, title: "Assigned Schedule", headerStyle: { backgroundColor: "#0A0A0A" }, headerTintColor: "#FFFFFF" }} />
        <Stack.Screen name="tradehub-post/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="estimator" options={{ headerShown: true, title: "Estimator", headerStyle: { backgroundColor: "#0A0A0A" }, headerTintColor: "#FFFFFF" }} />
        <Stack.Screen name="finance" options={{ headerShown: false }} />
        <Stack.Screen name="invoice/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="invoice/edit" options={{ headerShown: false }} />
        <Stack.Screen name="quote/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="quote/edit" options={{ headerShown: false }} />
        <Stack.Screen name="voice-estimate" options={{ headerShown: false }} />
        <Stack.Screen name="tradehub" options={{ headerShown: false }} />
        <Stack.Screen name="calculators" options={{ headerShown: false }} />
        <Stack.Screen name="site-vision" options={{ headerShown: false }} />
        <Stack.Screen name="safety" options={{ headerShown: false }} />
      </Stack>
      <GlobalVoiceCommandFAB />
    </View>
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
