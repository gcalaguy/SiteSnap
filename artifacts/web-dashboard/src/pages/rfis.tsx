import { useListAllRFIs, useListProjects } from "@workspace/api-client-react";
import { Link } from "wouter";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { MessageSquareWarning, Search, ExternalLink, X } from "lucide-react";
import { useState } from "react";

const statusColor: Record<string, string> = {
  open: "bg-red-100 text-red-700 border-red-200",
  in_review: "bg-yellow-100 text-yellow-700 border-yellow-200",
  answered: "bg-blue-100 text-blue-700 border-blue-200",
  closed: "bg-gray-100 text-gray-600 border-gray-200",
};

const priorityColor: Record<string, string> = {
  low: "bg-gray-100 text-gray-600 border-gray-200",
  medium: "bg-orange-100 text-orange-700 border-orange-200",
  high: "bg-red-100 text-red-700 border-red-200",
  urgent: "bg-red-200 text-red-800 border-red-300",
};

const RFI_STATUSES = [
  { value: "open", label: "Open" },
  { value: "in_review", label: "In Review" },
  { value: "answered", label: "Answered" },
  { value: "closed", label: "Closed" },
] as const;

export default function RFIsPage() {
  const [search, setSearch] = useState("");
  const [projectId, setProjectId] = useState<number | undefined>(undefined);
  const [status, setStatus] = useState<string | undefined>(undefined);

  const { data: projects = [] } = useListProjects();
  const { data: rfis = [], isLoading } = useListAllRFIs({
    projectId,
    status: status as "open" | "in_review" | "answered" | "closed" | undefined,
  });

  const filtered = rfis.filter((r) => {
    const q = search.toLowerCase();
    return (
      r.subject.toLowerCase().includes(q) ||
      r.rfiNumber.toLowerCase().includes(q) ||
      (r.projectName ?? "").toLowerCase().includes(q)
    );
  });

  const sorted = [...filtered].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  const hasFilters = projectId !== undefined || status !== undefined;

  function clearFilters() {
    setProjectId(undefined);
    setStatus(undefined);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-[#121212] flex items-center gap-2">
          <MessageSquareWarning className="h-6 w-6" style={{ color: "#D4AF37" }} />
          RFIs
        </h1>
        <p className="text-sm text-[#121212]/60 font-medium">All Requests for Information across your projects.</p>
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative max-w-sm flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#D4AF37]" />
          <Input
            className="pl-9 border-[#D4AF37]/20 focus-visible:ring-[#D4AF37]"
            placeholder="Search RFIs…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <Select
          value={projectId !== undefined ? String(projectId) : "all"}
          onValueChange={(v) => setProjectId(v === "all" ? undefined : Number(v))}
        >
          <SelectTrigger className="w-[180px] border-[#D4AF37]/20 focus:ring-[#D4AF37]">
            <SelectValue placeholder="All Projects" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Projects</SelectItem>
            {projects.map((p) => (
              <SelectItem key={p.id} value={String(p.id)}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={status ?? "all"}
          onValueChange={(v) => setStatus(v === "all" ? undefined : v)}
        >
          <SelectTrigger className="w-[150px] border-[#D4AF37]/20 focus:ring-[#D4AF37]">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {RFI_STATUSES.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearFilters}
            className="text-[#121212]/60 hover:text-[#121212] gap-1"
          >
            <X className="h-3.5 w-3.5" />
            Clear filters
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="py-16 text-center text-[#121212]/60 animate-pulse font-medium">Loading RFIs…</div>
      ) : sorted.length === 0 ? (
        <Card className="border-[#D4AF37]/20">
          <CardContent className="py-16 flex flex-col items-center gap-3 text-center">
            <MessageSquareWarning className="h-10 w-10 text-[#D4AF37]/40" />
            <p className="text-[#121212]/60 font-medium">
              {search || hasFilters ? "No RFIs match your filters." : "No RFIs yet. Submit one from a project."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {sorted.map((rfi) => (
            <Card key={rfi.id} className="hover:border-[#D4AF37]/40 transition-colors border-[#D4AF37]/20">
              <CardContent className="py-4 px-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-xs font-mono text-[#121212]/50">{rfi.rfiNumber}</span>
                      <Badge variant="outline" className={`text-xs ${statusColor[rfi.status] ?? ""}`}>
                        {rfi.status.replace("_", " ")}
                      </Badge>
                      <Badge variant="outline" className={`text-xs ${priorityColor[rfi.priority] ?? ""}`}>
                        {rfi.priority}
                      </Badge>
                    </div>
                    <p className="font-semibold text-sm truncate text-[#121212]">{rfi.subject}</p>
                    <p className="text-xs text-[#121212]/60 mt-1 font-medium">
                      {rfi.projectName && (
                        <span className="font-semibold text-[#121212]">{rfi.projectName} · </span>
                      )}
                      Submitted by {rfi.submittedByName} · {format(new Date(rfi.createdAt), "MMM d, yyyy")}
                      {rfi.dueDate && ` · Due ${format(new Date(rfi.dueDate), "MMM d, yyyy")}`}
                    </p>
                  </div>
                  <Link
                    href={`/projects/${rfi.projectId}`}
                    className="shrink-0 flex items-center gap-1 text-xs text-[#D4AF37] hover:underline mt-1 font-medium"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    View Project
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
