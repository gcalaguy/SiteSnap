import "@/src/i18n";
import React, { useEffect, useRef, useState } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { StatusBar } from "expo-status-bar";
import { ClerkProvider, useAuth, useUser } from "@clerk/clerk-expo";
import { useGetMe, useSyncUser, getGetMeQueryKey, setAuthTokenGetter, setBaseUrl, setTenantIdGetter } from "@workspace/api-client-react";
import {
  useFonts,
  NunitoSans_400Regular,
  NunitoSans_500Medium,
  NunitoSans_600SemiBold,
  NunitoSans_700Bold,
  NunitoSans_800ExtraBold,
} from "@expo-google-fonts/nunito-sans";
import * as SplashScreen from "expo-splash-screen";
import { TermsModal } from "@/components/TermsModal";
import { GlobalVoiceCommandFAB } from "@/components/GlobalVoiceCommandFAB";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import * as SecureStore from "expo-secure-store";
import { QueryClient, QueryClientProvider, QueryCache, MutationCache, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@workspace/api-client-react";
import { I18nextProvider } from "react-i18next";
import { KeyboardProvider } from "react-native-keyboard-controller";
import i18n, { setAppLanguage } from "@/src/i18n";
import { hydrateQueryCache, startCachePersistence } from "@/utils/queryPersister";
import { setTokenGetter, setSignOut } from "@/utils/auth";
import { reportClientError, persistCrashReport, flushPendingCrashReport } from "@/utils/errorReporting";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ThemeProvider, useThemePreference } from "@/context/ThemeContext";
import { OfflineQueueProvider } from "@/context/OfflineQueueContext";
import { MediaQueueProvider } from "@/context/MediaQueueContext";
import { NoteQueueProvider } from "@/context/NoteQueueContext";

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

// A published *.replit.app deployment runs a Clerk *production* instance, and
// its API server only accepts session tokens minted by that instance. A build
// carrying a pk_test_ key authenticates against a completely separate Clerk
// user directory, so every /api call comes back 401 — which the QueryCache
// error handler below turns into an automatic sign-out. The symptom is an app
// that opens, spins on every screen, then drops back to the login screen with
// no explanation, while real accounts from the web dashboard cannot sign in at
// all because they do not exist in the test directory. Fail loudly here
// instead, where the cause is nameable: the fix is a rebuild, and no amount of
// retrying in the app can work around it.
const clerkInstanceMismatch =
  IS_NATIVE &&
  CLERK_KEY.startsWith("pk_test_") &&
  /(^|\.)replit\.app$/i.test(API_DOMAIN);

const hasMissingConfig = missingClerkKey || missingDomain || clerkInstanceMismatch;

function ClerkInstanceMismatchScreen() {
  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  return (
    <View style={cfgStyles.root}>
      <ScrollView contentContainerStyle={cfgStyles.content}>
        <Text style={cfgStyles.icon}>⚠️</Text>
        <Text style={cfgStyles.title}>Wrong Auth Environment</Text>
        <Text style={cfgStyles.body}>
          This build signs in against a Clerk{" "}
          <Text style={cfgStyles.code}>development</Text> instance, but{" "}
          <Text style={cfgStyles.code}>{API_DOMAIN}</Text> is a published
          deployment running a Clerk <Text style={cfgStyles.code}>production</Text>{" "}
          instance. They are separate user directories, so accounts that work on
          the web dashboard do not exist here and every API call is rejected.
        </Text>
        <Text style={cfgStyles.sectionLabel}>Baked into this build:</Text>
        <Text style={cfgStyles.varRow}>
          • EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY = {CLERK_KEY.slice(0, 8)}…
        </Text>
        <Text style={cfgStyles.varRow}>• EXPO_PUBLIC_DOMAIN = {API_DOMAIN}</Text>
        <Text style={cfgStyles.body}>
          {"\n"}To fix, set the production key in{" "}
          <Text style={cfgStyles.code}>eas.json</Text> (it starts with{" "}
          <Text style={cfgStyles.code}>pk_live_</Text>, and must match the
          dashboard&apos;s VITE_CLERK_PUBLISHABLE_KEY) and rebuild:{"\n"}
          {"   "}eas build --profile production --platform ios{"\n"}
          {"\n"}The key is compiled into the JS bundle at build time, so a
          redeploy of the server alone will not change it.
        </Text>
      </ScrollView>
    </View>
  );
}

