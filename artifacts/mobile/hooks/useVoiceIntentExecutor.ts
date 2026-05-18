import { useCallback, useState } from "react";
import { Alert } from "react-native";
import * as Haptics from "expo-haptics";
import { customFetch } from "@workspace/api-client-react";
import {
  interpretVoiceCommand,
  withActiveProject,
  type VoiceIntent,
  type SingleAction,
} from "@/src/utils/voiceRouter";

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
  onNavigate?: (target: string) => void;
  onAddNote?: (payload: string) => void;
  onUnknown?: (transcript: string) => void;
}

type LLMResult = {
  intent: string;
  project?: string | null;
  notes?: string;
  hours?: number;
  worker?: string;
  taskName?: string;
  reason?: string;
  amount?: number;
  description?: string;
  vendor?: string | null;
  subject?: string;
  item?: string;
  target?: string;
};

async function classifyWithLLM(
  transcript: string,
  projectNames: string[],
): Promise<VoiceIntent> {
  try {
    const result = await customFetch<LLMResult>("/api/ai/voice-classify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transcript, projectNames }),
    });

    const project = result.project ?? null;

    switch (result.intent) {
      case "ADD_DAILY_LOG":
        return {
          intent: "SINGLE_ACTION",
          action: {
            type: "ADD_DAILY_LOG",
            project,
            notes: result.notes || "Update logged via voice",
          },
          confidence: "low",
        };
      case "LOG_HOURS":
        if (result.worker && result.hours != null) {
          return {
            intent: "SINGLE_ACTION",
            action: { type: "LOG_HOURS", worker: result.worker, hours: result.hours, project },
            confidence: "low",
          };
        }
        break;
      case "LOG_OWN_HOURS":
        if (result.hours != null) {
          return {
            intent: "SINGLE_ACTION",
            action: { type: "LOG_OWN_HOURS", hours: result.hours, project },
            confidence: "low",
          };
        }
        break;
      case "MARK_TASK_DONE":
        if (result.taskName) {
          return {
            intent: "SINGLE_ACTION",
            action: { type: "MARK_TASK_DONE", taskName: result.taskName, project },
            confidence: "low",
          };
        }
        break;
      case "LOG_DELAY":
        if (result.hours != null && result.reason) {
          return {
            intent: "SINGLE_ACTION",
            action: { type: "LOG_DELAY", hours: result.hours, reason: result.reason, project },
            confidence: "low",
          };
        }
        break;
      case "LOG_EXPENSE":
        if (result.amount != null && result.description) {
          return {
            intent: "SINGLE_ACTION",
            action: {
              type: "LOG_EXPENSE",
              amount: result.amount,
              description: result.description,
              vendor: result.vendor ?? null,
              project,
            },
            confidence: "low",
          };
        }
        break;
      case "CREATE_RFI":
        if (result.subject) {
          return {
            intent: "SINGLE_ACTION",
            action: { type: "CREATE_RFI", subject: result.subject, project },
            confidence: "low",
          };
        }
        break;
      case "MATERIAL_ALERT":
        if (result.item) {
          return {
            intent: "SINGLE_ACTION",
            action: { type: "MATERIAL_ALERT", item: result.item, project },
            confidence: "low",
          };
        }
        break;
      case "NAVIGATE":
        if (result.target) {
          return {
            intent: "NAVIGATE",
            target: result.target as VoiceIntent extends { intent: "NAVIGATE"; target: infer T } ? T : string,
            confidence: "low",
          };
        }
        break;
    }
  } catch {
    // Network or parse error — fall through to UNKNOWN
  }

  return { intent: "UNKNOWN", transcript, confidence: "low" };
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

      try {
        const rawIntent = interpretVoiceCommand(transcript);

        // LLM fallback: if regex couldn't classify, ask the AI
        const resolvedRaw =
          rawIntent.intent === "UNKNOWN"
            ? await classifyWithLLM(transcript, projectNames ?? [])
            : rawIntent;

        const intent = withActiveProject(resolvedRaw, activeProject ?? null);
        setLastIntent(intent);

        if (intent.intent === "UNKNOWN") {
          setState("error");
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          callbacks.onUnknown?.(transcript);
          return;
        }

        if (intent.intent === "NAVIGATE") {
          setState("done");
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          callbacks.onNavigate?.(intent.target);
          return;
        }

        if (intent.intent === "DATA_ENTRY") {
          setState("done");
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          callbacks.onAddNote?.(intent.payload);
          return;
        }

        if (intent.intent === "SINGLE_ACTION") {
          setState("executing");
          await runSingleAction(intent.action, callbacks);
          setState("done");
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          return;
        }

        if (intent.intent === "COMPOUND_ACTION") {
          setState("executing");
          for (const action of intent.actions) {
            await runSingleAction(action, callbacks);
          }
          setState("done");
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          return;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Voice command failed";
        setState("error");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
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

async function runSingleAction(
  action: SingleAction,
  callbacks: ExecutorCallbacks
): Promise<void> {
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
  }
}
