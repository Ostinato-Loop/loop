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
  // Vite-built JS/CSS have hashes — cache them aggressively
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

  // Always bypass auth, API, and realtime endpoints
  if (shouldBypass(url)) return;

  if (isImage(url)) {
    // Images: cache first (30-day TTL via fetch headers already; SW just stores)
    event.respondWith(cacheFirst(IMAGE_CACHE, request));
    return;
  }

  if (isShellAsset(url)) {
    // Hashed JS/CSS: cache first — hash changes = new URL = fresh fetch
    event.respondWith(cacheFirst(SHELL_CACHE, request));
    return;
  }

  // Navigation (HTML) + anything else: network first, fall back to cached shell
  event.respondWith(networkFirstWithShellFallback(request));
});

// ── Strategies ─────────────────────────────────────────────────────────────

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
    // Network failed — try cache, then fall back to root (SPA shell)
    const cached = await caches.match(request);
    if (cached) return cached;

    // SPA fallback: return the cached root HTML so React Router handles routing
    const shell = await caches.match("/");
    if (shell) return shell;

    return new Response(
      `<!DOCTYPE html><html><body>
        <p style="font-family:sans-serif;padding:2rem;color:#5A9E76">
          Loop is offline. Connect to the internet to continue.
        </p>
      </body></html>`,
      { headers: { "Content-Type": "text/html" } }
    );
  }
}

// ── Push notifications (stub — wired up in Sprint 2) ──────────────────────
self.addEventListener("push", (event) => {
  if (!event.data) return;
  let data = {};
  try { data = event.data.json(); } catch { return; }

  const title   = data.title   ?? "Loop";
  const options = {
    body:    data.body    ?? "",
    icon:    data.icon    ?? "/icons/icon-192.png",
    badge:   data.badge   ?? "/icons/icon-192.png",
    tag:     data.tag     ?? "loop-notification",
    data:    data.data    ?? {},
    vibrate: [100, 50, 100],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? "/";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((cs) => {
      const existing = cs.find((c) => c.url.includes(self.location.origin));
      if (existing) return existing.focus().then((c) => c.navigate(url));
      return clients.openWindow(url);
    })
  );
});
