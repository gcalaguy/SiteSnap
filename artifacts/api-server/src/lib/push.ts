const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  sound: "default";
  data?: Record<string, unknown>;
}

/**
 * Send a push notification to a single Expo push token.
 * Fire-and-forget — never throws, so callers don't need try/catch.
 */
export async function sendPushNotification(
  pushToken: string | null | undefined,
  title: string,
  body: string,
  data?: Record<string, unknown>,
): Promise<void> {
  if (!pushToken || !pushToken.startsWith("ExponentPushToken[")) return;

  const message: ExpoPushMessage = { to: pushToken, title, body, sound: "default", data };

  try {
    await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(message),
    });
  } catch {
    // Intentionally swallowed — notification failure must never break the main request
  }
}
