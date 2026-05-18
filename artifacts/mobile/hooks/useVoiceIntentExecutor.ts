import { useCallback, useState } from "react";
import { Alert } from "react-native";
import * as Haptics from "expo-haptics";
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
  execute: (transcript: string, activeProject?: string | null) => Promise<void>;
  reset: () => void;
}

/**
 * Execute a parsed voice intent by firing screen-level callbacks.
 *
 * Usage in a screen component:
 *
 *   const { execute } = useVoiceIntentExecutor({
 *     onLogHours: ({ worker, hours, project }) => { ... },
 *     onAddDailyLog: ({ notes, project }) => { ... },
 *     onMaterialAlert: ({ item, project }) => { ... },
 *     onTriggerCamera: ({ context }) => { ... },
 *     onSafetyLog: ({ project, issue }) => { ... },
 *     onNavigate: (target) => router.push(target),
 *     onAddNote: (payload) => setNotes((p) => (p ? p + " " + payload : payload)),
 *   });
 *
 *   const voice = useVoiceRecorder((text) => execute(text, activeProjectName));
 */
export interface ExecutorCallbacks {
  onLogHours?: (action: Extract<SingleAction, { type: "LOG_HOURS" }>) => Promise<void> | void;
  onAddDailyLog?: (action: Extract<SingleAction, { type: "ADD_DAILY_LOG" }>) => Promise<void> | void;
  onMaterialAlert?: (action: Extract<SingleAction, { type: "MATERIAL_ALERT" }>) => Promise<void> | void;
  onTriggerCamera?: (action: Extract<SingleAction, { type: "TRIGGER_CAMERA" }>) => Promise<void> | void;
  onSafetyLog?: (action: Extract<SingleAction, { type: "SAFETY_LOG" }>) => Promise<void> | void;
  onNavigate?: (target: "Calculators" | "Schedule" | "Projects" | "Ask") => void;
  onAddNote?: (payload: string) => void;
  onUnknown?: (transcript: string) => void;
}

export function useVoiceIntentExecutor(
  callbacks: ExecutorCallbacks
): UseVoiceIntentExecutorReturn {
  const [state, setState] = useState<ExecutorState>("idle");
  const [lastIntent, setLastIntent] = useState<VoiceIntent | null>(null);

  const execute = useCallback(
    async (transcript: string, activeProject?: string | null) => {
      setState("parsing");
      setLastIntent(null);

      try {
        const rawIntent = interpretVoiceCommand(transcript);
        const intent = withActiveProject(rawIntent, activeProject ?? null);
        setLastIntent(intent);

        if (intent.intent === "UNKNOWN") {
          setState("error");
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          callbacks.onUnknown?.(intent.transcript);
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
    case "ADD_DAILY_LOG": {
      await callbacks.onAddDailyLog?.(action);
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
