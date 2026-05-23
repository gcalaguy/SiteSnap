import { useListAllDailyReports, useListProjects } from "@workspace/api-client-react";
import { Link } from "wouter";
import { format } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { FileText, Search, ExternalLink, User, Cloud, X } from "lucide-react";
import { useState } from "react";

export default function ReportsPage() {
  const [search, setSearch] = useState("");
  const [projectId, setProjectId] = useState<number | undefined>(undefined);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const { data: projects = [] } = useListProjects();
  const { data: reports = [], isLoading } = useListAllDailyReports({
    projectId,
    from: from || undefined,
    to: to || undefined,
  });

  const filtered = reports.filter((r) => {
    const q = search.toLowerCase();
    return (
      r.workPerformed.toLowerCase().includes(q) ||
      (r.projectName ?? "").toLowerCase().includes(q) ||
      r.submittedByName.toLowerCase().includes(q)
    );
  });

  const sorted = [...filtered].sort(
    (a, b) => new Date(b.reportDate).getTime() - new Date(a.reportDate).getTime(),
  );

  const hasFilters = projectId !== undefined || from !== "" || to !== "";

  function clearFilters() {
    setProjectId(undefined);
    setFrom("");
    setTo("");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-[#121212] flex items-center gap-2">
          <FileText className="h-6 w-6" style={{ color: "#D4AF37" }} />
          Daily Reports
        </h1>
        <p className="text-sm text-[#121212]/60 font-medium">All daily site reports submitted across your projects.</p>
      </div>

      <div className="flex flex-wrap gap-3 items-end">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#D4AF37]" />
          <Input
            className="pl-9 border-[#D4AF37]/20 focus-visible:ring-[#D4AF37]"
            placeholder="Search reports…"
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

        <div className="flex items-end gap-2">
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-[#121212]/60 font-medium">From</Label>
            <Input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="w-[150px] border-[#D4AF37]/20 focus-visible:ring-[#D4AF37]"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-[#121212]/60 font-medium">To</Label>
            <Input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="w-[150px] border-[#D4AF37]/20 focus-visible:ring-[#D4AF37]"
            />
          </div>
        </div>

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
        <div className="py-16 text-center text-[#121212]/60 animate-pulse font-medium">Loading reports…</div>
      ) : sorted.length === 0 ? (
        <Card className="border-[#D4AF37]/20">
          <CardContent className="py-16 flex flex-col items-center gap-3 text-center">
            <FileText className="h-10 w-10 text-[#D4AF37]/40" />
            <p className="text-[#121212]/60 font-medium">
              {search || hasFilters ? "No reports match your filters." : "No daily reports yet. Submit one from a project."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {sorted.map((report) => (
            <Card key={report.id} className="hover:border-[#D4AF37]/40 transition-colors border-[#D4AF37]/20">
              <CardContent className="py-4 px-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1">
                      <p className="font-extrabold text-sm text-[#121212]">
                        {format(new Date(report.reportDate), "MMMM d, yyyy")}
                      </p>
                      {report.weather && (
                        <span className="flex items-center gap-1 text-xs text-[#121212]/60 font-medium">
                          <Cloud className="h-3.5 w-3.5" style={{ color: "#D4AF37" }} />
                          {report.weather}
                          {report.temperature ? ` · ${report.temperature}` : ""}
                        </span>
                      )}
                      <span className="flex items-center gap-1 text-xs text-[#121212]/60 font-medium">
                        <User className="h-3.5 w-3.5" style={{ color: "#D4AF37" }} />
                        {report.submittedByName}
                      </span>
                    </div>
                    <p className="text-sm text-[#121212]/80 line-clamp-2">{report.workPerformed}</p>
                    {report.issues && (
                      <p className="text-xs text-red-600 mt-1 line-clamp-1 font-medium">⚠ {report.issues}</p>
                    )}
                    <p className="text-xs text-[#121212]/60 mt-1 font-medium">
                      {report.projectName && (
                        <span className="font-semibold text-[#121212]">{report.projectName} · </span>
                      )}
                      {report.submittedByName}
                      <span className="ml-2 opacity-60">· Submitted {format(new Date(report.createdAt), "MMM d 'at' h:mm a")}</span>
                    </p>
                  </div>
                  <Link
                    href={`/projects/${report.projectId}`}
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
