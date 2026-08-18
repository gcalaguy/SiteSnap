import type { Href, Router } from "expo-router";
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
 *
 * `path` is typed as `Href` (not a bare string) so a call site with a stale
 * or typo'd route fails at compile time — callers building a route from a
 * data table should type that field as `Href` too (see admin-hub.tsx,
 * capture.tsx, GlobalVoiceCommandFAB.tsx for the pattern).
 */
export function safeNavigate(router: Router, path: Href, context: string): void {
  try {
    router.push(path);
  } catch (err) {
    reportClientError({
      logType: "NAVIGATION_ERROR",
      message: err instanceof Error ? err.message : String(err),
      stackTrace: err instanceof Error ? err.stack : undefined,
      metadata: { path: typeof path === "string" ? path : JSON.stringify(path), context },
    });
  }
}
