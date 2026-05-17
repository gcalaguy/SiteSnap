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
  ClipboardList,
  ArrowRight,
  Printer,
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
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "@/components/ui/sheet";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

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

interface FormTemplate {
  id: number;
  name: string;
  category: string;
  schema: { fields: Array<{ id: string; label: string; type: string; required: boolean }> };
  isActive: boolean;
  createdAt: string;
}

const statusConfig: Record<string, { label: string; icon: React.ElementType; color: string; bg: string }> = {
  draft:     { label: "Draft",     icon: Clock,        color: "#6B7280", bg: "#F3F4F6" },
  submitted: { label: "Submitted", icon: FileText,     color: "#2563EB", bg: "#DBEAFE" },
  reviewed:  { label: "Reviewed",  icon: Eye,          color: "#7C3AED", bg: "#EDE9FE" },
  approved:  { label: "Approved",  icon: CheckCircle2, color: "#16A34A", bg: "#DCFCE7" },
};

const categoryConfig: Record<string, { label: string; color: string; bg: string }> = {
  injury:  { label: "Injury",   color: "#DC2626", bg: "#FEE2E2" },
  safety:  { label: "Safety",   color: "#2563EB", bg: "#DBEAFE" },
  hazard:  { label: "Hazard",   color: "#D97706", bg: "#FEF3C7" },
  toolbox: { label: "Toolbox",  color: "#16A34A", bg: "#DCFCE7" },
};

function CategoryBadge({ category }: { category: string }) {
  const cfg = categoryConfig[category];
  if (!cfg) return null;
  return (
    <span
      className="text-[10px] font-bold px-2 py-0.5 rounded-full"
      style={{ background: cfg.bg, color: cfg.color }}
    >
      {cfg.label}
    </span>
  );
}

