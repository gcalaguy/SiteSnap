import { useState, useRef, useEffect, useCallback } from "react";
import { Mic, Square, Play, Pause, Trash2, Upload, Loader2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { customFetch } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";

interface VoiceRecorderProps {
  existingUrl?: string | null;
  existingDuration?: number | null;
  onSaved: (objectPath: string, url: string, duration: number) => void;
  onDeleted: () => void;
}

type RecorderState = "idle" | "recording" | "recorded" | "uploading" | "saved";

function formatSeconds(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

// Animated waveform bars during recording
function WaveformBars({ active }: { active: boolean }) {
  const bars = 24;
  return (
    <div className="flex items-center gap-0.5 h-10">
      {Array.from({ length: bars }).map((_, i) => (
        <div
          key={i}
          className={`rounded-full transition-all ${active ? "bg-primary" : "bg-muted-foreground/30"}`}
          style={{
            width: 3,
            height: active
              ? `${20 + Math.random() * 60}%`
              : "20%",
            animation: active ? `wave ${0.5 + (i % 5) * 0.15}s ease-in-out infinite alternate` : "none",
            animationDelay: `${(i % 7) * 0.07}s`,
          }}
        />
      ))}
      <style>{`
        @keyframes wave {
          0% { height: 20%; }
          100% { height: 90%; }
        }
      `}</style>
    </div>
  );
}

// Static waveform drawn from analysed audio data
function StaticWaveform({ data }: { data: number[] }) {
  if (!data.length) return null;
  const step = Math.max(1, Math.floor(data.length / 60));
  const samples = Array.from({ length: 60 }, (_, i) => data[i * step] ?? 0);
  const max = Math.max(...samples, 1);

  return (
    <div className="flex items-center gap-0.5 h-10">
      {samples.map((v, i) => (
        <div
          key={i}
          className="rounded-full bg-primary/70"
          style={{ width: 3, height: `${Math.max(8, (v / max) * 100)}%` }}
        />
      ))}
    </div>
  );
}

export function VoiceRecorder({ existingUrl, existingDuration, onSaved, onDeleted }: VoiceRecorderProps) {
  const { toast } = useToast();
  const [state, setState] = useState<RecorderState>(existingUrl ? "saved" : "idle");
  const [elapsed, setElapsed] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [waveData, setWaveData] = useState<number[]>([]);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioBlobRef = useRef<Blob | null>(null);
  const audioUrlRef = useRef<string | null>(existingUrl ?? null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const durationRef = useRef<number>(existingDuration ?? 0);

  // Live waveform animation during recording
  const drawWaveform = useCallback(() => {
    if (!analyserRef.current) return;
    const data = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(data);
    setWaveData(Array.from(data).slice(0, 80));
    animFrameRef.current = requestAnimationFrame(drawWaveform);
  }, []);

  const stopWaveform = () => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    animFrameRef.current = null;
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Set up analyser for waveform
      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "audio/ogg";

      const mr = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mr;
      audioChunksRef.current = [];
      setElapsed(0);
      setState("recording");
      drawWaveform();

      mr.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        stopWaveform();
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        audioBlobRef.current = blob;
        const url = URL.createObjectURL(blob);
        audioUrlRef.current = url;
        setState("recorded");
      };

      mr.start(100);
      timerRef.current = setInterval(() => {
        setElapsed((e) => {
          const next = e + 1;
          durationRef.current = next;
          if (next >= 120) stopRecording(); // 2-min cap
          return next;
        });
      }, 1000);
    } catch {
      toast({ title: "Microphone access denied", description: "Please allow microphone access in your browser.", variant: "destructive" });
    }
  };

  const stopRecording = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    mediaRecorderRef.current?.stop();
  };

  const togglePlayback = () => {
    if (!audioUrlRef.current) return;
    if (!audioElRef.current) {
      audioElRef.current = new Audio(audioUrlRef.current);
      audioElRef.current.onended = () => setIsPlaying(false);
    }
    if (isPlaying) {
      audioElRef.current.pause();
      setIsPlaying(false);
    } else {
      audioElRef.current.src = audioUrlRef.current;
      audioElRef.current.play();
      setIsPlaying(true);
    }
  };

  const discard = () => {
    if (audioElRef.current) { audioElRef.current.pause(); audioElRef.current = null; }
    audioBlobRef.current = null;
    audioUrlRef.current = null;
    setElapsed(0);
    setIsPlaying(false);
    setState("idle");
  };

  const uploadAndSave = async () => {
    if (!audioBlobRef.current) return;
    setState("uploading");
    try {
      // 1. Request presigned URL
      const { uploadURL, objectPath } = await customFetch("/api/storage/uploads/request-url", {
        method: "POST",
        body: JSON.stringify({ name: "voice-intro.webm", size: audioBlobRef.current.size, contentType: audioBlobRef.current.type }),
      }) as { uploadURL: string; objectPath: string };

      // 2. PUT blob directly to storage
      const putRes = await fetch(uploadURL, {
        method: "PUT",
        headers: { "Content-Type": audioBlobRef.current.type },
        body: audioBlobRef.current,
      });
      if (!putRes.ok) throw new Error("Upload failed");

      // 3. Save objectPath to profile
      const profile = await customFetch("/api/tradehub/profile/voice", {
        method: "PUT",
        body: JSON.stringify({ objectPath, duration: durationRef.current }),
      }) as any;

      audioUrlRef.current = profile.voiceIntroUrl;
      setState("saved");
      onSaved(objectPath, profile.voiceIntroUrl, durationRef.current);
      toast({ title: "Voice intro saved!" });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err?.message, variant: "destructive" });
      setState("recorded");
    }
  };

  const deleteVoice = async () => {
    try {
      await customFetch("/api/tradehub/profile/voice", { method: "DELETE" });
      if (audioElRef.current) { audioElRef.current.pause(); audioElRef.current = null; }
      audioUrlRef.current = null;
      audioBlobRef.current = null;
      durationRef.current = 0;
      setElapsed(0);
      setIsPlaying(false);
      setState("idle");
      onDeleted();
      toast({ title: "Voice intro removed" });
    } catch {
      toast({ title: "Error", description: "Failed to remove voice intro", variant: "destructive" });
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      stopWaveform();
      if (audioElRef.current) audioElRef.current.pause();
    };
  }, []);

  // ── Render ─────────────────────────────────────────────────────────────────

  if (state === "idle") {
    return (
      <div className="border-2 border-dashed border-border rounded-2xl p-5 flex flex-col items-center gap-3 text-center">
        <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
          <Mic className="h-6 w-6 text-primary" />
        </div>
        <div>
          <p className="font-medium text-sm">Add a Voice Intro</p>
          <p className="text-xs text-muted-foreground mt-0.5">Record a short clip about yourself (max 2 min)</p>
        </div>
        <Button onClick={startRecording} className="gap-2">
          <Mic className="h-4 w-4" />Start Recording
        </Button>
      </div>
    );
  }

  if (state === "recording") {
    return (
      <div className="border-2 border-primary/40 rounded-2xl p-5 flex flex-col items-center gap-3 bg-primary/5">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
          <span className="text-sm font-mono font-semibold text-foreground">{formatSeconds(elapsed)}</span>
          <span className="text-xs text-muted-foreground">/ 2:00 max</span>
        </div>
        <WaveformBars active={true} />
        <Button onClick={stopRecording} variant="destructive" className="gap-2">
          <Square className="h-4 w-4 fill-current" />Stop Recording
        </Button>
      </div>
    );
  }

  if (state === "recorded") {
    return (
      <div className="border rounded-2xl p-5 space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-medium">Recording ready</span>
          <span className="text-xs text-muted-foreground ml-auto">{formatSeconds(durationRef.current)}</span>
        </div>
        <div className="flex items-center gap-3 bg-muted/40 rounded-xl px-3 py-2">
          <button onClick={togglePlayback} className="w-8 h-8 rounded-full bg-primary flex items-center justify-center flex-shrink-0 hover:bg-primary/90 transition-colors">
            {isPlaying ? <Pause className="h-4 w-4 text-white" /> : <Play className="h-4 w-4 text-white ml-0.5" />}
          </button>
          <div className="flex-1">
            <StaticWaveform data={waveData} />
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={discard} className="gap-1.5">
            <Trash2 className="h-3.5 w-3.5" />Discard
          </Button>
          <Button size="sm" onClick={uploadAndSave} className="gap-1.5 flex-1">
            <Upload className="h-3.5 w-3.5" />Save to Profile
          </Button>
        </div>
      </div>
    );
  }

  if (state === "uploading") {
    return (
      <div className="border rounded-2xl p-5 flex items-center justify-center gap-3 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
        <span className="text-sm">Uploading voice intro…</span>
      </div>
    );
  }

  // "saved" state — show playback + re-record/delete
  return (
    <div className="border rounded-2xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <CheckCircle2 className="h-4 w-4 text-green-600" />
        <span className="text-sm font-medium">Voice Intro</span>
        {existingDuration && (
          <span className="text-xs text-muted-foreground ml-auto">{formatSeconds(existingDuration)}</span>
        )}
      </div>
      <div className="flex items-center gap-3 bg-muted/40 rounded-xl px-3 py-2">
        <button
          onClick={togglePlayback}
          className="w-8 h-8 rounded-full bg-primary flex items-center justify-center flex-shrink-0 hover:bg-primary/90 transition-colors"
        >
          {isPlaying ? <Pause className="h-4 w-4 text-white" /> : <Play className="h-4 w-4 text-white ml-0.5" />}
        </button>
        <div className="flex-1 h-8 flex items-center">
          <div className="w-full h-1.5 bg-primary/20 rounded-full relative overflow-hidden">
            <div className={`h-full bg-primary rounded-full transition-all ${isPlaying ? "animate-pulse" : ""}`} style={{ width: "100%" }} />
          </div>
        </div>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" className="gap-1.5 text-destructive hover:text-destructive" onClick={deleteVoice}>
          <Trash2 className="h-3.5 w-3.5" />Remove
        </Button>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={discard}>
          <Mic className="h-3.5 w-3.5" />Re-record
        </Button>
      </div>
    </div>
  );
}

