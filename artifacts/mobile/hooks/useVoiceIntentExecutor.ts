import { useCallback, useState } from "react";
import { Alert } from "react-native";
import * as Haptics from "expo-haptics";
import {
  interpretVoiceCommand,
  withActiveProject,
  type VoiceIntent,
  type SingleAction,
} from "@/src/utils/voiceRouter";
import { getAiErrorMessage } from "@/src/utils/aiError";

/**
 * Quick-nav intercepts: checked BEFORE the full voiceRouter pipeline so these
 * phrases cannot be accidentally swallowed by action parsers (e.g. daily-log).
 * Each entry maps one or more phrases to the RouteTarget string that the FAB
 * pathMap already handles.
 */
const QUICK_NAV_PATTERNS: Array<{ pattern: RegExp; target: string }> = [
  // ── Vault / document scanning ──────────────────────────────────────────────
  {
    pattern: /^(?:(?:go|navigate|switch)\s+to\s+|open\s+|show(?:\s+me)?\s+|take\s+me\s+to\s+)?(?:the\s+)?(?:vault|worker\s+documents?|audit\s+vault|document\s+vault)(?:\s+(?:list|page|screen))?$/i,
    target: "Vault",
  },
  {
    pattern: /^(?:scan|upload)\s+(?:receipts?|invoices?|documents?|files?)$/i,
    target: "Vault",
  },
  // ── Gatekeeper / morning safety questionnaire ──────────────────────────────
  {
    pattern: /^(?:(?:go|navigate|switch)\s+to\s+|open\s+|show(?:\s+me)?\s+|take\s+me\s+to\s+)?(?:the\s+)?(?:morning\s+)?gatekeeper(?:\s+safety)?(?:\s+(?:list|page|screen))?$/i,
    target: "Gatekeeper",
  },
  {
    pattern: /^(?:morning\s+(?:questionnaire|checklist?|safety)|gatekeeper\s+safety|safety\s+questionnaire)$/i,
    target: "Gatekeeper",
  },
];

function matchQuickNav(transcript: string): string | null {
  const t = transcript.trim();
  for (const { pattern, target } of QUICK_NAV_PATTERNS) {
    if (pattern.test(t)) return target;
  }
  return null;
}

export type ExecutorState = "idle" | "parsing" | "executing" | "done" | "error";

export interface UseVoiceIntentExecutorReturn {
  state: ExecutorState;
  lastIntent: VoiceIntent | null;
  execute: (transcript: string, activeProject?: string | null, projectNames?: string[]) => Promise<void>;
  reset: () => void;
}

export interface ExecutorCallbacks {
  onLogHours?: (action: Extract<SingleAction, { type: "LOG_HOURS" }>) => Promise<void> | void;
  onLogOwnHours?: (action: Extract<SingleAction, { type: "LOG_OWN_HOURS" }>) => Promise<void> | void;
  onAddDailyLog?: (action: Extract<SingleAction, { type: "ADD_DAILY_LOG" }>) => Promise<void> | void;
  onMarkTaskDone?: (action: Extract<SingleAction, { type: "MARK_TASK_DONE" }>) => Promise<void> | void;
  onLogDelay?: (action: Extract<SingleAction, { type: "LOG_DELAY" }>) => Promise<void> | void;
  onLogExpense?: (action: Extract<SingleAction, { type: "LOG_EXPENSE" }>) => Promise<void> | void;
  onCreateRFI?: (action: Extract<SingleAction, { type: "CREATE_RFI" }>) => Promise<void> | void;
  onMaterialAlert?: (action: Extract<SingleAction, { type: "MATERIAL_ALERT" }>) => Promise<void> | void;
  onTriggerCamera?: (action: Extract<SingleAction, { type: "TRIGGER_CAMERA" }>) => Promise<void> | void;
  onSafetyLog?: (action: Extract<SingleAction, { type: "SAFETY_LOG" }>) => Promise<void> | void;
  onCreateQuote?: (action: Extract<SingleAction, { type: "CREATE_QUOTE" }>) => Promise<void> | void;
  onNavigate?: (target: string) => void;
  onAddNote?: (payload: string) => void;
  onAskAssistant?: (question: string) => void;
  onUnknown?: (transcript: string) => void;
}

