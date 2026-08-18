import type { ReactNode } from "react";
import { useRouter } from "expo-router";
import { ErrorBoundary } from "./ErrorBoundary";

/**
 * Per-screen error boundary for heavy/native-module-touching screens (camera,
 * mic, AI vision). Falls back to just this screen instead of the whole app —
 * the root ErrorBoundary in app/_layout.tsx still catches anything that
 * escapes here. Offers "Go Back" since these screens render their own header
 * (headerShown: false), so a crash takes the in-content back button down too.
 */
export function ScreenErrorBoundary({ children }: { children: ReactNode }) {
  const router = useRouter();
  return <ErrorBoundary onGoBack={() => router.back()}>{children}</ErrorBoundary>;
}
