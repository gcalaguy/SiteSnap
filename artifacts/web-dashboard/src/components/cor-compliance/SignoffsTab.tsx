import { useState, useRef, useCallback, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { format } from "date-fns";
import {
  AlertTriangle, CheckCircle2, Clock, Plus, Loader2,
  FileText, PenLine, ChevronDown, ChevronUp, Users, BarChart3,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  GOLD, BLACK, IHSA_ELEMENTS, DOC_TYPE_LABELS, DOC_TYPE_IHSA_DEFAULT,
  ErrorState, SignoffComplianceBadge,
} from "./shared";
import type { DocType, PolicyDocument } from "./shared";
import {
  usePolicyDocumentsList, useSignoffMatrix, useMySignoffs, usePendingSignoffs,
  useCreatePolicyDocument, useArchivePolicyDocument,
} from "@/hooks/cor-compliance/usePolicyDocuments";

const CREATE_DOC_DEFAULTS = {
  documentType: "swp" as DocType,
  title: "",
  description: "",
  fileUrl: "",
  contentText: "",
  ihsaElement: "element_3",
  requiresAnnualRenewal: false,
};

// ── Signature canvas (HTML5 canvas drawing pad) ───────────────────────────────

function SignatureCanvas({
  onChanged,
}: {
  onChanged: (hasData: boolean, dataUrl: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawingRef = useRef(false);
  const hasDataRef = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, []);

  function getPos(e: MouseEvent | TouchEvent, canvas: HTMLCanvasElement) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ("touches" in e) {
      return {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top) * scaleY,
      };
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }

  function startDraw(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { x, y } = getPos(e.nativeEvent, canvas);
    isDrawingRef.current = true;
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function draw(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault();
    if (!isDrawingRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { x, y } = getPos(e.nativeEvent, canvas);
    ctx.lineTo(x, y);
    ctx.stroke();
    hasDataRef.current = true;
    onChanged(true, canvas.toDataURL("image/png"));
  }

  function endDraw() {
    isDrawingRef.current = false;
  }

  function clear() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    hasDataRef.current = false;
    onChanged(false, "");
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-medium text-zinc-400">Draw your signature below</span>
        <button
          type="button"
          onClick={clear}
          className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          Clear
        </button>
      </div>
      <div
        style={{ position: "relative", border: "1px solid #333", borderRadius: 8, background: "#0a0a0a", overflow: "hidden" }}
      >
        <canvas
          ref={canvasRef}
          width={480}
          height={110}
          style={{ display: "block", width: "100%", height: 110, cursor: "crosshair", touchAction: "none" }}
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={endDraw}
          onMouseLeave={endDraw}
          onTouchStart={startDraw}
          onTouchMove={draw}
          onTouchEnd={endDraw}
        />
        <div
          style={{
            position: "absolute",
            bottom: 8,
            left: "50%",
            transform: "translateX(-50%)",
            borderBottom: "1px solid #2a2a2a",
            width: "70%",
            pointerEvents: "none",
          }}
        />
        <span
          style={{
            position: "absolute",
            bottom: 12,
            left: "50%",
            transform: "translateX(-50%)",
            color: "#333",
            fontSize: 10,
            pointerEvents: "none",
            whiteSpace: "nowrap",
          }}
        >
          Sign above the line
        </span>
      </div>
    </div>
  );
}

function DocumentViewModal({
  doc,
  onClose,
  onSigned,
}: {
  doc: PolicyDocument;
  onClose: () => void;
  onSigned: () => void;
}) {
  const { toast } = useToast();
  const [confirmed, setConfirmed] = useState(false);
  const [signatureData, setSignatureData] = useState("");
  const [hasSignature, setHasSignature] = useState(false);
  const [expanded, setExpanded] = useState(true);

  const handleSignatureChange = useCallback((hasData: boolean, dataUrl: string) => {
    setHasSignature(hasData);
    setSignatureData(dataUrl);
  }, []);

  const signMutation = useMutation({
    mutationFn: () =>
      customFetch(`/api/cor/policy-documents/${doc.id}/sign`, {
        method: "POST",
        body: JSON.stringify({ signatureData: signatureData || undefined }),
      }),
    onSuccess: () => {
      toast({ title: "Document signed", description: `You have acknowledged: "${doc.title}"` });
      onSigned();
      onClose();
    },
    onError: () => toast({ title: "Sign-off failed", variant: "destructive" }),
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent style={{ background: "#0f0f0f", border: "1px solid #2a2a2a", maxWidth: 640, maxHeight: "90vh", display: "flex", flexDirection: "column" }}>
        <DialogHeader className="shrink-0">
          <DialogTitle style={{ color: "#e5e5e5" }} className="flex items-center gap-2">
            <PenLine className="h-5 w-5" style={{ color: GOLD }} />
            {doc.title}
          </DialogTitle>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className="text-xs px-2 py-0.5 rounded font-medium" style={{ background: "#ffffff10", color: GOLD }}>
              {DOC_TYPE_LABELS[doc.documentType]}
            </span>
            <span className="text-xs text-zinc-500">
              {IHSA_ELEMENTS[doc.ihsaElement] ?? doc.ihsaElement}
            </span>
            {doc.requiresAnnualRenewal && (
              <span className="text-xs px-2 py-0.5 rounded" style={{ background: "#fef9c320", color: "#fbbf24" }}>
                Annual renewal required
              </span>
            )}
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0 space-y-4 py-2 pr-1">
          {doc.description && (
            <p className="text-sm text-zinc-300 leading-relaxed">{doc.description}</p>
          )}

          {doc.fileUrl && (
            <a
              href={doc.fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm p-3 rounded-lg hover:opacity-80 transition-opacity"
              style={{ background: "#ffffff08", color: GOLD, border: "1px solid #2a2a2a" }}
            >
              <FileText className="h-4 w-4" />
              Open document file
            </a>
          )}

          {doc.contentText && (
            <div style={{ background: "#0a0a0a", border: "1px solid #1f1f1f", borderRadius: 8 }}>
              <button
                className="w-full flex items-center justify-between px-4 py-3 text-xs font-semibold uppercase tracking-wider"
                style={{ color: "#a1a1aa" }}
                onClick={() => setExpanded((v) => !v)}
              >
                <span>Document Content</span>
                {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              </button>
              {expanded && (
                <div className="px-4 pb-4 text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap max-h-64 overflow-y-auto"
                  style={{ borderTop: "1px solid #1f1f1f" }}>
                  <div className="pt-3">{doc.contentText}</div>
                </div>
              )}
            </div>
          )}

          <div className="space-y-4">
            <SignatureCanvas onChanged={handleSignatureChange} />

            <div
              className="rounded-lg p-4"
              style={{ background: "#ffffff06", border: "1px solid #2a2a2a" }}
            >
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-yellow-500 cursor-pointer shrink-0"
                />
                <span className="text-sm text-zinc-200 leading-relaxed">
                  I confirm that I have read, understood, and agree to comply with this{" "}
                  <strong>{DOC_TYPE_LABELS[doc.documentType]}</strong>. My digital signature
                  and acknowledgement constitute a legally binding sign-off as of today's date and time.
                </span>
              </label>
            </div>

            {confirmed && !hasSignature && (
              <p className="text-xs text-amber-400 flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                Please draw your signature above to complete the sign-off.
              </p>
            )}
          </div>
        </div>

        <DialogFooter className="shrink-0 gap-2 pt-2">
          <Button variant="ghost" onClick={onClose} className="text-zinc-400">
            Cancel
          </Button>
          <Button
            style={{ background: GOLD, color: BLACK }}
            disabled={!confirmed || !hasSignature || signMutation.isPending}
            onClick={() => signMutation.mutate()}
          >
            {signMutation.isPending ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Signing…</>
            ) : (
              <><PenLine className="h-4 w-4 mr-2" />Sign & Acknowledge</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CreateDocumentDialog({ open, onClose, onCreated }: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState(CREATE_DOC_DEFAULTS);

  function handleTypeChange(t: DocType) {
    setForm((f) => ({
      ...f,
      documentType: t,
      ihsaElement: DOC_TYPE_IHSA_DEFAULT[t],
    }));
  }

  const createMutation = useCreatePolicyDocument();

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !createMutation.isPending && onClose()}>
      <DialogContent style={{ background: "#0f0f0f", border: "1px solid #2a2a2a", maxWidth: 560 }}>
        <DialogHeader>
          <DialogTitle style={{ color: "#e5e5e5" }} className="flex items-center gap-2">
            <FileText className="h-5 w-5" style={{ color: GOLD }} />
            Add Policy Document
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-zinc-400 mb-1.5 block">Document Type</Label>
              <Select value={form.documentType} onValueChange={(v) => handleTypeChange(v as DocType)}>
                <SelectTrigger style={{ background: "#1a1a1a", border: "1px solid #333", color: "#e5e5e5" }}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent style={{ background: "#1a1a1a", border: "1px solid #333" }}>
                  {(Object.keys(DOC_TYPE_LABELS) as DocType[]).map((t) => (
                    <SelectItem key={t} value={t} style={{ color: "#e5e5e5" }}>{DOC_TYPE_LABELS[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-zinc-400 mb-1.5 block">IHSA Element</Label>
              <Select value={form.ihsaElement} onValueChange={(v) => setForm((f) => ({ ...f, ihsaElement: v }))}>
                <SelectTrigger style={{ background: "#1a1a1a", border: "1px solid #333", color: "#e5e5e5" }}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent style={{ background: "#1a1a1a", border: "1px solid #333" }}>
                  {Object.entries(IHSA_ELEMENTS).map(([k, v]) => (
                    <SelectItem key={k} value={k} style={{ color: "#e5e5e5" }}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label className="text-xs text-zinc-400 mb-1.5 block">Title <span className="text-red-400">*</span></Label>
            <Input
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="e.g. Elevated Work Platform Safe Work Procedure"
              style={{ background: "#1a1a1a", border: "1px solid #333", color: "#e5e5e5" }}
            />
          </div>

          <div>
            <Label className="text-xs text-zinc-400 mb-1.5 block">Description (optional)</Label>
            <Textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              rows={2}
              placeholder="Brief summary visible to workers before signing"
              style={{ background: "#1a1a1a", border: "1px solid #333", color: "#e5e5e5" }}
            />
          </div>

          <div>
            <Label className="text-xs text-zinc-400 mb-1.5 block">Document URL (optional)</Label>
            <Input
              value={form.fileUrl}
              onChange={(e) => setForm((f) => ({ ...f, fileUrl: e.target.value }))}
              placeholder="https://… (PDF, Word, etc.)"
              style={{ background: "#1a1a1a", border: "1px solid #333", color: "#e5e5e5" }}
            />
          </div>

          <div>
            <Label className="text-xs text-zinc-400 mb-1.5 block">Inline Content (optional)</Label>
            <Textarea
              value={form.contentText}
              onChange={(e) => setForm((f) => ({ ...f, contentText: e.target.value }))}
              rows={4}
              placeholder="Paste the full text of the document here so workers can read it in-app before signing…"
              style={{ background: "#1a1a1a", border: "1px solid #333", color: "#e5e5e5" }}
            />
          </div>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={form.requiresAnnualRenewal}
              onChange={(e) => setForm((f) => ({ ...f, requiresAnnualRenewal: e.target.checked }))}
              className="h-4 w-4 accent-yellow-500"
            />
            <span className="text-sm text-zinc-300">Requires annual re-sign</span>
          </label>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose} disabled={createMutation.isPending} className="text-zinc-400">
            Cancel
          </Button>
          <Button
            style={{ background: GOLD, color: BLACK }}
            disabled={!form.title.trim() || createMutation.isPending}
            onClick={() => createMutation.mutate(form, {
              onSuccess: () => {
                setForm(CREATE_DOC_DEFAULTS);
                onCreated();
                onClose();
              },
            })}
          >
            {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create Document"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function SignoffsTab({ isAdmin, userId }: { isAdmin: boolean; userId: number | undefined }) {
  const queryClient = useQueryClient();

  const matrixQuery = useSignoffMatrix(isAdmin);
  const mySignoffsQuery = useMySignoffs(userId, !isAdmin);
  const pendingQuery = usePendingSignoffs(userId);
  const docsQuery = usePolicyDocumentsList();

  const [showCreate, setShowCreate] = useState(false);
  const [viewDoc, setViewDoc] = useState<PolicyDocument | null>(null);
  const [expandedDocId, setExpandedDocId] = useState<number | null>(null);

  const archiveMutation = useArchivePolicyDocument();

  function handleSigned() {
    queryClient.invalidateQueries({ queryKey: ["cor-pending-signoffs"] });
    queryClient.invalidateQueries({ queryKey: ["cor-my-signoffs"] });
    queryClient.invalidateQueries({ queryKey: ["cor-signoff-matrix"] });
  }

  const pending = pendingQuery.data?.pending ?? [];
  const matrix = matrixQuery.data?.matrix ?? [];
  const mySignoffs = mySignoffsQuery.data?.signoffs ?? [];

  // ── Worker view ───────────────────────────────────────────────────────────

  if (!isAdmin) {
    return (
      <div className="space-y-5">
        {viewDoc && (
          <DocumentViewModal doc={viewDoc} onClose={() => setViewDoc(null)} onSigned={handleSigned} />
        )}

        {/* Pending sign-offs */}
        <Card style={{ background: BLACK, border: "none", boxShadow: "0 2px 12px rgba(0,0,0,0.2)" }}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider" style={{ color: GOLD }}>
                Pending Sign-offs
              </CardTitle>
              {pendingQuery.data && (
                <span className="text-xs text-zinc-500">{pending.length} document{pending.length !== 1 ? "s" : ""} awaiting your signature</span>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {pendingQuery.isLoading && <Skeleton className="h-20 rounded-lg" style={{ background: "#1a1a1a" }} />}
            {pendingQuery.isError && <ErrorState message="Could not load pending documents." />}

            {!pendingQuery.isLoading && pending.length === 0 && (
              <div className="flex flex-col items-center justify-center py-8 text-zinc-600">
                <CheckCircle2 className="h-8 w-8 mb-2 opacity-30" style={{ color: "#22c55e" }} />
                <p className="text-sm" style={{ color: "#22c55e" }}>All documents signed — you're up to date!</p>
              </div>
            )}

            <div className="space-y-3">
              {pending.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center justify-between gap-3 p-4 rounded-lg"
                  style={{ background: "#ffffff06", border: "1px solid #2a2a2a" }}
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="shrink-0 mt-0.5 w-8 h-8 rounded flex items-center justify-center"
                      style={{ background: "#ffffff0a" }}>
                      <FileText className="h-4 w-4" style={{ color: GOLD }} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-zinc-100 truncate">{doc.title}</p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className="text-xs text-zinc-500">{DOC_TYPE_LABELS[doc.documentType]}</span>
                        <span className="text-xs text-zinc-600">·</span>
                        <span className="text-xs text-zinc-500">{IHSA_ELEMENTS[doc.ihsaElement]}</span>
                      </div>
                      {doc.description && (
                        <p className="text-xs text-zinc-600 mt-1 line-clamp-2">{doc.description}</p>
                      )}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => setViewDoc(doc)}
                    style={{ background: GOLD, color: BLACK, fontWeight: 600 }}
                    className="shrink-0"
                  >
                    <PenLine className="h-3.5 w-3.5 mr-1.5" />
                    Review & Sign
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Completed sign-offs */}
        <Card style={{ background: BLACK, border: "none", boxShadow: "0 2px 12px rgba(0,0,0,0.2)" }}>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider" style={{ color: GOLD }}>
              My Signed Documents
            </CardTitle>
          </CardHeader>
          <CardContent>
            {mySignoffsQuery.isLoading && <Skeleton className="h-20 rounded-lg" style={{ background: "#1a1a1a" }} />}
            {mySignoffsQuery.isError && <ErrorState message="Could not load signed documents." />}
            {!mySignoffsQuery.isLoading && mySignoffs.length === 0 && (
              <p className="text-sm text-zinc-600 italic">No signed documents yet.</p>
            )}
            <div className="divide-y" style={{ borderColor: "#1f1f1f" }}>
              {mySignoffs.map(({ signoff, document }) => (
                <div key={signoff.id} className="flex items-center justify-between py-3 first:pt-0 last:pb-0 gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-zinc-200 truncate">{document.title}</p>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      {DOC_TYPE_LABELS[document.documentType]} · {IHSA_ELEMENTS[document.ihsaElement]}
                    </p>
                  </div>
                  <div className="shrink-0 flex items-center gap-1.5 text-xs" style={{ color: "#22c55e" }}>
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {format(new Date(signoff.signedAt), "MMM d, yyyy")}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Admin view ────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      {viewDoc && (
        <DocumentViewModal doc={viewDoc} onClose={() => setViewDoc(null)} onSigned={handleSigned} />
      )}
      <CreateDocumentDialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={() => {
          queryClient.invalidateQueries({ queryKey: ["cor-policy-documents"] });
          queryClient.invalidateQueries({ queryKey: ["cor-signoff-matrix"] });
        }}
      />

      {/* Compliance summary row */}
      {matrix.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          {[
            {
              label: "Documents",
              value: matrix.length,
              icon: <FileText className="h-4 w-4" style={{ color: GOLD }} />,
            },
            {
              label: "Avg Compliance",
              value: `${Math.round(matrix.reduce((s, m) => s + m.compliancePercent, 0) / matrix.length)}%`,
              icon: <BarChart3 className="h-4 w-4" style={{ color: GOLD }} />,
            },
            {
              label: "Total Workers",
              value: matrix[0]?.totalWorkers ?? 0,
              icon: <Users className="h-4 w-4" style={{ color: GOLD }} />,
            },
          ].map((stat) => (
            <Card key={stat.label} style={{ background: BLACK, border: "none", boxShadow: "0 2px 12px rgba(0,0,0,0.2)" }}>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="w-8 h-8 rounded flex items-center justify-center" style={{ background: `${GOLD}1a` }}>
                  {stat.icon}
                </div>
                <div>
                  <p className="text-xl font-bold text-white">{stat.value}</p>
                  <p className="text-xs text-zinc-500">{stat.label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Document list with per-doc signoff breakdown */}
      <Card style={{ background: BLACK, border: "none", boxShadow: "0 2px 12px rgba(0,0,0,0.2)" }}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider" style={{ color: GOLD }}>
              Policy Documents & Sign-off Compliance
            </CardTitle>
            <Button size="sm" onClick={() => setShowCreate(true)} style={{ background: GOLD, color: BLACK, height: 30, fontSize: 12 }}>
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Add Document
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {(matrixQuery.isLoading || docsQuery.isLoading) && (
            <div className="space-y-2">{[1,2,3].map((i) => <Skeleton key={i} className="h-16 rounded-lg" style={{ background: "#1a1a1a" }} />)}</div>
          )}
          {matrixQuery.isError && <ErrorState message="Could not load sign-off matrix." />}

          {!matrixQuery.isLoading && matrix.length === 0 && (
            <div className="flex flex-col items-center justify-center py-10 text-zinc-600">
              <FileText className="h-8 w-8 mb-2 opacity-30" />
              <p className="text-sm">No policy documents yet.</p>
              <p className="text-xs mt-1">Click "Add Document" to create your first SWP, JHA, or Company Rule.</p>
            </div>
          )}

          <div className="space-y-2">
            {matrix.map((entry) => {
              const isExpanded = expandedDocId === entry.document.id;
              const unsigned = entry.signoffs.filter((s) => !s.signedAt);
              return (
                <div key={entry.document.id} style={{ border: "1px solid #1f1f1f", borderRadius: 8, overflow: "hidden" }}>
                  <button
                    className="w-full flex items-center gap-4 px-4 py-3 hover:bg-white/[0.02] transition-colors text-left"
                    onClick={() => setExpandedDocId(isExpanded ? null : entry.document.id)}
                  >
                    <div className="w-8 h-8 rounded shrink-0 flex items-center justify-center" style={{ background: "#ffffff08" }}>
                      <FileText className="h-4 w-4" style={{ color: GOLD }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium text-zinc-100 truncate">{entry.document.title}</p>
                        <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: "#ffffff0a", color: "#a1a1aa" }}>
                          {DOC_TYPE_LABELS[entry.document.documentType]}
                        </span>
                        <span className="text-xs text-zinc-600">{IHSA_ELEMENTS[entry.document.ihsaElement]}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 shrink-0">
                      <div className="text-right">
                        <SignoffComplianceBadge pct={entry.compliancePercent} />
                        <p className="text-xs text-zinc-600 mt-0.5">{entry.signedCount}/{entry.totalWorkers} signed</p>
                      </div>
                      {isExpanded ? <ChevronUp className="h-4 w-4 text-zinc-600" /> : <ChevronDown className="h-4 w-4 text-zinc-600" />}
                    </div>
                  </button>

                  {isExpanded && (
                    <div style={{ borderTop: "1px solid #1f1f1f" }}>
                      {/* Document actions */}
                      <div className="flex items-center gap-3 px-4 py-2" style={{ background: "#ffffff03" }}>
                        {(entry.document.fileUrl || entry.document.contentText) && (
                          <Button size="sm" variant="ghost" onClick={() => setViewDoc(entry.document)}
                            className="h-7 text-xs text-zinc-400 hover:text-zinc-100">
                            <FileText className="h-3 w-3 mr-1.5" />
                            Preview
                          </Button>
                        )}
                        <Button
                          size="sm" variant="ghost"
                          className="h-7 text-xs text-red-500 hover:text-red-400 ml-auto"
                          disabled={archiveMutation.isPending}
                          onClick={() => archiveMutation.mutate(entry.document.id)}
                        >
                          Archive
                        </Button>
                      </div>

                      {/* Workers unsigned first */}
                      {unsigned.length > 0 && (
                        <div className="px-4 py-2" style={{ borderTop: "1px solid #1a1a1a" }}>
                          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-600 mb-2">
                            Unsigned ({unsigned.length})
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {unsigned.map((w) => (
                              <span key={w.userId} className="text-xs px-2 py-0.5 rounded" style={{ background: "#7f1d1d20", color: "#f87171" }}>
                                {w.firstName} {w.lastName}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Signed workers */}
                      <div className="overflow-x-auto" style={{ borderTop: "1px solid #1a1a1a" }}>
                        <table className="w-full text-xs min-w-max">
                          <thead>
                            <tr style={{ borderBottom: "1px solid #1a1a1a" }}>
                              {["Worker", "Status", "Date Signed"].map((h) => (
                                <th key={h} className="text-left px-4 py-2 text-zinc-600 font-semibold uppercase tracking-wider">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {entry.signoffs.map((s) => (
                              <tr key={s.userId} style={{ borderBottom: "1px solid #111111" }}>
                                <td className="px-4 py-2.5 text-zinc-300 whitespace-nowrap">
                                  {s.firstName} {s.lastName}
                                  <span className="ml-1.5 text-zinc-600">{s.email}</span>
                                </td>
                                <td className="px-4 py-2.5">
                                  {s.signedAt
                                    ? <span className="inline-flex items-center gap-1" style={{ color: "#22c55e" }}><CheckCircle2 className="h-3 w-3" />Signed</span>
                                    : <span className="inline-flex items-center gap-1 text-zinc-600"><Clock className="h-3 w-3" />Pending</span>}
                                </td>
                                <td className="px-4 py-2.5 text-zinc-500 whitespace-nowrap">
                                  {s.signedAt ? format(new Date(s.signedAt), "MMM d, yyyy · h:mm a") : "—"}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
