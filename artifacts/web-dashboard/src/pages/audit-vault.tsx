import { useState, useMemo } from "react";
import { customFetch } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, ShieldCheck, Clock, User, FolderOpen, Globe } from "lucide-react";
import { format } from "date-fns";

const GOLD = "#C9A84C";
const BLACK = "#111111";

const renderSafeTimestamp = (dateString: any) => {
  if (!dateString) return "N/A";
  try {
    const d = new Date(dateString);
    return isNaN(d.getTime()) ? "N/A" : format(d, "MMM d, yyyy h:mm a");
  } catch {
    return "N/A";
  }
};

interface AuditLogEntry {
  id: number;
  createdAt: string;
  userName: string;
  userRole: string;
  action: string;
  projectName: string;
  ipAddress: string;
}

function roleBadge(role: string) {
  const label = role.charAt(0).toUpperCase() + role.slice(1);
  if (role === "owner") return <Badge className="bg-amber-600 text-white text-[10px] font-semibold">{label}</Badge>;
  if (role === "foreman") return <Badge className="bg-blue-600 text-white text-[10px] font-semibold">{label}</Badge>;
  return <Badge className="bg-zinc-600 text-white text-[10px] font-semibold">{label}</Badge>;
}

function actionBadge(action: string) {
  const lower = action.toLowerCase();
  if (lower.includes("approved") || lower.includes("signed")) {
    return <Badge className="bg-green-600 text-white text-[10px] font-semibold">Approved</Badge>;
  }
  if (lower.includes("uploaded") || lower.includes("submitted")) {
    return <Badge className="bg-blue-600 text-white text-[10px] font-semibold">Submitted</Badge>;
  }
  if (lower.includes("deleted") || lower.includes("removed")) {
    return <Badge className="bg-red-600 text-white text-[10px] font-semibold">Deleted</Badge>;
  }
  return <Badge className="bg-zinc-600 text-white text-[10px] font-semibold">Action</Badge>;
}

async function fetchAuditLogs(): Promise<AuditLogEntry[]> {
  return customFetch<AuditLogEntry[]>(`${import.meta.env.BASE_URL}api/audit-logs`, { method: "GET" });
}

export default function AuditVaultPage() {
  const [search, setSearch] = useState("");

  const { data: logs, isLoading, error } = useQuery<AuditLogEntry[], Error>({
    queryKey: ["audit-logs"],
    queryFn: fetchAuditLogs,
  });

  const filtered = useMemo(() => {
    if (!logs) return [];
    if (!search.trim()) return logs;
    const q = search.toLowerCase();
    return logs.filter(
      (l) =>
        l.userName.toLowerCase().includes(q) ||
        l.projectName.toLowerCase().includes(q) ||
        l.action.toLowerCase().includes(q),
    );
  }, [logs, search]);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <ShieldCheck size={22} style={{ color: GOLD }} />
        <h1 className="text-xl font-bold tracking-tight" style={{ color: BLACK }}>
          Audit Vault
        </h1>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <CardTitle className="text-base font-semibold">Activity Log</CardTitle>
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by user, project, or action..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-9 text-sm"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading && (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          )}

          {error && (
            <div className="text-sm text-destructive">
              Failed to load audit logs: {error.message}
            </div>
          )}

          {!isLoading && !error && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left font-medium text-muted-foreground py-2.5 pr-4 w-44">
                      <span className="inline-flex items-center gap-1.5">
                        <Clock size={13} /> Timestamp
                      </span>
                    </th>
                    <th className="text-left font-medium text-muted-foreground py-2.5 pr-4 w-48">
                      <span className="inline-flex items-center gap-1.5">
                        <User size={13} /> User / Foreman
                      </span>
                    </th>
                    <th className="text-left font-medium text-muted-foreground py-2.5 pr-4">
                      Action
                    </th>
                    <th className="text-left font-medium text-muted-foreground py-2.5 pr-4 w-52">
                      <span className="inline-flex items-center gap-1.5">
                        <FolderOpen size={13} /> Project
                      </span>
                    </th>
                    <th className="text-left font-medium text-muted-foreground py-2.5 w-32">
                      <span className="inline-flex items-center gap-1.5">
                        <Globe size={13} /> IP Address
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-muted-foreground text-sm">
                        No audit logs found.
                      </td>
                    </tr>
                  )}
                  {filtered.map((log) => (
                    <tr key={log.id} className="border-b last:border-0 hover:bg-muted/40 transition-colors">
                      <td className="py-3 pr-4 text-xs text-muted-foreground whitespace-nowrap">
                        {renderSafeTimestamp(log.createdAt)}
                      </td>
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-foreground text-sm">{log.userName}</span>
                          {roleBadge(log.userRole)}
                        </div>
                      </td>
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-2">
                          {actionBadge(log.action)}
                          <span className="text-foreground text-sm">{log.action}</span>
                        </div>
                      </td>
                      <td className="py-3 pr-4 text-sm text-foreground">{log.projectName}</td>
                      <td className="py-3 text-xs text-muted-foreground font-mono">{log.ipAddress}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
