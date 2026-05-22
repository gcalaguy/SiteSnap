import { useState, useCallback } from "react";
import {
  useAudioRecorder,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
} from "expo-audio";
import * as FileSystem from "expo-file-system/legacy";
import { customFetch } from "@workspace/api-client-react";
import { getAiErrorMessage } from "@/src/utils/aiError";
import { withAiRetry } from "@/src/utils/aiRetry";

export type VoiceState = "idle" | "recording" | "transcribing" | "retrying";

export interface UseVoiceRecorderReturn {
  state: VoiceState;
  error: string | null;
  toggle: () => Promise<void>;
}

export function useVoiceRecorder(
  onTranscript: (text: string) => void
): UseVoiceRecorderReturn {
  const [state, setState] = useState<VoiceState>("idle");
  const [error, setError] = useState<string | null>(null);

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);

  const startRecording = useCallback(async () => {
    setError(null);
    console.log("[voiceRecorder] startRecording called");

    const { granted } = await requestRecordingPermissionsAsync();
    console.log("[voiceRecorder] permission granted:", granted);
    if (!granted) {
      setError("Microphone permission denied. Enable it in device settings.");
      return;
    }

    try {
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      console.log("[voiceRecorder] recording started, uri:", recorder.uri);
      setState("recording");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not start recording";
      console.error("[voiceRecorder] startRecording error:", msg);
      setError(msg);
    }
  }, [recorder]);

  const stopAndTranscribe = useCallback(async () => {
    setState("transcribing");
    console.log("[voiceRecorder] stopAndTranscribe called");

    try {
      await recorder.stop();
      const uri = recorder.uri;
      console.log("[voiceRecorder] stopped, uri:", uri);
      if (!uri) throw new Error("No recording captured");

      // Read audio file as base64
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: "base64",
      });
      console.log("[voiceRecorder] base64 length:", base64.length);

      // customFetch returns the parsed JSON body directly (not a Response).
      // It throws an ApiError on non-2xx responses.
      console.log("[voiceRecorder] sending to /api/ai/transcribe");
      const result = await withAiRetry(
        () =>
          customFetch<{ text?: string }>("/api/ai/transcribe", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ audio: base64, format: "m4a" }),
          }),
        () => setState("retrying"),
      );
      console.log("[voiceRecorder] transcribe result:", result);

      const transcript = result.text?.trim() ?? "";
      if (!transcript) {
        setError("No speech detected. Try speaking closer to the microphone.");
      }
      // Always call onTranscript so the executor can handle empty strings
      // and surface feedback instead of leaving the sheet stuck on "Working on it…"
      onTranscript(transcript);
    } catch (err) {
      const msg = getAiErrorMessage(err, "Transcription failed. Please try again.");
      console.error("[voiceRecorder] transcribe error:", msg);
      setError(msg);
      // Notify upstream so the FAB can show the error instead of hanging
      onTranscript("");
    } finally {
      setState("idle");
    }
  }, [recorder, onTranscript]);

  const toggle = useCallback(async () => {
    if (state === "idle") {
      await startRecording();
    } else if (state === "recording") {
      await stopAndTranscribe();
    }
  }, [state, startRecording, stopAndTranscribe]);

  return { state, error, toggle };
}
