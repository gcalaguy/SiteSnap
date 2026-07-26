import { useState, useCallback, useRef } from "react";
import { Alert, Linking } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import {
  useAudioRecorder,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
} from "expo-audio";
import { customFetch } from "@workspace/api-client-react";

export type RecorderState = "idle" | "recording" | "uploading";

export interface VoiceInspectionUpload {
  objectPath: string;
  durationSeconds: number;
}

export interface UseVoiceInspectionRecorderReturn {
  state: RecorderState;
  error: string | null;
  start: () => Promise<void>;
  stopAndUpload: () => Promise<VoiceInspectionUpload | null>;
}

const AUDIO_CONTENT_TYPE = "audio/mp4"; // RecordingPresets.HIGH_QUALITY records .m4a (mp4 container)

export function useVoiceInspectionRecorder(): UseVoiceInspectionRecorderReturn {
  const [state, setState] = useState<RecorderState>("idle");
  const [error, setError] = useState<string | null>(null);

  const recordingUriRef = useRef<string | null>(null);
  const recordingStartedAtRef = useRef<number>(0);

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);

  const start = useCallback(async () => {
    setError(null);
    recordingUriRef.current = null;

    const { granted } = await requestRecordingPermissionsAsync();
    if (!granted) {
      setError("Microphone permission denied. Enable it in device settings.");
      Alert.alert(
        "Microphone Access Required",
        "Site Snap needs microphone access to record voice inspections. Enable it in Settings.",
        [
          { text: "Not Now", style: "cancel" },
          { text: "Open Settings", onPress: () => void Linking.openSettings() },
        ],
      );
      return;
    }

    try {
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      recordingUriRef.current = recorder.uri;
      recordingStartedAtRef.current = Date.now();
      setState("recording");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start recording");
    }
  }, [recorder]);

  const stopAndUpload = useCallback(async (): Promise<VoiceInspectionUpload | null> => {
    setState("uploading");
    try {
      const uri = recordingUriRef.current ?? recorder.uri;
      await recorder.stop();
      const finalUri = uri ?? recorder.uri;
      if (!finalUri) throw new Error("No recording captured");

      const durationSeconds = Math.max(1, Math.round((Date.now() - recordingStartedAtRef.current) / 1000));

      const info = await FileSystem.getInfoAsync(finalUri);
      const size = info.exists ? info.size : 0;

      const { uploadURL, objectPath } = await customFetch<{ uploadURL: string; objectPath: string }>(
        "/api/storage/uploads/request-url",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: `voice-inspection-${Date.now()}.m4a`, size, contentType: AUDIO_CONTENT_TYPE }),
        },
      );

      const dest = new URL(uploadURL);
      if (!dest.protocol.startsWith("https")) throw new Error("Unexpected upload destination");

      const result = await FileSystem.uploadAsync(uploadURL, finalUri, {
        httpMethod: "PUT",
        uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
        headers: { "Content-Type": AUDIO_CONTENT_TYPE },
      });
      if (result.status < 200 || result.status >= 300) throw new Error(`Upload failed: ${result.status}`);

      return { objectPath, durationSeconds };
    } catch (err) {
      setError(err instanceof Error ? err.message : "Recording upload failed. Please try again.");
      return null;
    } finally {
      setState("idle");
    }
  }, [recorder]);

  return { state, error, start, stopAndUpload };
}
