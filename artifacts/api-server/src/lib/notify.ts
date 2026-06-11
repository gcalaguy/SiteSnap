import { db, usersTable, notificationsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { sendPushNotification } from "./push";
import { logger } from "./logger";

interface NotifyOptions {
  userId: number;
  actorUserId?: number;
  type: "task" | "rfi" | "inspection" | "message" | "tradehub_message" | "tradehub_post";
  title: string;
  body: string;
  referenceId: number;
  projectId?: number;
}

/**
 * Insert a notification record and fire a push notification to the user.
 * For non-AI types, never notifies a user of their own actions.
 * Never throws — safe to call fire-and-forget.
 */
export async function notify(opts: NotifyOptions): Promise<void> {
  const { userId, actorUserId, type, title, body, referenceId, projectId } = opts;

  // For message (AI reply) notifications we always notify the user regardless
  // of whether they are also the actor, since the reply comes from the AI.
  if (type !== "message" && actorUserId && actorUserId === userId) return;

  try {
    await db.insert(notificationsTable).values({
      userId,
      type,
      title,
      body,
      referenceId,
      projectId: projectId ?? null,
    });
  } catch (err) {
    logger.error({ err, userId, type, referenceId }, "Failed to insert notification record");
    return;
  }

  // Fire-and-forget push
  db.select({ pushToken: usersTable.pushToken })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1)
    .then(([user]) => {
      if (user?.pushToken) {
        sendPushNotification(user.pushToken, title, body, {
          type,
          referenceId,
          projectId: projectId ?? 0,
        });
      }
    })
    .catch((err) => {
      logger.warn({ err, userId, type, referenceId }, "Failed to deliver push notification");
    });
}
