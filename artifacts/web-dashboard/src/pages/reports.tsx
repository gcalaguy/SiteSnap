import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { Link } from "wouter";
import { format } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { FileText, Search, ExternalLink, Users, Cloud } from "lucide-react";
import { useState } from "react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type ReportItem = {
  id: number;
  projectId: number;
  projectName: string | null;
  reportDate: string;
  submittedByName: string;
  weather: string | null;
  temperature: string | null;
  crewCount: number;
  workPerformed: string;
  issues: string | null;
  createdAt: string;
};

export default function ReportsPage() {
  const [search, setSearch] = useState("");

  const { data: reports = [], isLoading } = useQuery<ReportItem[]>({
    queryKey: ["daily-reports-all"],
    queryFn: () => customFetch(`${BASE}/api/daily-reports`),
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Daily Reports</h1>
        <p className="text-muted-foreground">All daily site reports submitted across your projects.</p>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Search reports…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {isLoading ? (
        <div className="py-16 text-center text-muted-foreground animate-pulse">Loading reports…</div>
      ) : sorted.length === 0 ? (
        <Card>
          <CardContent className="py-16 flex flex-col items-center gap-3 text-center">
            <FileText className="h-10 w-10 text-muted-foreground/40" />
            <p className="text-muted-foreground">{search ? "No reports match your search." : "No daily reports yet. Submit one from a project."}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {sorted.map((report) => (
            <Card key={report.id} className="hover:border-primary/40 transition-colors">
              <CardContent className="py-4 px-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1">
                      <p className="font-semibold text-sm">
                        {format(new Date(report.reportDate), "MMMM d, yyyy")}
                      </p>
                      {report.weather && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Cloud className="h-3.5 w-3.5" />
                          {report.weather}
                          {report.temperature ? ` · ${report.temperature}` : ""}
                        </span>
                      )}
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Users className="h-3.5 w-3.5" />
                        {report.crewCount} crew
                      </span>
                    </div>
                    <p className="text-sm text-foreground/80 line-clamp-2">{report.workPerformed}</p>
                    {report.issues && (
                      <p className="text-xs text-destructive mt-1 line-clamp-1">⚠ {report.issues}</p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      {report.projectName && (
                        <span className="font-medium text-foreground">{report.projectName} · </span>
                      )}
                      {report.submittedByName}
                    </p>
                  </div>
                  <Link
                    href={`/projects/${report.projectId}`}
                    className="shrink-0 flex items-center gap-1 text-xs text-primary hover:underline mt-1"
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
