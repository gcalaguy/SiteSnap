import { useEffect, useRef, useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@workspace/api-client-react";

const POLL_INTERVAL_MS = 5_000;
const basePath = (import.meta.env.BASE_URL as string).replace(/\/$/, "");
const HEALTH_URL = `${basePath}/api/healthz`;

function isServerDownError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  // Network / fetch-failed errors
  if (err instanceof TypeError) return true;
  // Timeout errors thrown by customFetch
  if (err instanceof Error && err.message.includes("timed out")) return true;
  // HTTP 503 Service Unavailable
  if (err instanceof ApiError && err.status === 503) return true;
  return false;
}

/**
 * Tracks whether the API server is reachable.
 *
 * - Subscribes to React Query's query/mutation caches for network-level or 503 errors.
 * - When an error is detected it starts polling /api/healthz every 5 s.
 * - When the health check succeeds it marks the server as up, stops polling,
 *   and invalidates all cached queries so stale data is refreshed automatically.
 */
export function useApiServerStatus(): { isDown: boolean } {
  const queryClient = useQueryClient();
  const [isDown, setIsDown] = useState(false);
  const isDownRef = useRef(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current != null) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const markUp = useCallback(() => {
    if (!isDownRef.current) return;
    isDownRef.current = false;
    setIsDown(false);
    stopPolling();
    queryClient.invalidateQueries();
  }, [queryClient, stopPolling]);

  const markDown = useCallback(() => {
    if (isDownRef.current) return;
    isDownRef.current = true;
    setIsDown(true);

    if (pollRef.current != null) return;
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(HEALTH_URL, { method: "GET", cache: "no-store" });
        if (res.ok) markUp();
      } catch {
        // still unreachable — keep polling
      }
    }, POLL_INTERVAL_MS);
  }, [markUp]);

  useEffect(() => {
    const queryCache = queryClient.getQueryCache();
    const mutationCache = queryClient.getMutationCache();

    const unsubQuery = queryCache.subscribe((event) => {
      if (event.type === "updated" && (event as { action?: { type?: string; error?: unknown } }).action?.type === "error") {
        const err = (event as { action?: { error?: unknown } }).action?.error;
        if (isServerDownError(err)) markDown();
      }
    });

    const unsubMutation = mutationCache.subscribe((event) => {
      if (
        event.type === "updated" &&
        event.mutation?.state.status === "error" &&
        isServerDownError(event.mutation.state.error)
      ) {
        markDown();
      }
    });

    return () => {
      unsubQuery();
      unsubMutation();
      stopPolling();
    };
  }, [queryClient, markDown, stopPolling]);

  return { isDown };
}
