import { useState } from "react";
import { Link } from "wouter";
import { format } from "date-fns";
import { ClipboardCheck, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ProjectSelect } from "./shared";
import { usePsiList } from "@/hooks/cor-compliance/usePsi";
import type { PsiListRow } from "./psiConstants";

const STATUS_CFG: Record<string, { label: string; bg: string; text: string }> = {
  draft: { label: "Draft", bg: "#f4f4f5", text: "#71717a" },
  submitted: { label: "Submitted", bg: "#dbeafe", text: "#1e40af" },
};

// Shared read-only PSI checklist list — used both by the admin-only COR
// Compliance "Pre-Inspections" tab and by the Safety & Forms "Pre-Inspections"
// tab, so the card markup lives in exactly one place.
export function PsiChecklistList({
  rows,
  isLoading,
  isError,
}: {
  rows: PsiListRow[];
  isLoading: boolean;
  isError: boolean;
}) {
  if (isError) {
    return <div className="py-6 text-center text-sm text-red-400">Could not load PSI checklists.</div>;
  }

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 rounded-lg" style={{ background: "#1a1a1a" }} />)}
      </div>
    );
  }

  if (!rows.length) {
    return (
      <div className="flex flex-col items-center justify-center py-14 text-zinc-600">
        <ClipboardCheck className="h-8 w-8 mb-2 opacity-30" />
        <p className="text-sm">No pre-inspection checklists yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {rows.map((row) => {
        const cfg = STATUS_CFG[row.psi.status] ?? STATUS_CFG.draft!;
        return (
          <Link key={row.psi.id} href={row.psi.status === "draft" ? `/psi/submit?id=${row.psi.id}` : `/psi/${row.psi.id}`}>
            <Card className="cursor-pointer hover:border-zinc-600 transition-colors" style={{ background: "#111111", border: "1px solid #2a2a2a" }}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold"
                        style={{ background: cfg.bg, color: cfg.text }}>
                        {cfg.label}
                      </span>
                      <span className="text-xs text-zinc-500">{format(new Date(row.psi.date), "MMM d, yyyy")}</span>
                    </div>
                    <p className="text-sm font-medium text-zinc-200 truncate">
                      {row.project?.name ?? "Unknown project"}
                      {row.psi.tradeDescription ? ` — ${row.psi.tradeDescription}` : ""}
                    </p>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      {row.creator ? `${row.creator.firstName} ${row.creator.lastName}` : "Unknown"}
                      {row.psi.location ? ` · ${row.psi.location}` : ""}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs text-zinc-500">{row.signatureCount} signature{row.signatureCount === 1 ? "" : "s"}</p>
                    <p className="text-xs text-zinc-500 mt-0.5">{row.approvalCount} approval{row.approvalCount === 1 ? "" : "s"}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}

// Admin-only governance view — read-only (no create button; PSI checklists are
// created from Safety & Forms). Admins still land here for the audit/status
// overview, and continue on to /psi/:id for sign-off, approval, and export.
export function PsiTab() {
  const [projectFilter, setProjectFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const listQuery = usePsiList(projectFilter ? parseInt(projectFilter) : undefined);
  const rows = (listQuery.data ?? []).filter(
    (r) => statusFilter === "all" || r.psi.status === statusFilter,
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <ProjectSelect value={projectFilter} onChange={setProjectFilter} placeholder="All projects" />

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40" style={{ background: "#1a1a1a", border: "1px solid #333", color: "#e5e5e5" }}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent style={{ background: "#1a1a1a", border: "1px solid #333" }}>
            <SelectItem value="all" style={{ color: "#e5e5e5" }}>All Statuses</SelectItem>
            <SelectItem value="draft" style={{ color: "#e5e5e5" }}>Draft</SelectItem>
            <SelectItem value="submitted" style={{ color: "#e5e5e5" }}>Submitted</SelectItem>
          </SelectContent>
        </Select>

        {listQuery.isFetching && <Loader2 className="h-4 w-4 animate-spin text-zinc-500" />}
      </div>

      <PsiChecklistList rows={rows} isLoading={listQuery.isLoading} isError={listQuery.isError} />
    </div>
  );
}
