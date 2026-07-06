import { useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, Mail, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  GOLD, BLACK, CREDENTIAL_LABELS, CREDENTIAL_TYPES, ErrorState, CredStatusBadge,
} from "./shared";
import type { WorkerCredential } from "./shared";
import {
  useMyCredentials, useCredentialMatrix, useUpsertCredential, useCredentialEligibility,
} from "@/hooks/cor-compliance/useCredentials";
import { useExpiryAlerts } from "@/hooks/cor-compliance/useExpiryAlerts";

interface UpsertCredentialForm {
  certificateNumber: string;
  issueDate: string;
  expirationDate: string;
  status: string;
  issuedBy: string;
  notes: string;
}

function ExpiryAlertsPanel() {
  const { query, triggerMutation } = useExpiryAlerts();

  const expiring = query.data?.expiring ?? [];
  const critical30 = expiring.filter((e) => e.alertWindow === "30_day");
  const warn60 = expiring.filter((e) => e.alertWindow === "60_day");
  const alreadyExpired = expiring.filter((e) => e.alertWindow === "expired");

  if (query.isLoading) return null;
  if (expiring.length === 0 && !query.isError) return null;

  return (
    <Card style={{ background: "#111111", border: "1px solid #2a2a2a" }}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xs font-semibold uppercase tracking-wider flex items-center gap-2" style={{ color: GOLD }}>
            <AlertTriangle className="h-4 w-4" />
            Certification Expiry Alerts
          </CardTitle>
          <Button size="sm" variant="outline"
            style={{ height: 28, fontSize: 11, borderColor: "#3a3a3a", color: "#a1a1aa" }}
            disabled={triggerMutation.isPending}
            onClick={() => triggerMutation.mutate()}>
            {triggerMutation.isPending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Mail className="h-3 w-3 mr-1" />}
            Run Alert Scan
          </Button>
        </div>
        {(alreadyExpired.length > 0 || critical30.length > 0 || warn60.length > 0) && (
          <div className="flex flex-wrap gap-2 mt-2">
            {alreadyExpired.length > 0 && (
              <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: "#7f1d1d44", color: "#f87171" }}>
                {alreadyExpired.length} expired
              </span>
            )}
            {critical30.length > 0 && (
              <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: "#78350f44", color: "#fbbf24" }}>
                {critical30.length} within 30 days
              </span>
            )}
            {warn60.length > 0 && (
              <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: "#1c1917", color: "#a16207" }}>
                {warn60.length} within 60 days
              </span>
            )}
          </div>
        )}
      </CardHeader>
      <CardContent className="pt-0">
        {query.isError && <p className="text-xs text-red-400">Could not load expiry data.</p>}
        <div className="space-y-1">
          {expiring.map((e) => {
            const isExpired = e.alertWindow === "expired";
            const is30 = e.alertWindow === "30_day";
            const color = isExpired ? "#ef4444" : is30 ? "#f59e0b" : "#a16207";
            return (
              <div key={`${e.userId}-${e.credentialType}`}
                className="flex items-center justify-between py-2 border-b last:border-0"
                style={{ borderColor: "#1f1f1f" }}>
                <div>
                  <p className="text-sm font-medium text-zinc-200">
                    {e.workerFirstName} {e.workerLastName}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {CREDENTIAL_LABELS[e.credentialType] ?? e.credentialType}
                    {" · "}
                    <span style={{ color }}>
                      {isExpired
                        ? `Expired ${e.expirationDate}`
                        : `Expires ${e.expirationDate} (${e.daysRemaining}d)`}
                    </span>
                  </p>
                </div>
                <span className="text-xs font-bold px-2 py-0.5 rounded" style={{
                  background: isExpired ? "#7f1d1d44" : is30 ? "#78350f44" : "#1c1917",
                  color,
                }}>
                  {isExpired ? "EXPIRED" : is30 ? "30-DAY" : "60-DAY"}
                </span>
              </div>
            );
          })}
        </div>
        <p className="text-xs text-zinc-600 mt-3">
          Alerts are emailed to the worker and all safety managers automatically at 6 AM ET daily.
          Use "Run Alert Scan" to send immediately.
        </p>
      </CardContent>
    </Card>
  );
}

