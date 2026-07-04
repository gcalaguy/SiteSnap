import {
  useGetMe, customFetch, useListCompanyMembers, useGetMemberPermissions, useSetMemberPermissions,
  getListCompanyMembersQueryKey, getGetMemberPermissionsQueryKey,
  useGetBillingSeats, useGetQuickBooksStatus, useGetCompanySettings, useGetAccountingExportData, getAccountingExportData,
  getGetQuickBooksStatusQueryKey, getGetCompanySettingsQueryKey, getGetAccountingExportDataQueryKey,
  getQuickBooksAuthUrl,
  useDisconnectQuickBooks,
  useSyncQuickBooksInvoices,
  useSyncQuickBooksCosts,
  useUpdateCompanyDocumentSettings,
  useUpdateCompanyLogo,
  useUpdateCompanyQuoteTemplate,
  useUpdateCompanyInvoiceTemplate,
} from "@workspace/api-client-react";
import type { MemberPermissions, UserWithCompany } from "@workspace/api-client-react";
import { UpdateCompanyDocumentSettingsBody } from "@workspace/api-zod";
import { PricingSettingsBody } from "@/pages/pricing-manager";
import { useToast } from "@/hooks/use-toast";
import { useCompanyFeatures } from "@/components/FeatureGuard";
import { useSignedUrl } from "@/hooks/useSignedUrl";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Mail, CheckCircle, AlertCircle, Loader2, ExternalLink, Info, RefreshCw, Link2, Link2Off, BookOpen, DollarSign, Globe, ImageIcon, Upload, X, FileText, Users, UserPlus, ChevronDown, ChevronRight, ShieldCheck, RotateCcw, Hash, Save, Download, Calculator, Crown, Archive, HardDrive, FolderOpen, Package, Layers, ToggleRight } from "lucide-react";
import { cn } from "@/lib/utils";
import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  loadDriveSyncState,
  saveDriveSyncState,
  clearDriveSyncState,
  isFileSystemAccessSupported,
  type DriveSyncState,
} from "@/lib/driveSyncManager";
import { mirrorBlob } from "@/lib/driveSyncPipeline";
import { z } from "zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
const GOLD = "#C9A84C";

