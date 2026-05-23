import React, { useState, useRef, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Pressable,
  ActivityIndicator,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import { customFetch, useListDocuments, useGetMe, getListDocumentsQueryKey } from "@workspace/api-client-react";
import { useFocusEffect } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
import { useVoiceRecorder } from "@/hooks/useVoiceRecorder";
import { openStorageFile } from "@/utils/openStorageFile";
import { withAiRetry } from "@/src/utils/aiRetry";
import { getAiErrorMessage } from "@/src/utils/aiError";
import { RetrySnackbar } from "@/components/RetrySnackbar";

// ─── Types ────────────────────────────────────────────────────────────────────
type DocStatus = "pending" | "processing" | "ready" | "failed";

type ProjectDoc = {
  id: number; projectId: number; filename: string; fileType: string;
  objectPath: string; fileSize: number | null; status: DocStatus;
  extractedData: Record<string, unknown> | null;
  aiSummary: string | null; extractedText: string | null; createdAt: string;
  chunkCount?: number;
};

type ExtractedFields = {
  documentType?: string; confidence?: string; ocrText?: string;
  extractedData?: {
    vendor?: string | null; amount?: number | null; currency?: string | null;
    date?: string | null; invoiceNumber?: string | null;
    projectReference?: string | null; notes?: string | null; version?: string | null;
    items?: { description: string; quantity: string; unitPrice: string; total: string }[];
  };
};

type SearchResult = ProjectDoc & { relevance: "high" | "medium" | "low"; reason: string };
type SearchResponse = { results: SearchResult[]; answer: string };
type QACitation = { id: number; filename: string; excerpt?: string };
type QAResponse = { answer: string; citations: QACitation[]; ragEnabled?: boolean; hasChunks?: boolean; hasAnalyzedDocsWithNoChunks?: boolean };
type QAMessage = { role: "user" | "assistant"; text: string; citations?: QACitation[]; ragEnabled?: boolean; hasChunks?: boolean; hasAnalyzedDocsWithNoChunks?: boolean };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatSize(bytes: number | null) {
  if (!bytes) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" });
}

const STATUS_COLORS: Record<DocStatus, string> = {
  pending: "#6B7280", processing: "#F59E0B", ready: "#22C55E", failed: "#EF4444",
};
const STATUS_LABELS: Record<DocStatus, string> = {
  pending: "Pending", processing: "Analyzing…", ready: "Analyzed", failed: "Failed",
};
const RELEVANCE_COLORS: Record<string, string> = {
  high: "#22C55E", medium: "#F59E0B", low: "#6B7280",
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function VoiceMicButton({ onTranscript, disabled }: { onTranscript: (t: string) => void; disabled?: boolean }) {
  const colors = useColors();
  const { state, toggle } = useVoiceRecorder(onTranscript);
  const isRecording = state === "recording";
  const isTranscribing = state === "transcribing";

  return (
    <Pressable
      onPress={toggle}
      disabled={disabled || isTranscribing}
      style={[
        docStyles.micBtn,
        { backgroundColor: isRecording ? "#EF444420" : `${colors.primary}15`, borderColor: isRecording ? "#EF4444" : colors.border },
      ]}
    >
      {isTranscribing ? (
        <ActivityIndicator size={16} color={colors.primary} />
      ) : (
        <Feather name={isRecording ? "mic-off" : "mic"} size={16} color={isRecording ? "#EF4444" : colors.primary} />
      )}
    </Pressable>
  );
}

const CATEGORY_LABELS: Record<string, string> = {
  materials: "Materials",
  labour: "Labour",
  equipment: "Equipment",
  other: "Other",
};

function ExtractedPanel({ doc, projectId }: { doc: ProjectDoc; projectId: number }) {
  const colors = useColors();
  const [open, setOpen] = useState(false);
  const [pushed, setPushed] = useState(false);
  const [pushing, setPushing] = useState(false);

  if (doc.status !== "ready" || !doc.extractedData) return null;

  const data = doc.extractedData as ExtractedFields;
  const fields = data.extractedData ?? {};
  const hasFields = !!(fields.vendor || fields.amount != null || fields.date || fields.invoiceNumber);
  const hasAmount = fields.amount != null && fields.amount > 0;
  const currency = fields.currency ?? "CAD";

  async function pushToCosts(category: string) {
    setPushing(true);
    try {
      await customFetch(`/api/projects/${projectId}/documents/${doc.id}/push-to-costs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category }),
      });
      setPushed(true);
      Alert.alert(
        "Added to Cost Tracking",
        `${currency}$${fields.amount!.toLocaleString()} added as ${CATEGORY_LABELS[category]} cost.`,
        [{ text: "OK" }]
      );
    } catch {
      Alert.alert("Failed", "Could not push to cost tracking. Please try again.");
    } finally {
      setPushing(false);
    }
  }

  function promptCategory() {
    if (pushed) return;
    Alert.alert(
      `Push ${currency}$${fields.amount!.toLocaleString()} to Costs`,
      "Select a cost category:",
      [
        { text: "Materials", onPress: () => pushToCosts("materials") },
        { text: "Labour", onPress: () => pushToCosts("labour") },
        { text: "Equipment", onPress: () => pushToCosts("equipment") },
        { text: "Other", onPress: () => pushToCosts("other") },
        { text: "Cancel", style: "cancel" },
      ]
    );
  }

  return (
    <View style={{ marginTop: 8 }}>
      <Pressable
        style={[docStyles.extractedHeader, { backgroundColor: `${colors.primary}08`, borderColor: `${colors.primary}25` }]}
        onPress={() => setOpen(v => !v)}
      >
        <Feather name="zap" size={12} color={colors.primary} />
        <Text style={[docStyles.extractedHeaderText, { color: colors.primary }]}>
          {data.documentType ?? "AI Analysis"}
          {data.confidence === "low" ? " · filename profile" : ""}
        </Text>
        {hasAmount && (
          <View style={[docStyles.amountPill, { backgroundColor: "#C9A84C20", borderColor: "#C9A84C50" }]}>
            <Text style={[docStyles.amountPillText, { color: "#C9A84C" }]}>
              {currency}${fields.amount!.toLocaleString()}
            </Text>
          </View>
        )}
        <Feather name={open ? "chevron-up" : "chevron-down"} size={12} color={colors.primary} style={{ marginLeft: 4 }} />
      </Pressable>

      {open && (
        <View style={[docStyles.extractedBody, { borderColor: `${colors.primary}20`, backgroundColor: colors.card }]}>
          {doc.aiSummary && (
            <Text style={[docStyles.extractedSummary, { color: colors.mutedForeground }]}>{doc.aiSummary}</Text>
          )}
          {hasFields && (
            <View style={docStyles.fieldsGrid}>
              {fields.vendor && (
                <View style={docStyles.fieldItem}>
                  <Text style={[docStyles.fieldLabel, { color: colors.mutedForeground }]}>Vendor</Text>
                  <Text style={[docStyles.fieldValue, { color: colors.foreground }]}>{fields.vendor}</Text>
                </View>
              )}
              {fields.amount != null && (
                <View style={docStyles.fieldItem}>
                  <Text style={[docStyles.fieldLabel, { color: colors.mutedForeground }]}>Amount</Text>
                  <Text style={[docStyles.fieldValue, { color: colors.foreground }]}>
                    {currency}${fields.amount.toLocaleString()}
                  </Text>
                </View>
              )}
              {fields.date && (
                <View style={docStyles.fieldItem}>
                  <Text style={[docStyles.fieldLabel, { color: colors.mutedForeground }]}>Date</Text>
                  <Text style={[docStyles.fieldValue, { color: colors.foreground }]}>{fields.date}</Text>
                </View>
              )}
              {fields.invoiceNumber && (
                <View style={docStyles.fieldItem}>
                  <Text style={[docStyles.fieldLabel, { color: colors.mutedForeground }]}>Invoice #</Text>
                  <Text style={[docStyles.fieldValue, { color: colors.foreground }]}>{fields.invoiceNumber}</Text>
                </View>
              )}
            </View>
          )}
          {fields.items && fields.items.length > 0 && (
            <View style={{ marginTop: 8 }}>
              <Text style={[docStyles.fieldLabel, { color: colors.mutedForeground, marginBottom: 4 }]}>LINE ITEMS</Text>
              {fields.items.map((item, i) => (
                <View key={i} style={[docStyles.lineItem, { borderTopColor: colors.border }]}>
                  <Text style={[docStyles.lineItemDesc, { color: colors.foreground }]} numberOfLines={1}>{item.description}</Text>
                  <Text style={[docStyles.lineItemAmt, { color: colors.foreground }]}>{item.total}</Text>
                </View>
              ))}
            </View>
          )}
          {data.ocrText ? (
            <View style={{ marginTop: 8 }}>
              <Text style={[docStyles.fieldLabel, { color: colors.mutedForeground, marginBottom: 4 }]}>EXTRACTED TEXT (OCR)</Text>
              <Text style={[docStyles.ocrText, { color: colors.mutedForeground, backgroundColor: `${colors.muted}50` }]} numberOfLines={6}>
                {data.ocrText}
              </Text>
            </View>
          ) : null}

          {/* Push to Costs */}
          {hasAmount && (
            <View style={{ marginTop: 10 }}>
              {pushed ? (
                <View style={[docStyles.pushedBadge, { backgroundColor: "#22C55E15", borderColor: "#22C55E40" }]}>
                  <Feather name="check-circle" size={13} color="#22C55E" />
                  <Text style={[docStyles.pushedText, { color: "#22C55E" }]}>Added to Cost Tracking</Text>
                </View>
              ) : (
                <Pressable
                  onPress={promptCategory}
                  disabled={pushing}
                  style={({ pressed }) => [
                    docStyles.pushBtn,
                    { backgroundColor: "#C9A84C", opacity: pressed || pushing ? 0.75 : 1 },
                  ]}
                >
                  {pushing
                    ? <ActivityIndicator size={13} color="#fff" />
                    : <Feather name="dollar-sign" size={13} color="#fff" />}
                  <Text style={docStyles.pushBtnText}>
                    {pushing ? "Adding…" : `Push to Costs · ${currency}$${fields.amount!.toLocaleString()}`}
                  </Text>
                </Pressable>
              )}
            </View>
          )}
        </View>
      )}
    </View>
  );
}

function SearchPanel({ projectId }: { projectId: number }) {
  const colors = useColors();
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [result, setResult] = useState<SearchResponse | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);

  async function run() {
    if (!query.trim() || loading) return;
    setLoading(true);
    setRetrying(false);
    setWaiting(false);
    setSearchError(null);
    setResult(null);
    try {
      const data = await withAiRetry(
        () => customFetch(`/api/projects/${projectId}/documents/search`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: query.trim() }),
        }) as Promise<SearchResponse>,
        () => { setRetrying(true); setWaiting(false); },
        () => { setWaiting(true); setRetrying(false); },
      );
      setRetrying(false);
      setWaiting(false);
      setResult(data);
    } catch (err) {
      setRetrying(false);
      setWaiting(false);
      setSearchError(getAiErrorMessage(err, "Search failed. Please try again."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={{ gap: 10 }}>
      <View style={[docStyles.inputRow, { borderColor: colors.border, backgroundColor: colors.card }]}>
        <Feather name="search" size={15} color={colors.mutedForeground} style={{ marginLeft: 10 }} />
        <TextInput
          style={[docStyles.textInput, { color: colors.foreground, flex: 1 }]}
          placeholder="Search docs… e.g. 'concrete receipts'"
          placeholderTextColor={colors.mutedForeground}
          value={query}
          onChangeText={t => { setQuery(t); if (searchError) setSearchError(null); }}
          onSubmitEditing={run}
          returnKeyType="search"
        />
        <VoiceMicButton onTranscript={t => setQuery(q => q ? `${q} ${t}` : t)} disabled={loading} />
        <Pressable
          onPress={run}
          disabled={loading || !query.trim()}
          style={[docStyles.sendBtn, { backgroundColor: colors.primary, opacity: (loading || !query.trim()) ? 0.5 : 1 }]}
        >
          {loading
            ? <ActivityIndicator size={13} color="#fff" />
            : <Feather name="search" size={13} color="#fff" />}
        </Pressable>
      </View>

      {loading && (retrying || waiting) && (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 4 }}>
          <ActivityIndicator size={13} color={colors.primary} />
          <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>
            {waiting ? "Waiting for connection…" : "Poor connection detected, retrying…"}
          </Text>
        </View>
      )}

      {searchError && !loading && (
        <View style={[docStyles.qaErrorBox, { backgroundColor: "#FEF2F2", borderColor: "#FECACA" }]}>
          <View style={docStyles.qaErrorTop}>
            <Feather name="alert-circle" size={15} color="#EF4444" />
            <Text style={docStyles.qaErrorMsg}>{searchError}</Text>
          </View>
          <Pressable
            onPress={() => { setSearchError(null); void run(); }}
            style={[docStyles.qaRetryBtn, { backgroundColor: colors.primary }]}
          >
            <Feather name="refresh-cw" size={13} color="#FFFFFF" />
            <Text style={docStyles.qaRetryBtnText}>Tap to retry</Text>
          </Pressable>
        </View>
      )}

      {result && (
        <View style={{ gap: 8 }}>
          {result.answer ? (
            <View style={[docStyles.aiAnswerBox, { backgroundColor: `${colors.primary}08`, borderColor: `${colors.primary}25` }]}>
              <Feather name="zap" size={13} color={colors.primary} style={{ marginTop: 1 }} />
              <Text style={[docStyles.aiAnswerText, { color: colors.foreground }]}>{result.answer}</Text>
            </View>
          ) : null}
          {result.results.length === 0
            ? <Text style={[docStyles.emptyText, { color: colors.mutedForeground }]}>No matching documents found.</Text>
            : result.results.map(doc => (
              <Pressable
                key={doc.id}
                style={[docStyles.searchResultRow, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={() => openStorageFile(doc.objectPath, doc.filename, doc.fileType)}
              >
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[docStyles.docFilename, { color: colors.foreground }]} numberOfLines={1}>
                    {doc.filename}
                  </Text>
                  <Text style={[docStyles.docMeta, { color: colors.mutedForeground }]} numberOfLines={2}>
                    {doc.reason}
                  </Text>
                </View>
                <View style={[docStyles.relevanceChip, { backgroundColor: `${RELEVANCE_COLORS[doc.relevance]}18` }]}>
                  <Text style={[docStyles.relevanceText, { color: RELEVANCE_COLORS[doc.relevance] }]}>{doc.relevance}</Text>
                </View>
              </Pressable>
            ))
          }
        </View>
      )}
    </View>
  );
}

const MOBILE_QA_STARTERS = [
  "What's the total spend on this project?",
  "List all vendors and amounts",
  "Any safety inspection issues?",
  "What is the contract scope of work?",
  "Any outstanding change orders?",
];

function QAPanel({ projectId, indexedCount, totalCount, onRetryChange }: {
  projectId: number;
  indexedCount: number;
  totalCount: number;
  onRetryChange?: (retrying: boolean, waiting: boolean) => void;
}) {
  const colors = useColors();
  const [messages, setMessages] = useState<QAMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [aiRetrying, setAiRetrying] = useState(false);
  const [aiWaiting, setAiWaiting] = useState(false);
  const [qaError, setQaError] = useState<string | null>(null);
  const [ragActive, setRagActive] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  function setRetrying(v: boolean) { setAiRetrying(v); onRetryChange?.(v, false); }
  function setWaiting(v: boolean) { setAiWaiting(v); onRetryChange?.(false, v); }
  function clearRetry() { setAiRetrying(false); setAiWaiting(false); onRetryChange?.(false, false); }

  async function ask() {
    const q = input.trim();
    if (!q || loading) return;
    setQaError(null);
    setInput("");
    setMessages(m => [...m, { role: "user", text: q }]);
    setLoading(true);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
    try {
      const history = messages.slice(-10);
      const data = await withAiRetry(
        () => customFetch(`/api/projects/${projectId}/documents/qa`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: q, history }),
        }) as Promise<QAResponse>,
        () => { setRetrying(true); setAiWaiting(false); },
        () => { setWaiting(true); setAiRetrying(false); },
      );
      clearRetry();
      if (data.ragEnabled) setRagActive(true);
      setMessages(m => [...m, { role: "assistant", text: data.answer, citations: data.citations, ragEnabled: data.ragEnabled, hasChunks: data.hasChunks, hasAnalyzedDocsWithNoChunks: data.hasAnalyzedDocsWithNoChunks }]);
    } catch (err) {
      clearRetry();
      setMessages(m => m.slice(0, -1));
      setInput(q);
      setQaError(getAiErrorMessage(err));
    } finally {
      setLoading(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
    }
  }

  return (
    <View style={{ gap: 10 }}>
      {ragActive && (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: `${colors.primary}10`, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 5 }}>
          <Feather name="zap" size={11} color={colors.primary} />
          <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: colors.primary }}>Full-text search active</Text>
          <Text style={{ fontSize: 10, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>— grounded in document content</Text>
        </View>
      )}
      {messages.length === 0 ? (
        <View style={{ gap: 8 }}>
          <View style={[docStyles.aiAnswerBox, { backgroundColor: `${colors.primary}08`, borderColor: `${colors.primary}25` }]}>
            <Feather name="zap" size={13} color={colors.primary} />
            <Text style={[docStyles.aiAnswerText, { color: colors.mutedForeground }]}>
              Ask anything about your project documents. Analyze files first for best results.
            </Text>
          </View>
          {totalCount > 0 && (
            <View style={{
              flexDirection: "row", alignItems: "center", gap: 6,
              borderRadius: 6, paddingHorizontal: 9, paddingVertical: 6,
              backgroundColor: indexedCount > 0 ? "#16a34a12" : "#d9770612",
              borderWidth: 1, borderColor: indexedCount > 0 ? "#16a34a30" : "#d9770630",
              alignSelf: "flex-start",
            }}>
              <Feather name={indexedCount > 0 ? "check-circle" : "alert-circle"} size={11} color={indexedCount > 0 ? "#16a34a" : "#d97706"} />
              <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: indexedCount > 0 ? "#16a34a" : "#d97706" }}>
                {indexedCount > 0
                  ? `${indexedCount} of ${totalCount} document${totalCount !== 1 ? "s" : ""} indexed for AI search`
                  : `No documents indexed yet — tap Re-index on analyzed files`}
              </Text>
            </View>
          )}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {MOBILE_QA_STARTERS.slice(0, 3).map(s => (
              <Pressable
                key={s}
                onPress={() => setInput(s)}
                style={[docStyles.starterChip, { backgroundColor: colors.muted, borderColor: colors.border }]}
              >
                <Text style={[docStyles.starterText, { color: colors.mutedForeground }]}>{s}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : (
        <ScrollView ref={scrollRef} style={{ maxHeight: 280 }} showsVerticalScrollIndicator={false}>
          <View style={{ gap: 10, paddingBottom: 4 }}>
            {messages.map((m, i) => (
              <View key={i} style={{ alignItems: m.role === "user" ? "flex-end" : "flex-start" }}>
                {m.role === "assistant" && (
                  <View style={[docStyles.aiBubbleHeader]}>
                    <Feather name="zap" size={11} color={colors.primary} />
                    <Text style={[docStyles.fieldLabel, { color: colors.primary }]}>Site Snap AI</Text>
                  </View>
                )}
                <View style={[
                  docStyles.bubble,
                  m.role === "user"
                    ? { backgroundColor: colors.primary }
                    : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
                ]}>
                  <Text style={[docStyles.bubbleText, { color: m.role === "user" ? "#fff" : colors.foreground }]}>
                    {m.text}
                  </Text>
                  {m.citations && m.citations.length > 0 && (
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
                      {m.citations.map(c => (
                        <View key={c.id} style={[docStyles.citationChip, { backgroundColor: `${colors.primary}12` }]}>
                          <Feather name="file-text" size={10} color={colors.primary} />
                          <Text style={[docStyles.citationText, { color: colors.primary }]} numberOfLines={1}>{c.filename}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                  {m.ragEnabled === false && (
                    <Text style={{ fontSize: 10, color: colors.mutedForeground, marginTop: 4, fontStyle: "italic" }}>
                      {m.hasChunks === false && m.hasAnalyzedDocsWithNoChunks
                        ? "Semantic search is not yet active — use 'Re-index for AI Search' on your documents to enable it."
                        : "No matching sections — answered from document summaries."}
                    </Text>
                  )}
                </View>
              </View>
            ))}
            {loading && (
              <View style={{ alignItems: "flex-start" }}>
                <View style={[docStyles.bubble, { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, flexDirection: "row", alignItems: "center", gap: 6 }]}>
                  <ActivityIndicator size={14} color={colors.primary} />
                  {(aiRetrying || aiWaiting) && (
                    <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>
                      {aiWaiting ? "Waiting for connection…" : "Retrying…"}
                    </Text>
                  )}
                </View>
              </View>
            )}
          </View>
        </ScrollView>
      )}

      {qaError && !loading && (
        <View style={[docStyles.qaErrorBox, { backgroundColor: "#FEF2F2", borderColor: "#FECACA" }]}>
          <View style={docStyles.qaErrorTop}>
            <Feather name="alert-circle" size={15} color="#EF4444" />
            <Text style={docStyles.qaErrorMsg}>{qaError}</Text>
          </View>
          <Pressable
            onPress={() => { setQaError(null); void ask(); }}
            style={[docStyles.qaRetryBtn, { backgroundColor: colors.primary }]}
          >
            <Feather name="refresh-cw" size={13} color="#FFFFFF" />
            <Text style={docStyles.qaRetryBtnText}>Tap to retry</Text>
          </Pressable>
        </View>
      )}

      <View>
        <View style={[docStyles.inputRow, { borderColor: colors.border, backgroundColor: colors.card }]}>
          <TextInput
            style={[docStyles.textInput, { color: colors.foreground, flex: 1, marginLeft: 10 }]}
            placeholder="Ask about your documents…"
            placeholderTextColor={colors.mutedForeground}
            value={input}
            onChangeText={(text) => setInput(text.slice(0, 2000))}
            maxLength={2000}
            onSubmitEditing={ask}
            returnKeyType="send"
            multiline
          />
          <VoiceMicButton onTranscript={t => setInput(q => { const next = q ? `${q} ${t}` : t; return next.slice(0, 2000); })} disabled={loading} />
          <Pressable
            onPress={ask}
            disabled={loading || !input.trim()}
            style={[docStyles.sendBtn, { backgroundColor: colors.primary, opacity: (loading || !input.trim()) ? 0.5 : 1 }]}
          >
            <Feather name="send" size={13} color="#fff" />
          </Pressable>
        </View>
        <Text style={{
          fontSize: 11,
          fontFamily: "Inter_500Medium",
          color: input.length >= 2000 ? "#EF4444" : input.length >= 2000 * 0.8 ? "#F59E0B" : colors.mutedForeground,
          textAlign: "right",
          marginTop: 3,
        }}>
          {input.length}/2,000
        </Text>
      </View>
    </View>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function DocumentsTab({ projectId, clientUploads }: { projectId: number; clientUploads: any[] }) {
  const colors = useColors();
  const queryClient = useQueryClient();
  const { data: documents, refetch: refetchDocs } = useListDocuments(projectId);

  useFocusEffect(
    useCallback(() => {
      refetchDocs();
    }, [refetchDocs]),
  );
  const docs: ProjectDoc[] = (documents as unknown as ProjectDoc[]) ?? [];

  const { data: me } = useGetMe();
  const isOwnerOrForeman = me?.role === "owner" || me?.role === "foreman";

  const [uploading, setUploading] = useState(false);
  const [analyzingIds, setAnalyzingIds] = useState<Set<number>>(new Set());
  const [reindexingIds, setReindexingIds] = useState<Set<number>>(new Set());
  const [mode, setMode] = useState<"list" | "search" | "qa">("list");
  const [qaRetrying, setQaRetrying] = useState(false);
  const [qaWaiting, setQaWaiting] = useState(false);

  const handleQaRetryChange = useCallback((retrying: boolean, waiting: boolean) => {
    setQaRetrying(retrying);
    setQaWaiting(waiting);
  }, []);

  const docQueryKey = getListDocumentsQueryKey(projectId);

  const triggerAnalyze = useCallback(async (doc: ProjectDoc) => {
    setAnalyzingIds(prev => new Set(prev).add(doc.id));
    try {
      const updated = await customFetch(`/api/projects/${projectId}/documents/${doc.id}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }) as ProjectDoc;
      queryClient.setQueryData<ProjectDoc[]>(docQueryKey, (old = []) =>
        old.map(d => d.id === updated.id ? updated : d)
      );
    } catch {
      Alert.alert("Analysis failed", "Could not analyze this file. Please try again.");
    } finally {
      setAnalyzingIds(prev => { const s = new Set(prev); s.delete(doc.id); return s; });
    }
  }, [projectId, queryClient]);

  const handleUpload = useCallback(async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission needed", "Allow photo library access in Settings to upload images.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      quality: 0.85,
    });

    if (result.canceled || !result.assets.length) return;
    setUploading(true);

    for (const asset of result.assets) {
      try {
        const ext = (asset.fileName?.split(".").pop() ?? "jpg").toLowerCase();
        const mimeType = asset.mimeType ?? `image/${ext}`;
        const filename = asset.fileName ?? `photo_${Date.now()}.${ext}`;
        const fileSize = asset.fileSize ?? undefined;

        // 1. Request presigned upload URL
        const { uploadURL, objectPath } = await customFetch("/api/storage/uploads/request-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: filename, size: fileSize ?? 0, contentType: mimeType }),
        }) as { uploadURL: string; objectPath: string };

        // 2. Upload binary to storage
        await FileSystem.uploadAsync(uploadURL, asset.uri, {
          httpMethod: "PUT",
          uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
          headers: { "Content-Type": mimeType },
        });

        // 3. Register document
        const doc = await customFetch(`/api/projects/${projectId}/documents`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filename, fileType: mimeType, objectPath, fileSize }),
        }) as ProjectDoc;

        queryClient.invalidateQueries({ queryKey: docQueryKey });

        // 4. Auto-analyze images
        setAnalyzingIds(prev => new Set(prev).add(doc.id));
        try {
          const updated = await customFetch(`/api/projects/${projectId}/documents/${doc.id}/analyze`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
          }) as ProjectDoc;
          queryClient.setQueryData<ProjectDoc[]>(docQueryKey, (old = []) =>
            old.map(d => d.id === updated.id ? updated : d)
          );
        } finally {
          setAnalyzingIds(prev => { const s = new Set(prev); s.delete(doc.id); return s; });
        }
      } catch {
        Alert.alert("Upload failed", "Could not upload one or more photos.");
      }
    }
    setUploading(false);
  }, [projectId, queryClient]);

  const handleCamera = useCallback(async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission needed", "Allow camera access in Settings to take photos.");
      return;
    }

    const result = await ImagePicker.launchCameraAsync({ quality: 0.85 });
    if (result.canceled || !result.assets.length) return;

    const asset = result.assets[0];
    setUploading(true);
    try {
      const ext = "jpg";
      const mimeType = "image/jpeg";
      const filename = `site_photo_${Date.now()}.${ext}`;

      const { uploadURL, objectPath } = await customFetch("/api/storage/uploads/request-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: filename, size: asset.fileSize ?? 0, contentType: mimeType }),
      }) as { uploadURL: string; objectPath: string };

      await FileSystem.uploadAsync(uploadURL, asset.uri, {
        httpMethod: "PUT",
        uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
        headers: { "Content-Type": mimeType },
      });

      const doc = await customFetch(`/api/projects/${projectId}/documents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename, fileType: mimeType, objectPath, fileSize: asset.fileSize }),
      }) as ProjectDoc;

      queryClient.invalidateQueries({ queryKey: docQueryKey });

      setAnalyzingIds(prev => new Set(prev).add(doc.id));
      try {
        const updated = await customFetch(`/api/projects/${projectId}/documents/${doc.id}/analyze`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        }) as ProjectDoc;
        queryClient.setQueryData<ProjectDoc[]>(docQueryKey, (old = []) =>
          old.map(d => d.id === updated.id ? updated : d)
        );
      } finally {
        setAnalyzingIds(prev => { const s = new Set(prev); s.delete(doc.id); return s; });
      }
    } catch {
      Alert.alert("Upload failed", "Could not upload the photo.");
    } finally {
      setUploading(false);
    }
  }, [projectId, queryClient]);

  const handleReindex = useCallback(async (doc: ProjectDoc) => {
    setReindexingIds(prev => new Set(prev).add(doc.id));
    try {
      const result = await customFetch(`/api/projects/${projectId}/documents/${doc.id}/reindex`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }) as { chunkCount: number; message?: string };
      queryClient.setQueryData<ProjectDoc[]>(docQueryKey, (old = []) =>
        old.map(d => d.id === doc.id ? { ...d, chunkCount: result.chunkCount } : d)
      );
      Alert.alert(
        result.chunkCount > 0 ? "Re-indexed" : "Re-index complete",
        result.chunkCount > 0
          ? `${result.chunkCount} sections indexed for AI search.`
          : (result.message ?? "No text found. Try re-analyzing the document.")
      );
    } catch {
      Alert.alert("Failed", "Could not re-index. Please try again.");
    } finally {
      setReindexingIds(prev => { const s = new Set(prev); s.delete(doc.id); return s; });
    }
  }, [projectId, queryClient]);

  const analyzedCount = docs.filter(d => d.status === "ready").length;
  const indexedCount = docs.filter(d => (d.chunkCount ?? 0) > 0).length;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: 20, paddingBottom: 20, gap: 14 }}>

        {/* Header row */}
        <View style={docStyles.headerRow}>
          <View>
            <Text style={[docStyles.heading, { color: colors.foreground }]}>Documents</Text>
            {docs.length > 0 && (
              <Text style={[docStyles.subheading, { color: colors.mutedForeground }]}>
                {analyzedCount}/{docs.length} analyzed · {indexedCount}/{docs.length} indexed for AI{clientUploads.length > 0 ? ` · ${clientUploads.length} client` : ""}
              </Text>
            )}
          </View>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Pressable
              onPress={() => Alert.alert("Upload", "Choose a source", [
                { text: "Camera", onPress: handleCamera },
                { text: "Photo Library", onPress: handleUpload },
                { text: "Cancel", style: "cancel" },
              ])}
              disabled={uploading}
              style={[docStyles.headerBtn, { backgroundColor: colors.primary }]}
            >
              {uploading
                ? <ActivityIndicator size={14} color="#fff" />
                : <Feather name="upload" size={14} color="#fff" />}
            </Pressable>
          </View>
        </View>

        {/* Mode tabs */}
        <View style={[docStyles.modeRow, { backgroundColor: colors.muted, borderRadius: 10 }]}>
          {(["list", "search", "qa"] as const).map(m => {
            const active = mode === m;
            const icons = { list: "file", search: "search", qa: "message-square" } as const;
            const labels = { list: "Files", search: "Search", qa: "Ask AI" };
            return (
              <Pressable
                key={m}
                onPress={() => setMode(m)}
                style={[docStyles.modeTab, active && { backgroundColor: colors.card, shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 4, elevation: 2 }]}
              >
                <Feather name={icons[m]} size={13} color={active ? colors.primary : colors.mutedForeground} />
                <Text style={[docStyles.modeTabText, { color: active ? colors.primary : colors.mutedForeground }]}>{labels[m]}</Text>
              </Pressable>
            );
          })}
        </View>

        {/* Search panel */}
        {mode === "search" && (
          <View style={[docStyles.panel, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={docStyles.panelHeader}>
              <Feather name="search" size={14} color={colors.primary} />
              <Text style={[docStyles.panelTitle, { color: colors.foreground }]}>Document Search</Text>
              <View style={[docStyles.aiBadge, { backgroundColor: `${colors.primary}15` }]}>
                <Feather name="zap" size={9} color={colors.primary} />
                <Text style={[docStyles.aiBadgeText, { color: colors.primary }]}>AI</Text>
              </View>
            </View>
            <SearchPanel projectId={projectId} />
          </View>
        )}

        {/* Q&A panel */}
        {mode === "qa" && (
          <View style={[docStyles.panel, { backgroundColor: colors.card, borderColor: `${colors.primary}30` }]}>
            <View style={docStyles.panelHeader}>
              <Feather name="message-square" size={14} color={colors.primary} />
              <Text style={[docStyles.panelTitle, { color: colors.foreground }]}>Document Q&A</Text>
              <View style={[docStyles.aiBadge, { backgroundColor: `${colors.primary}15` }]}>
                <Feather name="zap" size={9} color={colors.primary} />
                <Text style={[docStyles.aiBadgeText, { color: colors.primary }]}>AI</Text>
              </View>
            </View>
            <QAPanel
              projectId={projectId}
              indexedCount={indexedCount}
              totalCount={docs.length}
              onRetryChange={handleQaRetryChange}
            />
          </View>
        )}

        {/* File list */}
        {mode === "list" && (
          <>
            {/* Tip */}
            <View style={[docStyles.tipBox, { backgroundColor: `${colors.primary}08`, borderColor: `${colors.primary}20` }]}>
              <Feather name="zap" size={13} color={colors.primary} style={{ marginTop: 1 }} />
              <Text style={[docStyles.tipText, { color: colors.mutedForeground }]}>
                Photos & receipts are analyzed automatically. Tap <Text style={{ fontFamily: "Inter_600SemiBold", color: colors.primary }}>Analyze</Text> on other files, then use Search or Ask AI.
              </Text>
            </View>

            {docs.length === 0 ? (
              <View style={docStyles.emptyBox}>
                <Feather name="folder" size={36} color={colors.border} />
                <Text style={[docStyles.emptyTitle, { color: colors.foreground }]}>No documents yet</Text>
                <Text style={[docStyles.emptySubtext, { color: colors.mutedForeground }]}>
                  Upload photos, receipts, or invoices using the upload button above.
                </Text>
              </View>
            ) : (
              <View style={{ gap: 10 }}>
                {[...docs].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).map(doc => {
                  const isAnalyzing = analyzingIds.has(doc.id);
                  const effectiveStatus: DocStatus = isAnalyzing ? "processing" : doc.status;
                  const isImage = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"].includes(doc.fileType.toLowerCase());
                  const isPdf = doc.fileType === "application/pdf";
                  const iconName = isImage ? "image" : isPdf ? "file-text" : "file";
                  const canAnalyze = !isAnalyzing && doc.status !== "processing" && doc.status !== "ready";

                  return (
                    <View key={doc.id} style={[docStyles.docCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                      <View style={docStyles.docCardMain}>
                        <View style={[docStyles.docIcon, { backgroundColor: `${colors.primary}15` }]}>
                          <Feather name={iconName as any} size={20} color={colors.primary} />
                        </View>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={[docStyles.docFilename, { color: colors.foreground }]} numberOfLines={1}>
                            {doc.filename}
                          </Text>
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 3, flexWrap: "wrap" }}>
                            {formatSize(doc.fileSize) && (
                              <Text style={[docStyles.docMeta, { color: colors.mutedForeground }]}>{formatSize(doc.fileSize)}</Text>
                            )}
                            <View style={[docStyles.statusChip, { backgroundColor: `${STATUS_COLORS[effectiveStatus]}15` }]}>
                              {effectiveStatus === "processing" && <ActivityIndicator size={10} color={STATUS_COLORS[effectiveStatus]} style={{ marginRight: 3 }} />}
                              <Text style={[docStyles.statusText, { color: STATUS_COLORS[effectiveStatus] }]}>
                                {STATUS_LABELS[effectiveStatus]}
                              </Text>
                            </View>
                            {doc.chunkCount != null && doc.chunkCount > 0 && (
                              <View style={[docStyles.statusChip, { backgroundColor: "#16a34a15", flexDirection: "row", alignItems: "center", gap: 3 }]}>
                                <Feather name="check-circle" size={9} color="#16a34a" />
                                <Text style={[docStyles.statusText, { color: "#16a34a" }]}>AI Ready</Text>
                              </View>
                            )}
                          </View>
                          <Text style={[docStyles.docMeta, { color: colors.mutedForeground, marginTop: 2 }]}>
                            {formatDate(doc.createdAt)}
                          </Text>
                        </View>
                        <View style={{ flexDirection: "row", gap: 4, alignItems: "center" }}>
                          {canAnalyze && (
                            <Pressable
                              onPress={() => triggerAnalyze(doc)}
                              style={[docStyles.analyzeBtn, { borderColor: colors.primary, backgroundColor: `${colors.primary}10` }]}
                            >
                              <Feather name="zap" size={11} color={colors.primary} />
                              <Text style={[docStyles.analyzeBtnText, { color: colors.primary }]}>Analyze</Text>
                            </Pressable>
                          )}
                          {isOwnerOrForeman && doc.status === "ready" && !doc.chunkCount && (
                            <Pressable
                              onPress={() => handleReindex(doc)}
                              disabled={reindexingIds.has(doc.id)}
                              style={[docStyles.analyzeBtn, { borderColor: "#3B82F6", backgroundColor: "#3B82F610", opacity: reindexingIds.has(doc.id) ? 0.6 : 1 }]}
                            >
                              {reindexingIds.has(doc.id)
                                ? <ActivityIndicator size={11} color="#3B82F6" />
                                : <Feather name="refresh-cw" size={11} color="#3B82F6" />}
                              <Text style={[docStyles.analyzeBtnText, { color: "#3B82F6" }]}>
                                {reindexingIds.has(doc.id) ? "Indexing…" : "Re-index"}
                              </Text>
                            </Pressable>
                          )}
                          <Pressable
                            onPress={() => openStorageFile(doc.objectPath, doc.filename, doc.fileType)}
                            style={[docStyles.iconBtn, { backgroundColor: colors.muted }]}
                          >
                            <Feather name="external-link" size={14} color={colors.mutedForeground} />
                          </Pressable>
                        </View>
                      </View>
                      <ExtractedPanel doc={doc} projectId={projectId} />
                    </View>
                  );
                })}
              </View>
            )}

            {/* Client uploads */}
            {clientUploads.length > 0 && (
              <View style={{ gap: 8, marginTop: 4 }}>
                <View style={docStyles.sectionLabelRow}>
                  <Feather name="user" size={13} color="#3B82F6" />
                  <Text style={[docStyles.sectionLabel, { color: colors.mutedForeground }]}>Client Uploads</Text>
                  <View style={docStyles.clientBadge}>
                    <Text style={docStyles.clientBadgeText}>{clientUploads.length}</Text>
                  </View>
                </View>
                {clientUploads.map((upload: any) => {
                  const isImage = ["image/jpeg", "image/jpg", "image/png", "image/webp"].includes((upload.fileType ?? "").toLowerCase());
                  const iconName = isImage ? "image" : "file-text";
                  return (
                    <Pressable
                      key={upload.id}
                      onPress={() => openStorageFile(upload.objectPath, upload.filename, upload.fileType)}
                      style={({ pressed }) => [docStyles.docCard, { backgroundColor: "#EFF6FF", borderColor: "#BFDBFE", opacity: pressed ? 0.85 : 1 }]}
                    >
                      <View style={docStyles.docCardMain}>
                        <View style={[docStyles.docIcon, { backgroundColor: "#3B82F618" }]}>
                          <Feather name={iconName as any} size={20} color="#3B82F6" />
                        </View>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={[docStyles.docFilename, { color: "#1E3A5F" }]} numberOfLines={1}>{upload.filename}</Text>
                          <View style={{ flexDirection: "row", gap: 6, marginTop: 3 }}>
                            {upload.fileSize && (
                              <Text style={[docStyles.docMeta, { color: "#64748B" }]}>{formatSize(upload.fileSize)}</Text>
                            )}
                            <View style={[docStyles.statusChip, { backgroundColor: "#3B82F618" }]}>
                              <Text style={[docStyles.statusText, { color: "#3B82F6" }]}>From Client</Text>
                            </View>
                          </View>
                          <Text style={[docStyles.docMeta, { color: "#64748B", marginTop: 2 }]}>{formatDate(upload.createdAt)}</Text>
                        </View>
                        <Feather name="external-link" size={14} color="#94A3B8" />
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </>
        )}
      </View>

      <RetrySnackbar
        visible={qaRetrying || qaWaiting}
        message={qaWaiting ? "Waiting for connection…" : "Poor connection detected, retrying…"}
      />
    </KeyboardAvoidingView>
  );
}

const docStyles = StyleSheet.create({
  headerRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  heading: { fontSize: 18, fontFamily: "Inter_700Bold" },
  subheading: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  headerBtn: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  modeRow: { flexDirection: "row", padding: 3, gap: 2 },
  modeTab: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingVertical: 8, borderRadius: 8 },
  modeTabText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  panel: { borderWidth: 1, borderRadius: 12, padding: 14, gap: 12 },
  panelHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 2 },
  panelTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold", flex: 1 },
  aiBadge: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  aiBadgeText: { fontSize: 10, fontFamily: "Inter_700Bold" },
  tipBox: { flexDirection: "row", gap: 8, borderWidth: 1, borderRadius: 10, padding: 10 },
  tipText: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 17, flex: 1 },
  emptyBox: { alignItems: "center", paddingVertical: 36, gap: 8 },
  emptyTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  emptySubtext: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", maxWidth: 260 },
  emptyText: { fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center", paddingVertical: 8 },
  docCard: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 0 },
  docCardMain: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  docIcon: { width: 44, height: 44, borderRadius: 10, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  docFilename: { fontSize: 14, fontFamily: "Inter_600SemiBold", flexShrink: 1 },
  docMeta: { fontSize: 11, fontFamily: "Inter_400Regular" },
  statusChip: { flexDirection: "row", alignItems: "center", paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8 },
  statusText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  analyzeBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8, borderWidth: 1 },
  analyzeBtnText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  iconBtn: { width: 32, height: 32, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  extractedHeader: { flexDirection: "row", alignItems: "center", gap: 6, padding: 8, borderRadius: 8, borderWidth: 1, marginTop: 8 },
  extractedHeaderText: { fontSize: 11, fontFamily: "Inter_600SemiBold", flex: 1 },
  extractedBody: { borderWidth: 1, borderTopWidth: 0, borderBottomLeftRadius: 8, borderBottomRightRadius: 8, padding: 10, gap: 0 },
  extractedSummary: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 17, fontStyle: "italic", marginBottom: 8 },
  fieldsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  fieldItem: { minWidth: "40%", gap: 1 },
  fieldLabel: { fontSize: 9, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.5 },
  fieldValue: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  lineItem: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 4, borderTopWidth: StyleSheet.hairlineWidth },
  lineItemDesc: { fontSize: 12, fontFamily: "Inter_400Regular", flex: 1 },
  lineItemAmt: { fontSize: 12, fontFamily: "Inter_600SemiBold", marginLeft: 8 },
  ocrText: { fontSize: 11, fontFamily: "Inter_400Regular", lineHeight: 16, borderRadius: 6, padding: 8 },
  amountPill: { flexDirection: "row", alignItems: "center", paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8, borderWidth: 1, marginLeft: "auto" as any },
  amountPillText: { fontSize: 10, fontFamily: "Inter_700Bold" },
  pushBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 9, borderRadius: 9 },
  pushBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#fff" },
  pushedBadge: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 7, paddingHorizontal: 10, borderRadius: 9, borderWidth: 1 },
  pushedText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  sectionLabelRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  sectionLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.5, flex: 1 },
  clientBadge: { backgroundColor: "#3B82F620", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  clientBadgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: "#3B82F6" },
  inputRow: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 12, overflow: "hidden", gap: 6, paddingRight: 6, paddingVertical: 4 },
  textInput: { fontSize: 13, fontFamily: "Inter_400Regular", paddingVertical: 6, minHeight: 32 },
  micBtn: { width: 32, height: 32, borderRadius: 8, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  sendBtn: { width: 32, height: 32, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  aiAnswerBox: { flexDirection: "row", gap: 8, borderWidth: 1, borderRadius: 10, padding: 10 },
  aiAnswerText: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18, flex: 1 },
  searchResultRow: { flexDirection: "row", alignItems: "center", gap: 10, padding: 10, borderRadius: 10, borderWidth: 1 },
  relevanceChip: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8 },
  relevanceText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  aiBubbleHeader: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 3, paddingLeft: 2 },
  bubble: { maxWidth: "88%", borderRadius: 14, padding: 10 },
  bubbleText: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19 },
  citationChip: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  citationText: { fontSize: 10, fontFamily: "Inter_500Medium", maxWidth: 140 },
  starterChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, borderWidth: 1 },
  starterText: { fontSize: 12, fontFamily: "Inter_400Regular" },
  qaErrorBox: { borderWidth: 1, borderRadius: 12, padding: 14, gap: 10, marginBottom: 6 },
  qaErrorTop: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  qaErrorMsg: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", color: "#B91C1C", lineHeight: 19 },
  qaRetryBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 8, paddingVertical: 9, paddingHorizontal: 14 },
  qaRetryBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#FFFFFF" },
});
