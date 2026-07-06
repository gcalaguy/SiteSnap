import { notify } from "../../lib/notify";
import {
  getUserById,
  getProfileByUserId,
  findExistingConversationId,
  insertConversation,
  insertConversationParticipants,
  insertMessage,
  touchConversation,
  insertNotification,
  listMyConversationIds,
  listConversationsByIds,
  getOtherParticipant,
  getLastMessage,
  getMyParticipant,
  getUnreadMessageCount,
  listMessagesForConversation as listMessagesForConversationRepo,
  listParticipants,
  markConversationRead,
} from "../../repositories/tradehub";

export async function startOrContinueConversation(
  userId: number,
  recipientId: number,
  message: string,
): Promise<number> {
  let conversationId = await findExistingConversationId(userId, recipientId);

  if (conversationId === null) {
    const conv = await insertConversation();
    conversationId = conv.id;
    await insertConversationParticipants(conversationId, [userId, recipientId]);
  }

  // Send the first message
  await insertMessage({
    conversationId,
    senderId: userId,
    content: message.trim(),
  });

  // Update conversation timestamp
  await touchConversation(conversationId);

  // Notify recipient
  const [sender, senderProfile] = await Promise.all([getUserById(userId), getProfileByUserId(userId)]);
  const senderName = senderProfile?.displayName ?? `${sender?.firstName ?? ""} ${sender?.lastName ?? ""}`.trim();
  await insertNotification({
    userId: recipientId,
    type: "message",
    referenceId: conversationId,
    message: `${senderName} sent you a message on TradeHub`,
  }).catch(() => {});
  notify({
    userId: recipientId,
    actorUserId: userId,
    type: "tradehub_message",
    title: "New TradeHub message",
    body: `${senderName} sent you a message on TradeHub`,
    referenceId: conversationId,
  }).catch(() => {});

  return conversationId;
}

export async function listConversationsWithMeta(userId: number) {
  const myConvIds = await listMyConversationIds(userId);
  if (myConvIds.length === 0) return [];

  const conversations = await listConversationsByIds(myConvIds);

  return Promise.all(
    conversations.map(async (conv) => {
      // Get other participant
      const otherPart = await getOtherParticipant(conv.id, userId);

      let otherParticipant = null;
      if (otherPart) {
        const profile = await getProfileByUserId(otherPart.userId);
        otherParticipant = profile ?? { userId: otherPart.userId, displayName: "Unknown" };
      }

      // Last message
      const lastMessage = await getLastMessage(conv.id);

      // Unread count
      const myPart = await getMyParticipant(conv.id, userId);
      const unreadCount = await getUnreadMessageCount(conv.id, userId, myPart?.lastReadAt);

      return { ...conv, otherParticipant, lastMessage: lastMessage ?? null, unreadCount };
    })
  );
}

export async function isConversationParticipant(conversationId: number, userId: number): Promise<boolean> {
  const part = await getMyParticipant(conversationId, userId);
  return !!part;
}

export async function listMessagesForConversation(conversationId: number) {
  return listMessagesForConversationRepo(conversationId, 100);
}

export async function sendConversationMessage(conversationId: number, userId: number, content: string) {
  // Verify participant + dedupe the "other participant" lookup in one query
  const participants = await listParticipants(conversationId);
  const isMember = participants.some((p) => p.userId === userId);
  if (!isMember) return null;

  const msg = await insertMessage({
    conversationId,
    senderId: userId,
    content: content.trim(),
  });

  // Update conversation timestamp
  await touchConversation(conversationId);

  // Notify the other participant
  const other = participants.find((p) => p.userId !== userId);
  if (other) {
    const [senderProfile, senderUser] = await Promise.all([getProfileByUserId(userId), getUserById(userId)]);
    const name = senderProfile?.displayName ?? `${senderUser?.firstName ?? ""}`.trim();
    const preview = `${content.trim().slice(0, 60)}${content.trim().length > 60 ? "…" : ""}`;
    await insertNotification({
      userId: other.userId,
      type: "message",
      referenceId: conversationId,
      message: `${name}: ${preview}`,
    }).catch(() => {});
    notify({
      userId: other.userId,
      actorUserId: userId,
      type: "tradehub_message",
      title: "New TradeHub message",
      body: `${name}: ${preview}`,
      referenceId: conversationId,
    }).catch(() => {});
  }

  return msg;
}

export async function markConversationAsRead(conversationId: number, userId: number): Promise<void> {
  await markConversationRead(conversationId, userId);
}
