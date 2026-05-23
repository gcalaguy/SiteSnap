import { useState, useCallback, useRef } from "react";
import {
  useAudioRecorder,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
} from "expo-audio";
import { customFetch } from "@workspace/api-client-react";
import { getAiErrorMessage } from "@/src/utils/aiError";
import { withAiRetry } from "@/src/utils/aiRetry";

export type VoiceState = "idle" | "recording" | "transcribing" | "retrying" | "waiting";

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

  // Keep a stable ref to the latest callback so stopAndTranscribe never
  // needs to be recreated just because the parent re-rendered.
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;

  // Store the URI right after prepareToRecordAsync so it is always available
  // when we stop — some platforms clear recorder.uri synchronously on stop().
  const recordingUriRef = useRef<string | null>(null);

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);

  const startRecording = useCallback(async () => {
    setError(null);
    recordingUriRef.current = null;
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
      // Capture URI immediately after prepare — it is set here and may be
      // cleared on the native side once stop() is called.
      recordingUriRef.current = recorder.uri;
      console.log("[voiceRecorder] recording started, uri:", recordingUriRef.current);
      setState("recording");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not start recording";
      console.error("[voiceRecorder] startRecording error:", msg);
      setError(msg);
    }
  }, [recorder]);

  // stopAndTranscribe only depends on recorder (stable) — onTranscript is
  // accessed via ref so this callback is never recreated on every parent render.
  const stopAndTranscribe = useCallback(async () => {
    setState("transcribing");
    console.log("[voiceRecorder] stopAndTranscribe called");

    try {
      // Read the URI we saved before recording — do this BEFORE stop() because
      // the native AudioRecorder can clear recorder.uri on stop().
      const uri = recordingUriRef.current ?? recorder.uri;
      console.log("[voiceRecorder] uri before stop:", uri);

      await recorder.stop();

      // Belt-and-suspenders: also check after stop in case the platform sets
      // it post-finalization (Android behaviour on some versions).
      const finalUri = uri ?? recorder.uri;
      console.log("[voiceRecorder] stopped, finalUri:", finalUri);
      if (!finalUri) throw new Error("No recording captured");

      // Use multipart FormData — consistent with the proven Expo Go upload
      // pattern used in DocumentsTab; avoids reading the whole file into a
      // base64 string which can fail for large audio buffers in Expo Go.
      const formData = new FormData();
      formData.append("file", {
        uri: finalUri,
        type: "audio/m4a",
        name: "recording.m4a",
      } as unknown as Blob);

      console.log("[voiceRecorder] sending to /api/ai/transcribe");
      const result = await withAiRetry(
        () =>
          customFetch<{ text?: string }>("/api/ai/transcribe", {
            method: "POST",
            body: formData,
          }),
        () => setState("retrying"),
        () => setState("waiting"),
      );
      console.log("[voiceRecorder] transcribe result:", result);

      const transcript = result.text?.trim() ?? "";
      if (!transcript) {
        setError("No speech detected. Try speaking closer to the microphone.");
      }
      // Always call the callback so the executor can surface feedback instead
      // of leaving the sheet stuck on "Working on it…"
      onTranscriptRef.current(transcript);
    } catch (err) {
      const msg = getAiErrorMessage(err, "Transcription failed. Please try again.");
      console.error("[voiceRecorder] transcribe error:", msg);
      setError(msg);
      onTranscriptRef.current("");
    } finally {
      setState("idle");
    }
  }, [recorder]);

  const toggle = useCallback(async () => {
    if (state === "idle") {
      await startRecording();
    } else if (state === "recording") {
      await stopAndTranscribe();
    }
  }, [state, startRecording, stopAndTranscribe]);

  return { state, error, toggle };
}
