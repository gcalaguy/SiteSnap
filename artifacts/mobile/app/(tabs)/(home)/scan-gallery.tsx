import React, { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { WebView } from "react-native-webview";
import * as Haptics from "expo-haptics";
import {
  useListScans,
  getListScansQueryKey,
  useGetScanUrl,
  getGetScanUrlQueryKey,
  useGetScanThumbnailUrl,
  getGetScanThumbnailUrlQueryKey,
  useDeleteScan,
  ScanRecord,
} from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const CYAN = "#06b6d4";

function formatBytes(b?: number | null): string {
  if (!b) return "";
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" });
}

function ScanWebView({ url }: { url: string }) {
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      {!loaded && !errored && (
        <View style={[StyleSheet.absoluteFillObject, styles.center, { zIndex: 10 }]}>
          <ActivityIndicator size="large" color={CYAN} />
          <Text style={styles.statusText}>Loading 3D viewer…</Text>
        </View>
      )}
      {errored ? (
        <View style={styles.center}>
          <Feather name="alert-triangle" size={36} color="#f59e0b" />
          <Text style={styles.statusText}>Failed to load 3D viewer</Text>
          <Text style={[styles.statusText, { fontSize: 12, marginTop: 4 }]}>
            Check your connection and try again.
          </Text>
        </View>
      ) : (
        <WebView
          source={{ uri: url }}
          style={{ flex: 1 }}
          onLoad={() => setLoaded(true)}
          onError={() => { setErrored(true); setLoaded(true); }}
          onHttpError={() => { setErrored(true); setLoaded(true); }}
          javaScriptEnabled
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          originWhitelist={["https://*"]}
          allowsFullscreenVideo
        />
      )}
    </View>
  );
}

function VideoWebView({ url }: { url: string }) {
  const [loaded, setLoaded] = useState(false);
  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{width:100%;height:100%;background:#000;overflow:hidden;display:flex;align-items:center;justify-content:center}
  video{width:100%;height:100%;object-fit:contain}
</style>
</head>
<body>
<video src="${url}" controls autoplay playsinline webkit-playsinline></video>
</body>
</html>`;

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      {!loaded && (
        <View style={[StyleSheet.absoluteFillObject, styles.center, { zIndex: 10 }]}>
          <ActivityIndicator size="large" color={CYAN} />
          <Text style={styles.statusText}>Loading video…</Text>
        </View>
      )}
      <WebView
        source={{ html }}
        style={{ flex: 1 }}
        onLoad={() => setLoaded(true)}
        javaScriptEnabled
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        allowsFullscreenVideo
        originWhitelist={["*"]}
      />
    </View>
  );
}

function ScanViewerModal({
  scanId,
  visible,
  onClose,
  onDelete,
}: {
  scanId: number | null;
  visible: boolean;
  onClose: () => void;
  onDelete: () => void;
}) {
  const { data: scanUrlData, isLoading, error } = useGetScanUrl(
    scanId ?? 0,
    {
      query: {
        queryKey: getGetScanUrlQueryKey(scanId ?? 0),
        enabled: scanId != null && Number.isFinite(scanId) && visible,
      },
    },
  );

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: "#000" }}>
        <View style={{ flex: 1 }}>
          {isLoading && (
            <View style={styles.center}>
              <ActivityIndicator size="large" color={CYAN} />
              <Text style={styles.statusText}>Loading scan…</Text>
            </View>
          )}
          {error && !isLoading && (
            <View style={styles.center}>
              <Feather name="alert-triangle" size={36} color="#f59e0b" />
              <Text style={styles.statusText}>Failed to load 3D scan</Text>
              <Text style={[styles.statusText, { fontSize: 12, marginTop: 4 }]}>
                {error instanceof Error ? error.message : "Unknown error"}
              </Text>
              <TouchableOpacity style={[styles.closeBtn, { marginTop: 20 }]} onPress={onClose}>
                <Text style={styles.closeBtnText}>Close</Text>
              </TouchableOpacity>
            </View>
          )}
          {scanUrlData?.url && !isLoading && !error && (() => {
            const isVideo = scanUrlData.scan?.sourceType === "video_capture";
            const title = isVideo ? "Site Recording" : "3D Site Scan";

            if (isVideo) {
              return (
                <View style={{ flex: 1 }}>
                  <VideoWebView url={scanUrlData.url} />
                  <View style={styles.viewerOverlay} pointerEvents="box-none">
                    <TouchableOpacity onPress={onClose} hitSlop={10} style={styles.viewerOverlayBtn}>
                      <Feather name="x" size={22} color="#fff" />
                    </TouchableOpacity>
                    <Text style={styles.viewerOverlayTitle}>{title}</Text>
                    <TouchableOpacity onPress={onDelete} hitSlop={10} style={styles.viewerOverlayBtn}>
                      <Feather name="trash-2" size={18} color="#fff" />
                    </TouchableOpacity>
                  </View>
                </View>
              );
            }

            const domain = process.env.EXPO_PUBLIC_DOMAIN;
            if (!domain) {
              return (
                <View style={styles.center}>
                  <Feather name="alert-triangle" size={36} color="#f59e0b" />
                  <Text style={styles.statusText}>Viewer unavailable</Text>
                  <Text style={[styles.statusText, { fontSize: 12, marginTop: 4 }]}>
                    EXPO_PUBLIC_DOMAIN is not configured.
                  </Text>
                </View>
              );
            }
            const viewerBase = `https://${domain}/supersplat-viewer/index.html`;
            const params = new URLSearchParams({ content: scanUrlData.url, noui: "" });
            const viewerUrl = `${viewerBase}?${params.toString()}`;
            return (
              <View style={{ flex: 1 }}>
                <ScanWebView url={viewerUrl} />
                <View style={styles.viewerOverlay} pointerEvents="box-none">
                  <TouchableOpacity onPress={onClose} hitSlop={10} style={styles.viewerOverlayBtn}>
                    <Feather name="x" size={22} color="#fff" />
                  </TouchableOpacity>
                  <Text style={styles.viewerOverlayTitle}>{title}</Text>
                  <TouchableOpacity onPress={onDelete} hitSlop={10} style={styles.viewerOverlayBtn}>
                    <Feather name="trash-2" size={18} color="#fff" />
                  </TouchableOpacity>
                </View>
              </View>
            );
          })()}
        </View>
      </SafeAreaView>
    </Modal>
  );
}

