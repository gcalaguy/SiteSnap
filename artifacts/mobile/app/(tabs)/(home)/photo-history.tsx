import {
  useListProjects,
  useListSitePhotos,
  useDeleteSitePhoto,
  useGetMe,
  getListSitePhotosQueryKey,
} from "@workspace/api-client-react";
import type { SitePhotoRecord } from "@workspace/api-client-react";
import { useRouter, useLocalSearchParams } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";

import { useColors } from "@/hooks/useColors";
import { spacing, radius, typography } from "@/constants/theme";
import { Chip, EmptyState } from "@/components/ui";
import { PhotoThumbnail, PhotoLightbox } from "@/components/PhotoThumbnail";

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" }) +
    " · " +
    d.toLocaleTimeString("en-CA", { hour: "numeric", minute: "2-digit" });
}

export default function PhotoHistoryScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { projectId: initialProjectId } = useLocalSearchParams<{ projectId?: string }>();

  const { data: projects = [] } = useListProjects();
  const { data: me } = useGetMe();
  const isOwner = me?.role === "owner";
  const myUserId = me?.id ?? null;

  const [projectId, setProjectId] = useState<number | null>(
    initialProjectId ? Number(initialProjectId) : null,
  );
  const [lightboxPath, setLightboxPath] = useState<string | null>(null);

  const activeProjectId = projectId ?? projects[0]?.id ?? null;

  const photoParams = { projectId: activeProjectId as number };
  const {
    data: photos = [],
    isLoading,
    isFetching,
    isError,
    refetch,
  } = useListSitePhotos(photoParams, {
    query: {
      queryKey: getListSitePhotosQueryKey(photoParams),
      enabled: !!activeProjectId,
    },
  });

  const deletePhoto = useDeleteSitePhoto({
    mutation: {
      onSuccess: () =>
        queryClient.invalidateQueries({ queryKey: getListSitePhotosQueryKey(photoParams) }),
    },
  });

  const sortedPhotos = useMemo(
    () =>
      [...photos].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ),
    [photos],
  );

  const renderItem = useCallback(
    ({ item }: { item: SitePhotoRecord }) => {
      const canDelete =
        isOwner ||
        item.uploadedByUserId == null ||
        (myUserId != null && item.uploadedByUserId === myUserId);
      return (
        <View style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <PhotoThumbnail
            objectPath={item.imageUrl}
            size={64}
            style={{ marginRight: 0 }}
            onPress={() => setLightboxPath(item.imageUrl)}
          />
          <TouchableOpacity
            style={styles.rowBody}
            activeOpacity={0.7}
            onPress={() => setLightboxPath(item.imageUrl)}
          >
            <Text style={[typography.bodyMedium, { color: colors.foreground }]} numberOfLines={1}>
              {item.roomLocation || "Site Photo"}
            </Text>
            <Text style={[typography.caption, { color: colors.mutedForeground, marginTop: 2 }]}>
              {formatDate(item.createdAt)}
            </Text>
          </TouchableOpacity>
          {canDelete ? (
            <TouchableOpacity
              hitSlop={10}
              onPress={() =>
                Alert.alert("Delete Photo", "This photo will be permanently removed.", [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "Delete",
                    style: "destructive",
                    onPress: () => deletePhoto.mutate({ id: item.id }),
                  },
                ])
              }
              style={styles.deleteBtn}
            >
              <Feather name="trash-2" size={16} color={colors.mutedForeground} />
            </TouchableOpacity>
          ) : null}
        </View>
      );
    },
    [colors, isOwner, myUserId, deletePhoto],
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.header,
          { paddingTop: Platform.OS === "web" ? 67 : insets.top + 12, backgroundColor: colors.sidebar },
        ]}
      >
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color="#FFFFFF" />
        </TouchableOpacity>
        <View>
          <Text style={styles.headerTitle}>Photo History</Text>
          <Text style={styles.headerSub}>
            {sortedPhotos.length} {sortedPhotos.length === 1 ? "photo" : "photos"}
          </Text>
        </View>
        <View style={{ width: 38 }} />
      </View>

      {projects.length > 1 ? (
        <FlatList
          horizontal
          data={projects}
          keyExtractor={(p) => String(p.id)}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
          renderItem={({ item: p }) => (
            <Chip
              label={p.name}
              selected={activeProjectId === p.id}
              onPress={() => setProjectId(p.id)}
            />
          )}
          style={{ flexGrow: 0 }}
        />
      ) : null}

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : isError ? (
        <View style={styles.center}>
          <EmptyState
            icon="alert-triangle"
            title="Could not load photos"
            subtitle="Pull down to try again"
          />
        </View>
      ) : (
        <FlatList
          data={sortedPhotos}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          removeClippedSubviews
          initialNumToRender={15}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 40 }]}
          refreshControl={
            <RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor={colors.primary} />
          }
          ListEmptyComponent={
            <EmptyState
              icon="camera"
              title="No photos yet"
              subtitle="Photos you capture on site will show up here"
            />
          }
        />
      )}

      <PhotoLightbox
        objectPath={lightboxPath}
        visible={!!lightboxPath}
        onClose={() => setLightboxPath(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  backBtn: { width: 38, height: 38, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 18, fontFamily: "Inter_700Bold", color: "#FFFFFF" },
  headerSub: { fontSize: 12, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.6)", marginTop: 1 },
  chipRow: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: spacing.sm },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  list: { padding: spacing.md, gap: spacing.sm },
  row: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  rowBody: { flex: 1, marginLeft: spacing.md, minWidth: 0 },
  deleteBtn: { padding: spacing.sm },
});
