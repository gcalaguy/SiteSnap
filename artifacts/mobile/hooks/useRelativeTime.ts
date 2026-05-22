import { useState, useEffect } from "react";

function formatRelativeTime(timestamp: number): string {
  const diffMs = Date.now() - timestamp;
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 5) return "Updated just now";
  if (diffSec < 60) return `Updated ${diffSec}s ago`;

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `Updated ${diffMin}m ago`;

  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `Updated ${diffHr}h ago`;

  const diffDay = Math.floor(diffHr / 24);
  return `Updated ${diffDay}d ago`;
}

export function useRelativeTime(timestamp: number | null | undefined): string {
  const [label, setLabel] = useState<string>(() =>
    timestamp ? formatRelativeTime(timestamp) : ""
  );

  useEffect(() => {
    if (!timestamp) {
      setLabel("");
      return;
    }

    setLabel(formatRelativeTime(timestamp));

    const interval = setInterval(() => {
      setLabel(formatRelativeTime(timestamp));
    }, 10_000);

    return () => clearInterval(interval);
  }, [timestamp]);

  return label;
}
