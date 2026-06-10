/**
 * Loop — Service Worker (App Shell + Offline)
 * Strategy:
 *   APP SHELL  (HTML, JS, CSS, fonts) → Cache First, network fallback
 *   IMAGES     → Cache First (stale-while-revalidate)
 *   API        → Network Only (auth tokens must always be fresh)
 *
 * MOBILE-001 (2026-06-09): Initial service worker.
 * PUSH-001   (2026-06-10): Push notifications delegated to OneSignalSDKWorker.js.
 *   Push event handlers removed — OneSignal owns push delivery via their own SW.
 *   This SW handles only app shell caching and offline fallback.
 */

const CACHE_VERSION = "loop-v2";
const SHELL_CACHE   = `${CACHE_VERSION}-shell`;
const IMAGE_CACHE   = `${CACHE_VERSION}-images`;

const SHELL_URLS = ["/", "/manifest.json", "/favicon.svg"];

const BYPASS_PATTERNS = [
  /^https:\/\/auth\.rald\.cloud/,
  /^https:\/\/profiles\.rald\.cloud/,
  /\/api\//,
  /\/rest\/v1\//,
  /supabase\.co/,
  /livekit/,
  /onesignal/,
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

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) =>
      cache.addAll(SHELL_URLS).catch(() => {})
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => !k.startsWith(CACHE_VERSION)).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = request.url;
  if (shouldBypass(url)) return;
  if (isImage(url)) { event.respondWith(cacheFirst(IMAGE_CACHE, request)); return; }
  if (isShellAsset(url)) { event.respondWith(cacheFirst(SHELL_CACHE, request)); return; }
  event.respondWith(networkFirstWithShellFallback(request));
});

async function cacheFirst(cacheName, request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) (await caches.open(cacheName)).put(request, response.clone());
    return response;
  } catch { return new Response("Offline", { status: 503 }); }
}

async function networkFirstWithShellFallback(request) {
  try {
    const response = await fetch(request);
    if (response.ok) (await caches.open(SHELL_CACHE)).put(request, response.clone());
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    const shell = await caches.match("/");
    if (shell) return shell;
    return new Response(
      `<!DOCTYPE html><html><body><p style="font-family:sans-serif;padding:2rem;color:#888">You're offline. Open Loop when you're back online.</p></body></html>`,
      { headers: { "Content-Type": "text/html" } }
    );
  }
}
