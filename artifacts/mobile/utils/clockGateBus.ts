// Lets a gated sub-flow (PSI sign-off, Daily Report submit) resume the
// clock-in/out action on ClockWidget after navigating back to Home, instead
// of ClockWidget re-deriving "was the gate just satisfied?" from route
// params across multiple pushed screens. Mirrors utils/voiceFabBus.ts.
type ClockInHandler = (projectId: number) => void;
type ClockOutHandler = (sessionId: number) => void;

let clockInHandler: ClockInHandler | null = null;
let clockOutHandler: ClockOutHandler | null = null;

export function setClockInGateHandler(fn: ClockInHandler | null) {
  clockInHandler = fn;
}

export function resolveClockInGate(projectId: number) {
  clockInHandler?.(projectId);
}

export function setClockOutGateHandler(fn: ClockOutHandler | null) {
  clockOutHandler = fn;
}

export function resolveClockOutGate(sessionId: number) {
  clockOutHandler?.(sessionId);
}
