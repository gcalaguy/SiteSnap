import { useState } from "react";
import {
  useGetMe,
  useGetEmailIntegrationsStatus,
  getGetEmailIntegrationsStatusQueryKey,
  getEmailIntegrationsOutlookAuthUrl,
  getEmailIntegrationsGmailAuthUrl,
  useListEmailIntegrationFolders,
  getListEmailIntegrationFoldersQueryKey,
  useUpdateEmailIntegrationAccount,
  useDisconnectEmailIntegrationAccount,
  useSyncEmailIntegrationAccountNow,
  type EmailAccount,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Mail,
  AtSign,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RefreshCw,
  Users,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

const FREQUENCY_OPTIONS: Array<{ value: EmailAccount["syncFrequency"]; label: string }> = [
  { value: "15min", label: "Every 15 min" },
  { value: "hourly", label: "Hourly" },
  { value: "daily", label: "Daily" },
];

function StatusPill({ status }: { status: EmailAccount["status"] | "not_connected" }) {
  const tone =
    status === "active"
      ? { cls: "bg-emerald-50 text-emerald-600 border-emerald-100", icon: CheckCircle2, label: "Connected" }
      : status === "reauth_required"
      ? { cls: "bg-amber-50 text-amber-600 border-amber-100", icon: AlertTriangle, label: "Reauth needed" }
      : status === "error"
      ? { cls: "bg-red-50 text-red-600 border-red-100", icon: XCircle, label: "Error" }
      : { cls: "bg-red-50 text-red-600 border-red-100", icon: XCircle, label: "Not connected" };
  const Icon = tone.icon;
  return (
    <Badge variant="outline" className={`gap-1 ${tone.cls}`}>
      <Icon className="w-3 h-3" /> {tone.label}
    </Badge>
  );
}

function formatDateTime(iso?: string | null) {
  if (!iso) return "Never";
  try {
    return new Date(iso).toLocaleString("en-CA", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "Never";
  }
}

function ProviderCard({
  provider,
  label,
  icon: Icon,
  configured,
  account,
  onRefetch,
}: {
  provider: "outlook" | "gmail";
  label: string;
  icon: typeof Mail;
  configured: boolean;
  account?: EmailAccount;
  onRefetch: () => void;
}) {
  const { toast } = useToast();
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [showFolders, setShowFolders] = useState(false);
  // Phase 4 — Outlook shared mailboxes only (Gmail Workspace delegation needs
  // domain-wide admin consent — a structurally different, scoped-out flow).
  const [mailboxMode, setMailboxMode] = useState<"personal" | "shared">("personal");
  const [sharedAddress, setSharedAddress] = useState("");

  const { data: folderData, isLoading: foldersLoading } = useListEmailIntegrationFolders(
    account?.id ?? 0,
    { query: { queryKey: getListEmailIntegrationFoldersQueryKey(account?.id ?? 0), enabled: showFolders && !!account } },
  );

  const { mutateAsync: updateAccount, isPending: updating } = useUpdateEmailIntegrationAccount();
  const { mutateAsync: disconnectAccount, isPending: disconnecting } = useDisconnectEmailIntegrationAccount();
  const { mutateAsync: syncNow } = useSyncEmailIntegrationAccountNow();

  async function handleConnect() {
    if (provider === "outlook" && mailboxMode === "shared" && !sharedAddress.trim()) {
      toast({ title: "Address required", description: "Enter the shared mailbox's email address first.", variant: "destructive" });
      return;
    }
    setConnecting(true);
    try {
      const result =
        provider === "outlook"
          ? await getEmailIntegrationsOutlookAuthUrl(
              mailboxMode === "shared" ? { sharedMailboxAddress: sharedAddress.trim() } : undefined,
            )
          : await getEmailIntegrationsGmailAuthUrl();
      window.location.href = result.url;
    } catch {
      toast({ title: "Connection failed", description: `Could not fetch the ${label} authorization URL. Please try again.`, variant: "destructive" });
      setConnecting(false);
    }
  }

  async function handleDisconnect() {
    if (!account) return;
    if (!window.confirm(`Disconnect ${label}? Synced emails already stored will be kept, but syncing will stop.`)) return;
    try {
      await disconnectAccount({ accountId: account.id });
      onRefetch();
    } catch {
      toast({ title: "Failed", description: "Could not disconnect. Please try again.", variant: "destructive" });
    }
  }

  async function handleSyncNow() {
    if (!account) return;
    setSyncing(true);
    try {
      await syncNow({ accountId: account.id });
      onRefetch();
    } catch {
      toast({ title: "Sync failed", description: "Could not sync now. Please try again.", variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  }

  async function handleFrequencyChange(freq: EmailAccount["syncFrequency"]) {
    if (!account) return;
    try {
      await updateAccount({ accountId: account.id, data: { syncFrequency: freq } });
      onRefetch();
    } catch {
      toast({ title: "Failed", description: "Could not update sync frequency. Please try again.", variant: "destructive" });
    }
  }

  async function toggleFolder(folderId: string) {
    if (!account) return;
    const current = (account.selectedFolders as string[] | null) ?? [];
    const next = current.includes(folderId) ? current.filter((f) => f !== folderId) : [...current, folderId];
    try {
      await updateAccount({ accountId: account.id, data: { selectedFolders: next } });
      onRefetch();
    } catch {
      toast({ title: "Failed", description: "Could not update folder selection. Please try again.", variant: "destructive" });
    }
  }

  const isConnected = account?.status === "active" || account?.status === "reauth_required" || account?.status === "error";

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Icon className="w-4.5 h-4.5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-semibold text-sm text-foreground">{label}</p>
              {account?.mailboxType === "shared" && (
                <Badge variant="outline" className="gap-1 text-muted-foreground">
                  <Users className="w-3 h-3" /> Shared
                </Badge>
              )}
            </div>
            {account?.emailAddress && (
              <p className="text-xs text-foreground/50 truncate">{account.emailAddress}</p>
            )}
          </div>
          <StatusPill status={account?.status ?? "not_connected"} />
        </div>

        {!configured && (
          <p className="text-xs text-foreground/50 leading-relaxed">
            Not configured on the server yet — ask an administrator to set up {label} OAuth credentials.
          </p>
        )}

        {isConnected && account && (
          <>
            <div className="flex items-center justify-between text-xs">
              <span className="text-foreground/50">Last synced</span>
              <span className="text-foreground">{formatDateTime(account.lastSyncAt)}</span>
            </div>
            {account.lastSyncError && (
              <p className="text-xs text-red-500 line-clamp-2">{account.lastSyncError}</p>
            )}

            <div className="space-y-1.5">
              <p className="text-xs font-medium text-foreground/70">Sync frequency</p>
              <div className="flex gap-1.5">
                {FREQUENCY_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    disabled={updating}
                    onClick={() => handleFrequencyChange(opt.value)}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                      account.syncFrequency === opt.value
                        ? "bg-primary text-black border-primary"
                        : "bg-muted text-foreground/70 border-border hover:text-foreground"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowFolders((v) => !v)}
              className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              {showFolders ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              {showFolders ? "Hide folders" : "Choose folders to sync"}
            </button>
            {showFolders && (
              <div className="space-y-1.5 pl-1">
                {foldersLoading ? (
                  <RefreshCw className="w-4 h-4 animate-spin text-foreground/40" />
                ) : (folderData?.folders ?? []).length === 0 ? (
                  <p className="text-xs text-foreground/50">No folders selected yet — syncing the default inbox.</p>
                ) : (
                  (folderData?.folders ?? []).map((folder) => {
                    const selected = ((account.selectedFolders as string[] | null) ?? []).includes(folder.id);
                    return (
                      <label key={folder.id} className="flex items-center gap-2 text-sm cursor-pointer">
                        <Checkbox checked={selected} onCheckedChange={() => toggleFolder(folder.id)} />
                        <span className="text-foreground/80">{folder.name}</span>
                      </label>
                    );
                  })
                )}
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <Button
                variant="outline"
                size="sm"
                className="flex-1 border-border"
                disabled={syncing}
                onClick={handleSyncNow}
              >
                {syncing ? <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 mr-1.5" />}
                Sync Now
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="flex-1 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                disabled={disconnecting}
                onClick={handleDisconnect}
              >
                Disconnect
              </Button>
            </div>
          </>
        )}

        {!isConnected && configured && provider === "outlook" && (
          <div className="space-y-2">
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => setMailboxMode("personal")}
                className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                  mailboxMode === "personal" ? "bg-primary text-black border-primary" : "bg-muted text-foreground/70 border-border"
                }`}
              >
                My Inbox
              </button>
              <button
                type="button"
                onClick={() => setMailboxMode("shared")}
                className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                  mailboxMode === "shared" ? "bg-primary text-black border-primary" : "bg-muted text-foreground/70 border-border"
                }`}
              >
                Shared Mailbox
              </button>
            </div>
            {mailboxMode === "shared" && (
              <Input
                value={sharedAddress}
                onChange={(e) => setSharedAddress(e.target.value)}
                placeholder="shared-mailbox@yourcompany.com"
                className="bg-background border-border h-9"
              />
            )}
          </div>
        )}

        {!isConnected && configured && (
          <Button
            className="w-full bg-primary text-black hover:bg-primary/90"
            disabled={connecting}
            onClick={handleConnect}
          >
            {connecting ? <RefreshCw className="w-4 h-4 mr-1.5 animate-spin" /> : <Icon className="w-4 h-4 mr-1.5" />}
            Connect {mailboxMode === "shared" && provider === "outlook" ? "Shared Mailbox" : label}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

export default function EmailIntegrationsPage() {
  const { data: me } = useGetMe();
  const queryClient = useQueryClient();
  const isOwner = me?.role === "owner" || me?.systemRole === "super_admin";

  const { data: status, isLoading } = useGetEmailIntegrationsStatus({
    query: { queryKey: getGetEmailIntegrationsStatusQueryKey(), enabled: isOwner },
  });

  function refetchStatus() {
    queryClient.invalidateQueries({ queryKey: getGetEmailIntegrationsStatusQueryKey() });
  }

  if (!isOwner) {
    return (
      <div className="py-16 flex flex-col items-center text-center">
        <AlertTriangle className="w-10 h-10 text-amber-400 mb-3" />
        <p className="text-sm font-medium">Only company owners can manage Email Integrations.</p>
      </div>
    );
  }

  const outlookAccount = status?.accounts.find((a) => a.provider === "outlook" && a.status !== "disconnected");
  const gmailAccount = status?.accounts.find((a) => a.provider === "gmail" && a.status !== "disconnected");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-foreground flex items-center gap-2">
          <Mail className="h-6 w-6 text-primary" />
          Email Integrations
        </h1>
        <p className="text-sm text-foreground/60 font-medium">
          Connect a mailbox to sync project-relevant emails into Project Communications. Only read access is
          requested — SiteSnap never sends email on your behalf.
        </p>
      </div>

      {isLoading ? (
        <div className="py-16 text-center text-foreground/60 animate-pulse font-medium">Loading…</div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 max-w-2xl">
          <ProviderCard
            provider="outlook"
            label="Outlook"
            icon={Mail}
            configured={status?.outlookConfigured ?? false}
            account={outlookAccount}
            onRefetch={refetchStatus}
          />
          <ProviderCard
            provider="gmail"
            label="Gmail"
            icon={AtSign}
            configured={status?.gmailConfigured ?? false}
            account={gmailAccount}
            onRefetch={refetchStatus}
          />
        </div>
      )}
    </div>
  );
}
