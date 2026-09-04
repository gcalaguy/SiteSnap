import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import { useRouter, type Router } from "expo-router";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { customFetch } from "@workspace/api-client-react";
import { safeNavigate } from "@/utils/safeNavigate";
import { usePermissions } from "@/hooks/usePermissions";

interface PushNotificationData {
  type?: string;
  projectId?: number;
  referenceId?: number;
}

// Mirrors notifications.tsx's own handlePress routing so a tapped OS
// notification (app backgrounded/killed) lands in the same place as tapping
// the equivalent row in the in-app notifications list.
function routeForNotification(router: Router, data: PushNotificationData, viewAskAI: boolean) {
  if (data.type === "message") {
    if (viewAskAI) safeNavigate(router, "/(tabs)/(home)/ask", "push-notification:message");
  } else if (data.projectId) {
    safeNavigate(router, `/project/${data.projectId}`, "push-notification:project");
  }
}

/**
 * Registers the device's Expo push token with the backend (POST
 * /users/push-token, which already existed server-side with nothing calling
 * it) and routes to the relevant screen when the user taps a delivered
 * notification. No-ops on web and until `enabled` (call with
 * `isSignedIn && synced`, same gate as GlobalVoiceCommandFAB).
 */
export function usePushNotifications(enabled: boolean) {
  const router = useRouter();
  const perms = usePermissions(enabled);
  const registeredRef = useRef(false);

  useEffect(() => {
    if (!enabled || Platform.OS === "web" || registeredRef.current) return;
    registeredRef.current = true;

    (async () => {
      try {
        const existing = await Notifications.getPermissionsAsync();
        let status = existing.status;
        if (status !== "granted") {
          const requested = await Notifications.requestPermissionsAsync();
          status = requested.status;
        }
        if (status !== "granted") return;

        const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
        const { data: token } = await Notifications.getExpoPushTokenAsync(
          projectId ? { projectId } : undefined,
        );

        await customFetch("/api/users/push-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
      } catch {
        // Best-effort — no push token just means no push notifications, not a broken app.
      }
    })();
  }, [enabled]);

  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as PushNotificationData;
      routeForNotification(router, data, perms.viewAskAI);
    });
    return () => sub.remove();
  }, [router, perms.viewAskAI]);
}
