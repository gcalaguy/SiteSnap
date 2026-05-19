import { useState, useCallback } from "react";
import {
  useAudioRecorder,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
} from "expo-audio";
import * as FileSystem from "expo-file-system/legacy";
import { customFetch } from "@workspace/api-client-react";

export type VoiceState = "idle" | "recording" | "transcribing";

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

    const { granted } = await requestRecordingPermissionsAsync();
    if (!granted) {
      setError("Microphone permission denied. Enable it in device settings.");
      return;
    }

    try {
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setState("recording");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not start recording";
      setError(msg);
    }
  }, [recorder]);

  const stopAndTranscribe = useCallback(async () => {
    setState("transcribing");

    try {
      await recorder.stop();
      const uri = recorder.uri;
      if (!uri) throw new Error("No recording captured");

      // Read audio file as base64
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: "base64",
      });

      // customFetch returns the parsed JSON body directly (not a Response).
      // It throws an ApiError on non-2xx responses.
      const result = await customFetch<{ text?: string }>("/api/ai/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audio: base64, format: "m4a" }),
      });

      const transcript = result.text?.trim() ?? "";
      if (!transcript) {
        setError("No speech detected. Try speaking closer to the microphone.");
      }
      // Always call onTranscript so the executor can handle empty strings
      // and surface feedback instead of leaving the sheet stuck on "Working on it…"
      onTranscript(transcript);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Transcription failed";
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
