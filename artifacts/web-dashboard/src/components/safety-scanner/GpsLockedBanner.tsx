import { AlertTriangle, Loader2, MapPin } from "lucide-react";

export interface GpsLockInfo {
  siteAddress: string | null;
  capturedAt: Date;
  timezone: string | null;
}

interface Props {
  loading: boolean;
  denied?: boolean;
  info: GpsLockInfo | null;
}

/** "GPS Locked • 123 Main St • Jul 26, 2026, 2:30 PM EST" status banner. */
export function GpsLockedBanner({ loading, denied, info }: Props) {
  if (denied) {
    return (
      <div className="flex items-center gap-2 rounded-md px-3 py-2 text-xs font-semibold"
        style={{ background: "#7f1d1d33", color: "#f87171" }}>
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
        Location permission denied — GPS tag required for audit trail
      </div>
    );
  }

  if (loading || !info) {
    return (
      <div className="flex items-center gap-2 rounded-md px-3 py-2 text-xs font-semibold text-zinc-400"
        style={{ background: "#ffffff10" }}>
        <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
        Locking GPS…
      </div>
    );
  }

  const dateLabel = info.capturedAt.toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
    ...(info.timezone ? { timeZone: info.timezone, timeZoneName: "short" as const } : {}),
  });

  return (
    <div className="flex items-center gap-2 rounded-md px-3 py-2 text-xs font-semibold truncate"
      style={{ background: "#16653433", color: "#4ade80" }}>
      <MapPin className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">
        GPS Locked{info.siteAddress ? ` • ${info.siteAddress}` : ""} • {dateLabel}
      </span>
    </div>
  );
}
