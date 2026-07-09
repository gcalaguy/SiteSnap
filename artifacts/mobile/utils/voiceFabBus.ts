// Lets other screens (Capture tab, Home's voice button) trigger the same
// global voice-command flow as the floating action button in
// components/GlobalVoiceCommandFAB.tsx, instead of re-implementing
// recording/transcription/intent-routing a second time.
type Handler = () => void;

let handler: Handler | null = null;

export function setVoiceFabHandler(fn: Handler | null) {
  handler = fn;
}

export function triggerVoiceFab() {
  handler?.();
}