export function useVoiceIntentExecutor(
  callbacks: ExecutorCallbacks
): UseVoiceIntentExecutorReturn {
  const [state, setState] = useState<ExecutorState>("idle");
  const [lastIntent, setLastIntent] = useState<VoiceIntent | null>(null);

  const execute = useCallback(
    async (transcript: string, activeProject?: string | null, projectNames?: string[]) => {
      setState("parsing");
      setLastIntent(null);

      // ── Quick-nav intercept ────────────────────────────────────────────────
      // Checked BEFORE interpretVoiceCommand so scan/vault/gatekeeper phrases
      // cannot be swallowed by the action-parser layer inside voiceRouter.
      const quickTarget = matchQuickNav(transcript);
      if (quickTarget !== null) {
        console.log("[voiceExecutor] quickNav intercept ->", quickTarget);
        setState("done");
        await safeHaptics(Haptics.NotificationFeedbackType.Success);
        callbacks.onNavigate?.(quickTarget);
        return;
      }

      try {
        const rawIntent = await interpretVoiceCommand(transcript, projectNames ?? []);
        const intent = withActiveProject(rawIntent, activeProject ?? null);
        setLastIntent(intent);

        if (intent.intent === "UNKNOWN") {
          setState("error");
          await safeHaptics(Haptics.NotificationFeedbackType.Error);
          callbacks.onUnknown?.(transcript);
          return;
        }

        if (intent.intent === "ASK_ASSISTANT") {
          setState("done");
          await safeHaptics(Haptics.NotificationFeedbackType.Success);
          callbacks.onAskAssistant?.(intent.question);
          return;
        }

        if (intent.intent === "NAVIGATE") {
          setState("done");
          await safeHaptics(Haptics.NotificationFeedbackType.Success);
          callbacks.onNavigate?.(intent.target);
          return;
        }

        if (intent.intent === "DATA_ENTRY") {
          setState("done");
          await safeHaptics(Haptics.NotificationFeedbackType.Success);
          callbacks.onAddNote?.(intent.payload);
          return;
        }

        if (intent.intent === "SINGLE_ACTION") {
          console.log("[voiceExecutor] SINGLE_ACTION:", intent.action.type);
          setState("executing");
          await runSingleAction(intent.action, callbacks);
          console.log("[voiceExecutor] SINGLE_ACTION done");
          setState("done");
          await safeHaptics(Haptics.NotificationFeedbackType.Success);
          return;
        }

        if (intent.intent === "COMPOUND_ACTION") {
          console.log("[voiceExecutor] COMPOUND_ACTION:", intent.actions.map((a) => a.type).join(", "));
          setState("executing");
          for (const action of intent.actions) {
            await runSingleAction(action, callbacks);
          }
          console.log("[voiceExecutor] COMPOUND_ACTION done");
          setState("done");
          await safeHaptics(Haptics.NotificationFeedbackType.Success);
          return;
        }
      } catch (err) {
        const msg = getAiErrorMessage(err, "Voice command failed. Please try again.");
        console.error("[voiceExecutor] error:", msg);
        setState("error");
        await safeHaptics(Haptics.NotificationFeedbackType.Error);
        Alert.alert("Command Failed", msg);
      }
    },
    [callbacks]
  );

  const reset = useCallback(() => {
    setState("idle");
    setLastIntent(null);
  }, []);

  return { state, lastIntent, execute, reset };
}

async function safeHaptics(type: Haptics.NotificationFeedbackType): Promise<void> {
  try {
    await Haptics.notificationAsync(type);
  } catch (hapticErr) {
    console.warn("[voiceExecutor] Haptics failed, continuing:", hapticErr);
  }
}

async function runSingleAction(
  action: SingleAction,
  callbacks: ExecutorCallbacks
): Promise<void> {
  console.log("[voiceExecutor] runSingleAction:", action.type);
  switch (action.type) {
    case "LOG_HOURS": {
      await callbacks.onLogHours?.(action);
      break;
    }
    case "LOG_OWN_HOURS": {
      await callbacks.onLogOwnHours?.(action);
      break;
    }
    case "ADD_DAILY_LOG": {
      await callbacks.onAddDailyLog?.(action);
      break;
    }
    case "MARK_TASK_DONE": {
      await callbacks.onMarkTaskDone?.(action);
      break;
    }
    case "LOG_DELAY": {
      await callbacks.onLogDelay?.(action);
      break;
    }
    case "LOG_EXPENSE": {
      await callbacks.onLogExpense?.(action);
      break;
    }
    case "CREATE_RFI": {
      await callbacks.onCreateRFI?.(action);
      break;
    }
    case "MATERIAL_ALERT": {
      await callbacks.onMaterialAlert?.(action);
      break;
    }
    case "TRIGGER_CAMERA": {
      await callbacks.onTriggerCamera?.(action);
      break;
    }
    case "SAFETY_LOG": {
      await callbacks.onSafetyLog?.(action);
      break;
    }
    case "CREATE_QUOTE": {
      await callbacks.onCreateQuote?.(action);
      break;
    }
  }
  console.log("[voiceExecutor] runSingleAction done:", action.type);
}