// Configure the API base URL here rather than in an effect: components issue
// their first queries during the initial render, before any effect runs, and a
// request sent without a base URL resolves as a relative path against whatever
// server delivered the bundle instead of the API.
//
// The same applies to crash telemetry: reportClientError POSTs to /api/... too,
// and every crash during provider init, first render, or font loading happens
// before any effect has run. Without this, a TestFlight crash-on-open could
// never report itself — which is why one went undiagnosed across three builds.
if (API_DOMAIN) setBaseUrl(`https://${API_DOMAIN}`);

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
  const payload = {
    logType: "CLIENT_EXCEPTION",
    message: error.message,
    stackTrace: error.stack,
    metadata: { source: "ErrorUtils", isFatal },
  };
  reportClientError(payload);

  if (isFatal) {
    // In a Release build the previous (default) handler terminates the process
    // via RCTFatal, which would race — and usually beat — both the POST above
    // and any storage write. Persist a breadcrumb first (re-sent by
    // flushPendingCrashReport on the next launch), bounded by a short timeout
    // so a broken AsyncStorage can never hold the crash handler hostage.
    const proceed = () => _previousErrorHandler(error, isFatal);
    Promise.race([
      persistCrashReport(payload),
      new Promise((resolve) => setTimeout(resolve, 1500)),
    ]).then(proceed, proceed);
  } else {
    _previousErrorHandler(error, isFatal);
  }
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

  // Registers the push token (backend endpoint already existed, unused) and
  // routes to the relevant screen on notification tap. Same readiness gate
  // as GlobalVoiceCommandFAB below.
  usePushNotifications(!!isSignedIn && synced);

  const router = useRouter();
  const segments = useSegments();
  const { scheme } = useThemePreference();

  const [fontsLoaded, fontError] = useFonts({
    NunitoSans_400Regular,
    NunitoSans_500Medium,
    NunitoSans_600SemiBold,
    NunitoSans_700Bold,
    NunitoSans_800ExtraBold,
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
  // TODO: Re-enable terms and conditions
  const needsTerms = false; // !!me && !me.termsAcceptedAt;

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
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      <TermsModal visible={needsTerms} />
      <View style={{ flex: 1 }}>
        <ErrorBoundary>
        <Stack screenOptions={{ headerBackTitle: "Back" }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="sign-in" options={{ headerShown: false }} />
        <Stack.Screen name="onboarding" options={{ headerShown: false }} />
        <Stack.Screen name="project/[id]" options={{ headerShown: false }} />
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
        <Stack.Screen name="tasks" options={{ headerShown: false }} />
        <Stack.Screen name="capture" options={{ headerShown: false }} />
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
        <Stack.Screen name="change-order/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="calculators" options={{ headerShown: false }} />
        <Stack.Screen name="site-vision" options={{ headerShown: false }} />
        <Stack.Screen name="settings" options={{ headerShown: false }} />
        <Stack.Screen name="email-integrations" options={{ headerShown: false }} />
        <Stack.Screen name="uncategorized-emails" options={{ headerShown: false }} />
        <Stack.Screen name="email-filing-rules" options={{ headerShown: false }} />
        <Stack.Screen name="communications-search" options={{ headerShown: false }} />
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
    // Second param differs by cache: QueryCache passes the Query (has queryKey),
    // MutationCache passes the mutation's variables (does not) — untyped here
    // and narrowed at the read site so one handler satisfies both signatures.
    const handleQueryError = (error: unknown, queryOrVariables?: unknown) => {
      if (error instanceof ApiError && error.status === 401) {
        // signOut clears the query cache + Clerk session — imported from utils/auth
        import("@/utils/auth").then(({ signOut }) => signOut()).catch(() => {});
        return;
      }
      // Missing/inaccessible storage objects are expected (deleted photo, stale
      // reference) and MediaCard/SignedImage/PhotoThumbnail already fall back to
      // a placeholder — reporting these as client exceptions is just noise.
      const queryKey = (queryOrVariables as { queryKey?: readonly unknown[] } | undefined)?.queryKey;
      if (error instanceof ApiError && error.status === 404 && queryKey?.[0] === "signed-photo-url") {
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
    // If the previous launch died in a fatal JS crash, the breadcrumb it
    // persisted is the only record — send it before anything else can crash.
    flushPendingCrashReport();

    let stop: (() => void) | undefined;
    hydrateQueryCache(queryClient).finally(() => {
      stop = startCachePersistence(queryClient);
    });
    return () => { stop?.(); };
  }, [queryClient]);

  return (
    // Wraps the entire provider tree (not just the routed screens below
    // RootLayoutNav) so a synchronous throw during Clerk/React Query/queue
    // provider init renders a recoverable fallback instead of taking down
    // the whole app with no UI at all.
    <ErrorBoundary>
      <ThemeProvider>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <ClerkProvider
            publishableKey={CLERK_KEY}
            tokenCache={tokenCache as any}
          >
            <QueryClientProvider client={queryClient}>
              <I18nextProvider i18n={i18n}>
                <OfflineQueueProvider>
                  <MediaQueueProvider>
                    <NoteQueueProvider>
                      <RootLayoutNav />
                    </NoteQueueProvider>
                  </MediaQueueProvider>
                </OfflineQueueProvider>
              </I18nextProvider>
            </QueryClientProvider>
          </ClerkProvider>
        </GestureHandlerRootView>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default function RootLayout() {
  // Guard: if EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY or EXPO_PUBLIC_DOMAIN were not
  // baked into the native bundle at EAS build time, show a diagnostic screen
  // instead of crashing silently or spinning forever.
  if (clerkInstanceMismatch) return <ClerkInstanceMismatchScreen />;
  if (hasMissingConfig) return <MissingConfigScreen />;
  return <AppRoot />;
}
