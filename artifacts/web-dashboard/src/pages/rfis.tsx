import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { Link } from "wouter";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { MessageSquareWarning, Search, ExternalLink } from "lucide-react";
import { useState } from "react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type RFIItem = {
  id: number;
  projectId: number;
  projectName: string | null;
  rfiNumber: string;
  subject: string;
  status: string;
  priority: string;
  submittedByName: string;
  dueDate: string | null;
  createdAt: string;
};

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
  critical: "bg-red-200 text-red-800 border-red-300",
};

export default function RFIsPage() {
  const [search, setSearch] = useState("");

  const { data: rfis = [], isLoading } = useQuery<RFIItem[]>({
    queryKey: ["rfis-all"],
    queryFn: () => customFetch(`${BASE}/api/rfis`),
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">RFIs</h1>
        <p className="text-muted-foreground">All Requests for Information across your projects.</p>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Search RFIs…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {isLoading ? (
        <div className="py-16 text-center text-muted-foreground animate-pulse">Loading RFIs…</div>
      ) : sorted.length === 0 ? (
        <Card>
          <CardContent className="py-16 flex flex-col items-center gap-3 text-center">
            <MessageSquareWarning className="h-10 w-10 text-muted-foreground/40" />
            <p className="text-muted-foreground">{search ? "No RFIs match your search." : "No RFIs yet. Submit one from a project."}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {sorted.map((rfi) => (
            <Card key={rfi.id} className="hover:border-primary/40 transition-colors">
              <CardContent className="py-4 px-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-xs font-mono text-muted-foreground">{rfi.rfiNumber}</span>
                      <Badge variant="outline" className={`text-xs ${statusColor[rfi.status] ?? ""}`}>
                        {rfi.status.replace("_", " ")}
                      </Badge>
                      <Badge variant="outline" className={`text-xs ${priorityColor[rfi.priority] ?? ""}`}>
                        {rfi.priority}
                      </Badge>
                    </div>
                    <p className="font-semibold text-sm truncate">{rfi.subject}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {rfi.projectName && (
                        <span className="font-medium text-foreground">{rfi.projectName} · </span>
                      )}
                      Submitted by {rfi.submittedByName} · {format(new Date(rfi.createdAt), "MMM d, yyyy")}
                      {rfi.dueDate && ` · Due ${format(new Date(rfi.dueDate), "MMM d, yyyy")}`}
                    </p>
                  </div>
                  <Link
                    href={`/projects/${rfi.projectId}`}
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
