import { customFetch } from "@workspace/api-client-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import React from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";

interface AppNotification {
  id: number;
  userId: number;
  type: string;
  title: string;
  body: string;
  referenceId: number;
  projectId: number;
  isRead: boolean;
  createdAt: string;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function NotificationRow({
  item,
  onPress,
}: {
  item: AppNotification;
  onPress: () => void;
}) {
  const colors = useColors();
  const icon = item.type === "rfi" ? "alert-circle" : "check-square";

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: item.isRead ? colors.card : colors.muted,
          borderBottomColor: colors.border,
          opacity: pressed ? 0.8 : 1,
        },
      ]}
    >
      {!item.isRead && (
        <View style={[styles.unreadDot, { backgroundColor: colors.primary }]} />
      )}
      <View style={[styles.iconWrap, { backgroundColor: item.isRead ? colors.muted : colors.card }]}>
        <Feather name={icon as any} size={18} color={colors.primary} />
      </View>
      <View style={styles.rowContent}>
        <Text style={[styles.title, { color: colors.foreground, fontFamily: item.isRead ? "Inter_400Regular" : "Inter_600SemiBold" }]}>
          {item.title}
        </Text>
        <Text style={[styles.body, { color: colors.mutedForeground }]} numberOfLines={2}>
          {item.body}
        </Text>
        <Text style={[styles.time, { color: colors.mutedForeground }]}>
          {timeAgo(item.createdAt)}
        </Text>
      </View>
    </Pressable>
  );
}

export default function NotificationsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();

  const {
    data: notifications = [],
    isLoading,
    refetch,
  } = useQuery<AppNotification[]>({
    queryKey: ["notifications"],
    queryFn: async () => {
      const res = await customFetch("/api/notifications");
      return res.json();
    },
  });

  const markAllRead = useMutation({
    mutationFn: async () => {
      await customFetch("/api/notifications/read-all", { method: "PATCH" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["notifications", "unread"] });
    },
  });

  const handlePress = async (item: AppNotification) => {
    if (!item.isRead) {
      await customFetch(`/api/notifications/${item.id}/read`, { method: "PATCH" }).catch(() => {});
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["notifications", "unread"] });
    }
    router.push(`/project/${item.projectId}`);
  };

  const unreadCount = notifications.filter((n) => !n.isRead).length;
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 8, backgroundColor: colors.sidebar }]}>
        <Text style={[styles.headerTitle, { color: "#FFFFFF" }]}>Notifications</Text>
        {unreadCount > 0 && (
          <Pressable
            onPress={() => markAllRead.mutate()}
            disabled={markAllRead.isPending}
            style={styles.markAllBtn}
          >
            <Text style={{ color: colors.primary, fontFamily: "Inter_500Medium", fontSize: 14 }}>
              Mark all read
            </Text>
          </Pressable>
        )}
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : notifications.length === 0 ? (
        <View style={styles.center}>
          <Feather name="bell-off" size={40} color={colors.mutedForeground} style={{ marginBottom: 12 }} />
          <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 15 }}>
            No notifications yet
          </Text>
          <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 13, marginTop: 4, textAlign: "center" }}>
            You'll be notified when tasks or RFIs are assigned to you.
          </Text>
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => (
            <NotificationRow item={item} onPress={() => handlePress(item)} />
          )}
          refreshControl={
            <RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={colors.primary} />
          }
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
  },
  headerTitle: { fontSize: 26, fontFamily: "Inter_700Bold" },
  markAllBtn: { paddingBottom: 3 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    gap: 12,
    position: "relative",
  },
  unreadDot: {
    position: "absolute",
    left: 6,
    top: "50%",
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: -3,
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  rowContent: { flex: 1 },
  title: { fontSize: 15, marginBottom: 2 },
  body: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18, marginBottom: 4 },
  time: { fontSize: 12, fontFamily: "Inter_400Regular" },
});
