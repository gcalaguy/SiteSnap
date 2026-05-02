import { useState, useRef, useCallback } from "react";
import { Audio } from "expo-av";
import * as FileSystem from "expo-file-system";
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
  const recordingRef = useRef<Audio.Recording | null>(null);

  const startRecording = useCallback(async () => {
    setError(null);

    const { status } = await Audio.requestPermissionsAsync();
    if (status !== "granted") {
      setError("Microphone permission denied. Enable it in device settings.");
      return;
    }

    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
    });

    const { recording } = await Audio.Recording.createAsync(
      Audio.RecordingOptionsPresets.HIGH_QUALITY
    );

    recordingRef.current = recording;
    setState("recording");
  }, []);

  const stopAndTranscribe = useCallback(async () => {
    const recording = recordingRef.current;
    if (!recording) return;

    setState("transcribing");

    try {
      await recording.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });

      const uri = recording.getURI();
      recordingRef.current = null;

      if (!uri) throw new Error("No recording URI");

      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const res = await customFetch("/api/ai/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audio: base64 }),
      });

      if (!res.ok) throw new Error(`Server error ${res.status}`);

      const json = await res.json() as { text?: string };
      if (json.text?.trim()) {
        onTranscript(json.text.trim());
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Transcription failed";
      setError(msg);
    } finally {
      setState("idle");
    }
  }, [onTranscript]);

  const toggle = useCallback(async () => {
    if (state === "idle") {
      await startRecording();
    } else if (state === "recording") {
      await stopAndTranscribe();
    }
  }, [state, startRecording, stopAndTranscribe]);

  return { state, error, toggle };
}
