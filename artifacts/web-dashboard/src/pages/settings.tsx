import { useGetMe, customFetch, useListCompanyMembers, useGetMemberPermissions, useSetMemberPermissions, getListCompanyMembersQueryKey, getGetMemberPermissionsQueryKey } from "@workspace/api-client-react";
import type { MemberPermissions, UserWithCompany } from "@workspace/api-client-react";
import { PricingSettingsBody } from "@/pages/pricing-manager";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Mail, CheckCircle, AlertCircle, Loader2, ExternalLink, Info, RefreshCw, Link2, Link2Off, BookOpen, DollarSign, Globe, ImageIcon, Upload, X, FileText, Users, UserPlus, ChevronDown, ChevronRight, ShieldCheck, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
const GOLD = "#C9A84C";
const BLACK = "#111111";

function statusBadge(status: string) {
  if (status === "active") return <Badge className="bg-green-600 text-white font-semibold">Active</Badge>;
  if (status === "trialing") return <Badge className="bg-blue-500 text-white font-semibold">Trial</Badge>;
  if (status === "past_due") return <Badge className="bg-amber-500 text-white font-semibold">Past Due</Badge>;
  if (status === "canceled") return <Badge className="bg-zinc-600 text-white font-semibold">Canceled</Badge>;
  return <Badge className="bg-zinc-700 text-white font-semibold capitalize">{status}</Badge>;
}

