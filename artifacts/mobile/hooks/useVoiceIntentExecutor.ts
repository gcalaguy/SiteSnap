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
        const rawIntent = await interpretVoiceCommand(transcript, projectNames ?? []);
        const intent = withActiveProject(rawIntent, activeProject ?? null);
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
          console.log("[voiceExecutor] SINGLE_ACTION:", intent.action.type);
          setState("executing");
          await runSingleAction(intent.action, callbacks);
          console.log("[voiceExecutor] SINGLE_ACTION done");
          setState("done");
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
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
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          return;
        }
      } catch (err) {
        const msg = getAiErrorMessage(err, "Voice command failed. Please try again.");
        console.error("[voiceExecutor] error:", msg);
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
  }
  console.log("[voiceExecutor] runSingleAction done:", action.type);
}
