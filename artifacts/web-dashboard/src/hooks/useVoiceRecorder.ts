import { useState, useRef, useCallback } from "react";

type RecorderState = "idle" | "recording" | "transcribing" | "error";

export function useVoiceRecorder(onTranscript: (text: string) => void) {
  const [state, setState] = useState<RecorderState>("idle");
  const [error, setError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const start = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : "audio/ogg";

      const mr = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: mimeType });
        if (blob.size < 1000) {
          setState("idle");
          return;
        }
        setState("transcribing");
        try {
          const arrayBuffer = await blob.arrayBuffer();
          const base64 = btoa(
            String.fromCharCode(...new Uint8Array(arrayBuffer)),
          );
          const format = mimeType.includes("webm") ? "webm" : "ogg";
          const res = await fetch("/api/ai/transcribe", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ audio: base64, format }),
          });
          if (!res.ok) throw new Error("Transcription request failed");
          const data = (await res.json()) as { text: string };
          onTranscript(data.text);
          setState("idle");
        } catch (err) {
          setError("Transcription failed. Please try again.");
          setState("error");
        }
      };
      mr.start(200);
      mediaRecorderRef.current = mr;
      setState("recording");
    } catch {
      setError("Microphone access denied or not available.");
      setState("error");
    }
  }, [onTranscript]);

  const stop = useCallback(() => {
    mediaRecorderRef.current?.stop();
    mediaRecorderRef.current = null;
  }, []);

  const toggle = useCallback(() => {
    if (state === "recording") stop();
    else if (state === "idle" || state === "error") start();
  }, [state, start, stop]);

  return { state, error, toggle };
}
