import { useCallback } from "react";
import { useFocusEffect } from "expo-router";

const STALE_MS = 60_000;

/**
 * Refetches a query on screen focus only if its data is older than 60s —
 * respects staleTime instead of blindly refetching every time the screen
 * regains focus (e.g. switching tabs and back).
 */
export function useRefetchOnStaleFocus(dataUpdatedAt: number, refetch: () => void) {
  useFocusEffect(
    useCallback(() => {
      if (!dataUpdatedAt || Date.now() - dataUpdatedAt > STALE_MS) refetch();
    }, [dataUpdatedAt, refetch]),
  );
}