export function CredentialsTab({ isAdmin, userId }: { isAdmin: boolean; userId: number | undefined }) {
  const matrixQuery = useCredentialMatrix(isAdmin);
  const myCredsQuery = useMyCredentials(userId, !isAdmin);

  const [editTarget, setEditTarget] = useState<{ userId: number; credentialType: string; existing?: WorkerCredential } | null>(null);
  const [form, setForm] = useState<UpsertCredentialForm>({ certificateNumber: "", issueDate: "", expirationDate: "", status: "active", issuedBy: "", notes: "" });

  function openEdit(uid: number, credType: string, existing?: WorkerCredential) {
    setEditTarget({ userId: uid, credentialType: credType, existing });
    setForm({
      certificateNumber: existing?.certificateNumber ?? "",
      issueDate: existing?.issueDate ?? "",
      expirationDate: existing?.expirationDate ?? "",
      status: existing?.status ?? "active",
      issuedBy: existing?.issuedBy ?? "",
      notes: existing?.notes ?? "",
    });
  }

  const upsertMutation = useUpsertCredential(userId, () => setEditTarget(null));

  const [checkUserId, setCheckUserId] = useState("");
  const { eligibility, setEligibility, checkMutation } = useCredentialEligibility();

  if (!isAdmin) {
    return (
      <Card style={{ background: BLACK, border: "none", boxShadow: "0 2px 12px rgba(0,0,0,0.2)" }}>
        <CardHeader><CardTitle className="text-xs font-semibold uppercase tracking-wider" style={{ color: GOLD }}>My Training Credentials</CardTitle></CardHeader>
        <CardContent>
          {myCredsQuery.isLoading && <Skeleton className="h-32 rounded-lg" style={{ background: "#1a1a1a" }} />}
          {myCredsQuery.isError && <ErrorState message="Could not load credentials." />}
          {myCredsQuery.data?.length === 0 && <p className="text-sm text-zinc-600 italic">No credentials on file yet.</p>}
          <div className="divide-y" style={{ borderColor: "#1f1f1f" }}>
            {myCredsQuery.data?.map((cred) => (
              <div key={cred.id} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                <div>
                  <p className="text-sm font-medium text-zinc-200">{CREDENTIAL_LABELS[cred.credentialType] ?? cred.credentialType}</p>
                  {cred.certificateNumber && <p className="text-xs text-zinc-500">Cert #{cred.certificateNumber}</p>}
                  {cred.issuedBy && <p className="text-xs text-zinc-500">Issued by {cred.issuedBy}</p>}
                </div>
                <CredStatusBadge status={cred.status} expirationDate={cred.expirationDate} />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const workers = matrixQuery.data?.workers ?? [];

  return (
    <div className="space-y-5">
      {/* Eligibility checker */}
      <Card style={{ background: BLACK, border: "none", boxShadow: "0 2px 12px rgba(0,0,0,0.2)" }}>
        <CardHeader className="pb-3">
          <CardTitle className="text-xs font-semibold uppercase tracking-wider" style={{ color: GOLD }}>Deployment Eligibility Check</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3 mb-4">
            <Select value={checkUserId} onValueChange={(v) => { setCheckUserId(v); setEligibility(null); }}>
              <SelectTrigger className="w-56" style={{ background: "#1a1a1a", border: "1px solid #333", color: "#e5e5e5" }}>
                <SelectValue placeholder="Select worker…" />
              </SelectTrigger>
              <SelectContent style={{ background: "#1a1a1a", border: "1px solid #333" }}>
                {workers.map((w) => (
                  <SelectItem key={w.user.id} value={String(w.user.id)} style={{ color: "#e5e5e5" }}>
                    {w.user.firstName} {w.user.lastName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline"
              disabled={!checkUserId || checkMutation.isPending}
              onClick={() => checkMutation.mutate(Number(checkUserId))}>
              {checkMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Check"}
            </Button>
          </div>

          {matrixQuery.isLoading && !workers.length && (
            <p className="text-xs text-zinc-600">Loading team list…</p>
          )}
          {matrixQuery.isError && <ErrorState message="Could not load worker list." />}

          {eligibility && (
            <div className="rounded-lg p-4 text-sm" style={{
              background: eligibility.eligible ? "#14532d20" : "#7f1d1d20",
              border: `1px solid ${eligibility.eligible ? "#14532d60" : "#7f1d1d60"}`,
            }}>
              <div className="flex items-center gap-2 font-semibold mb-2" style={{ color: eligibility.eligible ? "#4ade80" : "#f87171" }}>
                {eligibility.eligible ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                {eligibility.eligible ? "Eligible for deployment" : "Deployment blocked"}
              </div>
              {eligibility.blocks.map((b, i) => (
                <p key={i} className="text-xs" style={{ color: "#f87171" }}>
                  Block: {CREDENTIAL_LABELS[b.credentialType] ?? b.credentialType} — {b.reason}
                </p>
              ))}
              {eligibility.warnings.map((w, i) => (
                <p key={i} className="text-xs" style={{ color: "#fbbf24" }}>
                  Warning: {CREDENTIAL_LABELS[w.credentialType] ?? w.credentialType} expires in {w.daysUntilExpiry} days
                </p>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Expiry alerts panel */}
      <ExpiryAlertsPanel />

      {/* Training matrix */}
      <Card style={{ background: BLACK, border: "none", boxShadow: "0 2px 12px rgba(0,0,0,0.2)" }}>
        <CardHeader className="pb-3">
          <CardTitle className="text-xs font-semibold uppercase tracking-wider" style={{ color: GOLD }}>Training Matrix</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {matrixQuery.isLoading && (
            <div className="p-4 space-y-2">{[1,2,3].map((i) => <Skeleton key={i} className="h-12" style={{ background: "#1a1a1a" }} />)}</div>
          )}
          {matrixQuery.isError && <div className="p-4"><ErrorState message="Could not load training matrix." /></div>}

          {matrixQuery.data && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-max">
                <thead>
                  <tr style={{ borderBottom: "1px solid #1f1f1f" }}>
                    <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-zinc-500 whitespace-nowrap">Worker</th>
                    {CREDENTIAL_TYPES.map((ct) => (
                      <th key={ct} className="text-left px-3 py-3 text-xs font-semibold text-zinc-500 whitespace-nowrap min-w-[130px]">
                        {CREDENTIAL_LABELS[ct]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {workers.length === 0 && (
                    <tr><td colSpan={CREDENTIAL_TYPES.length + 1} className="px-4 py-10 text-center text-zinc-600 text-sm italic">No team members found.</td></tr>
                  )}
                  {workers.map((worker) => (
                    <tr key={worker.user.id} style={{ borderBottom: "1px solid #1a1a1a" }}>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <p className="text-sm font-medium text-zinc-200">{worker.user.firstName} {worker.user.lastName}</p>
                        <p className="text-xs text-zinc-500">{worker.user.email}</p>
                      </td>
                      {CREDENTIAL_TYPES.map((ct) => {
                        const cred = worker.credentials.find((c) => c.credentialType === ct);
                        return (
                          <td key={ct} className="px-3 py-3">
                            <button className="text-left w-full hover:opacity-70 transition-opacity"
                              onClick={() => openEdit(worker.user.id, ct, cred)}>
                              {cred
                                ? <CredStatusBadge status={cred.status} expirationDate={cred.expirationDate} />
                                : <span className="inline-flex items-center gap-1 text-xs text-zinc-600 hover:text-zinc-300">
                                    <Plus className="h-3 w-3" />Add
                                  </span>}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Upsert dialog */}
      <Dialog open={!!editTarget} onOpenChange={(open) => !open && setEditTarget(null)}>
        <DialogContent style={{ background: "#0f0f0f", border: "1px solid #2a2a2a" }}>
          <DialogHeader>
            <DialogTitle style={{ color: "#e5e5e5" }}>
              {editTarget?.existing ? "Update" : "Add"} Credential — {CREDENTIAL_LABELS[editTarget?.credentialType ?? ""] ?? editTarget?.credentialType}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {(["certificateNumber", "issueDate", "expirationDate", "issuedBy"] as const).map((field) => (
              <div key={field}>
                <Label className="text-xs text-zinc-400 mb-1 block capitalize">
                  {field.replace(/([A-Z])/g, " $1")}
                </Label>
                <Input
                  type={field.includes("Date") ? "date" : "text"}
                  value={form[field]}
                  onChange={(e) => setForm((f) => ({ ...f, [field]: e.target.value }))}
                  style={{ background: "#1a1a1a", border: "1px solid #333", color: "#e5e5e5" }}
                />
              </div>
            ))}
            <div>
              <Label className="text-xs text-zinc-400 mb-1 block">Notes</Label>
              <Textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                rows={2} style={{ background: "#1a1a1a", border: "1px solid #333", color: "#e5e5e5" }} />
            </div>
            <div>
              <Label className="text-xs text-zinc-400 mb-1 block">Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
                <SelectTrigger style={{ background: "#1a1a1a", border: "1px solid #333", color: "#e5e5e5" }}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent style={{ background: "#1a1a1a", border: "1px solid #333" }}>
                  {["active", "expired", "pending", "revoked"].map((s) => (
                    <SelectItem key={s} value={s} style={{ color: "#e5e5e5" }} className="capitalize">{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditTarget(null)} className="text-zinc-400">Cancel</Button>
            <Button style={{ background: GOLD, color: BLACK }} disabled={upsertMutation.isPending}
              onClick={() => {
                if (!editTarget) return;
                const body = Object.fromEntries(Object.entries(form).filter(([, v]) => v !== ""));
                upsertMutation.mutate({ uid: editTarget.userId, credType: editTarget.credentialType, body });
              }}>
              {upsertMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
