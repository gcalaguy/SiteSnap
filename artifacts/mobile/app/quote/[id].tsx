import React, { useState, useCallback } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { Feather } from "@expo/vector-icons";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system/legacy";
import * as XLSX from "xlsx";
import { useColors } from "@/hooks/useColors";
import { useRelativeTime } from "@/hooks/useRelativeTime";
import {
  useGetQuote,
  useSubmitQuoteForApproval,
  useUnsubmitQuote,
  useConvertQuoteToInvoice,
  useDeleteQuote,
  useApproveQuote,
  useRejectQuote,
  useGetMe,
  getGetQuoteQueryKey,
  getListAllQuotesQueryKey,
  getListQuotesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { Share as RNShare } from "react-native";

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  pending_approval: "Submitted",
  approved: "Approved",
  rejected: "Needs Revision",
  converted: "Invoiced",
};
const STATUS_COLORS: Record<string, string> = {
  draft: "#6B7280",
  pending_approval: "#2563EB",
  approved: "#16A34A",
  rejected: "#EA580C",
  converted: "#7C3AED",
};

type LineItem = { description: string; quantity: number; unit: string; unitPrice: number; total: number };

function fmtCAD(v: string | number) {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(Number(v));
}

function buildQuoteHTML(quote: any, lineItems: LineItem[]): string {
  const itemRows = lineItems.map((item) => `
    <tr>
      <td>${item.description}</td>
      <td style="text-align:right">${item.quantity}</td>
      <td style="text-align:right">${item.unit}</td>
      <td style="text-align:right">${fmtCAD(item.unitPrice)}</td>
      <td style="text-align:right">${fmtCAD(item.total)}</td>
    </tr>`).join("");
  const hstPct = (parseFloat(quote.taxRate ?? "0.13") * 100).toFixed(0);
  const validUntil = quote.validUntil ? new Date(quote.validUntil).toLocaleDateString("en-CA", { year: "numeric", month: "long", day: "numeric" }) : "—";
  const createdAt = new Date(quote.createdAt).toLocaleDateString("en-CA", { year: "numeric", month: "long", day: "numeric" });
  const statusLabel = STATUS_LABELS[quote.status] ?? quote.status;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    body{font-family:Helvetica,Arial,sans-serif;margin:0;padding:0;color:#0A0A0A}
    .header{background:#D4AF37;color:#fff;padding:24px 32px}
    .header h1{margin:0;font-size:20px}
    .header p{margin:4px 0 0;opacity:.8;font-size:13px}
    .inv-num{float:right;text-align:right}
    .body{padding:32px}
    .meta{display:flex;justify-content:space-between;background:#f5f5f5;border-radius:6px;padding:16px;margin-bottom:24px}
    table{width:100%;border-collapse:collapse;margin:24px 0}
    th{background:#0A0A0A;color:#fff;padding:10px 12px;text-align:left;font-size:12px}
    th:not(:first-child){text-align:right}
    td{padding:9px 12px;font-size:13px;border-bottom:1px solid #eee}
    .totals{float:right;width:260px;margin-top:16px}
    .totals tr td{border-bottom:none;padding:5px 8px}
    .totals .grand td{background:#D4AF37;color:#fff;font-weight:bold;border-radius:4px}
    .footer{margin-top:40px;text-align:center;font-size:11px;color:#9CA3AF}
    .clearfix::after{content:"";display:table;clear:both}
  </style></head><body>
  <div class="header"><div class="inv-num"><div style="font-size:13px;opacity:.75">QUOTE</div><div style="font-size:20px;font-weight:bold">${quote.quoteNumber}</div><div style="font-size:11px;opacity:.7;margin-top:2px">Status: ${statusLabel}</div></div><h1>Site Snap</h1><p>Professional Construction Quote</p></div>
  <div class="body">
  <div class="meta">
    <div><div style="font-size:11px;color:#6B7280;font-weight:bold;margin-bottom:4px">CLIENT</div><div style="font-weight:bold;font-size:15px">${quote.clientName}</div>${quote.clientEmail ? `<div style="font-size:12px;color:#6B7280">${quote.clientEmail}</div>` : ""}</div>
    <div style="text-align:right"><div style="font-size:11px;color:#6B7280;font-weight:bold;margin-bottom:4px">DATES</div><div style="font-size:12px">Issued: ${createdAt}</div><div style="font-size:12px">Valid Until: ${validUntil}</div></div>
  </div>
  <div style="font-size:18px;font-weight:bold;margin-bottom:16px">${quote.title}</div>
  <table><thead><tr><th>Description</th><th style="text-align:right">Qty</th><th style="text-align:right">Unit</th><th style="text-align:right">Unit Price</th><th style="text-align:right">Total</th></tr></thead><tbody>${itemRows}</tbody></table>
  <div class="clearfix">
  <table class="totals"><tbody>
    <tr><td style="color:#6B7280">Subtotal</td><td style="text-align:right">${fmtCAD(quote.subtotal)}</td></tr>
    <tr><td style="color:#6B7280">HST (${hstPct}%)</td><td style="text-align:right">${fmtCAD(quote.taxAmount)}</td></tr>
    <tr class="grand"><td>TOTAL CAD</td><td style="text-align:right">${fmtCAD(quote.total)}</td></tr>
  </tbody></table>
  </div>
  ${quote.notes ? `<div style="margin-top:32px;clear:both"><div style="font-size:11px;font-weight:bold;color:#6B7280;margin-bottom:6px">NOTES</div><div style="font-size:13px;line-height:1.6">${quote.notes}</div></div>` : ""}
  ${quote.signedAt && quote.signatureData ? `
  <div style="margin-top:36px;clear:both;border:1px solid #d1d5db;border-radius:6px;padding:12px;width:280px;float:right">
    <div style="font-size:9px;font-weight:bold;color:#6B7280;letter-spacing:0.5px;margin-bottom:6px">CLIENT SIGNATURE</div>
    <img src="${quote.signatureData}" style="max-width:100%;max-height:70px;display:block"/>
    ${quote.signerName ? `<div style="font-size:11px;font-weight:bold;margin-top:4px">${quote.signerName}</div>` : ""}
  </div>
  <div style="clear:both;margin-top:16px;font-size:9px;color:#6B7280">
    Digitally signed on ${new Date(quote.signedAt).toUTCString()}${quote.signerIp ? ` from IP ${quote.signerIp}` : ""}
  </div>` : ""}
  <div class="footer">Generated by Site Snap · ${quote.quoteNumber}</div>
  </div></body></html>`;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const colors = useColors();
  return (
    <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>{title}</Text>
      {children}
    </View>
  );
}

function InfoRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  const colors = useColors();
  return (
    <View style={styles.infoRow}>
      <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <Text style={[styles.infoValue, { color: highlight ? colors.primary : colors.foreground }]}>{value}</Text>
    </View>
  );
}

export default function QuoteDetailScreen() {
  const { id, projectId: projectIdParam } = useLocalSearchParams<{ id: string; projectId?: string }>();
  const quoteId = parseInt(id ?? "0");
  const projectId = parseInt(projectIdParam ?? "0");
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();

  const { data: quote, isLoading, dataUpdatedAt, refetch } = useGetQuote(projectId, quoteId, {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    query: { enabled: quoteId > 0 } as any,
  });
  useFocusEffect(useCallback(() => { refetch(); }, [refetch]));
  const updatedLabel = useRelativeTime(dataUpdatedAt || null);
  const { data: me } = useGetMe();
  const isAuthorized = me?.role === "owner" || me?.role === "foreman";
  const submitQuote = useSubmitQuoteForApproval();
  const unsubmitQuote = useUnsubmitQuote();
  const convertQuote = useConvertQuoteToInvoice();
  const deleteQuote = useDeleteQuote();
  const approveQuote = useApproveQuote();
  const rejectQuote = useRejectQuote();

  const [exporting, setExporting] = useState<"pdf" | "xlsx" | null>(null);

  const lineItems: LineItem[] = (quote?.lineItems ?? []) as LineItem[];
  const statusColor = STATUS_COLORS[quote?.status ?? "draft"] ?? "#6B7280";

  function invalidate() {
    qc.invalidateQueries({ queryKey: getGetQuoteQueryKey(projectId, quoteId) });
    qc.invalidateQueries({ queryKey: getListAllQuotesQueryKey({}) });
    qc.invalidateQueries({ queryKey: getListQuotesQueryKey(projectId) });
  }

  const handleExportPDF = useCallback(async () => {
    if (!quote) return;
    setExporting("pdf");
    try {
      const html = buildQuoteHTML(quote, lineItems);
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      const dest = `${FileSystem.cacheDirectory}${quote.quoteNumber}.pdf`;
      await FileSystem.copyAsync({ from: uri, to: dest });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(dest, { mimeType: "application/pdf", UTI: "com.adobe.pdf" });
      } else {
        Alert.alert("Sharing is not available on this device.");
      }
    } catch {
      Alert.alert("Failed to export PDF. Please try again.");
    } finally {
      setExporting(null);
    }
  }, [quote, lineItems]);

  const handleExportXLSX = useCallback(async () => {
    if (!quote) return;
    setExporting("xlsx");
    try {
      const wsData = [
        ["Quote Number", quote.quoteNumber],
        ["Title", quote.title],
        ["Client", quote.clientName],
        ["Status", STATUS_LABELS[quote.status] ?? quote.status],
        ["Valid Until", quote.validUntil ?? ""],
        [],
        ["Description", "Qty", "Unit", "Unit Price", "Total"],
        ...lineItems.map((item) => [item.description, item.quantity, item.unit, Number(item.unitPrice), Number(item.total)]),
        [],
        ["Subtotal", "", "", "", Number(quote.subtotal)],
        [`HST (${(parseFloat(quote.taxRate ?? "0.13") * 100).toFixed(0)}%)`, "", "", "", Number(quote.taxAmount)],
        ["TOTAL", "", "", "", Number(quote.total)],
      ];
      const ws = XLSX.utils.aoa_to_sheet(wsData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Quote");
      const xlsxBase64 = XLSX.write(wb, { type: "base64", bookType: "xlsx" });
      const dest = `${FileSystem.cacheDirectory}${quote.quoteNumber}.xlsx`;
      await FileSystem.writeAsStringAsync(dest, xlsxBase64, { encoding: FileSystem.EncodingType.Base64 });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(dest, { mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", UTI: "com.microsoft.excel.xlsx" });
      } else {
        Alert.alert("Sharing is not available on this device.");
      }
    } catch {
      Alert.alert("Failed to export Excel. Please try again.");
    } finally {
      setExporting(null);
    }
  }, [quote, lineItems]);

  const handleSubmit = useCallback(() => {
    Alert.alert(
      "Submit Quote?",
      "The foreman and owner will be notified by email to review this quote. Make sure all line items and totals are correct.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Submit",
          onPress: () => {
            submitQuote.mutate({ projectId, quoteId }, {
              onSuccess: () => {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                Alert.alert("Quote Submitted", "The foreman and owner have been notified by email.");
                invalidate();
              },
              onError: () => Alert.alert("Failed to submit quote"),
            });
          },
        },
      ]
    );
  }, [quoteId, submitQuote]);

  const handleUnsubmit = useCallback(() => {
    Alert.alert(
      "Unsubmit Quote?",
      "This will move the quote back to Draft so you can make edits before resubmitting.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Unsubmit",
          style: "destructive",
          onPress: () => {
            unsubmitQuote.mutate({ projectId, quoteId }, {
              onSuccess: () => {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                invalidate();
              },
              onError: () => Alert.alert("Failed to unsubmit quote"),
            });
          },
        },
      ]
    );
  }, [projectId, quoteId, unsubmitQuote]);

  const handleConvert = useCallback(() => {
    Alert.alert("Convert to Invoice?", "A new invoice will be created from this quote.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Convert", onPress: () => {
          convertQuote.mutate({ projectId: quote?.projectId ?? 0, quoteId, data: {} }, {
            onSuccess: (inv) => {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              Alert.alert("Invoice Created", `Invoice ${inv.invoiceNumber} is ready.`);
              invalidate();
              router.replace("/finance");
            },
            onError: () => Alert.alert("Failed to convert quote"),
          });
        }
      },
    ]);
  }, [quote, quoteId, convertQuote, router]);

  const handleDelete = useCallback(() => {
    Alert.alert(
      "Delete Quote?",
      "This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            deleteQuote.mutate({ projectId: quote?.projectId ?? 0, quoteId }, {
              onSuccess: () => {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                qc.invalidateQueries({ queryKey: getListAllQuotesQueryKey({}) });
                qc.invalidateQueries({ queryKey: getListQuotesQueryKey(projectId) });
                router.replace("/finance");
              },
              onError: () => Alert.alert("Failed to delete quote"),
            });
          },
        },
      ]
    );
  }, [quote, quoteId, deleteQuote, projectId, qc, router]);

  const topInsets = Platform.OS === "web" ? 67 : insets.top;
  const isEditable = quote?.status === "draft" || quote?.status === "rejected";
  const isSubmitted = quote?.status === "pending_approval";

  const handleApproveQuote = useCallback(() => {
    if (!isAuthorized) return;
    Alert.alert("Approve Quote?", `Approve ${quote?.quoteNumber}?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Approve", onPress: () => {
          approveQuote.mutate({ projectId, quoteId }, {
            onSuccess: () => {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              Alert.alert("Approved", "Quote has been approved.");
              invalidate();
            },
            onError: () => Alert.alert("Failed to approve quote"),
          });
        },
      },
    ]);
  }, [quote, isAuthorized, projectId, quoteId, approveQuote]);

  const handleRejectQuote = useCallback(() => {
    if (!isAuthorized) return;
    Alert.alert("Reject Quote?", `Send ${quote?.quoteNumber} back for revision?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Reject", style: "destructive", onPress: () => {
          rejectQuote.mutate({ projectId, quoteId, data: { reason: "" } }, {
            onSuccess: () => {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              Alert.alert("Rejected", "Quote sent back for revision.");
              invalidate();
            },
            onError: () => Alert.alert("Failed to reject quote"),
          });
        },
      },
    ]);
  }, [quote, isAuthorized, projectId, quoteId, rejectQuote]);

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { paddingTop: topInsets + 8, backgroundColor: colors.sidebar }]}>
          <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={10}>
            <Feather name="arrow-left" size={22} color="#FFFFFF" />
          </Pressable>
          <Text style={styles.headerTitle}>Quote</Text>
          <View style={{ width: 36 }} />
        </View>
        <View style={styles.center}><ActivityIndicator color={colors.primary} size="large" /></View>
      </View>
    );
  }

  if (!quote) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { paddingTop: topInsets + 8, backgroundColor: colors.sidebar }]}>
          <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={10}>
            <Feather name="arrow-left" size={22} color="#FFFFFF" />
          </Pressable>
          <Text style={styles.headerTitle}>Quote</Text>
          <View style={{ width: 36 }} />
        </View>
        <View style={styles.center}>
          <Text style={{ color: colors.mutedForeground }}>Quote not found</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topInsets + 8, backgroundColor: colors.sidebar }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={10}>
          <Feather name="arrow-left" size={22} color="#FFFFFF" />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>{quote.quoteNumber}</Text>
        {isEditable && (
          <Pressable
            onPress={() => router.push({ pathname: "/quote/edit", params: { id: String(quoteId), projectId: String(projectId) } })}
            hitSlop={10}
          >
            <Feather name="edit-2" size={20} color="#FFFFFF" />
          </Pressable>
        )}
        {!isEditable && <View style={{ width: 36 }} />}
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Title + Status */}
        <View style={[styles.titleCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
            <Text style={[styles.quoteTitle, { color: colors.foreground, flex: 1, marginRight: 8 }]}>{quote.title}</Text>
            <View style={[styles.statusBadge, { backgroundColor: `${statusColor}18` }]}>
              <Text style={[styles.statusText, { color: statusColor }]}>{STATUS_LABELS[quote.status] ?? quote.status}</Text>
            </View>
          </View>
          <Text style={[styles.quoteNum, { color: colors.mutedForeground }]}>{quote.quoteNumber}</Text>
          {!!updatedLabel && (
            <Text style={[styles.updatedLabel, { color: colors.mutedForeground }]}>{updatedLabel}</Text>
          )}

          {/* Submitted notice */}
          {quote.status === "pending_approval" && (
            <View style={[styles.submittedBanner, { backgroundColor: "#DBEAFE", borderColor: "#BFDBFE" }]}>
              <Feather name="clock" size={13} color="#2563EB" />
              <Text style={styles.submittedBannerText}>Awaiting review by foreman and owner</Text>
            </View>
          )}
          {quote.status === "rejected" && (
            <View style={[styles.submittedBanner, { backgroundColor: "#FFF7ED", borderColor: "#FDBA74" }]}>
              <Feather name="alert-circle" size={13} color="#EA580C" />
              <Text style={[styles.submittedBannerText, { color: "#EA580C" }]}>Needs revision — edit and re-submit</Text>
            </View>
          )}
          {(quote as any).signedAt && (
            <View style={[styles.submittedBanner, { backgroundColor: "#DCFCE7", borderColor: "#86EFAC" }]}>
              <Feather name="shield" size={13} color="#16A34A" />
              <Text style={[styles.submittedBannerText, { color: "#15803D" }]}>
                Signature Verified · {(quote as any).signerName ?? "Client"}
              </Text>
            </View>
          )}
        </View>

        {(quote as any).publicToken && quote.status !== "draft" && quote.status !== "rejected" && (
          <View style={[styles.actionGroup, { borderColor: colors.border }]}>
            <Text style={[styles.actionGroupTitle, { color: colors.mutedForeground }]}>CLIENT SIGNING</Text>
            <Pressable
              style={[styles.exportBtn, { backgroundColor: colors.card, borderColor: colors.border, width: "100%" }]}
              onPress={async () => {
                const domain = process.env.EXPO_PUBLIC_DOMAIN;
                const url = domain ? `https://${domain}/q/${(quote as any).publicToken}` : `/q/${(quote as any).publicToken}`;
                try {
                  await RNShare.share({ message: `Please review and sign this quote: ${url}`, url });
                } catch {
                  Alert.alert("Sign link", url);
                }
              }}
            >
              <Feather name="share-2" size={18} color={colors.primary} />
              <Text style={[styles.exportBtnText, { color: colors.foreground }]}>Share Sign Link</Text>
            </Pressable>
          </View>
        )}

        {(quote as any).signedAt && (quote as any).signatureData && (
          <Section title="SIGNATURE">
            <View style={{ alignItems: "flex-start", gap: 6 }}>
              <View style={{ borderWidth: 1, borderColor: colors.border, padding: 8, borderRadius: 6, backgroundColor: "#fff" }}>
                <Text style={{ fontSize: 11, color: colors.mutedForeground }}>{(quote as any).signerName ?? "Client signature"}</Text>
              </View>
              <Text style={{ fontSize: 11, color: colors.mutedForeground }}>
                UTC: {new Date((quote as any).signedAt).toUTCString()}
              </Text>
              {(quote as any).signerIp && (
                <Text style={{ fontSize: 11, color: colors.mutedForeground }}>
                  IP: {(quote as any).signerIp}
                </Text>
              )}
            </View>
          </Section>
        )}

        {/* Info */}
        <Section title="QUOTE DETAILS">
          <InfoRow label="Client" value={quote.clientName} />
          {quote.clientEmail && <InfoRow label="Email" value={quote.clientEmail} />}
          {quote.validUntil && <InfoRow label="Valid Until" value={new Date(quote.validUntil).toLocaleDateString("en-CA", { year: "numeric", month: "long", day: "numeric" })} />}
          <InfoRow label="Created" value={new Date(quote.createdAt).toLocaleDateString("en-CA", { year: "numeric", month: "long", day: "numeric" })} />
        </Section>

        {/* Line Items */}
        {lineItems.length > 0 && (
          <Section title="LINE ITEMS">
            {lineItems.map((item, i) => (
              <View key={i} style={[styles.lineItem, { borderBottomColor: colors.border, borderBottomWidth: i < lineItems.length - 1 ? 1 : 0 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.lineDesc, { color: colors.foreground }]}>{item.description}</Text>
                  <Text style={[styles.lineMeta, { color: colors.mutedForeground }]}>
                    {item.quantity} {item.unit} × {fmtCAD(item.unitPrice)}
                  </Text>
                </View>
                <Text style={[styles.lineTotal, { color: colors.primary }]}>{fmtCAD(item.total)}</Text>
              </View>
            ))}
          </Section>
        )}

        {/* Totals */}
        <Section title="TOTALS">
          <InfoRow label="Subtotal" value={fmtCAD(quote.subtotal)} />
          <InfoRow label={`HST (${(parseFloat(quote.taxRate ?? "0.13") * 100).toFixed(0)}%)`} value={fmtCAD(quote.taxAmount)} />
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <InfoRow label="Total" value={fmtCAD(quote.total)} highlight />
        </Section>

        {quote.notes && (
          <Section title="NOTES">
            <Text style={[styles.notes, { color: colors.foreground }]}>{quote.notes}</Text>
          </Section>
        )}

        {/* Export */}
        <View style={[styles.actionGroup, { borderColor: colors.border }]}>
          <Text style={[styles.actionGroupTitle, { color: colors.mutedForeground }]}>EXPORT</Text>
          <View style={styles.actionRow}>
            <Pressable
              style={[styles.exportBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={handleExportPDF}
              disabled={exporting !== null}
            >
              {exporting === "pdf" ? <ActivityIndicator color={colors.primary} size="small" /> : <Feather name="file-text" size={18} color={colors.primary} />}
              <Text style={[styles.exportBtnText, { color: colors.foreground }]}>PDF</Text>
            </Pressable>
            <Pressable
              style={[styles.exportBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={handleExportXLSX}
              disabled={exporting !== null}
            >
              {exporting === "xlsx" ? <ActivityIndicator color="#22C55E" size="small" /> : <Feather name="grid" size={18} color="#22C55E" />}
              <Text style={[styles.exportBtnText, { color: colors.foreground }]}>Excel</Text>
            </Pressable>
          </View>
        </View>

        {/* Actions */}
        {(isEditable || isSubmitted || quote.status === "approved") && (
          <View style={[styles.actionGroup, { borderColor: colors.border }]}>
            <Text style={[styles.actionGroupTitle, { color: colors.mutedForeground }]}>ACTIONS</Text>
            <View style={styles.actionCol}>
              {/* Submit (draft or needs revision) */}
              {isEditable && (
                <Pressable
                  style={[styles.actionBtnFull, { backgroundColor: colors.primary }]}
                  onPress={handleSubmit}
                  disabled={submitQuote.isPending}
                >
                  {submitQuote.isPending
                    ? <ActivityIndicator color="#FFFFFF" size="small" />
                    : <Feather name="send" size={18} color="#FFFFFF" />
                  }
                  <Text style={[styles.actionBtnText, { color: "#FFFFFF", fontFamily: "Inter_700Bold" }]}>
                    Submit to Foreman & Owner
                  </Text>
                </Pressable>
              )}
              {/* Unsubmit (pending_approval) */}
              {isSubmitted && (
                <Pressable
                  style={[styles.actionBtnFull, { backgroundColor: "#EFF6FF", borderColor: "#BFDBFE", borderWidth: 1 }]}
                  onPress={handleUnsubmit}
                  disabled={unsubmitQuote.isPending}
                >
                  {unsubmitQuote.isPending
                    ? <ActivityIndicator color="#2563EB" size="small" />
                    : <Feather name="rotate-ccw" size={18} color="#2563EB" />
                  }
                  <Text style={[styles.actionBtnText, { color: "#2563EB" }]}>Unsubmit (Back to Draft)</Text>
                </Pressable>
              )}
              {/* Approve / Reject (pending_approval, owner/foreman only) */}
              {isSubmitted && isAuthorized && (
                <>
                  <Pressable
                    style={[styles.actionBtnFull, { backgroundColor: "#DCFCE7", borderColor: "#86EFAC", borderTopWidth: 1 }]}
                    onPress={handleApproveQuote}
                    disabled={approveQuote.isPending}
                  >
                    {approveQuote.isPending
                      ? <ActivityIndicator color="#16A34A" size="small" />
                      : <Feather name="check-circle" size={18} color="#16A34A" />
                    }
                    <Text style={[styles.actionBtnText, { color: "#16A34A" }]}>Approve Quote</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.actionBtnFull, { backgroundColor: "#FEF2F2", borderColor: "#FECACA", borderTopWidth: 1 }]}
                    onPress={handleRejectQuote}
                    disabled={rejectQuote.isPending}
                  >
                    {rejectQuote.isPending
                      ? <ActivityIndicator color="#DC2626" size="small" />
                      : <Feather name="x-circle" size={18} color="#DC2626" />
                    }
                    <Text style={[styles.actionBtnText, { color: "#DC2626" }]}>Reject Quote</Text>
                  </Pressable>
                </>
              )}
              {/* Convert to invoice */}
              {quote.status === "approved" && (
                <Pressable
                  style={[styles.actionBtnFull, { backgroundColor: colors.primary + "18", borderColor: colors.primary + "40", borderTopWidth: isEditable ? 1 : 0 }]}
                  onPress={handleConvert}
                  disabled={convertQuote.isPending}
                >
                  {convertQuote.isPending
                    ? <ActivityIndicator color={colors.primary} size="small" />
                    : <Feather name="file-plus" size={18} color={colors.primary} />
                  }
                  <Text style={[styles.actionBtnText, { color: colors.primary }]}>Convert to Invoice</Text>
                </Pressable>
              )}
              {/* Delete (draft or needs revision) */}
              {isEditable && (
                <Pressable
                  style={[styles.actionBtnFull, { backgroundColor: "#FEF2F2", borderColor: "#FECACA", borderTopWidth: 1 }]}
                  onPress={handleDelete}
                  disabled={deleteQuote.isPending}
                >
                  {deleteQuote.isPending
                    ? <ActivityIndicator color="#DC2626" size="small" />
                    : <Feather name="trash-2" size={18} color="#DC2626" />
                  }
                  <Text style={[styles.actionBtnText, { color: "#DC2626" }]}>Delete Quote</Text>
                </Pressable>
              )}
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingBottom: 16 },
  backBtn: { width: 36 },
  headerTitle: { fontSize: 17, fontFamily: "Inter_700Bold", color: "#FFFFFF", flex: 1, textAlign: "center" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: { padding: 16, gap: 12 },
  titleCard: { borderRadius: 12, padding: 16, borderWidth: 1, gap: 4 },
  quoteTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  quoteNum: { fontSize: 13, fontFamily: "Inter_400Regular" },
  updatedLabel: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 4 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  statusText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  submittedBanner: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10, padding: 10, borderRadius: 8, borderWidth: 1 },
  submittedBannerText: { fontSize: 12, fontFamily: "Inter_500Medium", color: "#2563EB", flex: 1 },
  section: { borderRadius: 12, padding: 16, borderWidth: 1 },
  sectionTitle: { fontSize: 11, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 12 },
  infoRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", paddingVertical: 4 },
  infoLabel: { fontSize: 13, fontFamily: "Inter_400Regular", flex: 1 },
  infoValue: { fontSize: 13, fontFamily: "Inter_500Medium", textAlign: "right", flex: 1 },
  lineItem: { flexDirection: "row", alignItems: "flex-start", gap: 12, paddingVertical: 10 },
  lineDesc: { fontSize: 14, fontFamily: "Inter_500Medium" },
  lineMeta: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  lineTotal: { fontSize: 14, fontFamily: "Inter_700Bold" },
  divider: { height: 1, marginVertical: 8 },
  notes: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 22 },
  actionGroup: { borderRadius: 12, borderWidth: 1, overflow: "hidden" },
  actionGroupTitle: { fontSize: 11, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.5, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  actionRow: { flexDirection: "row" },
  actionCol: { gap: 0 },
  exportBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, padding: 14, flex: 1, borderTopWidth: StyleSheet.hairlineWidth },
  exportBtnText: { fontSize: 14, fontFamily: "Inter_500Medium" },
  actionBtnFull: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16 },
  actionBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
});
