/**
 * Per-project compliance analysis debouncer.
 *
 * Calls to scheduleComplianceAnalysis() for the same projectId within the
 * 15-minute window are collapsed: the timer resets and only one analysis
 * fires at the end of the quiet period.
 *
 * Backed by the `pending_compliance_analyses` table (migration 0052) instead
 * of an in-memory Map — a setTimeout-based in-memory debounce only works
 * within a single process, so behind a load balancer, requests for the same
 * project landing on different instances would each keep their own timer and
 * could fire the analysis multiple times instead of collapsing to one. With
 * the schedule stored in Postgres, every instance shares one row per project,
 * and `SELECT ... FOR UPDATE SKIP LOCKED` in claimAndRunReady() guarantees
 * exactly one instance actually runs the callback even though all instances
 * poll the same table.
 *
 * Because a debounce timer just needs to elapse (not be pushed to), a poll
 * loop is the correct primitive here — Postgres has no "notify me when this
 * timestamp arrives" mechanism. LISTEN/NOTIFY is layered on top purely as a
 * latency optimization: schedule/cancel calls notify so any instance's poll
 * fires immediately instead of waiting out the interval. It's best-effort —
 * if the LISTEN connection drops, the poll loop alone still guarantees
 * correctness, just with coarser (POLL_INTERVAL_MS) latency.
 */

import type { PoolClient } from "pg";
import { pool } from "@workspace/db";
import { logger } from "../../lib/logger";

const DEBOUNCE_MS = 15 * 60 * 1000; // 15 minutes
const POLL_INTERVAL_MS = 30_000;
const NOTIFY_CHANNEL = "compliance_debounce_wake";

type AnalysisHandler = (projectId: number) => Promise<void>;

// A handler must be a fixed function of projectId (not a closure captured at
// schedule() time) so that whichever instance's poller claims a ready row can
// run the same logic — the callback itself never crosses the DB boundary,
// only the (projectId, fire_at) schedule does.
let handler: AnalysisHandler | null = null;

export function registerComplianceAnalysisHandler(fn: AnalysisHandler): void {
  handler = fn;
}

/**
 * Schedule a compliance analysis for a project, debounced by 15 minutes.
 * Each new call for the same projectId pushes fire_at back out.
 */
export async function scheduleComplianceAnalysis(projectId: number): Promise<void> {
  await pool.query(
    `INSERT INTO pending_compliance_analyses (project_id, fire_at)
     VALUES ($1, now() + $2 * interval '1 millisecond')
     ON CONFLICT (project_id) DO UPDATE SET fire_at = excluded.fire_at`,
    [projectId, DEBOUNCE_MS],
  );
  await notifyWake();
}

/**
 * Cancel any pending debounced analysis for a project.
 * Useful for cleanup in tests or when a project is archived.
 */
export async function cancelComplianceAnalysis(projectId: number): Promise<void> {
  await pool.query(`DELETE FROM pending_compliance_analyses WHERE project_id = $1`, [projectId]);
  await notifyWake();
}

async function notifyWake(): Promise<void> {
  try {
    await pool.query(`SELECT pg_notify($1, '')`, [NOTIFY_CHANNEL]);
  } catch (err) {
    // Purely a latency optimization — the poll loop will catch up regardless.
    logger.warn({ err }, "compliance debouncer: notify failed");
  }
}

async function claimAndRunReady(): Promise<void> {
  if (!handler) return; // nothing registered — nothing to run yet

  const client = await pool.connect();
  let claimed: number[] = [];
  try {
    await client.query("BEGIN");
    const { rows } = await client.query<{ project_id: number }>(
      `SELECT project_id FROM pending_compliance_analyses
       WHERE fire_at <= now()
       FOR UPDATE SKIP LOCKED`,
    );
    claimed = rows.map((r) => r.project_id);
    if (claimed.length > 0) {
      await client.query(`DELETE FROM pending_compliance_analyses WHERE project_id = ANY($1::int[])`, [claimed]);
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    logger.error({ err }, "compliance debouncer: claim failed");
    return;
  } finally {
    client.release();
  }

  // Run handlers after releasing the row locks — a slow analysis shouldn't
  // hold the transaction (and its row locks) open.
  for (const projectId of claimed) {
    try {
      await handler(projectId);
    } catch (err) {
      logger.error({ err, projectId }, "compliance debouncer: analysis handler failed");
    }
  }
}

let pollTimer: ReturnType<typeof setInterval> | null = null;
let listenerClient: PoolClient | null = null;

/** Start the shared poll loop + best-effort LISTEN wake-up. Call once at boot. */
export async function startComplianceDebouncerWorker(): Promise<void> {
  if (pollTimer) return; // already started

  pollTimer = setInterval(() => {
    claimAndRunReady().catch((err) => logger.error({ err }, "compliance debouncer: poll tick failed"));
  }, POLL_INTERVAL_MS);

  try {
    const client = await pool.connect();
    await client.query(`LISTEN ${NOTIFY_CHANNEL}`);
    client.on("notification", () => {
      claimAndRunReady().catch((err) => logger.error({ err }, "compliance debouncer: notify-triggered poll failed"));
    });
    client.on("error", (err) => {
      logger.warn({ err }, "compliance debouncer: LISTEN connection dropped, relying on poll fallback");
      listenerClient = null;
    });
    listenerClient = client;
  } catch (err) {
    logger.warn({ err }, "compliance debouncer: failed to establish LISTEN connection, relying on poll fallback");
  }
}

/** Stop the poll loop and release the LISTEN connection. For tests/shutdown. */
export function stopComplianceDebouncerWorker(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  if (listenerClient) {
    listenerClient.release();
    listenerClient = null;
  }
}
