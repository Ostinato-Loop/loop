// Loop — App entry point
// MOBILE-001 (2026-06-09): Service worker registration for PWA installability and offline shell.
// P0-FIX-004: Global offline/online detection.
// LILCKY STUDIO LIMITED

import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

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

// ── Service Worker registration (MOBILE-001) ──────────────────────────────
// Register after render so it never delays first paint.
// Scope: "/" — handles all Loop routes.
// Update on reload: the SW checks for a new sw.js on every page load;
// if found, it installs and activates on the next navigation.
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((reg) => {
        // Background sync: check for SW update every 60s while app is open
        setInterval(() => reg.update().catch(() => {}), 60_000);
      })
      .catch(() => {
        // SW registration failure is non-fatal — app works without it
      });
  });
}
