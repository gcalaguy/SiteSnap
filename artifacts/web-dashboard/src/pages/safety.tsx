import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { useGetMe } from "@workspace/api-client-react";
import { format } from "date-fns";
import {
  ShieldAlert,
  Plus,
  Search,
  Filter,
  FileText,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Eye,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const GOLD = "#C9A84C";
const BLACK = "#111111";

interface Submission {
  id: number;
  templateName: string;
  templateCategory: string;
  workerName: string;
  workerEmail: string;
  status: string;
  aiSummary: string | null;
  createdAt: string;
  updatedAt: string;
}

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: React.ElementType }> = {
  draft: { label: "Draft", variant: "outline", icon: Clock },
  submitted: { label: "Submitted", variant: "default", icon: FileText },
  reviewed: { label: "Reviewed", variant: "secondary", icon: Eye },
  approved: { label: "Approved", variant: "default", icon: CheckCircle2 },
};

const categoryColor: Record<string, string> = {
  injury: "bg-red-950/40 text-red-400 border-red-900/60",
  safety: "bg-blue-950/40 text-blue-400 border-blue-900/60",
  hazard: "bg-orange-950/40 text-orange-400 border-orange-900/60",
  toolbox: "bg-green-950/40 text-green-400 border-green-900/60",
};

export default function SafetyPage() {
  const { data: me } = useGetMe();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const isOwnerOrForeman = me?.role === "owner" || me?.role === "foreman";

  const { data: submissions = [], isLoading } = useQuery<Submission[]>({
    queryKey: ["safety-submissions", statusFilter],
    queryFn: () =>
      customFetch(`/api/safety/submissions${statusFilter !== "all" ? `?status=${statusFilter}` : ""}`),
  });

  const filtered = submissions.filter((s) => {
    const q = search.toLowerCase();
    return (
      !q ||
      s.templateName?.toLowerCase().includes(q) ||
      s.workerName?.toLowerCase().includes(q) ||
      s.templateCategory?.toLowerCase().includes(q)
    );
  });

  const counts = {
    total: submissions.length,
    draft: submissions.filter((s) => s.status === "draft").length,
    submitted: submissions.filter((s) => s.status === "submitted").length,
    reviewed: submissions.filter((s) => s.status === "reviewed" || s.status === "approved").length,
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <ShieldAlert className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Safety & Incidents</h1>
            <p className="text-sm text-muted-foreground">
              Manage safety forms, incident reports, and hazard assessments
            </p>
          </div>
        </div>
        <Link href="/safety/submit">
          <Button className="gap-2">
            <Plus className="h-4 w-4" />
            New Form
          </Button>
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Forms",     value: counts.total,     icon: FileText },
          { label: "Drafts",          value: counts.draft,     icon: Clock },
          { label: "Awaiting Review", value: counts.submitted, icon: AlertTriangle },
          { label: "Reviewed",        value: counts.reviewed,  icon: CheckCircle2 },
        ].map(({ label, value, icon: Icon }) => (
          <div
            key={label}
            className="rounded-xl p-4"
            style={{ background: BLACK, boxShadow: "0 4px 16px rgba(0,0,0,0.18)" }}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: GOLD }}>{label}</span>
              <Icon size={15} style={{ color: GOLD }} />
            </div>
            <p className="text-2xl font-bold text-white">{value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by form type, worker..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="submitted">Submitted</SelectItem>
            <SelectItem value="reviewed">Reviewed</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Submissions List */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 rounded-lg bg-muted/40 animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 gap-4">
            <ShieldAlert className="h-12 w-12 text-muted-foreground/40" />
            <div className="text-center">
              <p className="font-medium text-foreground">No safety forms yet</p>
              <p className="text-sm text-muted-foreground mt-1">
                {search || statusFilter !== "all"
                  ? "Try adjusting your filters."
                  : "Start by submitting a safety form."}
              </p>
            </div>
            {!search && statusFilter === "all" && (
              <Link href="/safety/submit">
                <Button variant="outline" className="gap-2">
                  <Plus className="h-4 w-4" />
                  New Form
                </Button>
              </Link>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((s) => {
            const sc = statusConfig[s.status] ?? statusConfig.draft;
            const StatusIcon = sc.icon;
            return (
              <Link key={s.id} href={`/safety/submissions/${s.id}`}>
                <Card className="cursor-pointer hover:shadow-md transition-shadow hover:border-primary/30">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-foreground">
                            {s.templateName ?? "Safety Form"}
                          </span>
                          {s.templateCategory && (
                            <span
                              className={`text-xs px-2 py-0.5 rounded-full border font-medium ${
                                categoryColor[s.templateCategory] ?? "bg-muted text-muted-foreground"
                              }`}
                            >
                              {s.templateCategory}
                            </span>
                          )}
                        </div>
                        {isOwnerOrForeman && s.workerName && (
                          <p className="text-sm text-muted-foreground mt-0.5">
                            Submitted by: {s.workerName}
                          </p>
                        )}
                        {s.aiSummary && (
                          <p className="text-sm text-muted-foreground mt-1 line-clamp-2 italic">
                            "{s.aiSummary.slice(0, 120)}…"
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground mt-1">
                          {format(new Date(s.createdAt), "MMM d, yyyy 'at' h:mm a")}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Badge
                          variant={sc.variant}
                          className={`gap-1.5 ${s.status === "approved" ? "bg-green-600 hover:bg-green-600" : ""}`}
                        >
                          <StatusIcon className="h-3 w-3" />
                          {sc.label}
                        </Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
