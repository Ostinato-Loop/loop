/**
 * Loop — Web Push Frontend Utility
 * Handles permission request, PushManager subscription, and API registration.
 *
 * PUSH-001 (2026-06-10)
 * LILCKY STUDIO LIMITED
 *
 * Usage:
 *   import { subscribeToPush, unsubscribeFromPush, getPushState } from "@/lib/push";
 */

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY ?? "";

export type PushState =
  | "unsupported"    // Browser has no push/SW support
  | "denied"         // User blocked notifications
  | "prompt"         // User hasn't been asked yet
  | "subscribed"     // Active push subscription registered with server
  | "unsubscribed";  // SW active but no subscription saved

/** Convert VAPID public key from Base64url to Uint8Array (required by PushManager) */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding  = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64   = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData  = atob(base64);
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
}

/** Returns the current push permission state without triggering a prompt. */
export async function getPushState(): Promise<PushState> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    return "unsupported";
  }

  if (Notification.permission === "denied") return "denied";

  const reg = await navigator.serviceWorker.getRegistration("/");
  if (!reg) return "prompt";

  const existing = await reg.pushManager.getSubscription();
  if (existing) return "subscribed";

  return Notification.permission === "granted" ? "unsubscribed" : "prompt";
}

/**
 * Request permission + subscribe to push + POST subscription to Loop API.
 * Returns the new state after the attempt.
 */
export async function subscribeToPush(): Promise<PushState> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    return "unsupported";
  }

  // Request notification permission (shows the browser prompt)
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return "denied";

  // Get the active service worker registration
  const reg = await navigator.serviceWorker.ready;

  // Subscribe via PushManager
  let subscription: PushSubscription;
  try {
    subscription = await reg.pushManager.subscribe({
      userVisibleOnly:      true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
  } catch (err) {
    console.error("[push] subscribe failed:", err);
    return "unsubscribed";
  }

  // POST to Loop API
  const saved = await postSubscription(subscription);
  return saved ? "subscribed" : "unsubscribed";
}

/** Unsubscribe and remove the subscription from the Loop API. */
export async function unsubscribeFromPush(): Promise<void> {
  const reg = await navigator.serviceWorker.getRegistration("/");
  if (!reg) return;

  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;

  const endpoint = sub.endpoint;
  await sub.unsubscribe();

  // Tell the server to forget this endpoint
  try {
    const { authFetch } = await import("@/lib/api-fetch");
    await authFetch(`${API_BASE}/api/push/unsubscribe`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint }),
    });
  } catch (err) {
    console.warn("[push] unsubscribe API call failed:", err);
  }
}

/** POST a PushSubscription to the Loop API (called after subscribe or key rotation). */
export async function postSubscription(subscription: PushSubscription): Promise<boolean> {
  try {
    const { authFetch } = await import("@/lib/api-fetch");
    const json  = subscription.toJSON();
    const keys  = json.keys ?? {};
    const agent = navigator.userAgent.slice(0, 200);

    const res = await authFetch(`${API_BASE}/api/push/subscribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        endpoint:  json.endpoint,
        p256dh:    keys.p256dh,
        auth:      keys.auth,
        platform:  "web",
        userAgent: agent,
      }),
    });

    return res.ok;
  } catch (err) {
    console.error("[push] postSubscription error:", err);
    return false;
  }
}

/**
 * Listen for PUSH_SUBSCRIPTION_CHANGED messages from the service worker
 * (fired when the browser rotates push keys). Re-registers automatically.
 * Call this once from your app root.
 */
export function listenForSubscriptionChange(): () => void {
  const handler = (event: MessageEvent) => {
    if (event.data?.type === "PUSH_SUBSCRIPTION_CHANGED" && event.data.subscription) {
      // Re-build a minimal PushSubscription-like object and re-POST it
      const sub = event.data.subscription as {
        endpoint: string;
        keys: { p256dh: string; auth: string };
      };
      const { authFetch } = require("@/lib/api-fetch");
      authFetch(`${API_BASE}/api/push/subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint:  sub.endpoint,
          p256dh:    sub.keys?.p256dh,
          auth:      sub.keys?.auth,
          platform:  "web",
        }),
      }).catch(console.error);
    }
  };

  navigator.serviceWorker.addEventListener("message", handler);
  return () => navigator.serviceWorker.removeEventListener("message", handler);
}