export default function SafetyPage() {
  const { data: me } = useGetMe();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [tab, setTab] = useState("submissions");
  const [showPrintSheet, setShowPrintSheet] = useState(false);
  const [printSections, setPrintSections] = useState<Record<string, boolean>>({
    inspections: true,
    hazard: false,
    incidents: false,
    toolbox: false,
    ppe: false,
    notes: false,
  });

  const isOwnerOrForeman = me?.role === "owner" || me?.role === "foreman";

  const { data: submissions = [], isLoading: loadingSubmissions } = useQuery<Submission[]>({
    queryKey: ["safety-submissions", statusFilter],
    queryFn: () =>
      customFetch(`/api/safety/submissions${statusFilter !== "all" ? `?status=${statusFilter}` : ""}`),
  });

  const { data: templates = [], isLoading: loadingTemplates } = useQuery<FormTemplate[]>({
    queryKey: ["safety-templates"],
    queryFn: () => customFetch("/api/safety/templates"),
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
    submitted: submissions.filter((s) => s.status === "submitted").length,
    reviewed: submissions.filter((s) => s.status === "reviewed" || s.status === "approved").length,
    pending: submissions.filter((s) => s.status === "submitted").length,
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
              Forms, incident reports, and hazard assessments
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="shrink-0 gap-2"
            onClick={() => setShowPrintSheet(true)}
          >
            <Printer className="h-4 w-4" />
            Export PDF
          </Button>
          <Link href="/safety/submit">
            <Button style={{ background: GOLD, color: BLACK }} className="gap-2 font-semibold">
              <Plus className="h-4 w-4" />
              New Form
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Forms",      value: counts.total,    icon: FileText,      action: () => { setTab("submissions"); setStatusFilter("all"); } },
          { label: "Templates",        value: templates.length, icon: ClipboardList, action: () => setTab("forms") },
          { label: "Awaiting Review",  value: counts.submitted, icon: AlertTriangle, action: () => { setTab("submissions"); setStatusFilter("submitted"); } },
          { label: "Reviewed",         value: counts.reviewed,  icon: CheckCircle2,  action: () => { setTab("submissions"); setStatusFilter("all"); } },
        ].map(({ label, value, icon: Icon, action }) => (
          <div
            key={label}
            onClick={action}
            className="rounded-xl p-4 cursor-pointer hover:opacity-90 transition-opacity"
            style={{ background: BLACK }}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: GOLD }}>{label}</span>
              <Icon size={15} style={{ color: GOLD }} />
            </div>
            <p className="text-2xl font-bold text-white">{value}</p>
          </div>
        ))}
      </div>

      {/* Alert banner for pending submissions */}
      {counts.pending > 0 && isOwnerOrForeman && (
        <div className="rounded-xl p-4 flex items-center gap-3" style={{ background: "#FEF3C7", border: "1px solid #FDE68A" }}>
          <AlertTriangle size={18} className="text-amber-600 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-900">
              {counts.pending} form{counts.pending > 1 ? "s" : ""} awaiting your review
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="border-amber-300 text-amber-800 hover:bg-amber-50"
            onClick={() => { setTab("submissions"); setStatusFilter("submitted"); }}
          >
            Review <ArrowRight size={12} className="ml-1" />
          </Button>
        </div>
      )}

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="forms">Available Forms</TabsTrigger>
          <TabsTrigger value="submissions">
            Submissions
            {counts.submitted > 0 && (
              <span className="ml-1.5 text-xs bg-blue-100 text-blue-700 rounded-full px-1.5 py-0.5 font-bold">
                {counts.submitted}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ── Forms Tab ── */}
        <TabsContent value="forms" className="mt-4 space-y-4">
          <p className="text-sm text-muted-foreground">
            Select a form type to fill and submit. All forms generate an AI summary upon submission.
          </p>
          {loadingTemplates ? (
            <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
            </div>
          ) : templates.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <ClipboardList className="h-10 w-10 text-muted-foreground/30 mb-3" />
                <p className="text-sm text-muted-foreground">No form templates available</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
              {templates.map((t) => {
                const cat = categoryConfig[t.category];
                return (
                  <Link key={t.id} href={`/safety/submit?template=${t.id}`}>
                    <div
                      className="rounded-xl p-5 border cursor-pointer hover:shadow-md hover:border-primary/40 transition-all group flex flex-col gap-3"
                      style={{ background: "#fff", borderColor: "#E5E5E5" }}
                    >
                      <div className="flex items-start justify-between">
                        <div
                          className="rounded-lg flex items-center justify-center flex-shrink-0"
                          style={{
                            width: 36,
                            height: 36,
                            background: cat?.bg ?? "#F3F4F6",
                          }}
                        >
                          <ShieldAlert size={17} style={{ color: cat?.color ?? "#6B7280" }} />
                        </div>
                        <CategoryBadge category={t.category} />
                      </div>
                      <div>
                        <p className="font-semibold text-sm group-hover:text-primary transition-colors">
                          {t.name}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {(t.schema?.fields ?? []).length} fields
                        </p>
                      </div>
                      <div className="mt-auto">
                        <span
                          className="text-xs font-semibold flex items-center gap-1"
                          style={{ color: GOLD }}
                        >
                          Fill Form <ArrowRight size={11} />
                        </span>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}

          {isOwnerOrForeman && (
            <div className="pt-2">
              <p className="text-xs text-muted-foreground">
                Need a custom form? Contact your administrator to add new form templates.
              </p>
            </div>
          )}
        </TabsContent>

        {/* ── Submissions Tab ── */}
        <TabsContent value="submissions" className="mt-4 space-y-4">
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

          {loadingSubmissions ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
            </div>
          ) : filtered.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16 gap-4">
                <ShieldAlert className="h-12 w-12 text-muted-foreground/40" />
                <div className="text-center">
                  <p className="font-medium text-foreground">No submissions yet</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {search || statusFilter !== "all"
                      ? "Try adjusting your filters."
                      : "Submit a safety form using the Forms tab."}
                  </p>
                </div>
                {!search && statusFilter === "all" && (
                  <Button variant="outline" onClick={() => setTab("forms")} className="gap-2">
                    <ClipboardList className="h-4 w-4" />
                    View Available Forms
                  </Button>
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
                              <CategoryBadge category={s.templateCategory} />
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
                            <span
                              className="text-xs font-bold px-2 py-1 rounded-full flex items-center gap-1"
                              style={{ background: sc.bg, color: sc.color }}
                            >
                              <StatusIcon className="h-3 w-3" />
                              {sc.label}
                            </span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Export PDF Sheet */}
      <Sheet open={showPrintSheet} onOpenChange={setShowPrintSheet}>
        <SheetContent side="right" className="sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Export Safety PDF</SheetTitle>
            <SheetDescription>
              Choose which sections to include in the report.
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-4 py-4">
            {[
              { key: "inspections", label: "Inspections", disabled: true },
              { key: "hazard", label: "Hazard Log" },
              { key: "incidents", label: "Incident Reports" },
              { key: "toolbox", label: "Toolbox Talks" },
              { key: "ppe", label: "PPE Compliance" },
              { key: "notes", label: "Safety Notes & AI Summaries" },
            ].map(({ key, label, disabled }) => (
              <div key={key} className="flex items-center space-x-3">
                <Checkbox
                  id={`print-${key}`}
                  checked={printSections[key]}
                  disabled={disabled}
                  onCheckedChange={(checked) =>
                    setPrintSections((prev) => ({ ...prev, [key]: checked === true }))
                  }
                />
                <Label htmlFor={`print-${key}`} className={disabled ? "text-muted-foreground" : ""}>
                  {label}
                  {disabled && <span className="text-xs text-muted-foreground ml-1">(required)</span>}
                </Label>
              </div>
            ))}
          </div>
          <SheetFooter>
            <Button variant="outline" onClick={() => setShowPrintSheet(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                const qs = new URLSearchParams();
                Object.entries(printSections).forEach(([k, v]) => qs.set(k, String(v)));
                const base = import.meta.env.BASE_URL.replace(/\/$/, "");
                window.open(`${base}/safety/print?${qs.toString()}`, "_blank");
                setShowPrintSheet(false);
              }}
            >
              Open Print Preview
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
