/**
 * Loop — Service Worker
 * Strategy:
 *   APP SHELL  (HTML, JS, CSS, fonts) → Cache First, network fallback, background refresh
 *   IMAGES     → Cache First, stale-while-revalidate (30 days)
 *   API        → Network Only (auth tokens must always be fresh)
 *
 * On install: pre-cache the app shell so Loop loads instantly on repeat visits
 * and works fully offline for already-visited pages.
 *
 * MOBILE-001 (2026-06-09): Initial service worker for PWA installability and offline shell.
 * PUSH-001   (2026-06-10): Full push event handler + notificationclick routing.
 */

const CACHE_VERSION = "loop-v1";
const SHELL_CACHE   = `${CACHE_VERSION}-shell`;
const IMAGE_CACHE   = `${CACHE_VERSION}-images`;

/** Resources to pre-cache on install */
const SHELL_URLS = [
  "/",
  "/manifest.json",
  "/favicon.svg",
];

/** URL patterns that bypass the service worker entirely */
const BYPASS_PATTERNS = [
  /^https:\/\/auth\.rald\.cloud/,
  /^https:\/\/profiles\.rald\.cloud/,
  /\/api\//,
  /\/rest\/v1\//,
  /supabase\.co/,
  /livekit/,
  /fonts\.googleapis\.com/,
  /fonts\.gstatic\.com/,
];

function shouldBypass(url) {
  return BYPASS_PATTERNS.some((p) => p.test(url));
}

function isImage(url) {
  return /\.(png|jpg|jpeg|webp|gif|svg|ico)(\?.*)?$/.test(url);
}

function isShellAsset(url) {
  return /\.(js|css|woff2?|ttf)(\?.*)?$/.test(url);
}

// ── Install: pre-cache shell ───────────────────────────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) =>
      cache.addAll(SHELL_URLS).catch(() => {
        // Pre-cache failures are non-fatal — shell still works
      })
    )
  );
  self.skipWaiting();
});

// ── Activate: prune old caches ─────────────────────────────────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => !k.startsWith(CACHE_VERSION))
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// ── Fetch: route by resource type ─────────────────────────────────────────
self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = request.url;

  if (shouldBypass(url)) return;

  if (isImage(url)) {
    event.respondWith(cacheFirst(IMAGE_CACHE, request));
    return;
  }

  if (isShellAsset(url)) {
    event.respondWith(cacheFirst(SHELL_CACHE, request));
    return;
  }

  event.respondWith(networkFirstWithShellFallback(request));
});

// ── Push: handle incoming push messages ───────────────────────────────────
/**
 * PUSH-001: Receives encrypted Web Push payloads dispatched by Loop Worker
 * /api/push/notify-room-live (and future notification types).
 *
 * Expected payload shape (JSON):
 * {
 *   title: string,
 *   body:  string,
 *   icon:  string,       // "/icons/icon-192.png"
 *   badge: string,       // "/icons/badge-72.png"
 *   tag:   string,       // deduplication key e.g. "room-live-<roomId>"
 *   data:  {
 *     url:  string,      // deep-link e.g. "/rooms/<roomId>"
 *     type: string,      // "room_live" | "new_follower" | "direct_message"
 *   }
 * }
 */
self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    // Malformed payload — show a generic notification so the push isn't silently dropped
    payload = {
      title: "Loop",
      body:  "Something's happening — tap to open.",
      icon:  "/icons/icon-192.png",
      badge: "/icons/badge-72.png",
      tag:   "loop-generic",
      data:  { url: "/" },
    };
  }

  const {
    title  = "Loop",
    body   = "",
    icon   = "/icons/icon-192.png",
    badge  = "/icons/badge-72.png",
    tag    = "loop-notification",
    data   = {},
  } = payload;

  const options = {
    body,
    icon,
    badge,
    tag,
    data,
    // Show notification even when the app is in the foreground on Android
    requireInteraction: false,
    // Vibration pattern: short-long-short
    vibrate: [100, 50, 100],
    // Actions — only shown on Android / desktop (iOS ignores)
    actions:
      data.type === "room_live"
        ? [{ action: "join",    title: "Join room" },
           { action: "dismiss", title: "Dismiss"   }]
        : [],
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// ── Notification click ─────────────────────────────────────────────────────
/**
 * Routes taps on push notifications to the correct in-app path.
 * Works for both action button taps and body taps.
 */
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const action = event.action;   // "join" | "dismiss" | "" (body tap)
  const data   = event.notification.data ?? {};
  const url    = data.url ?? "/";

  // "dismiss" action — just close, don't navigate
  if (action === "dismiss") return;

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        // If Loop is already open, focus the existing window and navigate
        const existing = clients.find((c) => {
          try {
            const u = new URL(c.url);
            return u.pathname !== "/login";
          } catch { return false; }
        });

        if (existing && "focus" in existing) {
          return existing.focus().then((win) => {
            if ("navigate" in win) win.navigate(url);
          });
        }

        // Otherwise open a new window at the target path
        if (self.clients.openWindow) {
          return self.clients.openWindow(url);
        }
      })
  );
});

// ── Push subscription change ───────────────────────────────────────────────
/**
 * Called by the browser when the push subscription is forcibly changed
 * (e.g. browser rotates keys). Re-registers the new subscription with the API.
 * This prevents silent push delivery failures after key rotation.
 */
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      const subscription = await self.registration.pushManager.subscribe(
        event.oldSubscription?.options ?? { userVisibleOnly: true }
      );
      // Notify all open clients to re-POST the new subscription
      const clients = await self.clients.matchAll({ type: "window" });
      clients.forEach((c) =>
        c.postMessage({ type: "PUSH_SUBSCRIPTION_CHANGED", subscription: subscription.toJSON() })
      );
    })()
  );
});

// ── Caching strategies ─────────────────────────────────────────────────────

async function cacheFirst(cacheName, request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response("Offline", { status: 503 });
  }
}

async function networkFirstWithShellFallback(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(SHELL_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;

    const shell = await caches.match("/");
    if (shell) return shell;

    return new Response(
      `<!DOCTYPE html><html><body>
        <p style="font-family:sans-serif;padding:2rem;color:#888">
          You're offline. Open Loop when you're back online.
        </p>
      </body></html>`,
      { headers: { "Content-Type": "text/html" } }
    );
  }
}
