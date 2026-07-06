import { useState } from "react";
import { Copy, Link2, Loader2, Plus, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuditorTokens, type AuditorToken } from "@/hooks/cor-compliance/useAuditorTokens";

export function AuditorAccessTab() {
  const { toast } = useToast();
  const [showCreate, setShowCreate] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [expiryDays, setExpiryDays] = useState("30");

  const { tokensQuery, createMutation, revokeMutation } = useAuditorTokens();
  const tokens = tokensQuery.data ?? [];
  const isLoading = tokensQuery.isLoading;

  function copyLink(tok: AuditorToken) {
    const basePath = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
    const url = `${window.location.origin}${basePath}/auditor/${tok.token}`;
    navigator.clipboard.writeText(url).then(
      () => toast({ title: "Link copied to clipboard" }),
      () => toast({ title: "Copy failed — try manually", variant: "destructive" }),
    );
  }

  function timeUntil(d: string): string {
    const diff = new Date(d).getTime() - Date.now();
    if (diff <= 0) return "Expired";
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    if (days > 1) return `${days}d left`;
    const hrs = Math.floor(diff / (1000 * 60 * 60));
    return hrs > 0 ? `${hrs}h left` : "< 1h left";
  }

  const activeTokens = tokens.filter((t) => t.isActive && new Date(t.expiresAt) > new Date());
  const inactiveTokens = tokens.filter((t) => !t.isActive || new Date(t.expiresAt) <= new Date());

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-foreground flex items-center gap-2"><Shield className="h-5 w-5 text-amber-500" /> External Auditor Access</h3>
          <p className="text-sm text-muted-foreground mt-0.5">Generate time-limited read-only links for external COR auditors. No login required.</p>
        </div>
        <Button size="sm" onClick={() => setShowCreate((v) => !v)} className="gap-1.5">
          <Plus className="h-4 w-4" /> Generate Link
        </Button>
      </div>

      {showCreate && (
        <Card style={{ background: "#0f0f0f", border: "1px solid #C9A84C44" }}>
          <CardContent className="pt-5 space-y-4">
            <div className="space-y-1.5">
              <Label>Link Label</Label>
              <Input
                placeholder="e.g. Q2 2026 IHSA External Review — Acme Auditors"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                maxLength={120}
              />
              <p className="text-xs text-muted-foreground">Visible to the auditor in the portal header.</p>
            </div>
            <div className="space-y-1.5">
              <Label>Link Expires After</Label>
              <Select value={expiryDays} onValueChange={setExpiryDays}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">7 days</SelectItem>
                  <SelectItem value="14">14 days</SelectItem>
                  <SelectItem value="30">30 days</SelectItem>
                  <SelectItem value="60">60 days</SelectItem>
                  <SelectItem value="90">90 days</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => createMutation.mutate(
                  { label: newLabel.trim(), expiryDays: parseInt(expiryDays) },
                  { onSuccess: () => { setNewLabel(""); setExpiryDays("30"); setShowCreate(false); } },
                )}
                disabled={!newLabel.trim() || createMutation.isPending}
              >
                {createMutation.isPending ? <><Loader2 className="h-3 w-3 animate-spin mr-1.5" />Creating…</> : <><Link2 className="h-3 w-3 mr-1.5" />Create Link</>}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowCreate(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="space-y-2">{[1, 2].map((i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : (
        <>
          {activeTokens.length === 0 && !showCreate && (
            <div className="rounded-lg border border-dashed border-border p-8 text-center text-muted-foreground text-sm">
              No active auditor links. Generate a link to share with an external COR auditor.
            </div>
          )}

          {activeTokens.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Active Links ({activeTokens.length})</p>
              {activeTokens.map((token) => (
                <div key={token.id} className="flex items-center gap-3 p-4 rounded-lg border border-border bg-card">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{token.label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Expires {new Date(token.expiresAt).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" })}
                      {" · "}
                      <span className={new Date(token.expiresAt).getTime() - Date.now() < 3 * 24 * 60 * 60 * 1000 ? "text-amber-500" : "text-muted-foreground"}>
                        {timeUntil(token.expiresAt)}
                      </span>
                      {" · "}
                      {token.accessCount} view{token.accessCount !== 1 ? "s" : ""}
                      {token.lastAccessedAt && ` · Last accessed ${new Date(token.lastAccessedAt).toLocaleDateString("en-CA")}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={() => copyLink(token)}>
                      <Copy className="h-3 w-3" /> Copy Link
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 text-xs text-destructive hover:text-destructive"
                      onClick={() => revokeMutation.mutate(token.id)}
                      disabled={revokeMutation.isPending}
                    >
                      Revoke
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {inactiveTokens.length > 0 && (
            <details className="group">
              <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors mt-2">
                {inactiveTokens.length} expired or revoked link{inactiveTokens.length !== 1 ? "s" : ""} ▸
              </summary>
              <div className="space-y-1.5 mt-2">
                {inactiveTokens.map((token) => (
                  <div key={token.id} className="flex items-center gap-3 p-3 rounded-lg border border-border/50 bg-muted/20 opacity-60">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-foreground truncate">{token.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {!token.isActive ? "Revoked" : "Expired"} · {token.accessCount} views
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </details>
          )}
        </>
      )}

      <div className="rounded-lg bg-muted/30 border border-border/50 p-4 text-xs text-muted-foreground space-y-1">
        <p className="font-medium text-foreground">What the auditor sees:</p>
        <p>• All 19 IHSA element evidence records — audit entries, policy sign-offs, CAPAs, and voice logs</p>
        <p>• Read-only, searchable interface with no access to your main dashboard or any other data</p>
        <p>• The link expires automatically — revoke early any time from this page</p>
      </div>
    </div>
  );
}
