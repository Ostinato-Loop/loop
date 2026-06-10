// Loop — App entry point
// MOBILE-001 (2026-06-09): Service worker registration for PWA + offline shell.
// PUSH-001   (2026-06-10): OneSignal init for push notifications.
// P0-FIX-004: Global offline/online detection.
// LILCKY STUDIO LIMITED

import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import OneSignal from "react-onesignal";

// ── Offline detection banner ──────────────────────────────────────────────
let offlineBanner: HTMLDivElement | null = null;

function showOfflineBanner() {
  if (offlineBanner) return;
  offlineBanner = document.createElement("div");
  offlineBanner.id = "loop-offline-banner";
  offlineBanner.textContent = "You're offline — check your connection";
  Object.assign(offlineBanner.style, {
    position:     "fixed",
    top:          "0",
    left:         "0",
    right:        "0",
    zIndex:       "9999",
    background:   "#1a1a1a",
    color:        "#f1f1f1",
    fontSize:     "13px",
    fontWeight:   "600",
    textAlign:    "center",
    padding:      "10px 16px",
    borderBottom: "1px solid rgba(255,255,255,0.08)",
  });
  document.body.prepend(offlineBanner);
}

function hideOfflineBanner() {
  if (!offlineBanner) return;
  offlineBanner.remove();
  offlineBanner = null;
}

window.addEventListener("offline", showOfflineBanner);
window.addEventListener("online",  hideOfflineBanner);
if (!navigator.onLine) showOfflineBanner();

// ── React root ────────────────────────────────────────────────────────────
createRoot(document.getElementById("root")!).render(<App />);

// ── OneSignal init (PUSH-001) ─────────────────────────────────────────────
// Initialise after render so it never delays first paint.
// App ID loaded from VITE_ONESIGNAL_APP_ID env var.
// External user ID is set separately in usePush after auth (see use-push.tsx).
const ONESIGNAL_APP_ID = import.meta.env.VITE_ONESIGNAL_APP_ID as string | undefined;

if (ONESIGNAL_APP_ID) {
  window.addEventListener("load", () => {
    OneSignal.init({
      appId:                        ONESIGNAL_APP_ID,
      serviceWorkerPath:            "OneSignalSDKWorker.js",
      serviceWorkerParam:           { scope: "/" },
      // Don't show OneSignal's default bell widget — we use PushPromptBanner
      notifyButton:                 { enable: false },
      // Allow localhost during development
      allowLocalhostAsSecureOrigin: import.meta.env.DEV,
    }).catch(() => {
      // OneSignal init failure is non-fatal — app works without push
    });
  });
}

// ── App shell service worker (MOBILE-001) ─────────────────────────────────
// Registers sw.js for offline caching. OneSignalSDKWorker.js is registered
// automatically by the OneSignal SDK above.
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((reg) => {
        setInterval(() => reg.update().catch(() => {}), 60_000);
      })
      .catch(() => {});
  });
}
