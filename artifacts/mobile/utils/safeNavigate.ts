import type { Router } from "expo-router";
import { reportClientError } from "./errorReporting";

/**
 * router.push wrapped in a safety block. expo-router/react-navigation don't
 * consistently throw for an unresolvable route (a NAVIGATE action can be
 * silently dropped by a nested navigator — see (tabs)/_layout.tsx's
 * NativeTabLayout bug), so this also can't *guarantee* every failure mode is
 * caught. It catches the cases that do throw (bad href, navigator not yet
 * mounted, etc.) and reports them instead of failing silently, and gives
 * every dashboard nav handler the same safety net instead of each screen
 * reimplementing its own try/catch.
 */
export function safeNavigate(router: Router, path: string, context: string): void {
  try {
    router.push(path as Parameters<Router["push"]>[0]);
  } catch (err) {
    reportClientError({
      logType: "NAVIGATION_ERROR",
      message: err instanceof Error ? err.message : String(err),
      stackTrace: err instanceof Error ? err.stack : undefined,
      metadata: { path, context },
    });
  }
}
