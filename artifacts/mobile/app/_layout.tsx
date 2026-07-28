import "@/src/i18n";
import React, { useEffect, useRef, useState } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { ClerkProvider, useAuth, useUser } from "@clerk/clerk-expo";
import { useGetMe, useSyncUser, getGetMeQueryKey, setAuthTokenGetter, setBaseUrl, setTenantIdGetter } from "@workspace/api-client-react";
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from "@expo-google-fonts/inter";
import * as SplashScreen from "expo-splash-screen";
import { TermsModal } from "@/components/TermsModal";
import { GlobalVoiceCommandFAB } from "@/components/GlobalVoiceCommandFAB";
import * as SecureStore from "expo-secure-store";
import { QueryClient, QueryClientProvider, QueryCache, MutationCache, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@workspace/api-client-react";
import { I18nextProvider } from "react-i18next";
import { KeyboardProvider } from "react-native-keyboard-controller";
import i18n, { setAppLanguage } from "@/src/i18n";
import { hydrateQueryCache, startCachePersistence } from "@/utils/queryPersister";
import { setTokenGetter, setSignOut } from "@/utils/auth";
import { reportClientError } from "@/utils/errorReporting";
import { ErrorBoundary } from "@/components/ErrorBoundary";

// ---------------------------------------------------------------------------
// Build-time config validation
// In a native EAS build, EXPO_PUBLIC_* vars must be set as EAS environment
// variables before running `eas build`. If they're missing the app will crash
// silently (Clerk) or all API calls will hang (no base URL). We detect this
// early and show a human-readable screen so the root cause is obvious.
// ---------------------------------------------------------------------------

const CLERK_KEY = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "";
const API_DOMAIN = process.env.EXPO_PUBLIC_DOMAIN ?? "";

// On native we need both values baked in. On web the dev server injects them.
const IS_NATIVE = Platform.OS !== "web";
const missingClerkKey = IS_NATIVE && !CLERK_KEY;
const missingDomain = IS_NATIVE && !API_DOMAIN;
const hasMissingConfig = missingClerkKey || missingDomain;

function MissingConfigScreen() {
  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  const missing: string[] = [];
  if (missingClerkKey) missing.push("EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY");
  if (missingDomain) missing.push("EXPO_PUBLIC_DOMAIN");

  return (
    <View style={cfgStyles.root}>
      <ScrollView contentContainerStyle={cfgStyles.content}>
        <Text style={cfgStyles.icon}>⚠️</Text>
        <Text style={cfgStyles.title}>App Not Configured</Text>
        <Text style={cfgStyles.body}>
          This build is missing required environment variables. These must be
          set as EAS secrets before running{" "}
          <Text style={cfgStyles.code}>eas build --profile production</Text>.
        </Text>
        <Text style={cfgStyles.sectionLabel}>Missing variables:</Text>
        {missing.map((v) => (
          <Text key={v} style={cfgStyles.varRow}>• {v}</Text>
        ))}
        <Text style={cfgStyles.body}>
          {"\n"}Steps to fix:{"\n"}
          1. Publish your app on Replit to get your production domain and
          Clerk production key (pk_live_…).{"\n"}
          2. Add them as EAS secrets:{"\n"}
          {"   "}eas secret:create --scope project --name EXPO_PUBLIC_DOMAIN
          --value YOUR_APP.replit.app{"\n"}
          {"   "}eas secret:create --scope project --name
          EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY --value pk_live_…{"\n"}
          3. Rebuild:{"\n"}
          {"   "}eas build --profile production --platform ios
        </Text>
      </ScrollView>
    </View>
  );
}

const cfgStyles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0A0A0A" },
  content: { flexGrow: 1, justifyContent: "center", padding: 32 },
  icon: { fontSize: 48, textAlign: "center", marginBottom: 16 },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: "#FFFFFF",
    textAlign: "center",
    marginBottom: 12,
  },
  body: { fontSize: 14, color: "#AAAAAA", lineHeight: 22, marginBottom: 12 },
  sectionLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#C9A84C",
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  varRow: { fontSize: 13, color: "#FF6B6B", fontFamily: "monospace", marginBottom: 4 },
  code: { color: "#C9A84C", fontFamily: "monospace" },
});

