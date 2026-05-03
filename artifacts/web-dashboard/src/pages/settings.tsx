import { useGetMe, customFetch } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Mail, CheckCircle, AlertCircle, Loader2, ExternalLink, Info, RefreshCw, Link2, Link2Off, BookOpen, DollarSign } from "lucide-react";
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="h-5 w-5 text-primary" />
          Daily Digest Email
        </CardTitle>
        <CardDescription>
          A morning summary is automatically emailed to all owners and foremens every day at 7:00 AM ET,
          showing yesterday's reports, open RFIs, and overdue tasks across all active projects.
        </CardDescription>
      </CardHeader>
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
    </Card>
  );
}

interface QbStatus {
  connected: boolean;
  configured: boolean;
  connection: {
    realmId: string;
    environment: string;
    lastInvoiceSyncAt: string | null;
    lastCostSyncAt: string | null;
    syncedInvoiceCount: number | null;
    syncedCostCount: number | null;
    connectedAt: string;
  } | null;
}

function QuickBooksCard() {
  const qc = useQueryClient();
  const [syncMsg, setSyncMsg] = useState<{ type: "ok" | "error"; text: string } | null>(null);

  const { data: qb, isLoading: qbLoading } = useQuery<QbStatus>({
    queryKey: ["qb-status"],
    queryFn: () => customFetch("/api/quickbooks/status"),
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const qbParam = params.get("qb");
    if (qbParam === "connected") {
      qc.invalidateQueries({ queryKey: ["qb-status"] });
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
      const data = await customFetch<{ url: string }>("/api/quickbooks/auth-url");
      window.location.href = data.url;
    },
    onError: (err: any) => setSyncMsg({ type: "error", text: err?.message ?? "Failed to get auth URL" }),
  });

  const disconnectMutation = useMutation({
    mutationFn: () => customFetch("/api/quickbooks/disconnect", { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["qb-status"] }); setSyncMsg(null); },
    onError: (err: any) => setSyncMsg({ type: "error", text: err?.message ?? "Disconnect failed" }),
  });

  const syncInvoices = useMutation({
    mutationFn: () => customFetch<{ synced: number; total: number; errors: string[] }>("/api/quickbooks/sync/invoices", { method: "POST" }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["qb-status"] });
      const errText = data.errors.length ? ` (${data.errors.length} errors)` : "";
      setSyncMsg({ type: data.errors.length ? "error" : "ok", text: `Synced ${data.synced}/${data.total} invoices to QuickBooks${errText}` });
    },
    onError: (err: any) => setSyncMsg({ type: "error", text: err?.message ?? "Invoice sync failed" }),
  });

  const syncCosts = useMutation({
    mutationFn: () => customFetch<{ synced: number; total: number; errors: string[] }>("/api/quickbooks/sync/costs", { method: "POST" }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["qb-status"] });
      const errText = data.errors.length ? ` (${data.errors.length} errors)` : "";
      setSyncMsg({ type: data.errors.length ? "error" : "ok", text: `Synced ${data.synced}/${data.total} cost entries to QuickBooks${errText}` });
    },
    onError: (err: any) => setSyncMsg({ type: "error", text: err?.message ?? "Cost sync failed" }),
  });

  const fmtDate = (d: string | null) => d ? new Date(d).toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short" }) : "Never";
  const isSyncing = syncInvoices.isPending || syncCosts.isPending;

  return (
    <Card>
      <CardHeader>
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
      </CardHeader>
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
    </Card>
  );
}

export default function Settings() {
  const { data: user } = useGetMe();
  const company = user?.company;

  if (!company) return null;

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">Manage your company information and preferences.</p>
      </div>

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

      <Card>
        <CardHeader>
          <CardTitle>My Profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>First Name</Label>
              <Input value={user.firstName} readOnly disabled />
            </div>
            <div className="space-y-2">
              <Label>Last Name</Label>
              <Input value={user.lastName} readOnly disabled />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Email</Label>
            <Input value={user.email} readOnly disabled />
          </div>
          <div className="space-y-2">
            <Label>Role</Label>
            <Input value={user.role} readOnly disabled className="capitalize" />
          </div>
          <p className="text-sm text-muted-foreground pt-4">
            * Profile details are synced from your login provider.
          </p>
        </CardContent>
      </Card>

      <DigestCard />
      <QuickBooksCard />
    </div>
  );
}
