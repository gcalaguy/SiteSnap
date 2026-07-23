import { customFetch, getListTimesheetsQueryKey } from "@workspace/api-client-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export type TimeClockUser = {
  id: number;
  firstName: string | null;
  lastName: string | null;
  email: string;
  role: "owner" | "foreman" | "worker" | null;
};

export type TimeClockProject = {
  id: number;
  name: string;
};

export type TimeClockSession = {
  id: number;
  companyId: number;
  projectId: number;
  userId: number;
  clockedInByUserId: number;
  clockedOutByUserId: number | null;
  date: string;
  clockInTime: string;
  clockOutTime: string | null;
  clockInNotes: string | null;
  clockOutNotes: string | null;
  status: "active" | "completed";
  timeEntryId: number | null;
  user?: TimeClockUser | null;
  project?: TimeClockProject | null;
};

export type TimeClockSummary = {
  date: string;
  completedHoursToday: string;
  activeSession: TimeClockSession | null;
  activeElapsedHours: string;
  todayTotalHours: string;
  weekTotalHours: string;
};

const ACTIVE_QUERY_KEY = ["time-clock", "active"] as const;
const ACTIVE_SESSIONS_QUERY_KEY = ["time-clock", "active-sessions"] as const;
const SUMMARY_QUERY_KEY = (date?: string) => ["time-clock", "summary", date ?? "today"] as const;

function todayLocalDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function useActiveSession() {
  return useQuery<{ session: TimeClockSession | null }>({
    queryKey: ACTIVE_QUERY_KEY,
    queryFn: () => customFetch("/api/time-clock/active"),
  });
}

export function useActiveSessions(enabled = true) {
  return useQuery<TimeClockSession[]>({
    queryKey: ACTIVE_SESSIONS_QUERY_KEY,
    queryFn: () => customFetch("/api/time-clock/active-sessions"),
    enabled,
    refetchInterval: enabled ? 30_000 : false,
  });
}

export function useTimeClockSummary(date?: string) {
  const d = date ?? todayLocalDate();
  return useQuery<TimeClockSummary>({
    queryKey: SUMMARY_QUERY_KEY(d),
    queryFn: () => customFetch(`/api/time-clock/summary?date=${d}`),
  });
}

function useInvalidateTimeClock() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["time-clock"] });
    qc.invalidateQueries({ queryKey: getListTimesheetsQueryKey() });
  };
}

export function useClockIn() {
  const invalidate = useInvalidateTimeClock();
  return useMutation({
    mutationFn: (body: { projectId: number; notes?: string; targetUserId?: number }) =>
      customFetch<TimeClockSession>("/api/time-clock/clock-in", {
        method: "POST",
        body: JSON.stringify({ ...body, localDate: todayLocalDate() }),
      }),
    onSuccess: invalidate,
  });
}

export function useClockOut() {
  const invalidate = useInvalidateTimeClock();
  return useMutation({
    mutationFn: ({ sessionId, notes }: { sessionId: number; notes?: string }) =>
      customFetch<{ session: TimeClockSession; timeEntry: unknown }>(`/api/time-clock/${sessionId}/clock-out`, {
        method: "POST",
        body: JSON.stringify({ notes }),
      }),
    onSuccess: invalidate,
  });
}

export function useCancelSession() {
  const invalidate = useInvalidateTimeClock();
  return useMutation({
    mutationFn: (sessionId: number) =>
      customFetch(`/api/time-clock/${sessionId}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });
}

export function useClockInAll() {
  const invalidate = useInvalidateTimeClock();
  return useMutation({
    mutationFn: (body: { projectId: number; notes?: string }) =>
      customFetch<{ clockedIn: TimeClockSession[]; skipped: number[] }>("/api/time-clock/clock-in-all", {
        method: "POST",
        body: JSON.stringify({ ...body, localDate: todayLocalDate() }),
      }),
    onSuccess: invalidate,
  });
}
