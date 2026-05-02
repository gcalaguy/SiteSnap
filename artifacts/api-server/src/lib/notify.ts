import { db, usersTable, notificationsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { sendPushNotification } from "./push";

interface NotifyOptions {
  userId: number;
  actorUserId?: number;
  type: "task" | "rfi";
  title: string;
  body: string;
  referenceId: number;
  projectId: number;
}

/**
 * Insert a notification record and fire a push notification to the user.
 * Never notifies a user of their own actions.
 * Never throws — safe to call fire-and-forget.
 */
export async function notify(opts: NotifyOptions): Promise<void> {
  const { userId, actorUserId, type, title, body, referenceId, projectId } = opts;

  if (actorUserId && actorUserId === userId) return;

  await db.insert(notificationsTable).values({ userId, type, title, body, referenceId, projectId });

  // Fire-and-forget push
  db.select({ pushToken: usersTable.pushToken })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1)
    .then(([user]) => {
      if (user?.pushToken) {
        sendPushNotification(user.pushToken, title, body, { type, referenceId, projectId });
      }
    })
    .catch(() => {});
}