function TeamSeatsCard() {
  const [, navigate] = useLocation();
  const { data: seatInfo, isLoading: seatsLoading } = useQuery<{
    currentSeats: number;
    maxSeats: number | "unlimited";
    canAddMore: boolean;
  }>({
    queryKey: ["billing-seats"],
    queryFn: () => customFetch("/api/billing/seats"),
  });

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

interface EmailConfig {
  fromEmail: string;
  isCustomDomain: boolean;
  resendKeySet: boolean;
}

function EmailDomainCard() {
  const { data: cfg, isLoading } = useQuery<EmailConfig>({
    queryKey: ["email-config"],
    queryFn: () => customFetch("/api/settings/email-config"),
    refetchOnWindowFocus: false,
  });

  const steps = [
    {
      n: 1,
      title: "Create a Resend account & add your domain",
      body: (
        <>
          Go to{" "}
          <a href="https://resend.com/domains" target="_blank" rel="noopener noreferrer" className="underline font-medium inline-flex items-center gap-0.5">
            resend.com/domains <ExternalLink className="h-3 w-3" />
          </a>{" "}
          and click <strong>Add Domain</strong>. Enter your domain (e.g. <code className="font-mono bg-muted px-1 rounded text-xs">sitesnap.ca</code>).
        </>
      ),
    },
    {
      n: 2,
      title: "Add the DNS records Resend provides",
      body: "Resend will show you SPF, DKIM, and DMARC records. Add them to your domain registrar (e.g. GoDaddy, Namecheap, Cloudflare). DNS propagation can take up to 48 hours.",
    },
    {
      n: 3,
      title: 'Click "Verify" in Resend once DNS is ready',
      body: 'Once verified, the domain status turns green. You can then send from any address at that domain, e.g. noreply@sitesnap.ca.',
    },
    {
      n: 4,
      title: "Set your from address in Replit Secrets",
      body: (
        <>
          In the Replit Secrets tab, set{" "}
          <code className="font-mono bg-muted px-1 rounded text-xs">DIGEST_FROM_EMAIL</code> to{" "}
          <code className="font-mono bg-muted px-1 rounded text-xs">Site Snap &lt;noreply@sitesnap.ca&gt;</code>{" "}
          (use your own domain). The server will pick it up on next restart.
        </>
      ),
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Globe className="h-5 w-5 text-primary" />
          Custom Email Domain
          {!isLoading && cfg && (
            cfg.isCustomDomain
              ? <Badge variant="outline" className="text-green-700 border-green-300 bg-green-50 ml-1">Active</Badge>
              : <Badge variant="outline" className="text-muted-foreground ml-1">Not configured</Badge>
          )}
        </CardTitle>
        <CardDescription>
          Send digest and billing emails from your own domain (e.g.{" "}
          <code className="font-mono text-xs">noreply@sitesnap.ca</code>) instead of the default Resend address.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!isLoading && cfg && (
          <div className={`rounded-md border p-3 text-sm flex items-start gap-2 ${cfg.isCustomDomain ? "bg-green-50 border-green-200 text-green-800" : "bg-muted/40 border-border text-muted-foreground"}`}>
            {cfg.isCustomDomain
              ? <CheckCircle className="h-4 w-4 mt-0.5 shrink-0 text-green-600" />
              : <Info className="h-4 w-4 mt-0.5 shrink-0" />}
            <span>
              Emails are currently sent from:{" "}
              <code className="font-mono text-xs bg-muted/60 px-1 rounded">{cfg.fromEmail}</code>
            </span>
          </div>
        )}

        {!isLoading && cfg && !cfg.resendKeySet && (
          <div className="flex items-start gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-3">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-amber-600" />
            <span>
              <strong>RESEND_API_KEY</strong> is not set. Email sending is disabled until you add it in Replit Secrets.
            </span>
          </div>
        )}

        <div className="space-y-3">
          <p className="text-sm font-medium text-foreground">Setup steps:</p>
          <ol className="space-y-3">
            {steps.map((s) => (
              <li key={s.n} className="flex gap-3 text-sm">
                <span className="flex-shrink-0 flex items-center justify-center h-6 w-6 rounded-full bg-primary/10 text-primary text-xs font-bold mt-0.5">
                  {s.n}
                </span>
                <div className="space-y-0.5">
                  <p className="font-medium text-foreground">{s.title}</p>
                  <p className="text-muted-foreground leading-relaxed">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>

        <div className="pt-1">
          <a
            href="https://resend.com/domains"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-primary underline underline-offset-2 hover:text-primary/80"
          >
            Open Resend Domain Settings
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      </CardContent>
    </Card>
  );
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

// ── Company Logo Card ──────────────────────────────────────────────────────────

function CompanyLogoCard({ company }: { company: any }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const logoUrl = company.logoPath
    ? company.logoPath.replace(/^\/objects\//, "/api/storage/objects/")
    : null;

  async function handleLogoUpload(file: File) {
    setUploading(true);
    try {
      const { uploadURL, objectPath } = await customFetch<{ uploadURL: string; objectPath: string }>(
        "/api/storage/uploads/request-url",
        {
          method: "POST",
          body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
        }
      );
      await fetch(uploadURL, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
      await customFetch(`/api/companies/${company.id}/logo`, {
        method: "PATCH",
        body: JSON.stringify({ logoPath: objectPath }),
      });
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
      await customFetch(`/api/companies/${company.id}/logo`, {
        method: "PATCH",
        body: JSON.stringify({ logoPath: "" }),
      });
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
        {logoUrl ? (
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

  function templateUrl(path: string | null | undefined) {
    if (!path) return null;
    return path.replace(/^\/objects\//, "/api/storage/objects/");
  }

  async function handleUpload(file: File, type: "quote" | "invoice") {
    setUploadingType(type);
    try {
      const { uploadURL, objectPath } = await customFetch<{ uploadURL: string; objectPath: string }>(
        "/api/storage/uploads/request-url",
        { method: "POST", body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }) }
      );
      await fetch(uploadURL, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
      await customFetch(`/api/companies/${company.id}/${type}-template`, {
        method: "PATCH",
        body: JSON.stringify({ templatePath: objectPath }),
      });
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
      await customFetch(`/api/companies/${company.id}/${type}-template`, {
        method: "PATCH",
        body: JSON.stringify({ templatePath: "" }),
      });
      queryClient.invalidateQueries({ queryKey: ["/api/users/me"] });
      toast({ title: `${type === "quote" ? "Quote" : "Invoice"} template removed` });
    } catch {
      toast({ title: "Failed to remove template", variant: "destructive" });
    }
  }

  const quoteTemplateUrl = templateUrl(company.quoteTemplatePath);
  const invoiceTemplateUrl = templateUrl(company.invoiceTemplatePath);

  function TemplateSection({
    type,
    currentUrl,
    inputRef,
  }: {
    type: "quote" | "invoice";
    currentUrl: string | null;
    inputRef: React.RefObject<HTMLInputElement | null>;
  }) {
    const label = type === "quote" ? "Quote Template" : "Invoice Template";
    const isUploading = uploadingType === type;
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

        {currentUrl ? (
          <div className="rounded-lg border border-border bg-muted/20 overflow-hidden">
            <img src={currentUrl} alt={`${label} preview`} className="w-full max-h-28 object-cover object-top" />
          </div>
        ) : (
          <div className="rounded-lg border-2 border-dashed border-border bg-muted/20 p-5 flex items-center justify-center h-20">
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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-primary" />
          Document Templates
        </CardTitle>
        <CardDescription>
          Upload a custom header image for your quotes and invoices. This image will appear at the top of every exported
          PDF, replacing the default Site Snap header. Recommended: landscape PNG at 1400&times;280 px.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <TemplateSection type="quote" currentUrl={quoteTemplateUrl} inputRef={quoteInputRef} />
        <Separator />
        <TemplateSection type="invoice" currentUrl={invoiceTemplateUrl} inputRef={invoiceInputRef} />
        <p className="text-xs text-muted-foreground">PNG, JPG, or WebP · max 20 MB</p>
      </CardContent>
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
    (m: UserWithCompany) =>
      m.id !== ownerId && (m.role === "worker" || m.role === "foreman")
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
      onSuccess: () => {
        toast({ title: "Permissions saved", description: "Changes are active immediately." });
        queryClient.invalidateQueries({ queryKey: ["memberPermissions", companyId, selectedUserId] });
        queryClient.invalidateQueries({ queryKey: ["getMemberPermissions"] });
      },
      onError: () => {
        toast({ title: "Error", description: "Failed to save permissions.", variant: "destructive" });
      },
    },
  });

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
  };

  const resolved = (rawPerms ?? defaultPermissions) as MemberPermissions;

  function toggle(key: keyof MemberPermissions) {
    if (!selectedUserId) return;
    const next: MemberPermissions = { ...resolved, [key]: !resolved[key] };
    setPerms.mutate({ companyId, userId: selectedUserId, data: next });
  }

  function resetToDefaults() {
    if (!selectedUserId) return;
    setPerms.mutate({ companyId, userId: selectedUserId, data: defaultPermissions });
  }

  return (
    <Card>
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="w-full flex items-center justify-between px-6 py-4 hover:bg-accent/30 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-md bg-amber-100">
            <ShieldCheck className="h-5 w-5 text-amber-700" />
          </div>
          <div>
            <CardTitle className="text-sm font-semibold">Member Permissions</CardTitle>
            <CardDescription className="text-xs mt-0.5">
              Choose which tabs and features workers can access.
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
                <p className="text-sm text-muted-foreground">No workers or foremen to manage.</p>
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
];

// ── Settings Page ──────────────────────────────────────────────────────────────

export default function Settings() {
  const { data: user } = useGetMe();
  const company = user?.company;

  if (!company) return null;

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-[#121212] flex items-center gap-2">
          <Globe className="h-6 w-6" style={{ color: "#D4AF37" }} />
          Settings
        </h1>
        <p className="text-sm text-[#121212]/60 font-medium">Manage your company information and preferences.</p>
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

      <TeamSeatsCard />
      {user?.role === "owner" && <MemberPermissionsCard companyId={company.id} ownerId={user.id} />}
      <CompanyLogoCard company={company} />
      <DocumentTemplatesCard company={company} />
      {user?.role === "owner" && <PricingManagerCard />}
      <DigestCard />
      <QuickBooksCard />
    </div>
  );
}