function ScanCardThumbnail({
  scan,
  colors,
}: {
  scan: ScanRecord;
  colors: ReturnType<typeof useColors>;
}) {
  const hasThumbnail = !!scan.thumbnailPath;
  const isReady = scan.status === "ready";
  const isVideo = scan.sourceType === "video_capture";

  const { data: thumbData } = useGetScanThumbnailUrl(
    scan.id,
    {
      query: {
        queryKey: getGetScanThumbnailUrlQueryKey(scan.id),
        enabled: hasThumbnail && isReady,
        staleTime: 600_000,
        retry: false,
      },
    },
  );

  const [imgError, setImgError] = useState(false);

  if (hasThumbnail && thumbData?.url && !imgError) {
    return (
      <View style={styles.cardIcon}>
        <Image
          source={{ uri: thumbData.url }}
          style={styles.thumbnailImg}
          onError={() => setImgError(true)}
          resizeMode="cover"
        />
      </View>
    );
  }

  return (
    <View style={[styles.cardIcon, { backgroundColor: `${CYAN}18` }]}>
      <Feather name={isVideo ? "film" : "file"} size={22} color={CYAN} />
    </View>
  );
}

function ScanCard({
  scan,
  colors,
  onView,
}: {
  scan: ScanRecord;
  colors: ReturnType<typeof useColors>;
  onView: (id: number) => void;
}) {
  const isReady = scan.status === "ready";
  const isVideo = scan.sourceType === "video_capture";

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={() => isReady && onView(scan.id)}
      activeOpacity={isReady ? 0.75 : 1}
      disabled={!isReady}
    >
      <ScanCardThumbnail scan={scan} colors={colors} />

      <View style={{ flex: 1, gap: 4 }}>
        <Text style={[styles.cardName, { color: colors.foreground }]} numberOfLines={1}>
          {scan.fileName}
        </Text>
        <View style={styles.badgeRow}>
          {/* Source type badge */}
          <View style={[styles.badge, { backgroundColor: `${CYAN}15`, borderColor: `${CYAN}30` }]}>
            <Text style={[styles.badgeText, { color: CYAN }]}>
              {isVideo ? "Camera" : "File"}
            </Text>
          </View>

          {/* Status badge */}
          {isReady ? (
            <View style={[styles.badge, { backgroundColor: "#16a34a15", borderColor: "#16a34a30" }]}>
              <Feather name="check-circle" size={10} color="#16a34a" />
              <Text style={[styles.badgeText, { color: "#16a34a" }]}>Ready</Text>
            </View>
          ) : (
            <View style={[styles.badge, { backgroundColor: "#f59e0b15", borderColor: "#f59e0b30" }]}>
              <ActivityIndicator size={10} color="#f59e0b" />
              <Text style={[styles.badgeText, { color: "#f59e0b" }]}>Processing</Text>
            </View>
          )}

          {/* Size */}
          {!!scan.fileSizeBytes && (
            <Text style={[styles.meta, { color: colors.mutedForeground }]}>
              {formatBytes(scan.fileSizeBytes)}
            </Text>
          )}
        </View>
        <Text style={[styles.meta, { color: colors.mutedForeground }]}>
          {formatDate(scan.createdAt)}
        </Text>
      </View>

      {isReady && (
        <Feather name="box" size={18} color={CYAN} style={{ marginLeft: 4 }} />
      )}
    </TouchableOpacity>
  );
}