// Installed at module scope (not inside a component/effect) so it's active
// before the very first render — mirrors how ErrorUtils must be configured
// before any JS runs that could throw.
const _previousErrorHandler = ErrorUtils.getGlobalHandler();
ErrorUtils.setGlobalHandler((error, isFatal) => {
  reportClientError({
    logType: "CLIENT_EXCEPTION",
    message: error.message,
    stackTrace: error.stack,
    metadata: { source: "ErrorUtils", isFatal },
  });
  _previousErrorHandler(error, isFatal);
});

const tokenCache = {
  async getToken(key: string) {
    return SecureStore.getItemAsync(key);
  },
  async saveToken(key: string, value: string) {
    return SecureStore.setItemAsync(key, value);
  },
};

SplashScreen.preventAutoHideAsync().catch(() => {});

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
  // API_DOMAIN is resolved at module scope from EXPO_PUBLIC_DOMAIN; on native
  // it was baked in by `eas build`, on web it is injected by the dev server.
  useEffect(() => {
    if (API_DOMAIN) setBaseUrl(`https://${API_DOMAIN}`);
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

  // Phase 4: Switch mobile language to user's preferred language from API profile
  useEffect(() => {
    const lang = me?.preferredLanguage;
    if (lang) setAppLanguage(lang);
  }, [me?.preferredLanguage]);

  const router = useRouter();
  const segments = useSegments();

  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    (async () => {
      if (fontsLoaded || fontError) {
        try {
          await SplashScreen.hideAsync();
        } catch (e) {
          console.warn("Splash screen hidden early or not registered:", e);
        }
      }
    })();
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

  // Terms must be accepted before the user can interact with any app screen.
  // Keep this above the routing effect so it can gate navigation.
  const needsTerms = !!me && !me.termsAcceptedAt;

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

    // If terms are pending, show the terms modal and do not navigate away
    // from sign-in or onboarding (the modal overlays whatever is current).
    if (needsTerms) return;

    // Phase 2: use activeCompanyId as source of truth; fallback to legacy companyId
    const hasCompany = !!me?.activeCompanyId;
    if (!hasCompany) {
      if (!inOnboarding) router.replace("/onboarding");
    } else if (inSignIn || inOnboarding) {
      router.replace("/");
    }
  }, [isSignedIn, isLoaded, segments, me, meLoading, meFetching, synced, router, needsTerms]);

  return (
    <KeyboardProvider>
      <TermsModal visible={needsTerms} />
      <View style={{ flex: 1 }}>
        <ErrorBoundary>
        <Stack screenOptions={{ headerBackTitle: "Back" }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="sign-in" options={{ headerShown: false }} />
        <Stack.Screen name="onboarding" options={{ headerShown: false }} />
        <Stack.Screen name="project/[id]" options={{ headerShown: true, title: "", headerStyle: { backgroundColor: "#0A0A0A" }, headerTintColor: "#FFFFFF" }} />
        <Stack.Screen name="notifications" options={{ headerShown: false }} />
        <Stack.Screen name="rfi/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="sync-queue" options={{ headerShown: false, presentation: "modal" }} />
        <Stack.Screen name="workforce" options={{ headerShown: false }} />
        <Stack.Screen name="time-clock" options={{ headerShown: false }} />
        <Stack.Screen name="schedule" options={{ headerShown: false }} />
        <Stack.Screen name="timesheets" options={{ headerShown: false }} />
        <Stack.Screen name="hours" options={{ headerShown: false }} />
        <Stack.Screen name="contacts" options={{ headerShown: false }} />
        <Stack.Screen name="tradehub-post/[id]" options={{ headerShown: false }} />
        {/* Reachable from tiles/menus but not persistent bottom-tab items — must live
            here, not inside (tabs), because NativeTabs (Liquid Glass devices) excludes
            any Trigger marked `hidden` from its rendered screen set entirely, not just
            from the tab bar strip, so router.push to a hidden NativeTabs child silently
            no-ops. A plain Stack screen has no such limitation. */}
        <Stack.Screen name="risk" options={{ headerShown: false }} />
        <Stack.Screen name="inspect" options={{ headerShown: false }} />
        <Stack.Screen name="safety" options={{ headerShown: false }} />
        <Stack.Screen name="tradehub" options={{ headerShown: false }} />
        <Stack.Screen name="admin-hub" options={{ headerShown: false }} />
        <Stack.Screen name="estimator" options={{ headerShown: true, title: "Estimator", headerStyle: { backgroundColor: "#0A0A0A" }, headerTintColor: "#FFFFFF" }} />
        <Stack.Screen name="finance" options={{ headerShown: false }} />
        <Stack.Screen name="invoice/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="invoice/edit" options={{ headerShown: false }} />
        <Stack.Screen name="quote/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="quote/edit" options={{ headerShown: false }} />
        <Stack.Screen name="calculators" options={{ headerShown: false }} />
        <Stack.Screen name="site-vision" options={{ headerShown: false }} />
        <Stack.Screen name="settings" options={{ headerShown: false }} />
        <Stack.Screen name="permits" options={{ headerShown: false }} />
        <Stack.Screen name="expenses" options={{ headerShown: false }} />
        <Stack.Screen name="vault" options={{ headerShown: false }} />
        <Stack.Screen name="tradehub-jobs" options={{ headerShown: false }} />
        <Stack.Screen name="tradehub-messages" options={{ headerShown: false }} />
      </Stack>
        {/* Only mount the FAB after the user is authenticated and synced.
            GlobalVoiceCommandFAB calls useAudioRecorder (expo-audio) which
            initialises AVAudioSession on mount. On iOS with New Architecture
            this crashes the native runtime when called before auth is ready.
            Keeping the FAB inside ErrorBoundary means a future FAB crash
            degrades gracefully instead of killing the whole layout. */}
        {isSignedIn && synced && <GlobalVoiceCommandFAB />}
        </ErrorBoundary>
    </View>
    </KeyboardProvider>
  );
}