function TeamSeatsCard() {
  const [, navigate] = useLocation();
  const { data: seatInfo, isLoading: seatsLoading } = useGetBillingSeats();

  const seatUsed = seatInfo?.currentSeats ?? 0;
  const seatMax = seatInfo?.maxSeats;
  const seatPct = seatMax === "unlimited" || !seatMax ? 0 : Math.round((seatUsed / (seatMax as number)) * 100);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" />
          Team Seats
        </CardTitle>
        <CardDescription>Manage your company seats and team members.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {seatsLoading ? (
          <div className="flex items-center gap-3 text-zinc-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Loading seat info…</span>
          </div>
        ) : seatInfo ? (
          <>
            <div className="flex items-baseline gap-1.5">
              <span className="text-3xl font-bold">{seatUsed}</span>
              <span className="text-muted-foreground text-sm">/ {seatMax === "unlimited" ? "∞" : seatMax} seats used</span>
            </div>
            {seatMax !== "unlimited" && typeof seatMax === "number" && (
              <div className="space-y-1.5">
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${seatPct}%`, background: GOLD }} />
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{seatPct}% of capacity</span>
                  {!seatInfo.canAddMore ? <span className="text-amber-500">Seat limit reached — contact support to add more</span> : null}
                </div>
              </div>
            )}
            <Button className="gap-2 bg-[#D4AF37] text-white hover:bg-[#b5922e] font-semibold" onClick={() => navigate("/team")}>
              <UserPlus className="h-4 w-4" />
              Manage Team
            </Button>
          </>
        ) : (
          <div className="flex items-center gap-3 text-zinc-400">
            <AlertCircle className="h-5 w-5 text-amber-500 shrink-0" />
            <span className="text-sm">Seat information unavailable.</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface SendResult {
  sent: number;
  recipients: string[];
}

interface SandboxInfo {
  allowedEmail: string;
  intendedRecipients: string[];
}

function DigestCard() {
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error" | "sandbox">("idle");
  const [detail, setDetail] = useState("");
  const [sandboxInfo, setSandboxInfo] = useState<SandboxInfo | null>(null);

  const handleSend = async () => {
    setStatus("sending");
    setDetail("");
    setSandboxInfo(null);
    try {
      const data = await customFetch<SendResult>("/api/digest/send-now", { method: "POST" });
      setDetail(`Sent to ${data.sent} recipient${data.sent !== 1 ? "s" : ""}: ${data.recipients.join(", ")}`);
      setStatus("sent");
    } catch (err: any) {
      const body = err?.data as any;
      if (body?.code === "resend_sandbox") {
        setSandboxInfo({
          allowedEmail: body.allowedEmail,
          intendedRecipients: body.intendedRecipients ?? [],
        });
        setStatus("sandbox");
        return;
      }
      setDetail(body?.error ?? err?.message ?? "Failed to send digest");
      setStatus("error");
    }
  };

  const [collapsed, setCollapsed] = useState(true);

  return (
    <Card>
      <button onClick={() => setCollapsed(c => !c)} className="w-full text-left">
        <CardHeader className="flex flex-row items-center justify-between py-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-primary" />
              Daily Digest Email
            </CardTitle>
            <CardDescription>
              A morning summary is automatically emailed to all owners and foremens every day at 7:00 AM ET,
              showing yesterday's reports, open RFIs, and overdue tasks across all active projects.
            </CardDescription>
          </div>
          {collapsed
            ? <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0 ml-4" />
            : <ChevronDown className="h-5 w-5 text-muted-foreground shrink-0 ml-4" />}
        </CardHeader>
      </button>
      {!collapsed && (
        <CardContent className="space-y-4">
          <div className="rounded-md border border-border bg-muted/40 p-4 text-sm text-muted-foreground space-y-1">
          <p className="font-medium text-foreground">What's included in each digest:</p>
          <ul className="list-disc list-inside space-y-0.5">
            <li>Daily reports submitted yesterday (per project)</li>
            <li>All open and in-review RFIs with overdue indicators</li>
            <li>Overdue tasks across all active projects</li>
          </ul>
        </div>

        <div className="flex flex-col gap-3">
          <Button
            onClick={handleSend}
            disabled={status === "sending" || status === "sent"}
            className="w-fit"
          >
            {status === "sending" ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Sending…</>
            ) : status === "sent" ? (
              <><CheckCircle className="h-4 w-4 mr-2" />Digest Sent!</>
            ) : (
              <><Mail className="h-4 w-4 mr-2" />Send Digest Now</>
            )}
          </Button>

          {status === "sent" && detail && (
            <div className="flex items-start gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-md p-3">
              <CheckCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{detail}</span>
            </div>
          )}

          {status === "sandbox" && sandboxInfo && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-4 space-y-3">
              <div className="flex items-start gap-2">
                <Info className="h-4 w-4 mt-0.5 shrink-0 text-amber-600" />
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-amber-800">Resend sandbox mode — domain not verified</p>
                  <p className="text-sm text-amber-700">
                    Your Resend account is in test mode and can only send to{" "}
                    <span className="font-mono font-medium">{sandboxInfo.allowedEmail}</span>.
                    To send real emails to your team, verify a custom domain.
                  </p>
                </div>
              </div>

              {sandboxInfo.intendedRecipients.length > 0 && (
                <div className="pl-6 text-sm text-amber-700">
                  <p className="font-medium mb-1">Would have sent to:</p>
                  <ul className="list-disc list-inside space-y-0.5 text-amber-600">
                    {sandboxInfo.intendedRecipients.map((r) => (
                      <li key={r} className="font-mono text-xs">{r}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="pl-6">
                <a
                  href="https://resend.com/domains"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-amber-800 underline underline-offset-2 hover:text-amber-900"
                >
                  Verify a domain at resend.com/domains
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
            </div>
          )}

          {status === "error" && detail && (
            <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md p-3">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{detail}</span>
            </div>
          )}
        </div>
      </CardContent>
      )}
    </Card>
  );
}

function AccountingCard() {
  const { data: user } = useGetMe();
  const company = user?.company;
  const companyId = company?.id;
  const [collapsed, setCollapsed] = useState(true);
  const [exporting, setExporting] = useState(false);
  const { data: seatInfo } = useGetBillingSeats();
  const { data: featureData } = useCompanyFeatures(companyId);

  const hasVaultAccess =
    featureData?.features?.includes("AUDIT_VAULT") ||
    seatInfo?.planName?.toLowerCase() === "enterprise";

  const { data: exportBlob, isLoading: exportLoading } = useGetAccountingExportData(companyId ?? 0, {
    query: { queryKey: getGetAccountingExportDataQueryKey(companyId ?? 0), enabled: !!companyId && !collapsed },
  });

  async function handleExport() {
    setExporting(true);
    try {
      const blob = exportBlob ?? await getAccountingExportData(companyId!);
      const url = URL.createObjectURL(blob);
      const filename = `site-snap-accountant-export-${new Date().toISOString().split("T")[0]}.zip`;
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      await mirrorBlob(filename, blob);
    } finally {
      setExporting(false);
    }
  }

  return (
    <Card>
      <button onClick={() => setCollapsed((c) => !c)} className="w-full text-left">
        <CardHeader className="flex flex-row items-center justify-between py-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Calculator className="h-5 w-5 text-primary" />
              Accounting
            </CardTitle>
            <CardDescription>
              QuickBooks sync and manual bookkeeping export tools.
            </CardDescription>
          </div>
          {collapsed
            ? <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0 ml-4" />
            : <ChevronDown className="h-5 w-5 text-muted-foreground shrink-0 ml-4" />}
        </CardHeader>
      </button>
      {!collapsed && (
        <CardContent className="space-y-6">
          {/* Accountant-Ready CSV Export */}
          <div className="rounded-md border border-border bg-muted/20 p-4 space-y-3">
            <div className="flex items-start gap-2">
              <Download className="h-5 w-5 mt-0.5 shrink-0 text-primary" />
              <div className="space-y-1">
                <p className="text-sm font-semibold">Accountant-Ready CSV Export</p>
                <p className="text-xs text-muted-foreground">
                  Download a flat transaction journal of all paid invoices, approved change orders, and project costs in CSV format for your bookkeeping software.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                disabled={exportLoading || exporting}
                onClick={handleExport}
              >
                {exportLoading || exporting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                Export Transaction Journal (CSV)
              </Button>
              {exportLoading && <span className="text-xs text-muted-foreground">Loading data...</span>}
            </div>
            {exportBlob && (
              <p className="text-xs text-muted-foreground">
                Accountant export ZIP ready for download.
              </p>
            )}
          </div>

          <Separator />

          {/* QuickBooks Integration (moved inside Accounting card) */}
          <QuickBooksCard />

          <Separator />

          {/* Compliance & Audit Vault (Enterprise-only) */}
          {hasVaultAccess ? <AuditVaultCard /> : <UpgradeToEnterpriseBanner />}
        </CardContent>
      )}
    </Card>
  );
}

function QuickBooksCard() {
  const qc = useQueryClient();
  const [syncMsg, setSyncMsg] = useState<{ type: "ok" | "error"; text: string } | null>(null);

  const { data: qb, isLoading: qbLoading } = useGetQuickBooksStatus({
    query: { queryKey: getGetQuickBooksStatusQueryKey(), refetchOnWindowFocus: false },
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const qbParam = params.get("qb");
    if (qbParam === "connected") {
      qc.invalidateQueries({ queryKey: getGetQuickBooksStatusQueryKey() });
      setSyncMsg({ type: "ok", text: "QuickBooks connected successfully!" });
      window.history.replaceState({}, "", window.location.pathname);
    } else if (qbParam === "error") {
      const reason = params.get("reason") ?? "unknown error";
      setSyncMsg({ type: "error", text: `Connection failed: ${reason}` });
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [qc]);

  const connectMutation = useMutation({
    mutationFn: async () => {
      const data = await getQuickBooksAuthUrl();
      window.location.href = data.url;
    },
    onError: (err: any) => setSyncMsg({ type: "error", text: err?.message ?? "Failed to get auth URL" }),
  });

  const disconnectMutation = useDisconnectQuickBooks({
    mutation: {
      onSuccess: () => { qc.invalidateQueries({ queryKey: getGetQuickBooksStatusQueryKey() }); setSyncMsg(null); },
      onError: (err: any) => setSyncMsg({ type: "error", text: err?.message ?? "Disconnect failed" }),
    },
  });

  const syncInvoices = useSyncQuickBooksInvoices({
    mutation: {
      onSuccess: (data) => {
        qc.invalidateQueries({ queryKey: getGetQuickBooksStatusQueryKey() });
        const errText = data.errors.length ? ` (${data.errors.length} errors)` : "";
        setSyncMsg({ type: data.errors.length ? "error" : "ok", text: `Synced ${data.synced}/${data.total} invoices to QuickBooks${errText}` });
      },
      onError: (err: any) => setSyncMsg({ type: "error", text: err?.message ?? "Invoice sync failed" }),
    },
  });

  const syncCosts = useSyncQuickBooksCosts({
    mutation: {
      onSuccess: (data) => {
        qc.invalidateQueries({ queryKey: getGetQuickBooksStatusQueryKey() });
        const errText = data.errors.length ? ` (${data.errors.length} errors)` : "";
        setSyncMsg({ type: data.errors.length ? "error" : "ok", text: `Synced ${data.synced}/${data.total} cost entries to QuickBooks${errText}` });
      },
      onError: (err: any) => setSyncMsg({ type: "error", text: err?.message ?? "Cost sync failed" }),
    },
  });

  const fmtDate = (d: string | null | undefined) => d ? new Date(d).toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short" }) : "Never";
  const isSyncing = syncInvoices.isPending || syncCosts.isPending;

  const [collapsed, setCollapsed] = useState(true);

  return (
    <Card>
      <button onClick={() => setCollapsed(c => !c)} className="w-full text-left">
        <CardHeader className="flex flex-row items-center justify-between py-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-[#2CA01C]" />
              QuickBooks Integration
              {qb?.connected && (
                <Badge variant="outline" className="text-green-700 border-green-300 bg-green-50 ml-1">
                  Connected
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              Sync your Site Snap invoices and project costs directly to QuickBooks Online for seamless accounting.
            </CardDescription>
          </div>
          {collapsed
            ? <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0 ml-4" />
            : <ChevronDown className="h-5 w-5 text-muted-foreground shrink-0 ml-4" />}
        </CardHeader>
      </button>
      {!collapsed && (
        <CardContent className="space-y-4">
          {!qb?.configured && !qbLoading && (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-4 space-y-2">
            <div className="flex items-start gap-2">
              <Info className="h-4 w-4 mt-0.5 shrink-0 text-amber-600" />
              <div className="space-y-1">
                <p className="text-sm font-semibold text-amber-800">QuickBooks credentials not configured</p>
                <p className="text-sm text-amber-700">
                  To enable this integration, set <code className="font-mono bg-amber-100 px-1 rounded">QB_CLIENT_ID</code> and{" "}
                  <code className="font-mono bg-amber-100 px-1 rounded">QB_CLIENT_SECRET</code> in your environment secrets.
                  Get these from{" "}
                  <a href="https://developer.intuit.com" target="_blank" rel="noopener noreferrer" className="underline font-medium">
                    developer.intuit.com
                  </a>{" "}
                  by creating a QuickBooks app with redirect URI:{" "}
                  <code className="font-mono bg-amber-100 px-1 rounded text-xs">{window.location.origin}/api/quickbooks/callback</code>
                </p>
              </div>
            </div>
          </div>
        )}

        {syncMsg && (
          <div className={`flex items-start gap-2 text-sm rounded-md p-3 ${syncMsg.type === "ok" ? "text-green-700 bg-green-50 border border-green-200" : "text-destructive bg-destructive/10 border border-destructive/20"}`}>
            {syncMsg.type === "ok" ? <CheckCircle className="h-4 w-4 mt-0.5 shrink-0" /> : <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />}
            <span>{syncMsg.text}</span>
          </div>
        )}

        {qb?.connected && qb.connection ? (
          <>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-md border bg-muted/40 p-3 space-y-1">
                <div className="flex items-center gap-1.5 text-muted-foreground text-xs uppercase tracking-wide font-medium">
                  <DollarSign className="h-3.5 w-3.5" /> Invoices
                </div>
                <div className="font-semibold">{qb.connection.syncedInvoiceCount ?? 0} synced</div>
                <div className="text-xs text-muted-foreground">Last: {fmtDate(qb.connection.lastInvoiceSyncAt)}</div>
              </div>
              <div className="rounded-md border bg-muted/40 p-3 space-y-1">
                <div className="flex items-center gap-1.5 text-muted-foreground text-xs uppercase tracking-wide font-medium">
                  <RefreshCw className="h-3.5 w-3.5" /> Cost Entries
                </div>
                <div className="font-semibold">{qb.connection.syncedCostCount ?? 0} synced</div>
                <div className="text-xs text-muted-foreground">Last: {fmtDate(qb.connection.lastCostSyncAt)}</div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                onClick={() => syncInvoices.mutate()}
                disabled={isSyncing}
              >
                {syncInvoices.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <DollarSign className="h-4 w-4 mr-2" />}
                Sync Invoices
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => syncCosts.mutate()}
                disabled={isSyncing}
              >
                {syncCosts.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                Sync Project Costs
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive hover:text-destructive ml-auto"
                onClick={() => disconnectMutation.mutate()}
                disabled={disconnectMutation.isPending}
              >
                {disconnectMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Link2Off className="h-4 w-4 mr-2" />}
                Disconnect
              </Button>
            </div>

            <p className="text-xs text-muted-foreground">
              Environment: <span className="font-medium capitalize">{qb.connection.environment}</span> ·
              Connected: {fmtDate(qb.connection.connectedAt)} ·
              Realm ID: <code className="font-mono">{qb.connection.realmId}</code>
            </p>
          </>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              Connect your QuickBooks Online account to automatically push invoices and project costs for accounting.
              Supports both sandbox (testing) and production environments.
            </p>
            <Button
              className="w-fit bg-[#2CA01C] hover:bg-[#228F16] text-white"
              onClick={() => connectMutation.mutate()}
              disabled={connectMutation.isPending || !qb?.configured || qbLoading}
            >
              {connectMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Link2 className="h-4 w-4 mr-2" />}
              Connect QuickBooks
            </Button>
          </div>
        )}
      </CardContent>
      )}
    </Card>
  );
}

// ── Audit Vault Card (Enterprise-only) ─────────────────────────────────────────

function AuditVaultCard() {
  const [, navigate] = useLocation();
  return (
    <div className="rounded-md border border-border bg-muted/20 p-4 space-y-3">
      <div className="flex items-start gap-2">
        <Archive className="h-5 w-5 mt-0.5 shrink-0 text-primary" />
        <div className="space-y-1">
          <p className="text-sm font-semibold">Compliance & Audit Vault</p>
          <p className="text-xs text-muted-foreground">
            Central pane to view, save, and print verified snapshots of all active projects, financials, timesheets, and security logs for official audits.
          </p>
        </div>
      </div>
      <Button
        variant="outline"
        size="sm"
        className="gap-2"
        onClick={() => navigate("/audit-vault")}
      >
        <Archive className="h-4 w-4" />
        Open Audit Vault
      </Button>
    </div>
  );
}

function UpgradeToEnterpriseBanner() {
  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 p-4 space-y-2">
      <div className="flex items-start gap-2">
        <Crown className="h-5 w-5 mt-0.5 shrink-0 text-amber-600" />
        <div className="space-y-1">
          <p className="text-sm font-semibold text-amber-800">Enterprise Feature</p>
          <p className="text-xs text-amber-700">
            Compliance & Audit Vault is available on the Enterprise plan. Upgrade to unlock audit-ready snapshots, security logs, and verified project archives.
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Company Logo Card ──────────────────────────────────────────────────────────

function CompanyLogoCard({ company }: { company: any }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: logoUrl, isLoading: logoUrlLoading } = useSignedUrl(company.logoPath);
  const updateLogo = useUpdateCompanyLogo();

  async function handleLogoUpload(file: File) {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const { objectPath } = await customFetch<{ objectPath: string }>("/api/storage/uploads/company-asset", {
        method: "POST",
        body: formData,
      });
      await updateLogo.mutateAsync({ companyId: company.id, data: { logoPath: objectPath } });
      queryClient.invalidateQueries({ queryKey: ["/api/users/me"] });
      toast({ title: "Logo uploaded", description: "Your logo will appear on exported estimates." });
    } catch (e: any) {
      toast({ title: "Upload failed", description: e?.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  }

  async function handleRemoveLogo() {
    try {
      await updateLogo.mutateAsync({ companyId: company.id, data: { logoPath: "" } });
      queryClient.invalidateQueries({ queryKey: ["/api/users/me"] });
      toast({ title: "Logo removed" });
    } catch {
      toast({ title: "Failed to remove logo", variant: "destructive" });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ImageIcon className="h-5 w-5 text-primary" />
          Company Logo
        </CardTitle>
        <CardDescription>
          Your logo appears on exported estimates (PDF, Word) and email headers.
          Recommended: landscape format, PNG or JPG.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {logoUrlLoading ? (
          <div className="rounded-lg border border-border bg-muted/30 p-4 flex items-center justify-center h-28">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : logoUrl ? (
          <div className="relative rounded-lg border border-border bg-muted/30 p-4 flex items-center justify-center h-28">
            <img src={logoUrl} alt="Company logo" className="max-h-20 max-w-full object-contain" />
            <button
              onClick={handleRemoveLogo}
              className="absolute top-2 right-2 p-1 rounded-full bg-background border border-border hover:bg-destructive/10 hover:text-destructive text-muted-foreground transition-colors"
              title="Remove logo"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <div className="rounded-lg border-2 border-dashed border-border bg-muted/20 p-6 flex items-center justify-center h-28">
            <div className="text-center">
              <ImageIcon className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-xs text-muted-foreground">No logo uploaded</p>
            </div>
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept="image/png,image/jpeg,image/webp"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleLogoUpload(f); e.target.value = ""; }}
        />
        <Button
          variant="outline"
          className="gap-2"
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {company.logoPath ? "Replace Logo" : "Upload Logo"}
        </Button>
        <p className="text-xs text-muted-foreground">PNG, JPG, or WebP · max 20 MB · landscape format works best</p>
      </CardContent>
    </Card>
  );
}

// ── Document Templates Card ────────────────────────────────────────────────────

function DocumentTemplatesCard({ company }: { company: any }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [uploadingType, setUploadingType] = useState<"quote" | "invoice" | null>(null);
  const quoteInputRef = useRef<HTMLInputElement>(null);
  const invoiceInputRef = useRef<HTMLInputElement>(null);

  const updateQuoteTemplate = useUpdateCompanyQuoteTemplate();
  const updateInvoiceTemplate = useUpdateCompanyInvoiceTemplate();

  async function handleUpload(file: File, type: "quote" | "invoice") {
    setUploadingType(type);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const { objectPath } = await customFetch<{ objectPath: string }>("/api/storage/uploads/company-asset", {
        method: "POST",
        body: formData,
      });
      if (type === "quote") {
        await updateQuoteTemplate.mutateAsync({ companyId: company.id, data: { templatePath: objectPath } });
      } else {
        await updateInvoiceTemplate.mutateAsync({ companyId: company.id, data: { templatePath: objectPath } });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/users/me"] });
      toast({ title: `${type === "quote" ? "Quote" : "Invoice"} template uploaded`, description: "It will appear on all new PDFs." });
    } catch (e: any) {
      toast({ title: "Upload failed", description: e?.message, variant: "destructive" });
    } finally {
      setUploadingType(null);
    }
  }

  async function handleRemove(type: "quote" | "invoice") {
    try {
      if (type === "quote") {
        await updateQuoteTemplate.mutateAsync({ companyId: company.id, data: { templatePath: null } });
      } else {
        await updateInvoiceTemplate.mutateAsync({ companyId: company.id, data: { templatePath: null } });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/users/me"] });
      toast({ title: `${type === "quote" ? "Quote" : "Invoice"} template removed` });
    } catch {
      toast({ title: "Failed to remove template", variant: "destructive" });
    }
  }

  function TemplateSection({
    type,
    templatePath,
    inputRef,
  }: {
    type: "quote" | "invoice";
    templatePath: string | null | undefined;
    inputRef: React.RefObject<HTMLInputElement | null>;
  }) {
    const label = type === "quote" ? "Quote Template" : "Invoice Template";
    const isUploading = uploadingType === type;
    const { data: currentUrl, isLoading: currentUrlLoading } = useSignedUrl(templatePath);
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">{label}</p>
            <p className="text-xs text-muted-foreground">Header image placed at the top of every {type} PDF</p>
          </div>
          {currentUrl && (
            <button
              onClick={() => handleRemove(type)}
              className="p-1 rounded-full bg-background border border-border hover:bg-destructive/10 hover:text-destructive text-muted-foreground transition-colors"
              title={`Remove ${type} template`}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {currentUrlLoading ? (
          <div className="rounded-lg border border-border bg-muted/20 p-5 flex items-center justify-center h-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : currentUrl ? (
          <div className="rounded-lg border border-border bg-muted/20 overflow-hidden">
            <img src={currentUrl} alt={`${label} preview`} className="w-full max-h-28 object-cover object-top" />
          </div>
        ) : (
          <div className="rounded-lg border-2 border-dashed border-border bg-muted/20 p-5 flex items-center justify-center h-20 border-t-[1px] border-r-[1px] border-b-[1px] border-l-[1px]">
            <div className="text-center">
              <FileText className="h-6 w-6 text-muted-foreground/30 mx-auto mb-1" />
              <p className="text-xs text-muted-foreground">No template uploaded</p>
            </div>
          </div>
        )}
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept="image/png,image/jpeg,image/webp"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f, type); e.target.value = ""; }}
        />
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          disabled={isUploading}
          onClick={() => inputRef.current?.click()}
        >
          {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {currentUrl ? "Replace Template" : "Upload Template"}
        </Button>
      </div>
    );
  }

  const [collapsed, setCollapsed] = useState(true);

  return (
    <Card>
      <button onClick={() => setCollapsed((c) => !c)} className="w-full text-left">
        <CardHeader className="flex flex-row items-center justify-between py-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              Document Templates
            </CardTitle>
            <CardDescription>
              Upload a custom header image for your quotes and invoices.
            </CardDescription>
          </div>
          {collapsed
            ? <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0 ml-4" />
            : <ChevronDown className="h-5 w-5 text-muted-foreground shrink-0 ml-4" />}
        </CardHeader>
      </button>
      {!collapsed && (
        <CardContent className="space-y-6">
          <TemplateSection type="quote" templatePath={company.quoteTemplatePath} inputRef={quoteInputRef} />
          <Separator />
          <TemplateSection type="invoice" templatePath={company.invoiceTemplatePath} inputRef={invoiceInputRef} />
          <p className="text-xs text-muted-foreground">PNG, JPG, or WebP · max 20 MB</p>
        </CardContent>
      )}
    </Card>
  );
}

// ── Document Numbering & Terms Card ──────────────────────────────────────────

const docSettingsSchema = UpdateCompanyDocumentSettingsBody.extend({
  quoteNumberPrefix: z
    .string()
    .min(1, "Quote prefix is required")
    .max(10, "Max 10 characters")
    .regex(/^\S+$/, "No spaces allowed"),
  invoiceNumberPrefix: z
    .string()
    .min(1, "Invoice prefix is required")
    .max(10, "Max 10 characters")
    .regex(/^\S+$/, "No spaces allowed"),
  quoteStartNumber: z
    .number()
    .int("Must be a whole number")
    .min(1, "Must be at least 1"),
  invoiceStartNumber: z
    .number()
    .int("Must be a whole number")
    .min(1, "Must be at least 1"),
});

function DocumentNumberingCard({ company }: { company: any }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const companyId = company?.id;

  const { data: settings, isLoading } = useGetCompanySettings(companyId ?? 0, {
    query: { queryKey: getGetCompanySettingsQueryKey(companyId ?? 0), enabled: !!companyId },
  });

  const [quotePrefix, setQuotePrefix] = useState("");
  const [invoicePrefix, setInvoicePrefix] = useState("");
  const [quoteStart, setQuoteStart] = useState(1);
  const [invoiceStart, setInvoiceStart] = useState(1);
  const [quoteTerms, setQuoteTerms] = useState("");
  const [invoiceNotes, setInvoiceNotes] = useState("");

  const saveDocSettings = useUpdateCompanyDocumentSettings();

  const errors = useMemo(() => {
    const result = docSettingsSchema.safeParse({
      quoteNumberPrefix: quotePrefix.trim(),
      invoiceNumberPrefix: invoicePrefix.trim(),
      quoteStartNumber: quoteStart,
      invoiceStartNumber: invoiceStart,
    });
    if (result.success) return {} as Record<string, string>;
    return Object.fromEntries(
      result.error.issues.map((e) => [String(e.path[0]), e.message])
    );
  }, [quotePrefix, invoicePrefix, quoteStart, invoiceStart]);

  const hasErrors = Object.keys(errors).length > 0;

  useEffect(() => {
    if (settings) {
      setQuotePrefix(settings.quoteNumberPrefix ?? "QUO");
      setInvoicePrefix(settings.invoiceNumberPrefix ?? "INV");
      setQuoteStart(settings.quoteStartNumber ?? 1);
      setInvoiceStart(settings.invoiceStartNumber ?? 1);
      setQuoteTerms(settings.defaultQuoteTerms ?? "");
      setInvoiceNotes(settings.defaultInvoiceNotes ?? "");
    }
  }, [settings]);

  async function handleSave() {
    if (!companyId) return;
    const payload = {
      quoteNumberPrefix: quotePrefix.trim(),
      invoiceNumberPrefix: invoicePrefix.trim(),
      quoteStartNumber: Math.max(1, Number(quoteStart) || 1),
      invoiceStartNumber: Math.max(1, Number(invoiceStart) || 1),
      defaultQuoteTerms: quoteTerms.trim() || null,
      defaultInvoiceNotes: invoiceNotes.trim() || null,
    };
    const validation = docSettingsSchema.safeParse(payload);
    if (!validation.success) {
      toast({ title: "Please fix the highlighted errors before saving", variant: "destructive" });
      return;
    }
    try {
      await saveDocSettings.mutateAsync({ companyId, data: payload });
      queryClient.invalidateQueries({ queryKey: getGetCompanySettingsQueryKey(companyId!) });
      toast({ title: "Document settings saved" });
    } catch (e: any) {
      toast({ title: "Failed to save settings", description: e?.message, variant: "destructive" });
    }
  }

  const [collapsed, setCollapsed] = useState(true);

  return (
    <Card>
      <button onClick={() => setCollapsed((c) => !c)} className="w-full text-left">
        <CardHeader className="flex flex-row items-center justify-between py-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Hash className="h-5 w-5 text-primary" />
              Document Numbering & Terms
            </CardTitle>
            <CardDescription>
              Customize quote/invoice prefixes, starting numbers, and default boilerplate text.
            </CardDescription>
          </div>
          {collapsed
            ? <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0 ml-4" />
            : <ChevronDown className="h-5 w-5 text-muted-foreground shrink-0 ml-4" />}
        </CardHeader>
      </button>
      {!collapsed && (
        <CardContent className="space-y-6">
          {isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading...
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Quote Prefix</Label>
                  <Input
                    value={quotePrefix}
                    onChange={(e) => setQuotePrefix(e.target.value)}
                    placeholder="QUO"
                    className={cn(errors.quoteNumberPrefix && "border-destructive focus-visible:ring-destructive")}
                  />
                  {errors.quoteNumberPrefix ? (
                    <p className="text-xs text-destructive flex items-center gap-1">
                      <AlertCircle className="h-3 w-3 shrink-0" />
                      {errors.quoteNumberPrefix}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">e.g., QUO, ABC, 2026-Q</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Quote Start Number</Label>
                  <Input
                    type="number"
                    min={1}
                    value={quoteStart}
                    onChange={(e) => setQuoteStart(Number(e.target.value))}
                    className={cn(errors.quoteStartNumber && "border-destructive focus-visible:ring-destructive")}
                  />
                  {errors.quoteStartNumber ? (
                    <p className="text-xs text-destructive flex items-center gap-1">
                      <AlertCircle className="h-3 w-3 shrink-0" />
                      {errors.quoteStartNumber}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">First quote will be {quotePrefix || "QUO"}-{String(quoteStart).padStart(4, "0")}</p>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Invoice Prefix</Label>
                  <Input
                    value={invoicePrefix}
                    onChange={(e) => setInvoicePrefix(e.target.value)}
                    placeholder="INV"
                    className={cn(errors.invoiceNumberPrefix && "border-destructive focus-visible:ring-destructive")}
                  />
                  {errors.invoiceNumberPrefix ? (
                    <p className="text-xs text-destructive flex items-center gap-1">
                      <AlertCircle className="h-3 w-3 shrink-0" />
                      {errors.invoiceNumberPrefix}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">e.g., INV, 2026-INV</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Invoice Start Number</Label>
                  <Input
                    type="number"
                    min={1}
                    value={invoiceStart}
                    onChange={(e) => setInvoiceStart(Number(e.target.value))}
                    className={cn(errors.invoiceStartNumber && "border-destructive focus-visible:ring-destructive")}
                  />
                  {errors.invoiceStartNumber ? (
                    <p className="text-xs text-destructive flex items-center gap-1">
                      <AlertCircle className="h-3 w-3 shrink-0" />
                      {errors.invoiceStartNumber}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">First invoice will be {invoicePrefix || "INV"}-{String(invoiceStart).padStart(4, "0")}</p>
                  )}
                </div>
              </div>
              <Separator />
              <div className="space-y-2">
                <Label>Default Quote Terms & Conditions</Label>
                <textarea
                  className="w-full min-h-[100px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  value={quoteTerms}
                  onChange={(e) => setQuoteTerms(e.target.value)}
                  placeholder="e.g., Payment terms: Net 30. Warranty: 1 year workmanship."
                />
                <p className="text-xs text-muted-foreground">Appears at the bottom of every quote PDF.</p>
              </div>
              <div className="space-y-2">
                <Label>Default Invoice Notes / Terms</Label>
                <textarea
                  className="w-full min-h-[100px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  value={invoiceNotes}
                  onChange={(e) => setInvoiceNotes(e.target.value)}
                  placeholder="e.g., EFT remittance: Transit 12345 · Account 987654321. Late fees apply after 30 days."
                />
                <p className="text-xs text-muted-foreground">Appears in the Notes / Terms section of every invoice PDF.</p>
              </div>
              {hasErrors && (
                <p className="text-sm text-destructive flex items-center gap-1.5">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  Fix the errors above before saving.
                </p>
              )}
              <Button onClick={handleSave} disabled={hasErrors || saveDocSettings.isPending} className="gap-2">
                {saveDocSettings.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save Document Settings
              </Button>
            </>
          )}
        </CardContent>
      )}
    </Card>
  );
}

// ── Pricing Manager Card (collapsible) ───────────────────────────────────────

function PricingManagerCard() {
  const [collapsed, setCollapsed] = useState(true);

  return (
    <Card>
      <button
        onClick={() => setCollapsed(c => !c)}
        className="w-full text-left"
      >
        <CardHeader className="flex flex-row items-center justify-between py-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-primary" />
              Pricing Manager
            </CardTitle>
            <CardDescription>
              Customize the $/sqft rates, overhead, and contingency used by the Smart Estimator.
            </CardDescription>
          </div>
          {collapsed
            ? <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0 ml-4" />
            : <ChevronDown className="h-5 w-5 text-muted-foreground shrink-0 ml-4" />}
        </CardHeader>
      </button>
      {!collapsed && (
        <CardContent>
          <PricingSettingsBody />
        </CardContent>
      )}
    </Card>
  );
}

// ── Member Permissions Card ────────────────────────────────────────────────────

function MemberPermissionsCard({ companyId, ownerId }: { companyId: number; ownerId: number }) {
  const [collapsed, setCollapsed] = useState(true);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: members = [] } = useListCompanyMembers(companyId, {
    query: { queryKey: getListCompanyMembersQueryKey(companyId), enabled: !collapsed },
  });

  const editableMembers = members.filter(
    (m: UserWithCompany) => m.id !== ownerId
  );

  const { data: rawPerms, isLoading: permsLoading } = useGetMemberPermissions(
    companyId,
    selectedUserId ?? 0,
    {
      query: {
        queryKey: getGetMemberPermissionsQueryKey(companyId, selectedUserId ?? 0),
        enabled: !!selectedUserId && !collapsed,
      },
    }
  );

  const setPerms = useSetMemberPermissions({
    mutation: {
      onMutate: async ({ data }) => {
        if (!selectedUserId) return;
        const queryKey = getGetMemberPermissionsQueryKey(companyId, selectedUserId);
        await queryClient.cancelQueries({ queryKey });
        const previous = queryClient.getQueryData<MemberPermissions>(queryKey);
        queryClient.setQueryData<MemberPermissions>(queryKey, data);
        return { previous, queryKey };
      },
      onError: (_err, _vars, context) => {
        if (context?.previous && context.queryKey) {
          queryClient.setQueryData(context.queryKey, context.previous);
        }
        toast({ title: "Error", description: "Failed to save permissions.", variant: "destructive" });
      },
      onSuccess: () => {
        toast({ title: "Permissions saved", description: "Changes take effect on next app refresh." });
      },
      onSettled: (_data, _err, _vars, context) => {
        if (context?.queryKey) {
          queryClient.invalidateQueries({ queryKey: context.queryKey });
        }
      },
    },
  });

  // Worker defaults — must stay in sync with WORKER_DEFAULTS in api-server/src/lib/permissionGate.ts
  const defaultPermissions: MemberPermissions = {
    viewQuotes: false,
    viewTimesheets: true,
    viewFinancials: false,
    viewDocuments: true,
    viewSchedules: true,
    viewClientMessages: true,
    viewRiskTab: true,
    viewSafetyTab: true,
    viewInspectTab: true,
    manageQuotes: false,
    submitExpenses: true,
    viewAllProjects: false,
    viewDailyLog: true,
    viewReports: true,
    viewRFIs: false,
    viewPhotos: true,
    viewVault: false,
    viewEstimator: false,
    viewTradeHub: false,
    viewAskAI: true,
  };

  const allTruePermissions: MemberPermissions = {
    viewQuotes: true, viewTimesheets: true, viewFinancials: true, viewDocuments: true,
    viewSchedules: true, viewClientMessages: true, viewRiskTab: true, viewSafetyTab: true,
    viewInspectTab: true, manageQuotes: true, submitExpenses: true, viewAllProjects: true,
    viewDailyLog: true, viewReports: true, viewRFIs: true, viewPhotos: true, viewVault: true,
    viewEstimator: true, viewTradeHub: true, viewAskAI: true,
  };

  const selectedMember = editableMembers.find((m) => m.id === selectedUserId);
  const selectedRole = selectedMember?.role ?? "worker";

  const hasCustomPerms = rawPerms != null && Object.keys(rawPerms).length > 0;
  const roleDefaults = selectedRole === "worker" ? defaultPermissions : allTruePermissions;
  const resolved = (hasCustomPerms ? rawPerms : roleDefaults) as MemberPermissions;

  function toggle(key: keyof MemberPermissions) {
    if (!selectedUserId) return;
    const next: MemberPermissions = { ...resolved, [key]: !resolved[key] };
    setPerms.mutate({ companyId, userId: selectedUserId, data: next });
  }

  function resetToDefaults() {
    if (!selectedUserId) return;
    setPerms.mutate({ companyId, userId: selectedUserId, data: roleDefaults });
  }

  return (
    <Card>
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="w-full flex items-center justify-between px-6 py-4 hover:bg-accent/30 transition-colors text-left border-t-[1px] border-r-[1px] border-b-[1px] border-l-[1px]"
      >
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-md bg-amber-100">
            <ShieldCheck className="h-5 w-5 text-amber-700" />
          </div>
          <div>
            <CardTitle className="text-sm font-semibold">Member Permissions</CardTitle>
            <CardDescription className="text-xs mt-0.5">
              Choose which tabs and features each team member can access. Owners and foremen see everything by default.
            </CardDescription>
          </div>
        </div>
        {collapsed ? (
          <ChevronDown className="h-5 w-5 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-5 w-5 text-muted-foreground" />
        )}
      </button>
      {!collapsed && (
        <CardContent className="pt-0 pb-5">
          <Separator className="mb-4" />
          <div className="flex flex-col sm:flex-row gap-4">
            {/* Member list */}
            <div className="sm:w-56 shrink-0 space-y-1">
              {editableMembers.length === 0 && (
                <p className="text-sm text-muted-foreground">No other members to manage.</p>
              )}
              {editableMembers.map((m: UserWithCompany) => (
                <button
                  key={m.id}
                  onClick={() => setSelectedUserId(m.id)}
                  className={cn(
                    "w-full text-left px-3 py-2 rounded-md text-sm font-medium transition-colors",
                    selectedUserId === m.id
                      ? "bg-amber-100 text-amber-900"
                      : "hover:bg-accent/50 text-foreground"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span>{m.firstName} {m.lastName}</span>
                    <Badge variant="outline" className="text-[10px] uppercase">
                      {m.role}
                    </Badge>
                  </div>
                </button>
              ))}
            </div>

            {/* Permission toggles */}
            <div className="flex-1 space-y-4">
              {!selectedUserId && (
                <p className="text-sm text-muted-foreground">Select a team member to edit their permissions.</p>
              )}
              {selectedUserId && permsLoading && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading permissions…
                </div>
              )}
              {selectedUserId && !permsLoading && (
                <>
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">
                      {editableMembers.find((m) => m.id === selectedUserId)?.firstName}{" "}
                      {editableMembers.find((m) => m.id === selectedUserId)?.lastName}
                    </h3>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 text-xs h-8"
                      onClick={resetToDefaults}
                      disabled={setPerms.isPending}
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      Reset to Defaults
                    </Button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {PERMISSION_FIELDS.map(({ key, label, desc }) => (
                      <label
                        key={key}
                        className="flex items-start gap-3 rounded-lg border p-3 hover:bg-accent/30 transition-colors cursor-pointer"
                      >
                        <Checkbox
                          checked={!!resolved[key]}
                          onCheckedChange={() => toggle(key)}
                          disabled={setPerms.isPending}
                        />
                        <div className="space-y-0.5 leading-none">
                          <span className="text-sm font-medium">{label}</span>
                          <p className="text-xs text-muted-foreground">{desc}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

const PERMISSION_FIELDS: { key: keyof MemberPermissions; label: string; desc: string }[] = [
  { key: "viewQuotes", label: "View Quotes", desc: "Quotes tab inside projects." },
  { key: "manageQuotes", label: "Manage Quotes", desc: "Create and edit quotes." },
  { key: "viewTimesheets", label: "View Timesheets", desc: "Timesheets and Hours tabs." },
  { key: "viewFinancials", label: "View Financials", desc: "Invoices and cost tracking." },
  { key: "submitExpenses", label: "Submit Expenses", desc: "Add expenses to daily reports." },
  { key: "viewDocuments", label: "View Documents", desc: "Documents and uploads tab." },
  { key: "viewSchedules", label: "View Schedules", desc: "Project schedule tab." },
  { key: "viewClientMessages", label: "View Messages", desc: "Client messages tab." },
  { key: "viewRiskTab", label: "Risk Tab", desc: "Top-level Risk tab (mobile)." },
  { key: "viewSafetyTab", label: "Safety Tab", desc: "Top-level Safety tab (mobile)." },
  { key: "viewInspectTab", label: "Inspect Tab", desc: "Top-level Inspection tab (mobile)." },
  { key: "viewAllProjects", label: "All Projects", desc: "See every project, not just assigned ones (mobile)." },
  { key: "viewDailyLog", label: "Daily Log", desc: "Daily log quick action (mobile)." },
  { key: "viewReports", label: "Reports", desc: "Reports quick action (mobile)." },
  { key: "viewRFIs", label: "RFIs", desc: "RFIs quick action (mobile)." },
  { key: "viewPhotos", label: "Photos", desc: "Photo quick action (mobile)." },
  { key: "viewVault", label: "Vault", desc: "Vault quick action (mobile)." },
  { key: "viewEstimator", label: "Estimator", desc: "Estimator quick action (mobile)." },
  { key: "viewTradeHub", label: "TradeHub", desc: "TradeHub quick action (mobile)." },
  { key: "viewAskAI", label: "Ask AI", desc: "Ask AI quick action (mobile)." },
];

// ── Drive Sync Card (Automated Network/Local Drive Backup) ───────────────────

function DriveSyncCard() {
  const { toast } = useToast();
  const [state, setState] = useState<DriveSyncState>({ enabled: false, handle: null, pathName: null });
  const [loading, setLoading] = useState(true);
  const [selecting, setSelecting] = useState(false);
  const [collapsed, setCollapsed] = useState(true);

  useEffect(() => {
    loadDriveSyncState().then((s) => {
      setState(s);
      setLoading(false);
    });
  }, []);

  async function handleToggle(checked: boolean) {
    const next = { ...state, enabled: checked };
    setState(next);
    await saveDriveSyncState(next);
    toast({ title: checked ? "Drive sync enabled" : "Drive sync disabled" });
  }

  async function handleSelectFolder() {
    if (!isFileSystemAccessSupported()) {
      toast({
        title: "Browser not supported",
        description: "Your browser does not support the File System Access API. Try Chrome or Edge.",
        variant: "destructive",
      });
      return;
    }
    setSelecting(true);
    try {
      const handle = await window.showDirectoryPicker();
      const next: DriveSyncState = { enabled: true, handle, pathName: handle.name };
      setState(next);
      await saveDriveSyncState(next);
      toast({ title: "Destination folder selected", description: handle.name });
    } catch (err: any) {
      if (err?.name === "SecurityError" || err?.name === "NotAllowedError") {
        toast({
          title: "Cannot open folder picker",
          description: "Your browser or iframe blocked the folder picker. Try opening the app in a standalone browser window.",
          variant: "destructive",
        });
      } else if (err?.name !== "AbortError") {
        toast({
          title: "Folder picker failed",
          description: err?.message || "Could not open the folder picker.",
          variant: "destructive",
        });
      }
    } finally {
      setSelecting(false);
    }
  }

  async function handleClear() {
    setState({ enabled: false, handle: null, pathName: null });
    await clearDriveSyncState();
    toast({ title: "Drive sync reset" });
  }

  const supported = isFileSystemAccessSupported();

  return (
    <Card>
      <button onClick={() => setCollapsed(c => !c)} className="w-full text-left">
        <CardHeader className="flex flex-row items-center justify-between py-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <HardDrive className="h-5 w-5 text-primary" />
              Automated Network/Local Drive Sync
            </CardTitle>
            <CardDescription>
              Automatically save copies of invoices, quotes, estimates, spreadsheets, and uploaded files
              to a local folder or mapped network drive.
            </CardDescription>
          </div>
          {collapsed
            ? <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0 ml-4" />
            : <ChevronDown className="h-5 w-5 text-muted-foreground shrink-0 ml-4" />}
        </CardHeader>
      </button>
      {!collapsed && (
        <CardContent className="space-y-4">
        {!supported && (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-amber-600" />
            <span>
              This feature requires a browser that supports the File System Access API
              (e.g. Chrome or Edge). It will not work in Safari or Firefox.
            </span>
          </div>
        )}

        <div className="flex items-center justify-between rounded-md border border-border bg-muted/30 p-3">
          <div className="space-y-0.5">
            <p className="text-sm font-medium">Enable automatic sync</p>
            <p className="text-xs text-muted-foreground">
              Every PDF, Excel, Word, CSV, or image export/upload will be mirrored to the selected folder.
            </p>
          </div>
          <button
            onClick={() => handleToggle(!state.enabled)}
            disabled={loading}
            className={cn(
              "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              state.enabled ? "bg-primary" : "bg-input",
              loading && "opacity-50 cursor-not-allowed"
            )}
            role="switch"
            aria-checked={state.enabled}
          >
            <span
              className={cn(
                "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-background shadow ring-0 transition duration-200 ease-in-out",
                state.enabled ? "translate-x-5" : "translate-x-0"
              )}
            />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="outline"
            className="gap-2"
            disabled={selecting}
            onClick={handleSelectFolder}
          >
            {selecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderOpen className="h-4 w-4" />}
            {state.pathName ? "Change Destination Folder" : "Select Destination Folder"}
          </Button>

          {state.pathName && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{state.pathName}</span>
              <button
                onClick={handleClear}
                className="text-xs text-destructive hover:underline"
                title="Clear selected folder"
              >
                Clear
              </button>
            </div>
          )}
        </div>
      </CardContent>
    )}
    </Card>
  );
}

// ── Feature metadata displayed in the picker ──────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const FEATURE_META: Record<string, { icon: any; description: string; category: string }> = {
  INVENTORY: {
    icon: Package,
    description: "Fleet dispatch board, materials stoplight tracking, and tool rental counter.",
    category: "Operations",
  },
  PERMITS: {
    icon: ShieldCheck,
    description: "Track, request, and manage municipal and environmental project permits.",
    category: "Compliance",
  },
  CONTACTS: {
    icon: Users,
    description: "Client, worker, and subcontractor CRM with COI compliance tracking.",
    category: "CRM",
  },
  SCHEDULING: {
    icon: Layers,
    description: "Crew and equipment scheduling, Gantt views, and worker hour tracking.",
    category: "Operations",
  },
  SAFETY_FORMS: {
    icon: ShieldCheck,
    description: "Dynamic safety forms, inspection checklists, and compliance sign-offs.",
    category: "Compliance",
  },
  FINANCIALS: {
    icon: DollarSign,
    description: "P&L reports, cost tracking, and financial dashboards.",
    category: "Finance",
  },
  AI_CHAT: {
    icon: Layers,
    description: "AI construction assistant for estimating, RFIs, and field queries.",
    category: "AI",
  },
  TRADEHUB: {
    icon: Globe,
    description: "Marketplace for finding and hiring local trades and subcontractors.",
    category: "Marketplace",
  },
};

type AvailableFeature = {
  id: number; key: string; name: string; description: string | null;
  isEnabled: boolean; active: boolean;
};

function FeaturesCard({ companyId }: { companyId: number }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [collapsed, setCollapsed] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);

  const { data, isLoading } = useQuery<{ features: AvailableFeature[] }>({
    queryKey: ["company-features-available", companyId],
    queryFn: () => customFetch(`/api/companies/${companyId}/features/available`),
    enabled: !collapsed && !!companyId,
    staleTime: 30_000,
  });

  async function handleToggle(featureKey: string, enabled: boolean) {
    setToggling(featureKey);
    try {
      await customFetch(`/api/companies/${companyId}/features/toggle`, {
        method: "PATCH",
        body: JSON.stringify({ featureKey, enabled }),
      });
      // Invalidate all feature caches so sidebar + guards update immediately
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["company-features-available", companyId] }),
        qc.invalidateQueries({ queryKey: ["company-features", companyId] }),
        qc.invalidateQueries({ queryKey: ["me-features"] }),
      ]);
      toast({ title: enabled ? `${featureKey} enabled` : `${featureKey} disabled` });
    } catch {
      toast({ title: "Failed to update feature", variant: "destructive" });
    } finally {
      setToggling(null);
    }
  }

  const features = data?.features ?? [];
  const activeCount = features.filter((f) => f.active).length;

  return (
    <Card>
      <button onClick={() => setCollapsed((c) => !c)} className="w-full text-left">
        <CardHeader className="flex flex-row items-center justify-between py-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ToggleRight className="h-5 w-5" style={{ color: "#D4AF37" }} />
              Features
            </CardTitle>
            <CardDescription>
              Enable or disable platform modules for your company.
              {!collapsed && activeCount > 0 && (
                <span className="ml-2 inline-flex items-center rounded-full bg-green-50 px-2 py-0.5 text-[10px] font-semibold text-green-700 border border-green-200">
                  {activeCount} active
                </span>
              )}
            </CardDescription>
          </div>
          {collapsed
            ? <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0 ml-4" />
            : <ChevronDown className="h-5 w-5 text-muted-foreground shrink-0 ml-4" />}
        </CardHeader>
      </button>

      {!collapsed && (
        <CardContent className="space-y-2 pt-0">
          {isLoading ? (
            <div className="space-y-3 py-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 animate-pulse">
                  <div className="h-9 w-9 rounded-lg bg-gray-100" />
                  <div className="flex-1">
                    <div className="h-3.5 w-32 bg-gray-100 rounded mb-1.5" />
                    <div className="h-3 w-48 bg-gray-100 rounded" />
                  </div>
                  <div className="h-6 w-11 rounded-full bg-gray-100" />
                </div>
              ))}
            </div>
          ) : features.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No features found. Contact your administrator.
            </p>
          ) : (
            <>
              {/* Group by category */}
              {Object.entries(
                features.reduce<Record<string, AvailableFeature[]>>((acc, f) => {
                  const cat = FEATURE_META[f.key]?.category ?? "Other";
                  if (!acc[cat]) acc[cat] = [];
                  acc[cat].push(f);
                  return acc;
                }, {}),
              ).map(([category, items]) => (
                <div key={category}>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mt-4 mb-2 px-1">
                    {category}
                  </p>
                  <div className="space-y-1">
                    {items.map((feature) => {
                      const meta = FEATURE_META[feature.key];
                      const Icon = meta?.icon ?? Package;
                      const isToggling = toggling === feature.key;

                      return (
                        <div
                          key={feature.key}
                          className="flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-muted/40"
                        >
                          <div
                            className="h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0"
                            style={{
                              background: feature.active ? "#D4AF3718" : "#f3f4f6",
                              border: `1px solid ${feature.active ? "#D4AF3740" : "#e5e7eb"}`,
                            }}
                          >
                            <Icon
                              className="h-4 w-4"
                              style={{ color: feature.active ? "#D4AF37" : "#9ca3af" }}
                            />
                          </div>

                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-foreground">{feature.name}</p>
                            <p className="text-xs text-muted-foreground truncate">
                              {meta?.description ?? feature.description ?? "—"}
                            </p>
                          </div>

                          {/* Toggle pill */}
                          <button
                            disabled={isToggling}
                            onClick={() => handleToggle(feature.key, !feature.active)}
                            className="relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer items-center rounded-full transition-colors focus:outline-none disabled:opacity-50"
                            style={{
                              background: feature.active ? "#D4AF37" : "#e5e7eb",
                            }}
                            aria-checked={feature.active}
                            role="switch"
                          >
                            {isToggling ? (
                              <Loader2
                                className="absolute inset-0 m-auto h-3.5 w-3.5 animate-spin"
                                style={{ color: feature.active ? "#fff" : "#6b7280" }}
                              />
                            ) : (
                              <span
                                className="inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform"
                                style={{
                                  transform: feature.active ? "translateX(22px)" : "translateX(2px)",
                                }}
                              />
                            )}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}

              <p className="text-xs text-muted-foreground pt-4 pb-1">
                Feature availability is determined by your subscription plan. Contact support to unlock additional modules.
              </p>
            </>
          )}
        </CardContent>
      )}
    </Card>
  );
}

// ── Settings Page ──────────────────────────────────────────────────────────────

export default function Settings() {
  const { data: user } = useGetMe();
  const company = user?.company;

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-[#121212] flex items-center gap-2">
          <Globe className="h-6 w-6" style={{ color: "#D4AF37" }} />
          Settings
        </h1>
        <p className="text-sm text-[#121212]/60 font-medium">Manage your company information and preferences.</p>
      </div>

      {company && (
        <Card>
          <CardHeader>
            <CardTitle>Company Details</CardTitle>
            <CardDescription>This information is visible on all reports and documents.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Company Name</Label>
              <Input value={company.name} readOnly disabled />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>City</Label>
                <Input value={company.city} readOnly disabled />
              </div>
              <div className="space-y-2">
                <Label>Province</Label>
                <Input value={company.province} readOnly disabled />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input value={company.phone || ""} readOnly disabled />
            </div>
            <p className="text-sm text-muted-foreground pt-4">
              * Company details can only be edited by contacting support currently.
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>My Profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>First Name</Label>
              <Input value={user?.firstName ?? ""} readOnly disabled />
            </div>
            <div className="space-y-2">
              <Label>Last Name</Label>
              <Input value={user?.lastName ?? ""} readOnly disabled />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Email</Label>
            <Input value={user?.email ?? ""} readOnly disabled />
          </div>
          <div className="space-y-2">
            <Label>Role</Label>
            <Input value={user?.role ?? ""} readOnly disabled className="capitalize" />
          </div>
          <p className="text-sm text-muted-foreground pt-4">
            * Profile details are synced from your login provider.
          </p>
        </CardContent>
      </Card>

      <TeamSeatsCard />
      {user?.role === "owner" && company && <FeaturesCard companyId={company.id} />}
      {user?.role === "owner" && company && <MemberPermissionsCard companyId={company.id} ownerId={user.id} />}
      {company && <CompanyLogoCard company={company} />}
      {company && <DocumentTemplatesCard company={company} />}
      {user?.role === "owner" && company && <DocumentNumberingCard company={company} />}
      {user?.role === "owner" && <PricingManagerCard />}
      <DigestCard />
      <AccountingCard />
      <DriveSyncCard />
    </div>
  );
}
