import { useVoiceRecorder } from "@/hooks/useVoiceRecorder";
import { Button } from "@/components/ui/button";
import { Mic, MicOff, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface VoiceNoteButtonProps {
  onTranscript: (text: string) => void;
  disabled?: boolean;
  className?: string;
  size?: "sm" | "default" | "icon";
}

export function VoiceNoteButton({ onTranscript, disabled, className, size = "icon" }: VoiceNoteButtonProps) {
  const voice = useVoiceRecorder(onTranscript);

  const isRecording = voice.state === "recording";
  const isTranscribing = voice.state === "transcribing";

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant={isRecording ? "destructive" : "outline"}
            size={size}
            onClick={voice.toggle}
            disabled={disabled || isTranscribing}
            className={cn(
              "shrink-0 transition-all",
              isRecording && "animate-pulse ring-2 ring-destructive ring-offset-1",
              className
            )}
            aria-label={isRecording ? "Stop recording" : isTranscribing ? "Transcribing…" : "Record voice note"}
          >
            {isTranscribing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : isRecording ? (
              <MicOff className="h-4 w-4" />
            ) : (
              <Mic className="h-4 w-4" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top">
          {isRecording ? "Tap to stop & transcribe" : isTranscribing ? "Transcribing…" : "Record voice note (Whisper AI)"}
          {voice.error && <p className="text-destructive text-xs mt-0.5">{voice.error}</p>}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
