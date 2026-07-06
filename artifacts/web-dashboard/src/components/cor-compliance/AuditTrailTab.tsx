import { useState } from "react";
import { format } from "date-fns";
import { ClipboardList, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { IHSA_ELEMENTS, BLACK, scoreColor, ErrorState, ProjectSelect, FindingPill } from "./shared";
import { useAuditTrail } from "@/hooks/cor-compliance/useAuditTrail";

export function AuditTrailTab() {
  const [projectId, setProjectId] = useState("");
  const [element, setElement] = useState("all");
  const [findingType, setFindingType] = useState("all");
  const [page, setPage] = useState(0);
  const limit = 20;

  const query = useAuditTrail({ projectId, element, findingType, page, limit });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <ProjectSelect value={projectId} onChange={(v) => { setProjectId(v); setPage(0); }} />

        <Select value={element} onValueChange={(v) => { setElement(v); setPage(0); }}>
          <SelectTrigger className="w-52" style={{ background: "#1a1a1a", border: "1px solid #333", color: "#e5e5e5" }}>
            <SelectValue placeholder="All Elements" />
          </SelectTrigger>
          <SelectContent style={{ background: "#1a1a1a", border: "1px solid #333" }}>
            <SelectItem value="all" style={{ color: "#e5e5e5" }}>All Elements</SelectItem>
            {Object.entries(IHSA_ELEMENTS).map(([k, v]) => (
              <SelectItem key={k} value={k} style={{ color: "#e5e5e5" }}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={findingType} onValueChange={(v) => { setFindingType(v); setPage(0); }}>
          <SelectTrigger className="w-36" style={{ background: "#1a1a1a", border: "1px solid #333", color: "#e5e5e5" }}>
            <SelectValue placeholder="All" />
          </SelectTrigger>
          <SelectContent style={{ background: "#1a1a1a", border: "1px solid #333" }}>
            <SelectItem value="all" style={{ color: "#e5e5e5" }}>All Findings</SelectItem>
            <SelectItem value="pass" style={{ color: "#e5e5e5" }}>Pass Only</SelectItem>
            <SelectItem value="fail" style={{ color: "#e5e5e5" }}>Fail Only</SelectItem>
          </SelectContent>
        </Select>

        {query.isFetching && <Loader2 className="h-4 w-4 animate-spin text-zinc-500" />}
      </div>

      {!projectId && (
        <div className="flex flex-col items-center justify-center py-16 text-zinc-600">
          <ClipboardList className="h-9 w-9 mb-2 opacity-30" />
          <p className="text-sm">Select a project to view its audit trail</p>
        </div>
      )}

      {projectId && query.isError && <ErrorState message="Could not load audit trail." />}

      {projectId && query.isLoading && (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 rounded-lg" style={{ background: "#1a1a1a" }} />)}
        </div>
      )}

      {projectId && query.data && (
        <Card style={{ background: BLACK, border: "none", boxShadow: "0 2px 12px rgba(0,0,0,0.2)" }}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: "1px solid #1f1f1f" }}>
                  {["Date", "Source", "IHSA Element", "Finding", "Score", "Description"].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {query.data.data.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-10 text-center text-zinc-600 text-sm italic">No entries for the selected filters.</td></tr>
                )}
                {query.data.data.map((entry) => (
                  <tr key={entry.id} style={{ borderBottom: "1px solid #1a1a1a" }}>
                    <td className="px-4 py-3 text-zinc-400 whitespace-nowrap text-xs">{format(new Date(entry.createdAt), "MMM d, yyyy")}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs px-2 py-0.5 rounded capitalize" style={{ background: "#ffffff10", color: "#a1a1aa" }}>
                        {entry.sourceType.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-zinc-300 text-xs">{entry.ihsaElementName}</td>
                    <td className="px-4 py-3"><FindingPill type={entry.findingType} /></td>
                    <td className="px-4 py-3">
                      <span className="font-bold" style={{ color: scoreColor(entry.complianceScore) }}>{entry.complianceScore}</span>
                    </td>
                    <td className="px-4 py-3 text-zinc-300 max-w-xs">
                      <p className="truncate">{entry.findingDescription}</p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {query.data.total > limit && (
            <div className="flex items-center justify-between px-4 py-3" style={{ borderTop: "1px solid #1f1f1f" }}>
              <p className="text-xs text-zinc-500">
                {page * limit + 1}–{Math.min((page + 1) * limit, query.data.total)} of {query.data.total}
              </p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</Button>
                <Button size="sm" variant="outline" disabled={(page + 1) * limit >= query.data.total} onClick={() => setPage((p) => p + 1)}>Next</Button>
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
