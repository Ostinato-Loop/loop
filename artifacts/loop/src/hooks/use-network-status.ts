/**
 * Loop — useNetworkStatus
 * Part 13: Poor Network Audit.
 * Detects online/offline and (if Navigator.connection is available)
 * classifies connection quality as "good" | "slow" | "offline".
 * LILCKY STUDIO LIMITED
 */

import { useEffect, useState } from "react";

type Quality = "good" | "slow" | "offline";

export function useNetworkStatus(): { online: boolean; quality: Quality } {
  const [online, setOnline] = useState(() => navigator.onLine);
  const [quality, setQuality] = useState<Quality>(() => deriveQuality(navigator.onLine));

  function deriveQuality(isOnline: boolean): Quality {
    if (!isOnline) return "offline";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const conn = (navigator as any).connection;
    if (!conn) return "good";
    const type: string = conn.effectiveType ?? "";
    if (type === "2g" || type === "slow-2g") return "slow";
    const rtt: number = conn.rtt ?? 0;
    const down: number = conn.downlink ?? Infinity;
    if (rtt > 800 || down < 0.25) return "slow";
    return "good";
  }

  useEffect(() => {
    const handleOnline  = () => { setOnline(true);  setQuality(deriveQuality(true)); };
    const handleOffline = () => { setOnline(false); setQuality("offline"); };

    window.addEventListener("online",  handleOnline);
    window.addEventListener("offline", handleOffline);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const conn = (navigator as any).connection;
    if (conn) {
      const handleChange = () => setQuality(deriveQuality(navigator.onLine));
      conn.addEventListener("change", handleChange);
      return () => {
        window.removeEventListener("online",  handleOnline);
        window.removeEventListener("offline", handleOffline);
        conn.removeEventListener("change", handleChange);
      };
    }

    return () => {
      window.removeEventListener("online",  handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return { online, quality };
}
