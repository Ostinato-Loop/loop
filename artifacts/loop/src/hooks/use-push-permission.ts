/**
 * Loop — usePushPermission
 * Part 19: Day-1 Retention.
 * Manages Web Push Notification permission state.
 * Returns current permission status and a requestPermission function.
 * Does NOT auto-prompt — the UI component decides when to ask.
 * LILCKY STUDIO LIMITED
 */

import { useEffect, useState } from "react";

export type PermissionState = "default" | "granted" | "denied" | "unsupported";

export function usePushPermission() {
  const [permission, setPermission] = useState<PermissionState>(() => {
    if (!("Notification" in window)) return "unsupported";
    return Notification.permission as PermissionState;
  });

  useEffect(() => {
    if (!("Notification" in window)) return;
    // Keep state in sync if user changes browser setting while app is open
    const id = setInterval(() => {
      setPermission(Notification.permission as PermissionState);
    }, 5000);
    return () => clearInterval(id);
  }, []);

  const requestPermission = async (): Promise<PermissionState> => {
    if (!("Notification" in window)) return "unsupported";
    if (Notification.permission !== "default") {
      setPermission(Notification.permission as PermissionState);
      return Notification.permission as PermissionState;
    }
    const result = await Notification.requestPermission();
    setPermission(result as PermissionState);
    return result as PermissionState;
  };

  return { permission, requestPermission };
}
