import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { format } from "date-fns";
import { useGetMe } from "@workspace/api-client-react";
import { ArrowLeft, CheckCircle2, ClipboardCheck, Clock, Loader2, Mic, Pencil, PenLine, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { SignaturePad } from "@/components/SignaturePad";
import { useSignedUrl } from "@/hooks/useSignedUrl";
import {
  PSI_HAZARD_CATEGORIES,
  PSI_HAZARD_CATEGORY_KEYS,
} from "@/components/cor-compliance/psiConstants";
import { usePsiDetail, useAddPsiSignature, useApprovePsi, useDeletePsiVoiceNote } from "@/hooks/cor-compliance/usePsi";

const GOLD = "#C9A84C";
const BLACK = "#111111";

function SignatureImage({ url }: { url: string }) {
  const isDataUrl = url.startsWith("data:");
  const { data: signedUrl, isLoading } = useSignedUrl(isDataUrl ? null : url);
  if (!isDataUrl && isLoading) return <Loader2 className="h-4 w-4 animate-spin text-zinc-600" />;
  const src = isDataUrl ? url : (signedUrl ?? url);
  return (
    <img src={src} alt="Signature" className="h-14 rounded" style={{ background: "#fff", border: "1px solid #333" }} />
  );
}

export default function PsiDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const psiId = parseInt(id ?? "");
  const { data: me } = useGetMe();
  const detailQuery = usePsiDetail(isNaN(psiId) ? undefined : psiId);
  const addSignature = useAddPsiSignature(psiId);
  const approve = useApprovePsi(psiId);
  const deleteVoiceNote = useDeletePsiVoiceNote(psiId);
  const [signTarget, setSignTarget] = useState<{ type: "worker" } | { type: "approval" } | null>(null);
  const [pendingSignature, setPendingSignature] = useState("");

  // Admins arrive here from the COR Compliance tab's read-only audit list;
  // everyone else arrives via Safety & Forms, where PSI checklists are created.
  const isAdmin = me?.role === "owner" || me?.role === "foreman";
  const backHref = isAdmin ? "/safety-compliance?tab=cor" : "/safety-compliance?tab=safety";

  if (detailQuery.isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#0a0a0a" }}>
        <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
      </div>
    );
  }

  if (detailQuery.isError || !detailQuery.data) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3" style={{ background: "#0a0a0a" }}>
        <p className="text-sm text-red-400">Could not load this PSI checklist.</p>
        <Button variant="outline" onClick={() => setLocation(backHref)}>Back</Button>
      </div>
    );
  }

  const { psi, project, creator, signatures, approvals } = detailQuery.data;
  const alreadySigned = me ? signatures.some((s) => s.userId === me.id) : false;
  const alreadyApproved = me ? approvals.some((a) => a.userId === me.id) : false;

  return (
    <div className="min-h-screen" style={{ background: "#0a0a0a" }}>
      <div className="px-6 py-5 border-b flex items-center justify-between gap-3" style={{ borderColor: "#1a1a1a", background: BLACK }}>
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => setLocation(backHref)} aria-label="Back">
            <ArrowLeft className="h-4 w-4" style={{ color: "#e5e5e5" }} />
          </Button>
          <div className="flex items-center justify-center rounded-lg"
            style={{ width: 38, height: 38, background: `${GOLD}1a`, border: `1px solid ${GOLD}40` }}>
            <ClipboardCheck className="h-5 w-5" style={{ color: GOLD }} />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">{project?.name ?? "PSI Checklist"}</h1>
            <p className="text-xs text-zinc-500">{format(new Date(psi.date), "MMM d, yyyy")} · {psi.status === "submitted" ? "Submitted" : "Draft"}</p>
          </div>
        </div>
        {psi.status === "draft" && (
          <Button variant="outline" style={{ border: "1px solid #333", color: "#e5e5e5" }}
            onClick={() => setLocation(`/psi/submit?id=${psi.id}`)}>
            <Pencil className="h-4 w-4 mr-2" />Edit Draft
          </Button>
        )}
      </div>

      <div className="p-6 max-w-4xl mx-auto space-y-5">
        <Card style={{ background: "#111111", border: "1px solid #2a2a2a" }}>
          <CardContent className="pt-6 grid gap-3 sm:grid-cols-2 text-sm">
            <div><span className="text-zinc-500">Created by</span><p className="text-zinc-200">{creator ? `${creator.firstName} ${creator.lastName}` : "Unknown"}</p></div>
            <div><span className="text-zinc-500">Trade / Task</span><p className="text-zinc-200">{psi.tradeDescription || "—"}</p></div>
            <div><span className="text-zinc-500">Weather</span><p className="text-zinc-200">{psi.weatherTemp || "—"}</p></div>
            <div><span className="text-zinc-500">Location</span><p className="text-zinc-200">{psi.location || "—"}</p></div>
          </CardContent>
        </Card>

        {PSI_HAZARD_CATEGORY_KEYS.map((key) => {
          const category = PSI_HAZARD_CATEGORIES[key];
          const value = psi.hazards[key];
          const otherEntries = [value?.otherText, value?.other2Text, value?.other3Text].filter(Boolean);
          if (!value?.checked?.length && !otherEntries.length) return null;
          return (
            <Card key={key} style={{ background: "#111111", border: "1px solid #2a2a2a" }}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm" style={{ color: "#e5e5e5" }}>{category.title}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {value.checked.map((item) => (
                  <span key={item} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded"
                    style={{ background: "#1a1a1a", color: "#d4d4d8", border: "1px solid #2a2a2a" }}>
                    <CheckCircle2 className="h-3 w-3" style={{ color: GOLD }} />{item}
                  </span>
                ))}
                {otherEntries.map((text, i) => (
                  <span key={i} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded"
                    style={{ background: "#1a1a1a", color: "#d4d4d8", border: "1px solid #2a2a2a" }}>
                    <CheckCircle2 className="h-3 w-3" style={{ color: GOLD }} />{text}
                  </span>
                ))}
              </CardContent>
            </Card>
          );
        })}

        {psi.taskRows.length > 0 && (
          <Card style={{ background: "#111111", border: "1px solid #2a2a2a" }}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm" style={{ color: "#e5e5e5" }}>Task / Hazard / Control</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {psi.taskRows.map((row) => (
                <div key={row.id} className="grid gap-2 sm:grid-cols-3 text-sm py-2" style={{ borderTop: "1px solid #1f1f1f" }}>
                  <p className="text-zinc-200">{row.task || "—"}</p>
                  <p className="text-zinc-400">{row.hazard || "—"}</p>
                  <p className="text-zinc-400">{row.control || "—"}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        <Card style={{ background: "#111111", border: "1px solid #2a2a2a" }}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2" style={{ color: "#e5e5e5" }}>
              <Mic className="h-4 w-4" style={{ color: GOLD }} />Voice Notes ({psi.voiceNotes.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {psi.voiceNotes.length === 0 && <p className="text-xs text-zinc-500">No voice notes recorded yet.</p>}
            {psi.voiceNotes.map((note) => (
              <div key={note.id} className="flex items-start justify-between gap-3 py-2" style={{ borderTop: "1px solid #1f1f1f" }}>
                <div>
                  <p className="text-sm text-zinc-200">{note.transcript}</p>
                  <p className="text-xs text-zinc-500 mt-1">{format(new Date(note.recordedAt), "MMM d, yyyy h:mm a")}</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-zinc-500 hover:text-red-400 shrink-0"
                  disabled={deleteVoiceNote.isPending}
                  onClick={() => deleteVoiceNote.mutate(note.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>

        {psi.status === "submitted" && (
          <>
            <Card style={{ background: "#111111", border: "1px solid #2a2a2a" }}>
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-sm" style={{ color: "#e5e5e5" }}>Worker Signatures ({signatures.length})</CardTitle>
                {!alreadySigned && (
                  <Button size="sm" style={{ background: GOLD, color: BLACK }}
                    onClick={() => { setPendingSignature(""); setSignTarget({ type: "worker" }); }}>
                    <PenLine className="h-3.5 w-3.5 mr-1.5" />Sign
                  </Button>
                )}
              </CardHeader>
              <CardContent className="space-y-3">
                {signatures.length === 0 && <p className="text-xs text-zinc-500">No signatures yet.</p>}
                {signatures.map((s) => (
                  <div key={s.id} className="flex items-center gap-3">
                    <SignatureImage url={s.signatureUrl} />
                    <div>
                      <p className="text-sm text-zinc-200">{s.firstName} {s.lastName}</p>
                      <p className="text-xs text-zinc-500">{format(new Date(s.signedAt), "MMM d, yyyy h:mm a")}</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card style={{ background: "#111111", border: "1px solid #2a2a2a" }}>
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-sm" style={{ color: "#e5e5e5" }}>Owner/Foreman Approvals ({approvals.length})</CardTitle>
                {isAdmin && !alreadyApproved && (
                  <Button size="sm" style={{ background: GOLD, color: BLACK }}
                    onClick={() => { setPendingSignature(""); setSignTarget({ type: "approval" }); }}>
                    <PenLine className="h-3.5 w-3.5 mr-1.5" />Approve
                  </Button>
                )}
              </CardHeader>
              <CardContent className="space-y-3">
                {approvals.length === 0 && (
                  <p className="text-xs text-zinc-500 flex items-center gap-1"><Clock className="h-3 w-3" />No approvals yet.</p>
                )}
                {approvals.map((a) => (
                  <div key={a.id} className="flex items-center gap-3">
                    {a.signatureUrl ? <SignatureImage url={a.signatureUrl} /> : <CheckCircle2 className="h-5 w-5" style={{ color: "#4ade80" }} />}
                    <div>
                      <p className="text-sm text-zinc-200">{a.firstName} {a.lastName}</p>
                      <p className="text-xs text-zinc-500">{format(new Date(a.approvedAt), "MMM d, yyyy h:mm a")}</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </>
        )}
      </div>

      <Dialog open={!!signTarget} onOpenChange={(open) => !open && setSignTarget(null)}>
        <DialogContent style={{ background: "#0f0f0f", border: "1px solid #2a2a2a", maxWidth: 480 }}>
          <DialogHeader>
            <DialogTitle style={{ color: "#e5e5e5" }} className="flex items-center gap-2">
              <PenLine className="h-5 w-5" style={{ color: GOLD }} />
              {signTarget?.type === "approval" ? "Approve PSI Checklist" : "Sign PSI Checklist"}
            </DialogTitle>
          </DialogHeader>
          <SignaturePad onChange={setPendingSignature} />
          <DialogFooter>
            <Button variant="ghost" className="text-zinc-400" onClick={() => setSignTarget(null)}>Cancel</Button>
            <Button
              style={{ background: GOLD, color: BLACK }}
              disabled={!pendingSignature || addSignature.isPending || approve.isPending}
              onClick={() => {
                if (!signTarget) return;
                if (signTarget.type === "worker") {
                  addSignature.mutate(pendingSignature, { onSuccess: () => setSignTarget(null) });
                } else {
                  approve.mutate(pendingSignature, { onSuccess: () => setSignTarget(null) });
                }
              }}>
              {(addSignature.isPending || approve.isPending) ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