// AppRoot contains all hooks and is only rendered when config is valid.
// Splitting out of RootLayout lets us do an early guard without violating
// the rules of hooks (no hooks before a conditional return).
function AppRoot() {
  const [queryClient] = useState(() => {
    // N-S2 fix: auto sign-out on 401 so expired sessions never silently linger.
    // Both query and mutation errors are intercepted at the cache level so every
    // customFetch call in the app benefits without per-call handling. Also the
    // practical catch-all for reporting failed API calls to the native error
    // tracker — true unhandled-rejection coverage beyond React Query is a
    // smaller residual gap, not closed here.
    const handleQueryError = (error: unknown) => {
      if (error instanceof ApiError && error.status === 401) {
        // signOut clears the query cache + Clerk session — imported from utils/auth
        import("@/utils/auth").then(({ signOut }) => signOut()).catch(() => {});
        return;
      }
      reportClientError({
        logType: "CLIENT_EXCEPTION",
        message: error instanceof Error ? error.message : String(error),
        stackTrace: error instanceof Error ? error.stack : undefined,
        metadata: { source: "react-query" },
      });
    };
    return new QueryClient({
      queryCache: new QueryCache({ onError: handleQueryError }),
      mutationCache: new MutationCache({ onError: handleQueryError }),
      defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
    });
  });

  useEffect(() => {
    let stop: (() => void) | undefined;
    hydrateQueryCache(queryClient).finally(() => {
      stop = startCachePersistence(queryClient);
    });
    return () => { stop?.(); };
  }, [queryClient]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ClerkProvider
        publishableKey={CLERK_KEY}
        tokenCache={tokenCache as any}
      >
        <QueryClientProvider client={queryClient}>
          <I18nextProvider i18n={i18n}>
            <RootLayoutNav />
          </I18nextProvider>
        </QueryClientProvider>
      </ClerkProvider>
    </GestureHandlerRootView>
  );
}

export default function RootLayout() {
  // Guard: if EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY or EXPO_PUBLIC_DOMAIN were not
  // baked into the native bundle at EAS build time, show a diagnostic screen
  // instead of crashing silently or spinning forever.
  if (hasMissingConfig) return <MissingConfigScreen />;
  return <AppRoot />;
}
