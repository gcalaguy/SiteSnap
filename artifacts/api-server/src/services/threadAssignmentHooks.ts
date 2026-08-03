import { promoteThreadAttachmentsToDocuments, backfillTimelineEventsProjectId } from "../repositories/emailIntegrations";
import { logger } from "../lib/logger";

/**
 * Single seam for "a thread's projectId just transitioned from null to a real
 * project" (Phase 4) — every write path that can cause that transition
 * (engine auto-assign and the filing-rule move-to-project branch, both in
 * emailSyncService.ts's triageThread(); and recordManualAssignment(), which
 * itself covers manual assign, bulk-assign, and create-project-and-assign)
 * calls this after updating the thread, instead of each duplicating its own
 * post-assignment side effects.
 */
export async function onThreadAssignedToProject(
  companyId: number,
  threadId: number,
  projectId: number,
): Promise<void> {
  try {
    await promoteThreadAttachmentsToDocuments(companyId, threadId, projectId);
  } catch (err) {
    // Promotion is a convenience, not correctness-critical — the assignment
    // itself must never fail because of it.
    logger.error({ err, companyId, threadId, projectId }, "Failed to promote thread attachments to project documents");
  }

  try {
    await backfillTimelineEventsProjectId(companyId, threadId, projectId);
  } catch (err) {
    logger.error({ err, companyId, threadId, projectId }, "Failed to backfill timeline events' projectId");
  }
}
