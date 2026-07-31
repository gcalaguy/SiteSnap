import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Location from "expo-location";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  useListProjects,
  useCreateProject,
  getListProjectsQueryKey,
  customFetch,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
import { GpsLockedBanner } from "@/components/GpsLockedBanner";
import { useVoiceInspectionRecorder } from "@/hooks/useVoiceInspectionRecorder";
import { ProjectFormSheet, type ProjectFormValues } from "@/components/sheets/ProjectFormSheet";

interface GpsState {
  lat: number;
  lng: number;
  altitude: number | null;
  accuracyM: number | null;
  capturedAtUtc: string;
  timezone: string;
}

export default function VoiceInspectionCaptureScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const { projectId: projectIdParam } = useLocalSearchParams<{ projectId?: string }>();
  const { data: projects = [] } = useListProjects();
  const { state: recorderState, error: recorderError, start, stopAndUpload } = useVoiceInspectionRecorder();

  const [projectId, setProjectId] = useState<number | null>(null);
  const [showProjectPicker, setShowProjectPicker] = useState(false);
  const [showNewProjectSheet, setShowNewProjectSheet] = useState(false);
  const [creatingProject, setCreatingProject] = useState(false);
  const [gps, setGps] = useState<GpsState | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsDenied, setGpsDenied] = useState(false);
  const [siteAddress, setSiteAddress] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const createProject = useCreateProject({
    mutation: {
      onSuccess: (project) => {
        qc.invalidateQueries({ queryKey: getListProjectsQueryKey() });
        setProjectId(project.id);
        setShowNewProjectSheet(false);
      },
      onError: () => Alert.alert("Failed to create project"),
      onSettled: () => setCreatingProject(false),
    },
  });

  // Default to the current active project when this screen is opened from within a project context.
  useEffect(() => {
    if (projectIdParam && projectId === null) {
      const parsed = parseInt(projectIdParam, 10);
      if (!isNaN(parsed)) setProjectId(parsed);
    }
  }, [projectIdParam]);

  const selectedProject = useMemo(() => projects.find((p) => p.id === projectId), [projects, projectId]);

  function handleCreateProject(values: ProjectFormValues) {
    setCreatingProject(true);
    createProject.mutate({
      data: {
        name: values.name,
        address: values.address,
        city: values.city,
        province: values.province,
        status: values.status,
        startDate: values.startDate ?? undefined,
        endDate: values.endDate ?? undefined,
        budget: values.budget ?? undefined,
        description: values.description ?? undefined,
      },
    });
  }

  async function lockGps() {
    setGpsLoading(true);
    setGpsDenied(false);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setGpsDenied(true);
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const { latitude, longitude, altitude, accuracy } = pos.coords;
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

      let address: string | null = null;
      try {
        const geo = await Location.reverseGeocodeAsync({ latitude, longitude });
        const g = geo[0];
        if (g) {
          address = [g.streetNumber, g.street].filter(Boolean).join(" ") || g.name || null;
          if (g.city) address = address ? `${address}, ${g.city}` : g.city;
        }
      } catch {
        // Reverse geocoding is best-effort — GPS coordinates alone still satisfy the audit trail.
      }

      setGps({
        lat: latitude,
        lng: longitude,
        altitude: altitude ?? null,
        accuracyM: accuracy ?? null,
        capturedAtUtc: new Date().toISOString(),
        timezone,
      });
      setSiteAddress(address);
    } finally {
      setGpsLoading(false);
    }
  }

  async function handleStart() {
    if (!gps && !gpsLoading) await lockGps();
    await start();
  }

  async function handleStopAndSubmit() {
    if (!projectId || !gps) return;
    const upload = await stopAndUpload();
    if (!upload) return;

    setSubmitting(true);
    try {
      const inspection = await customFetch<{ id: number }>("/api/voice-inspections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          audioObjectPath: upload.objectPath,
          audioDurationSeconds: upload.durationSeconds,
          gps,
          siteAddress: siteAddress ?? undefined,
        }),
      });
      router.replace({ pathname: "/(tabs)/(home)/voice-inspection-results", params: { id: String(inspection.id) } });
    } catch (err: any) {
      Alert.alert("Inspection Failed", err?.message ?? "Could not analyze the recording. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const recording = recorderState === "recording";
  const uploading = recorderState === "uploading" || submitting;
  const canStart = !!projectId && !gpsLoading && !recording && !uploading;

  return (
    <>
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: colors.background }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView contentContainerStyle={{ padding: 20, paddingTop: insets.top + 16, paddingBottom: 40 }}>
          <View style={styles.topRow}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
              <Feather name="arrow-left" size={20} color={colors.foreground} />
              <Text style={[styles.backText, { color: colors.foreground }]}>Back</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => router.push("/(tabs)/(home)/voice-inspection-history")}
              style={styles.historyBtn}
            >
              <Feather name="clock" size={16} color={colors.primary} />
              <Text style={[styles.historyText, { color: colors.primary }]}>History</Text>
            </TouchableOpacity>
          </View>

          <Text style={[styles.title, { color: colors.foreground }]}>Voice Inspection</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            Speak a Pre-Use Inspection or hazard report — AI structures it into an audit-ready record.
          </Text>

          <Text style={[styles.label, { color: colors.mutedForeground }]}>Project</Text>
          <Pressable
            style={[styles.pickerBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => setShowProjectPicker(true)}
          >
            <Feather name="folder" size={14} color={selectedProject ? colors.primary : colors.mutedForeground} />
            <Text style={[styles.pickerBtnText, { color: selectedProject ? colors.foreground : colors.mutedForeground }]}>
              {selectedProject?.name ?? "Select a project"}
            </Text>
            <Feather name="chevron-down" size={15} color={colors.mutedForeground} />
          </Pressable>

          {gps ? (
            <View style={{ marginTop: 20 }}>
              <GpsLockedBanner
                loading={gpsLoading}
                denied={gpsDenied}
                info={gps ? { siteAddress, capturedAt: new Date(gps.capturedAtUtc), timezone: gps.timezone } : null}
              />
            </View>
          ) : null}

          <View style={styles.recordArea}>
            <TouchableOpacity
              onPress={recording ? handleStopAndSubmit : handleStart}
              disabled={!canStart && !recording}
              style={[
                styles.recordBtn,
                {
                  backgroundColor: recording ? colors.destructive : canStart ? colors.primary : "#ccc",
                },
              ]}
            >
              {uploading ? (
                <ActivityIndicator color="#fff" size="large" />
              ) : (
                <Feather name={recording ? "square" : "mic"} size={32} color="#fff" />
              )}
            </TouchableOpacity>
            <Text style={[styles.recordLabel, { color: colors.mutedForeground }]}>
              {uploading
                ? "Analyzing…"
                : recording
                  ? "Tap to stop"
                  : !projectId
                    ? "Select a project to begin"
                    : "Tap to start recording"}
            </Text>
            {recorderError ? (
              <Text style={[styles.errorText, { color: colors.destructive }]}>{recorderError}</Text>
            ) : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Project picker sheet */}
      <Modal visible={showProjectPicker} transparent animationType="slide" onRequestClose={() => setShowProjectPicker(false)}>
        <Pressable style={styles.pickerOverlay} onPress={() => setShowProjectPicker(false)} />
        <View style={[styles.pickerSheet, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
          <View style={[styles.pickerHandle, { backgroundColor: colors.border }]} />
          <Text style={[styles.pickerSheetTitle, { color: colors.foreground }]}>Select Project</Text>
          <Pressable
            style={[styles.pickerRow, { borderBottomColor: colors.border }]}
            onPress={() => {
              setShowProjectPicker(false);
              setShowNewProjectSheet(true);
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Feather name="plus-circle" size={16} color={colors.primary} />
              <Text style={[styles.pickerRowText, { color: colors.primary }]}>New Project</Text>
            </View>
          </Pressable>
          <ScrollView>
            {projects.length === 0 ? (
              <View style={{ padding: 24, alignItems: "center" }}>
                <Text style={{ color: colors.mutedForeground, fontSize: 14 }}>No projects available</Text>
              </View>
            ) : projects.map((p) => (
              <Pressable
                key={p.id}
                style={[styles.pickerRow, { borderBottomColor: colors.border }, p.id === projectId && { backgroundColor: `${colors.primary}10` }]}
                onPress={() => { setProjectId(p.id); setShowProjectPicker(false); }}
              >
                <Text style={[styles.pickerRowText, { color: colors.foreground }]}>{p.name}</Text>
                {p.id === projectId && <Feather name="check" size={16} color={colors.primary} />}
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </Modal>

      <ProjectFormSheet
        visible={showNewProjectSheet}
        onClose={() => setShowNewProjectSheet(false)}
        onSubmit={handleCreateProject}
        submitting={creatingProject}
      />
    </>
  );
}

const styles = StyleSheet.create({
  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  backBtn: { flexDirection: "row", alignItems: "center", gap: 6 },
  backText: { fontSize: 14, fontFamily: "NunitoSans_500Medium" },
  historyBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 6, paddingHorizontal: 10 },
  historyText: { fontSize: 14, fontFamily: "NunitoSans_500Medium" },
  title: { fontSize: 28, fontFamily: "NunitoSans_700Bold", marginBottom: 4 },
  subtitle: { fontSize: 14, fontFamily: "NunitoSans_400Regular", marginBottom: 20 },
  label: {
    fontSize: 12,
    fontFamily: "NunitoSans_600SemiBold",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  pickerBtn: {
    flexDirection: "row", alignItems: "center", gap: 8,
    borderWidth: 1, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 11,
  },
  pickerBtnText: { flex: 1, fontSize: 14, fontFamily: "NunitoSans_400Regular" },
  pickerOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)" },
  pickerSheet: {
    borderTopWidth: 1, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingBottom: 40, maxHeight: "60%",
  },
  pickerHandle: { width: 36, height: 4, borderRadius: 2, alignSelf: "center", marginVertical: 10 },
  pickerSheetTitle: { fontSize: 15, fontFamily: "NunitoSans_700Bold", paddingHorizontal: 16, marginBottom: 8 },
  pickerRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  pickerRowText: { fontSize: 14, fontFamily: "NunitoSans_400Regular" },
  recordArea: { alignItems: "center", marginTop: 48 },
  recordBtn: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  recordLabel: { fontSize: 13, fontFamily: "NunitoSans_500Medium", marginTop: 16, textAlign: "center" },
  errorText: { fontSize: 12, fontFamily: "NunitoSans_400Regular", marginTop: 8, textAlign: "center" },
});
