import { useState, useEffect, useRef, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

export interface DraftState<T> {
  hasDraft: boolean;
  restore: () => void;
  discard: () => void;
}

function draftKey(userId: string | number | undefined, formType: string): string {
  return `form_draft:${userId ?? "anonymous"}:${formType}`;
}

/**
 * Auto-save and restore form drafts to AsyncStorage.
 *
 * @param userId     The current worker/user id (from useGetMe)
 * @param formType   Unique slug for this form, e.g. "daily-report" or "timesheet"
 * @param payload    The current form JSON payload to persist
 * @param setPayload Setter to restore the payload from storage
 * @param resetForm  Callback to fully reset the form (called after discard or on clear)
 * @returns          { hasDraft, restore, discard } for rendering the banner
 */
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

  // ── Check for existing draft on mount ───────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(key)
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
      const json = JSON.stringify(payload);
      if (json === savedRef.current) return; // skip if unchanged
      AsyncStorage.setItem(key, json)
        .then(() => { savedRef.current = json; })
        .catch(() => {});
    }, 5000);
    return () => clearInterval(timer);
  }, [key, payload]);

  // ── Restore from storage ──────────────────────────────────────────────────
  const restore = useCallback(() => {
    AsyncStorage.getItem(key)
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
    AsyncStorage.removeItem(key)
      .catch(() => {})
      .finally(() => {
        savedRef.current = null;
        setHasDraft(false);
        resetForm();
      });
  }, [key, resetForm]);

  // ── Clear draft on successful submit ──────────────────────────────────────
  const clearDraft = useCallback(() => {
    AsyncStorage.removeItem(key)
      .catch(() => {})
      .finally(() => {
        savedRef.current = null;
        setHasDraft(false);
      });
  }, [key]);

  // Expose clearDraft as a stable ref so consumers can call it imperatively
  // without adding it to their dependency arrays.
  useEffect(() => {
    (useFormDraft as any)._clearDraftRef = clearDraft;
  }, [clearDraft]);

  return { hasDraft, restore, discard };
}

/**
 * Imperatively clear the draft for a given user/form type.
 * Call this after a successful API submit.
 */
export async function clearFormDraft(
  userId: string | number | undefined,
  formType: string,
): Promise<void> {
  const key = draftKey(userId, formType);
  try {
    await AsyncStorage.removeItem(key);
  } catch {
    // silently ignore storage errors
  }
}
