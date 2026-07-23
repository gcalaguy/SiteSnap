import { useState, useEffect, useRef, useCallback } from "react";
import * as SecureStore from "expo-secure-store";

export interface DraftState<T> {
  hasDraft: boolean;
  restore: () => void;
  discard: () => void;
  clearDraft: () => void;
}

// expo-secure-store keys must be alphanumeric plus underscores and dots — no colons.
function draftKey(userId: string | number | undefined, formType: string): string {
  const safeUser = String(userId ?? "anon").replace(/[^a-zA-Z0-9]/g, "_");
  const safeType = formType.replace(/[^a-zA-Z0-9]/g, "_");
  return `form_draft_${safeUser}_${safeType}`;
}

export function useFormDraft<T extends Record<string, unknown>>(
  userId: string | number | undefined,
  formType: string,
  payload: T,
  setPayload: (value: T) => void,
  resetForm: () => void,
): DraftState<T> {
  const key = draftKey(userId, formType);
  const [hasDraft, setHasDraft] = useState(false);
  const savedRef = useRef<string | null>(null);

  // payload is typically a fresh object literal every render (built from several
  // useState values at the call site) — reading it through a ref instead of a
  // dependency means the interval below survives re-renders instead of being
  // torn down and recreated on every keystroke.
  const payloadRef = useRef(payload);
  payloadRef.current = payload;

  // ── Check for existing draft on mount ───────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    SecureStore.getItemAsync(key)
      .then((raw) => {
        if (cancelled) return;
        if (raw) setHasDraft(true);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [key]);

  // ── Auto-save every 5 seconds ─────────────────────────────────────────────
  useEffect(() => {
    const timer = setInterval(() => {
      const json = JSON.stringify(payloadRef.current);
      if (json === savedRef.current) return;
      SecureStore.setItemAsync(key, json)
        .then(() => { savedRef.current = json; })
        .catch(() => {});
    }, 5000);
    return () => clearInterval(timer);
  }, [key]);

  // ── Restore from storage ──────────────────────────────────────────────────
  const restore = useCallback(() => {
    SecureStore.getItemAsync(key)
      .then((raw) => {
        if (!raw) return;
        try {
          const parsed = JSON.parse(raw) as T;
          setPayload(parsed);
        } catch {
          // ignore corrupt draft
        }
      })
      .catch(() => {})
      .finally(() => setHasDraft(false));
  }, [key, setPayload]);

  // ── Discard draft ─────────────────────────────────────────────────────────
  const discard = useCallback(() => {
    SecureStore.deleteItemAsync(key)
      .catch(() => {})
      .finally(() => {
        savedRef.current = null;
        setHasDraft(false);
        resetForm();
      });
  }, [key, resetForm]);

  // ── Clear draft on successful submit ──────────────────────────────────────
  const clearDraft = useCallback(() => {
    SecureStore.deleteItemAsync(key)
      .catch(() => {})
      .finally(() => {
        savedRef.current = null;
        setHasDraft(false);
      });
  }, [key]);

  return { hasDraft, restore, discard, clearDraft };
}

export async function clearFormDraft(
  userId: string | number | undefined,
  formType: string,
): Promise<void> {
  const key = draftKey(userId, formType);
  try {
    await SecureStore.deleteItemAsync(key);
  } catch {
    // silently ignore storage errors
  }
}
