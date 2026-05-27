import { useState, useEffect, useRef, useCallback } from "react";
import { useUser } from "@clerk/react";

export interface DraftRecoveryResult {
  showBanner: boolean;
  restoreDraft: () => void;
  discardDraft: () => void;
  clearDraft: () => void;
}

export function useDraftRecovery(
  formKey: string,
  getFormState: () => Record<string, unknown>,
  onRestore: (state: Record<string, unknown>) => void,
): DraftRecoveryResult {
  const { user } = useUser();
  const userId = user?.id ?? "anonymous";
  const storageKey = `draft:${userId}:${formKey}`;

  const [showBanner, setShowBanner] = useState(false);
  const [pendingState, setPendingState] = useState<Record<string, unknown> | null>(null);

  const getStateRef = useRef(getFormState);
  getStateRef.current = getFormState;

  // Check for existing draft on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Object.keys(parsed).length > 0) {
          setPendingState(parsed);
          setShowBanner(true);
        }
      }
    } catch {
      // Ignore parse errors
    }
  }, [storageKey]);

  // Save draft every 5 seconds
  useEffect(() => {
    const id = setInterval(() => {
      try {
        const state = getStateRef.current();
        const hasValue = Object.values(state).some((v) => {
          if (v === "" || v === undefined || v === null) return false;
          if (Array.isArray(v) && v.length === 0) return false;
          if (typeof v === "object" && Object.keys(v).length === 0) return false;
          return true;
        });
        if (hasValue) {
          localStorage.setItem(storageKey, JSON.stringify(state));
        }
      } catch {
        // Ignore storage errors (quota exceeded, private mode, etc.)
      }
    }, 5000);
    return () => clearInterval(id);
  }, [storageKey]);

  const restoreDraft = useCallback(() => {
    if (pendingState) {
      onRestore(pendingState);
    }
    setShowBanner(false);
    setPendingState(null);
  }, [pendingState, onRestore]);

  const discardDraft = useCallback(() => {
    localStorage.removeItem(storageKey);
    setShowBanner(false);
    setPendingState(null);
  }, [storageKey]);

  const clearDraft = useCallback(() => {
    localStorage.removeItem(storageKey);
    setShowBanner(false);
    setPendingState(null);
  }, [storageKey]);

  return { showBanner, restoreDraft, discardDraft, clearDraft };
}
