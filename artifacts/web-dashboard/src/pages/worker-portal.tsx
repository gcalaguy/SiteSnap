import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { customFetch, useGetMe } from "@workspace/api-client-react";
import { format } from "date-fns";
import {
  Plus,
  ShieldAlert,
  Clock,
  CheckCircle2,
  FileText,
  Eye,
  ChevronRight,
  AlertTriangle,
  Inbox,
  Globe,
  Briefcase,
  MessageCircle,
  Calculator,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { WorkerLayout } from "@/components/worker-layout";
import { WorkerCalculator } from "@/components/worker-calculator";

interface Submission {
  id: number;
  templateName: string;
  templateCategory: string;
  status: string;
  aiSummary: string | null;
  reviewNotes: string | null;
  createdAt: string;
}

const statusConfig: Record<string, { label: string; color: string; icon: React.ElementType; bg: string }> = {
  draft:     { label: "Draft",     color: "text-gray-600",  icon: Clock,         bg: "bg-gray-100" },
  submitted: { label: "Submitted", color: "text-blue-700",  icon: FileText,      bg: "bg-blue-50" },
  reviewed:  { label: "Reviewed",  color: "text-purple-700",icon: Eye,           bg: "bg-purple-50" },
  approved:  { label: "Approved",  color: "text-green-700", icon: CheckCircle2,  bg: "bg-green-50" },
};

const categoryColor: Record<string, string> = {
  injury:  "bg-red-100 text-red-700",
  safety:  "bg-blue-100 text-blue-700",
  hazard:  "bg-orange-100 text-orange-700",
  toolbox: "bg-green-100 text-green-700",
};

export default function WorkerPortalPage() {
  const { data: me } = useGetMe();
  const [tab, setTab] = useState<"all" | "draft" | "submitted" | "reviewed">("all");
  const [showCalc, setShowCalc] = useState(false);

  const { data: submissions = [], isLoading } = useQuery<Submission[]>({
    queryKey: ["safety-submissions"],
    queryFn: () => customFetch("/api/safety/submissions"),
  });

  const pending = submissions.filter((s) => s.status === "submitted").length;

  const filtered =
    tab === "all"
      ? submissions
      : tab === "reviewed"
      ? submissions.filter((s) => s.status === "reviewed" || s.status === "approved")
      : submissions.filter((s) => s.status === tab);

  return (
    <WorkerLayout>
      {/* Welcome */}
      <div className="mb-5">
        <h1 className="text-xl font-bold text-gray-900">
          Hello{me?.firstName ? `, ${me.firstName}` : ""} 👷
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Your safety forms and incident reports
        </p>
      </div>

      {/* Attention banner */}
      {pending > 0 && (
        <div className="mb-4 flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0" />
          <p className="text-sm text-amber-800">
            You have {pending} form{pending !== 1 ? "s" : ""} awaiting foreman review.
          </p>
        </div>
      )}

      {/* Quick Access */}
      <div className="mb-4 grid grid-cols-3 gap-2.5">
        <Link href="/tradehub/jobs">
          <div className="bg-white border border-gray-100 rounded-2xl px-3 py-3 flex flex-col items-center gap-2 cursor-pointer hover:border-primary/30 hover:shadow-md transition-all shadow-sm">
            <div className="w-9 h-9 bg-green-50 rounded-xl flex items-center justify-center">
              <Briefcase className="h-4 w-4 text-green-700" />
            </div>
            <p className="font-semibold text-xs text-gray-900 text-center leading-tight">Find Jobs</p>
          </div>
        </Link>
        <Link href="/tradehub/messages">
          <div className="bg-white border border-gray-100 rounded-2xl px-3 py-3 flex flex-col items-center gap-2 cursor-pointer hover:border-primary/30 hover:shadow-md transition-all shadow-sm">
            <div className="w-9 h-9 bg-blue-50 rounded-xl flex items-center justify-center">
              <MessageCircle className="h-4 w-4 text-blue-700" />
            </div>
            <p className="font-semibold text-xs text-gray-900 text-center leading-tight">Messages</p>
          </div>
        </Link>
        <Link href="/tradehub">
          <div className="bg-white border border-gray-100 rounded-2xl px-3 py-3 flex flex-col items-center gap-2 cursor-pointer hover:border-primary/30 hover:shadow-md transition-all shadow-sm">
            <div className="w-9 h-9 bg-purple-50 rounded-xl flex items-center justify-center">
              <Globe className="h-4 w-4 text-purple-700" />
            </div>
            <p className="font-semibold text-xs text-gray-900 text-center leading-tight">Feed</p>
          </div>
        </Link>
      </div>

      {/* Calculators Section */}
      <div className="mb-5">
        <button
          onClick={() => setShowCalc(!showCalc)}
          className="w-full bg-white border border-gray-100 rounded-2xl px-4 py-3.5 flex items-center gap-3 shadow-sm hover:border-primary/30 hover:shadow-md transition-all"
        >
          <div className="w-9 h-9 bg-orange-50 rounded-xl flex items-center justify-center flex-shrink-0">
            <Calculator className="h-4 w-4 text-primary" />
          </div>
          <div className="flex-1 text-left">
            <p className="font-semibold text-sm text-gray-900">Trade Calculators</p>
            <p className="text-xs text-gray-400 mt-0.5">16 field calculators — concrete, framing, electrical…</p>
          </div>
          <ChevronRight className={`h-4 w-4 text-gray-300 transition-transform ${showCalc ? "rotate-90" : ""}`} />
        </button>

        {showCalc && (
          <div className="mt-2 bg-gray-50 rounded-2xl border border-gray-100 p-4">
            <WorkerCalculator />
          </div>
        )}
      </div>

      {/* New Form CTA */}
      <Link href="/worker-portal/submit">
        <div className="mb-5 rounded-2xl bg-[#0A0A0A] text-white px-5 py-4 flex items-center justify-between cursor-pointer hover:bg-[#1A1A1A] transition-colors shadow-md">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center flex-shrink-0">
              <ShieldAlert className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="font-semibold text-base">Report an Incident</p>
              <p className="text-xs text-white/60 mt-0.5">Fill out any safety or incident form</p>
            </div>
          </div>
          <div className="w-8 h-8 bg-white/10 rounded-full flex items-center justify-center flex-shrink-0">
            <Plus className="h-4 w-4" />
          </div>
        </div>
      </Link>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-4">
        {(["all", "draft", "submitted", "reviewed"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 text-xs font-medium py-1.5 rounded-lg transition-all capitalize ${
              tab === t
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {t === "reviewed" ? "Done" : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* Submissions */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 rounded-2xl bg-gray-200 animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
          <Inbox className="h-12 w-12 text-gray-300" />
          <p className="font-medium text-gray-700">No forms here yet</p>
          <p className="text-sm text-gray-400">
            {tab === "all"
              ? "Tap the button above to submit your first form."
              : "Nothing in this category yet."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((s) => {
            const sc = statusConfig[s.status] ?? statusConfig.draft;
            const StatusIcon = sc.icon;
            return (
              <Link key={s.id} href={`/worker-portal/submissions/${s.id}`}>
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3.5 flex items-center gap-3 cursor-pointer hover:border-primary/30 hover:shadow-md transition-all">
                  <div className={`w-10 h-10 rounded-xl ${sc.bg} flex items-center justify-center flex-shrink-0`}>
                    <StatusIcon className={`h-5 w-5 ${sc.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-sm text-gray-900 truncate">
                        {s.templateName ?? "Safety Form"}
                      </p>
                      {s.templateCategory && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 ${categoryColor[s.templateCategory] ?? "bg-gray-100 text-gray-600"}`}>
                          {s.templateCategory}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {format(new Date(s.createdAt), "MMM d, yyyy · h:mm a")}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={`text-xs font-medium ${sc.color}`}>{sc.label}</span>
                    <ChevronRight className="h-4 w-4 text-gray-300" />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </WorkerLayout>
  );
}
