/**
 * Per-project compliance analysis debouncer.
 *
 * Calls to scheduleComplianceAnalysis() for the same projectId within the
 * 15-minute window are collapsed: the timer resets and only one analysis
 * fires at the end of the quiet period.
 */

const DEBOUNCE_MS = 15 * 60 * 1000; // 15 minutes

type AnalysisCallback = () => Promise<void>;

interface PendingEntry {
  timer: ReturnType<typeof setTimeout>;
  callback: AnalysisCallback;
}

const pending = new Map<number, PendingEntry>();

/**
 * Schedule a compliance analysis for a project, debounced by 15 minutes.
 * Each new call for the same projectId resets the timer.
 *
 * @param projectId  - the project to analyse
 * @param callback   - async function that performs the actual analysis
 */
export function scheduleComplianceAnalysis(
  projectId: number,
  callback: AnalysisCallback,
): void {
  const existing = pending.get(projectId);
  if (existing) {
    clearTimeout(existing.timer);
  }

  const timer = setTimeout(async () => {
    pending.delete(projectId);
    try {
      await callback();
    } catch {
      // Errors in background compliance analysis must never surface to callers.
    }
  }, DEBOUNCE_MS);

  pending.set(projectId, { timer, callback });
}

/**
 * Cancel any pending debounced analysis for a project.
 * Useful for cleanup in tests or when a project is archived.
 */
export function cancelComplianceAnalysis(projectId: number): void {
  const existing = pending.get(projectId);
  if (existing) {
    clearTimeout(existing.timer);
    pending.delete(projectId);
  }
}
