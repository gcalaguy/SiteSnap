import { useState } from "react";
import { useLocation } from "wouter";
import {
  ChevronDown, ChevronRight, Loader2, Calculator, Download,
  BookOpen, Info, CheckCircle, AlertCircle,
  DollarSign, RefreshCw, Link2, Link2Off, Archive, Crown,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAccountingExport } from "@/hooks/settings/useAccountingExport";
import { useQuickBooks } from "@/hooks/settings/useQuickBooks";

// ── QuickBooks Integration Card ────────────────────────────────────────────────

function QuickBooksCard() {
  const { qb, qbLoading, syncMsg, connectMutation, disconnectMutation, syncInvoices, syncCosts, fmtDate, isSyncing } = useQuickBooks();
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

// ── Audit Log Card (Enterprise-only) ─────────────────────────────────────────

function AuditLogCard() {
  const [, navigate] = useLocation();
  return (
    <div className="rounded-md border border-border bg-muted/20 p-4 space-y-3">
      <div className="flex items-start gap-2">
        <Archive className="h-5 w-5 mt-0.5 shrink-0 text-primary" />
        <div className="space-y-1">
          <p className="text-sm font-semibold">Compliance & Audit Log</p>
          <p className="text-xs text-muted-foreground">
            Central pane to view, save, and print verified snapshots of all active projects, financials, timesheets, and security logs for official audits.
          </p>
        </div>
      </div>
      <Button
        variant="outline"
        size="sm"
        className="gap-2"
        onClick={() => navigate("/audit-log")}
      >
        <Archive className="h-4 w-4" />
        Open Audit Log
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

export function AccountingTab() {
  const [collapsed, setCollapsed] = useState(true);
  const { hasVaultAccess, exportBlob, exportLoading, exporting, handleExport } = useAccountingExport(collapsed);

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
                  Download a ZIP of CSVs for your bookkeeping software — uploaded &amp; OCR'd receipts, the full expense ledger, invoices, a transaction journal of all paid invoices, approved change orders, project costs, and approved timesheets, with copies of the original attachments.
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
          {hasVaultAccess ? <AuditLogCard /> : <UpgradeToEnterpriseBanner />}
        </CardContent>
      )}
    </Card>
  );
}
