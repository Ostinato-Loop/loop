/**
 * Loop — Web Push Utility (OneSignal)
 * PUSH-001 (2026-06-10): Replaced VAPID with @onesignal/onesignal-web-sdk.
 * LILCKY STUDIO LIMITED
 */
import OneSignal from "react-onesignal";

export type PushState =
  | "unsupported"   // Browser has no push support or OneSignal not initialised
  | "denied"        // User blocked notifications
  | "prompt"        // Not yet asked
  | "subscribed"    // Opted in and receiving push
  | "unsubscribed"; // Granted permission but opted out

/** Read current push state without triggering a browser prompt. */
export async function getPushState(): Promise<PushState> {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  if (Notification.permission === "denied") return "denied";

  try {
    const optedIn = (OneSignal.User as any).PushSubscription.optedIn;
    if (optedIn) return "subscribed";
    if (Notification.permission === "granted") return "unsubscribed";
    return "prompt";
  } catch {
    return "prompt";
  }
}

/**
 * Request permission + opt the user in to OneSignal push.
 * Returns the resulting state.
 */
export async function subscribeToPush(): Promise<PushState> {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";

  try {
    await (OneSignal.Notifications as any).requestPermission();
  } catch {
    return "denied";
  }

  if (Notification.permission !== "granted") return "denied";

  try {
    await (OneSignal.User as any).PushSubscription.optIn();
    return "subscribed";
  } catch {
    return "unsubscribed";
  }
}

/** Opt the user out without revoking browser permission. */
export async function unsubscribeFromPush(): Promise<void> {
  try {
    await (OneSignal.User as any).PushSubscription.optOut();
  } catch {
    // Non-fatal
  }
}

/**
 * Set OneSignal external user ID to the Supabase user UUID.
 * Call this immediately after authentication.
 * OneSignal uses this to deliver targeted notifications.
 */
export async function identifyPushUser(userId: string): Promise<void> {
  try {
    await OneSignal.login(userId);
  } catch {
    // Non-fatal — push will still work but won't be user-targeted
  }
}

/** Remove the external user ID on sign-out. */
export async function clearPushUser(): Promise<void> {
  try {
    await OneSignal.logout();
  } catch { /* Non-fatal */ }
}
