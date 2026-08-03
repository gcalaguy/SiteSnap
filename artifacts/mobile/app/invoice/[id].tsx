import React, { useState, useCallback } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  Share,
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
import * as XLSX from "@e965/xlsx";
import { useColors } from "@/hooks/useColors";
import { useRelativeTime } from "@/hooks/useRelativeTime";
import {
  useGetInvoice,
  useMarkInvoiceSent,
  useMarkInvoicePaid,
  useSendInvoiceEmail,
  useSendInvoiceReminder,
  useGetMe,
  getGetInvoiceQueryKey,
  getListAllInvoicesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft", sent: "Sent", paid: "Paid", overdue: "Overdue", cancelled: "Cancelled",
};
const STATUS_COLORS: Record<string, string> = {
  draft: "#6B7280", sent: "#3B82F6", paid: "#22C55E", overdue: "#EF4444", cancelled: "#9CA3AF",
};

type LineItem = { description: string; quantity: number; unit: string; unitPrice: number; total: number };

function fmtCAD(v: string | number) {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(Number(v));
}

function buildInvoiceHTML(invoice: any, lineItems: LineItem[], companyName: string): string {
  const itemRows = lineItems.map((item) => `
    <tr>
      <td>${item.description}</td>
      <td style="text-align:right">${item.quantity}</td>
      <td style="text-align:right">${item.unit}</td>
      <td style="text-align:right">${fmtCAD(item.unitPrice)}</td>
      <td style="text-align:right">${fmtCAD(item.total)}</td>
    </tr>`).join("");
  const hstPct = (parseFloat(invoice.taxRate ?? "0.13") * 100).toFixed(0);
  const dueDate = invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString("en-CA", { year: "numeric", month: "long", day: "numeric" }) : "—";
  const createdAt = new Date(invoice.createdAt).toLocaleDateString("en-CA", { year: "numeric", month: "long", day: "numeric" });
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
  <div class="header"><div class="inv-num"><div style="font-size:13px;opacity:.75">INVOICE</div><div style="font-size:20px;font-weight:bold">${invoice.invoiceNumber}</div><div style="font-size:11px;opacity:.7;margin-top:2px">Status: ${STATUS_LABELS[invoice.status] ?? invoice.status}</div></div><h1>${companyName}</h1><p>Professional Construction Services</p></div>
  <div class="body">
  <div class="meta">
    <div><div style="font-size:11px;color:#6B7280;font-weight:bold;margin-bottom:4px">BILL TO</div><div style="font-weight:bold;font-size:15px">${invoice.clientName}</div>${invoice.clientEmail ? `<div style="font-size:12px;color:#6B7280">${invoice.clientEmail}</div>` : ""}</div>
    <div style="text-align:right"><div style="font-size:11px;color:#6B7280;font-weight:bold;margin-bottom:4px">DATES</div><div style="font-size:12px">Issued: ${createdAt}</div><div style="font-size:12px">Due: ${dueDate}</div></div>
  </div>
  <div style="font-size:18px;font-weight:bold;margin-bottom:16px">${invoice.title}</div>
  <table><thead><tr><th>Description</th><th style="text-align:right">Qty</th><th style="text-align:right">Unit</th><th style="text-align:right">Unit Price</th><th style="text-align:right">Total</th></tr></thead><tbody>${itemRows}</tbody></table>
  <div class="clearfix">
  <table class="totals"><tbody>
    <tr><td style="color:#6B7280">Subtotal</td><td style="text-align:right">${fmtCAD(invoice.subtotal)}</td></tr>
    <tr><td style="color:#6B7280">HST (${hstPct}%)</td><td style="text-align:right">${fmtCAD(invoice.taxAmount)}</td></tr>
    <tr class="grand"><td>TOTAL CAD</td><td style="text-align:right">${fmtCAD(invoice.total)}</td></tr>
  </tbody></table>
  </div>
  ${invoice.notes ? `<div style="margin-top:32px;clear:both"><div style="font-size:11px;font-weight:bold;color:#6B7280;margin-bottom:6px">NOTES</div><div style="font-size:13px;line-height:1.6">${invoice.notes}</div></div>` : ""}
  ${invoice.signedAt && invoice.signatureData ? `
  <div style="margin-top:36px;clear:both;border:1px solid #d1d5db;border-radius:6px;padding:12px;width:280px;float:right">
    <div style="font-size:9px;font-weight:bold;color:#6B7280;letter-spacing:0.5px;margin-bottom:6px">CLIENT SIGNATURE</div>
    <img src="${invoice.signatureData}" style="max-width:100%;max-height:70px;display:block"/>
    ${invoice.signerName ? `<div style="font-size:11px;font-weight:bold;margin-top:4px">${invoice.signerName}</div>` : ""}
  </div>
  <div style="clear:both;margin-top:16px;font-size:9px;color:#6B7280">
    Digitally signed on ${new Date(invoice.signedAt).toUTCString()}${invoice.signerIp ? ` from IP ${invoice.signerIp}` : ""}
  </div>` : ""}
  <div class="footer">Generated by Site Snap · ${invoice.invoiceNumber}</div>
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

export default function InvoiceDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const invoiceId = parseInt(id ?? "0");
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();

  const { data: invoice, isLoading, dataUpdatedAt, refetch } = useGetInvoice(invoiceId);
  useFocusEffect(useCallback(() => { refetch(); }, [refetch]));
  const updatedLabel = useRelativeTime(dataUpdatedAt || null);
  const { data: me } = useGetMe();
  const isAuthorized = me?.role === "owner" || me?.role === "foreman";
  const markSent = useMarkInvoiceSent();
  const markPaid = useMarkInvoicePaid();
  const sendEmail = useSendInvoiceEmail();
  const sendReminder = useSendInvoiceReminder();

  const [exporting, setExporting] = useState<"pdf" | "xlsx" | null>(null);
  const [emailing, setEmailing] = useState(false);
  const [invoiceActionLoading, setInvoiceActionLoading] = useState<string | null>(null);

  const companyName = (me as any)?.company?.name ?? "Site Snap";

  function invalidate() {
    qc.invalidateQueries({ queryKey: getGetInvoiceQueryKey(invoiceId) });
    qc.invalidateQueries({ queryKey: getListAllInvoicesQueryKey({}) });
  }

  const lineItems: LineItem[] = (invoice?.lineItems ?? []) as LineItem[];
  const statusColor = STATUS_COLORS[invoice?.status ?? "draft"] ?? "#6B7280";

  const handleExportPDF = useCallback(async () => {
    if (!invoice) return;
    setExporting("pdf");
    try {
      const html = buildInvoiceHTML(invoice, lineItems, companyName);
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      const dest = `${FileSystem.cacheDirectory}${invoice.invoiceNumber}.pdf`;
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
  }, [invoice, lineItems, companyName]);

  const handleExportXLSX = useCallback(async () => {
    if (!invoice) return;
    setExporting("xlsx");
    try {
      const wsData = [
        ["Invoice Number", invoice.invoiceNumber],
        ["Title", invoice.title],
        ["Client", invoice.clientName],
        ["Status", STATUS_LABELS[invoice.status] ?? invoice.status],
        ["Due Date", invoice.dueDate ?? ""],
        [],
        ["Description", "Qty", "Unit", "Unit Price", "Total"],
        ...lineItems.map((item) => [item.description, item.quantity, item.unit, Number(item.unitPrice), Number(item.total)]),
        [],
        ["Subtotal", "", "", "", Number(invoice.subtotal)],
        [`HST (${(parseFloat(invoice.taxRate ?? "0.13") * 100).toFixed(0)}%)`, "", "", "", Number(invoice.taxAmount)],
        ["TOTAL", "", "", "", Number(invoice.total)],
      ];
      const ws = XLSX.utils.aoa_to_sheet(wsData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Invoice");
      const xlsxBase64 = XLSX.write(wb, { type: "base64", bookType: "xlsx" });
      const dest = `${FileSystem.cacheDirectory}${invoice.invoiceNumber}.xlsx`;
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
  }, [invoice, lineItems]);

  const handleSendEmail = useCallback(async () => {
    if (!invoice) return;
    if (!invoice.clientEmail) { Alert.alert("No client email on this invoice."); return; }
    setEmailing(true);
    try {
      const html = buildInvoiceHTML(invoice, lineItems, companyName);
      const { uri } = await Print.printToFileAsync({ html, base64: true });
      const pdfBase64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
      sendEmail.mutate(
        { invoiceId, data: { pdfBase64 } },
        {
          onSuccess: (result: any) => {
            if (result.sandboxWarning) {
              Alert.alert("Sandbox Mode", "Email not delivered. Verify a domain at resend.com/domains to send to any recipient.");
            } else {
              Alert.alert("Email sent", `Invoice emailed to ${invoice.clientEmail}`);
              invalidate();
            }
          },
          onError: () => Alert.alert("Failed to send email. Please try again."),
          onSettled: () => setEmailing(false),
        }
      );
    } catch {
      Alert.alert("Failed to prepare email. Please try again.");
      setEmailing(false);
    }
  }, [invoice, lineItems, companyName, invoiceId, sendEmail]);

  const handleMarkSent = useCallback(() => {
    if (!isAuthorized) { Alert.alert("Only owners and foremen can mark invoices as sent."); return; }
    Alert.alert("Mark as Sent?", `This confirms you have sent ${invoice?.invoiceNumber} to ${invoice?.clientName}.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Mark Sent", onPress: () => {
          setInvoiceActionLoading("sent");
          markSent.mutate({ invoiceId }, {
            onSuccess: () => { Alert.alert("Invoice marked as sent"); invalidate(); },
            onError: () => Alert.alert("Failed to update invoice"),
            onSettled: () => setInvoiceActionLoading(null),
          });
        }
      },
    ]);
  }, [invoice, invoiceId, markSent, isAuthorized]);

  const handleMarkPaid = useCallback(() => {
    if (!isAuthorized) { Alert.alert("Only owners and foremen can mark invoices as paid."); return; }
    Alert.alert("Mark as Paid?", `Record payment received for ${invoice?.invoiceNumber}.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Mark Paid", style: "default", onPress: () => {
          setInvoiceActionLoading("paid");
          markPaid.mutate({ invoiceId }, {
            onSuccess: () => { Alert.alert("Invoice marked as paid!"); invalidate(); },
            onError: () => Alert.alert("Failed to update invoice"),
            onSettled: () => setInvoiceActionLoading(null),
          });
        }
      },
    ]);
  }, [invoice, invoiceId, markPaid, isAuthorized]);

  const handleSendReminder = useCallback(() => {
    if (!invoice?.clientEmail) { Alert.alert("No client email on this invoice."); return; }
    sendReminder.mutate({ invoiceId }, {
      onSuccess: (result: any) => {
        if (result.sandboxWarning) {
          Alert.alert("Sandbox Mode", "Reminder not delivered. Verify a domain at resend.com/domains.");
        } else {
          Alert.alert("Reminder sent", `Payment reminder sent to ${invoice.clientEmail}`);
          invalidate();
        }
      },
      onError: () => Alert.alert("Failed to send reminder"),
    });
  }, [invoice, invoiceId, sendReminder]);

  const topInsets = Platform.OS === "web" ? 67 : insets.top;

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { paddingTop: topInsets + 8, backgroundColor: colors.sidebar }]}>
          <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={10}>
            <Feather name="arrow-left" size={22} color="#FFFFFF" />
          </Pressable>
          <Text style={styles.headerTitle}>Invoice</Text>
          <View style={{ width: 36 }} />
        </View>
        <View style={styles.center}><ActivityIndicator color={colors.primary} size="large" /></View>
      </View>
    );
  }

  if (!invoice) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { paddingTop: topInsets + 8, backgroundColor: colors.sidebar }]}>
          <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={10}>
            <Feather name="arrow-left" size={22} color="#FFFFFF" />
          </Pressable>
          <Text style={styles.headerTitle}>Invoice</Text>
          <View style={{ width: 36 }} />
        </View>
        <View style={styles.center}>
          <Text style={{ color: colors.mutedForeground }}>Invoice not found</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topInsets + 8, backgroundColor: colors.sidebar }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={10}>
          <Feather name="arrow-left" size={22} color="#FFFFFF" />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>{invoice.invoiceNumber}</Text>
        {(invoice.status === "draft") ? (
          <Pressable
            onPress={() => router.push({ pathname: "/invoice/edit", params: { id: String(invoiceId) } })}
            hitSlop={10}
          >
            <Feather name="edit-2" size={20} color="#FFFFFF" />
          </Pressable>
        ) : (
          <View style={{ width: 36 }} />
        )}
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Title + Status */}
        <View style={[styles.titleCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
            <Text style={[styles.invoiceTitle, { color: colors.foreground, flex: 1, marginRight: 8 }]}>{invoice.title}</Text>
            <View style={[styles.statusBadge, { backgroundColor: `${statusColor}18` }]}>
              <Text style={[styles.statusText, { color: statusColor }]}>{STATUS_LABELS[invoice.status] ?? invoice.status}</Text>
            </View>
          </View>
          <Text style={[styles.invoiceNum, { color: colors.mutedForeground }]}>{invoice.invoiceNumber}</Text>
          {!!updatedLabel && (
            <Text style={[styles.updatedLabel, { color: colors.mutedForeground }]}>{updatedLabel}</Text>
          )}
          {(invoice as any).signedAt && (
            <View style={[styles.submittedBanner, { backgroundColor: "#DCFCE7", borderColor: "#86EFAC" }]}>
              <Feather name="shield" size={13} color="#16A34A" />
              <Text style={[styles.submittedBannerText, { color: "#15803D" }]}>
                Signature Verified · {(invoice as any).signerName ?? "Client"}
              </Text>
            </View>
          )}
        </View>

        {(invoice as any).publicToken && invoice.status !== "draft" && (
          <View style={[styles.actionGroup, { borderColor: colors.border }]}>
            <Text style={[styles.actionGroupTitle, { color: colors.mutedForeground }]}>CLIENT SIGNING</Text>
            <Pressable
              style={[styles.actionBtn, { backgroundColor: colors.card, borderColor: colors.border, flex: 1 }]}
              onPress={async () => {
                const domain = process.env.EXPO_PUBLIC_DOMAIN;
                const url = domain ? `https://${domain}/i/${(invoice as any).publicToken}` : `/i/${(invoice as any).publicToken}`;
                try {
                  await Share.share({ message: `Please review and sign this invoice: ${url}`, url });
                } catch {
                  Alert.alert("Sign link", url);
                }
              }}
            >
              <Feather name="share-2" size={18} color={colors.primary} />
              <Text style={[styles.actionBtnText, { color: colors.foreground }]}>Share Sign Link</Text>
            </Pressable>
          </View>
        )}

        {(invoice as any).signedAt && (invoice as any).signatureData && (
          <Section title="SIGNATURE">
            <View style={{ alignItems: "flex-start", gap: 6 }}>
              <View style={{ borderWidth: 1, borderColor: colors.border, padding: 8, borderRadius: 6, backgroundColor: "#fff" }}>
                <Text style={{ fontSize: 11, color: colors.mutedForeground }}>{(invoice as any).signerName ?? "Client signature"}</Text>
              </View>
              <Text style={{ fontSize: 11, color: colors.mutedForeground }}>
                UTC: {new Date((invoice as any).signedAt).toUTCString()}
              </Text>
              {(invoice as any).signerIp && (
                <Text style={{ fontSize: 11, color: colors.mutedForeground }}>
                  IP: {(invoice as any).signerIp}
                </Text>
              )}
            </View>
          </Section>
        )}

        {/* Info */}
        <Section title="INVOICE DETAILS">
          <InfoRow label="Client" value={invoice.clientName} />
          {invoice.clientEmail && <InfoRow label="Email" value={invoice.clientEmail} />}
          {invoice.dueDate && <InfoRow label="Due Date" value={new Date(invoice.dueDate).toLocaleDateString("en-CA", { year: "numeric", month: "long", day: "numeric" })} />}
          <InfoRow label="Created" value={new Date(invoice.createdAt).toLocaleDateString("en-CA", { year: "numeric", month: "long", day: "numeric" })} />
          {invoice.sentAt && <InfoRow label="Sent" value={new Date(invoice.sentAt).toLocaleDateString("en-CA")} />}
          {invoice.paidAt && <InfoRow label="Paid" value={new Date(invoice.paidAt).toLocaleDateString("en-CA")} />}
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
          <InfoRow label="Subtotal" value={fmtCAD(invoice.subtotal)} />
          <InfoRow label={`HST (${(parseFloat(invoice.taxRate ?? "0.13") * 100).toFixed(0)}%)`} value={fmtCAD(invoice.taxAmount)} />
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <InfoRow label="Total" value={fmtCAD(invoice.total)} highlight />
        </Section>

        {invoice.notes && (
          <Section title="NOTES">
            <Text style={[styles.notes, { color: colors.foreground }]}>{invoice.notes}</Text>
          </Section>
        )}

        {/* Export Buttons */}
        <View style={[styles.actionGroup, { borderColor: colors.border }]}>
          <Text style={[styles.actionGroupTitle, { color: colors.mutedForeground }]}>EXPORT</Text>
          <View style={styles.actionRow}>
            <Pressable
              style={[styles.actionBtn, { backgroundColor: colors.card, borderColor: colors.border, flex: 1 }]}
              onPress={handleExportPDF}
              disabled={exporting !== null}
            >
              {exporting === "pdf" ? <ActivityIndicator color={colors.primary} size="small" /> : <Feather name="file-text" size={18} color={colors.primary} />}
              <Text style={[styles.actionBtnText, { color: colors.foreground }]}>PDF</Text>
            </Pressable>
            <Pressable
              style={[styles.actionBtn, { backgroundColor: colors.card, borderColor: colors.border, flex: 1 }]}
              onPress={handleExportXLSX}
              disabled={exporting !== null}
            >
              {exporting === "xlsx" ? <ActivityIndicator color="#22C55E" size="small" /> : <Feather name="grid" size={18} color="#22C55E" />}
              <Text style={[styles.actionBtnText, { color: colors.foreground }]}>Excel</Text>
            </Pressable>
          </View>
        </View>

        {/* Actions */}
        <View style={[styles.actionGroup, { borderColor: colors.border }]}>
          <Text style={[styles.actionGroupTitle, { color: colors.mutedForeground }]}>ACTIONS</Text>
          <View style={styles.actionCol}>
            <Pressable
              style={[styles.actionBtnFull, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={handleSendEmail}
              disabled={emailing || !invoice.clientEmail}
            >
              {emailing ? <ActivityIndicator color={colors.primary} size="small" /> : <Feather name="mail" size={18} color={colors.primary} />}
              <Text style={[styles.actionBtnText, { color: colors.foreground, flex: 1 }]}>
                {emailing ? "Sending…" : "Send via Email"}
              </Text>
              {!invoice.clientEmail && <Text style={[styles.actionHint, { color: colors.mutedForeground }]}>No email</Text>}
            </Pressable>

            {(invoice.status === "sent" || invoice.status === "overdue" || invoice.status === "draft") && (
              <Pressable
                style={[styles.actionBtnFull, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={handleSendReminder}
                disabled={sendReminder.isPending || !invoice.clientEmail}
              >
                {sendReminder.isPending ? <ActivityIndicator color="#F59E0B" size="small" /> : <Feather name="bell" size={18} color="#F59E0B" />}
                <Text style={[styles.actionBtnText, { color: colors.foreground }]}>Send Reminder</Text>
              </Pressable>
            )}

            {isAuthorized && invoice.status === "draft" && (
              <Pressable
                style={[styles.actionBtnFull, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={handleMarkSent}
                disabled={markSent.isPending || invoiceActionLoading === "sent"}
              >
                {(markSent.isPending || invoiceActionLoading === "sent")
                  ? <ActivityIndicator color="#3B82F6" size="small" />
                  : <Feather name="send" size={18} color="#3B82F6" />
                }
                <Text style={[styles.actionBtnText, { color: colors.foreground }]}>Mark Sent</Text>
              </Pressable>
            )}

            {isAuthorized && (invoice.status === "sent" || invoice.status === "overdue") && (
              <Pressable
                style={[styles.actionBtnFull, { backgroundColor: "#22C55E18", borderColor: "#22C55E40" }]}
                onPress={handleMarkPaid}
                disabled={markPaid.isPending || invoiceActionLoading === "paid"}
              >
                {(markPaid.isPending || invoiceActionLoading === "paid")
                  ? <ActivityIndicator color="#22C55E" size="small" />
                  : <Feather name="check-circle" size={18} color="#22C55E" />
                }
                <Text style={[styles.actionBtnText, { color: "#22C55E" }]}>Mark Paid</Text>
              </Pressable>
            )}
          </View>
        </View>
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
  titleCard: { borderRadius: 12, padding: 16, borderWidth: 1 },
  invoiceTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  invoiceNum: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 4 },
  updatedLabel: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 4 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  statusText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
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
  actionRow: { flexDirection: "row", gap: 1, borderTopWidth: 1, borderTopColor: "transparent" },
  actionCol: { gap: 1 },
  actionBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, padding: 14, borderWidth: 0, flex: 1 },
  actionBtnFull: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderTopWidth: 1 },
  actionBtnText: { fontSize: 14, fontFamily: "Inter_500Medium" },
  actionHint: { fontSize: 12, fontFamily: "Inter_400Regular" },
  submittedBanner: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 8, borderWidth: 1, marginTop: 12 },
  submittedBannerText: { fontSize: 13, fontFamily: "Inter_500Medium" },
});
