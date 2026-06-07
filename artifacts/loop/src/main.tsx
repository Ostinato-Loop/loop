// Loop — App entry point
// P0-FIX-004: Global offline/online detection.
// Shows a persistent banner when the user loses connectivity.
// LILCKY STUDIO LIMITED

import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// ── Offline detection banner ──────────────────────────────────────────
let offlineBanner: HTMLDivElement | null = null;

function showOfflineBanner() {
  if (offlineBanner) return;
  offlineBanner = document.createElement("div");
  offlineBanner.id = "loop-offline-banner";
  offlineBanner.textContent = "You're offline — check your connection";
  Object.assign(offlineBanner.style, {
    position: "fixed",
    top: "0",
    left: "0",
    right: "0",
    zIndex: "9999",
    background: "#1a1a1a",
    color: "#f1f1f1",
    fontSize: "13px",
    fontWeight: "600",
    textAlign: "center",
    padding: "10px 16px",
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

// Show immediately if already offline (e.g., page loaded while offline)
if (!navigator.onLine) showOfflineBanner();

// ── React root ────────────────────────────────────────────────────────
createRoot(document.getElementById("root")!).render(<App />);