export default function ScanGalleryScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [viewingScanId, setViewingScanId] = useState<number | null>(null);
  const [viewerVisible, setViewerVisible] = useState(false);
  const deleteScanMutation = useDeleteScan({
    mutation: {
      onSuccess: () => {
        setViewerVisible(false);
        setViewingScanId(null);
      },
    },
  });

  const { data: scans, isLoading, refetch, isRefetching } = useListScans(
    undefined,
    { query: { queryKey: getListScansQueryKey() } },
  );

  function openViewer(id: number) {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setViewingScanId(id);
    setViewerVisible(true);
  }

  function closeViewer() {
    setViewerVisible(false);
    setViewingScanId(null);
  }

  function deleteViewerScan() {
    if (viewingScanId == null) return;
    deleteScanMutation.mutate({ id: viewingScanId });
  }

  function handleNewScan() {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push("/site-scan");
  }

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 8, backgroundColor: colors.sidebar }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>3D Site Scans</Text>
          <Text style={styles.headerSub}>
            {scans ? `${scans.length} scan${scans.length !== 1 ? "s" : ""}` : "Loading…"}
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.newBtn, { backgroundColor: `${CYAN}22`, borderColor: `${CYAN}40` }]}
          onPress={handleNewScan}
          activeOpacity={0.8}
        >
          <Feather name="plus" size={16} color={CYAN} />
          <Text style={[styles.newBtnText, { color: CYAN }]}>New Scan</Text>
        </TouchableOpacity>
      </View>

      {/* List */}
      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={CYAN} />
          <Text style={[styles.statusText, { color: colors.mutedForeground }]}>Loading scans…</Text>
        </View>
      ) : (
        <FlatList
          data={scans ?? []}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={[
            styles.list,
            { paddingBottom: insets.bottom + 32 },
            (!scans || scans.length === 0) && { flex: 1 },
          ]}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor={CYAN}
            />
          }
          renderItem={({ item }) => (
            <ScanCard scan={item} colors={colors} onView={openViewer} />
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <View style={[styles.emptyIcon, { backgroundColor: `${CYAN}15` }]}>
                <Feather name="box" size={32} color={CYAN} />
              </View>
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No scans yet</Text>
              <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
                Capture a site walkthrough with your camera or upload a .ply / .sog file.
              </Text>
              <Pressable
                style={[styles.emptyBtn, { backgroundColor: CYAN }]}
                onPress={handleNewScan}
              >
                <Feather name="video" size={16} color="#fff" />
                <Text style={styles.emptyBtnText}>Capture or Upload</Text>
              </Pressable>
            </View>
          }
        />
      )}

      <ScanViewerModal
        scanId={viewingScanId}
        visible={viewerVisible}
        onClose={closeViewer}
        onDelete={deleteViewerScan}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 20,
    paddingBottom: 18,
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 20, fontFamily: "Inter_700Bold", color: "#fff" },
  headerSub: { fontSize: 12, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.55)", marginTop: 2 },

  newBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  newBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },

  list: { padding: 16, gap: 10 },

  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  cardIcon: {
    width: 46,
    height: 46,
    borderRadius: 12,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  thumbnailImg: {
    width: 46,
    height: 46,
    borderRadius: 12,
  },
  cardName: { fontSize: 14, fontFamily: "Inter_600SemiBold" },

  badgeRow: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 20,
    borderWidth: 1,
  },
  badgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  meta: { fontSize: 11, fontFamily: "Inter_400Regular" },

  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 32 },
  statusText: { fontSize: 14, fontFamily: "Inter_400Regular", color: "#fff", textAlign: "center" },

  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: 40, gap: 12 },
  emptyIcon: { width: 72, height: 72, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_700Bold", textAlign: "center" },
  emptySub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20 },
  emptyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 8,
  },
  emptyBtnText: { fontSize: 15, fontFamily: "Inter_700Bold", color: "#fff" },

  viewerOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    zIndex: 50,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  viewerOverlayBtn: { width: 40, alignItems: "center", justifyContent: "center" },
  viewerOverlayTitle: { fontSize: 16, fontFamily: "Inter_700Bold", color: "#fff" },

  closeBtn: {
    backgroundColor: CYAN,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 10,
  },
  closeBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#fff" },
});