// ── Read-only player for viewing someone else's profile ───────────────────────
export function VoicePlayer({ url, duration, name }: { url: string; duration?: number | null; name?: string }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const [progress, setProgress] = useState(0);

  const toggle = () => {
    if (!audioElRef.current) {
      audioElRef.current = new Audio(url);
      audioElRef.current.onended = () => { setIsPlaying(false); setProgress(0); };
      audioElRef.current.ontimeupdate = () => {
        const el = audioElRef.current;
        if (el && el.duration) setProgress(el.currentTime / el.duration);
      };
    }
    if (isPlaying) {
      audioElRef.current.pause();
      setIsPlaying(false);
    } else {
      audioElRef.current.play();
      setIsPlaying(true);
    }
  };

  useEffect(() => () => { audioElRef.current?.pause(); }, []);

  return (
    <div className="flex items-center gap-3 bg-primary/5 border border-primary/15 rounded-xl px-4 py-3">
      <button
        onClick={toggle}
        className="w-9 h-9 rounded-full bg-primary flex items-center justify-center flex-shrink-0 hover:bg-primary/90 transition-colors shadow-sm"
      >
        {isPlaying ? <Pause className="h-4 w-4 text-white" /> : <Play className="h-4 w-4 text-white ml-0.5" />}
      </button>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-foreground mb-1.5">{name ? `${name}'s voice intro` : "Voice Intro"}</p>
        <div className="w-full h-1.5 bg-primary/20 rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      </div>
      {duration && (
        <span className="text-xs text-muted-foreground flex-shrink-0">{formatSeconds(duration)}</span>
      )}
    </div>
  );
}
