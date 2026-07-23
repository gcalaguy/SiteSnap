import React, { useEffect, useState } from "react";
import { Text, type TextStyle, type StyleProp } from "react-native";

function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}h ${pad(m)}m` : `${m}m ${pad(s)}s`;
}

/**
 * Isolated leaf that ticks its own 1s interval so only this small node
 * re-renders every second — not the screen it's mounted in.
 */
export const ElapsedTimer = React.memo(function ElapsedTimer({
  clockInTime,
  style,
}: {
  clockInTime: string;
  style?: StyleProp<TextStyle>;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const elapsed = now - new Date(clockInTime).getTime();
  return <Text style={style}>{formatElapsed(elapsed)}</Text>;
});
