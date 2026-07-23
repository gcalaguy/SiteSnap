import { memo, useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch, getListTimesheetsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Radio, Square } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type ActiveSession = {
  id: number;
  projectId: number;
  userId: number;
  clockInTime: string;
  user: { firstName: string | null; lastName: string | null; email: string } | null;
  project: { id: number; name: string } | null;
};

function displayName(user: ActiveSession["user"]): string {
  if (!user) return "Unknown";
  const name = `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim();
  return name || user.email?.split("@")[0] || "Unknown";
}

function initials(user: ActiveSession["user"]): string {
  if (!user) return "?";
  if (user.firstName) return `${user.firstName[0]}${user.lastName?.[0] ?? ""}`.toUpperCase();
  return (user.email?.[0] ?? "?").toUpperCase();
}

function formatElapsed(ms: number): string {
  const totalMinutes = Math.max(0, Math.floor(ms / 60000));
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// Isolated leaf so only this row re-renders every minute, not the whole widget.
const ElapsedBadge = memo(function ElapsedBadge({ clockInTime }: { clockInTime: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  return <span className="text-xs font-semibold text-[#22C55E]">{formatElapsed(now - new Date(clockInTime).getTime())}</span>;
});

export function WhosClockedInWidget() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: sessions = [], isLoading } = useQuery<ActiveSession[]>({
    queryKey: ["time-clock", "active-sessions"],
    queryFn: () => customFetch("/api/time-clock/active-sessions"),
    refetchInterval: 30_000,
  });

  const clockOut = useMutation({
    mutationFn: (sessionId: number) =>
      customFetch(`/api/time-clock/${sessionId}/clock-out`, { method: "POST", body: JSON.stringify({}) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["time-clock"] });
      qc.invalidateQueries({ queryKey: getListTimesheetsQueryKey() });
      toast({ title: "Clocked out" });
    },
    onError: () => toast({ title: "Failed to clock out", variant: "destructive" }),
  });

  if (!isLoading && sessions.length === 0) return null;

  return (
    <Card className="border-[#D4AF37]/20">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Radio className="h-4 w-4 text-[#22C55E]" />
          <span className="text-sm font-bold text-[#121212]">Clocked In Now</span>
          {sessions.length > 0 && (
            <span className="text-xs font-semibold text-[#121212]/50">({sessions.length})</span>
          )}
        </div>
        <div className="space-y-2">
          {sessions.map((s) => (
            <div key={s.id} className="flex items-center gap-3 rounded-md border border-[#D4AF37]/10 p-2">
              <Avatar className="h-8 w-8">
                <AvatarFallback className="text-xs">{initials(s.user)}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-[#121212] truncate">{displayName(s.user)}</div>
                <div className="text-xs text-[#121212]/60 truncate">{s.project?.name ?? "Unknown project"}</div>
              </div>
              <ElapsedBadge clockInTime={s.clockInTime} />
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2 text-xs"
                disabled={clockOut.isPending}
                onClick={() => clockOut.mutate(s.id)}
              >
                <Square className="h-3 w-3 mr-1" />
                Clock Out
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
