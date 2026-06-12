/**
 * UsernameSetupDialog — USN-001 (2026-06-12)
 *
 * Shown ONCE when the user is authenticated but has no @username.
 * This happens for:
 *   • Email-only users whose JWT never carried a username claim
 *   • Legacy phone users who skipped the onboarding username step
 *   • Any user whose username was wiped by the (now-fixed) email-slug bug
 *
 * On success: calls refreshProfile() so the rest of the app updates immediately.
 * Never shown again once profile.username is non-null.
 *
 * The claim hits POST /api/auth/username/claim (loop worker) → forwards to
 * rald-auth-core with the user's Bearer token (USN-001 fix) → canonical claim.
 */

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/use-auth";
import { authFetch } from "@/lib/api-fetch";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

export function UsernameSetupDialog() {
  const { user, profile, loading, refreshProfile } = useAuth();
  const [open, setOpen]             = useState(false);
  const [username, setUsername]     = useState("");
  const [checking, setChecking]     = useState(false);
  const [available, setAvailable]   = useState<boolean | null>(null);
  const [availReason, setAvailReason] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [done, setDone]             = useState(false);

  useEffect(() => {
    if (!loading && user && profile !== null && !profile.username && !done) {
      setOpen(true);
    } else if (profile?.username) {
      setOpen(false);
    }
  }, [loading, user, profile, done]);

  // Debounced availability check
  useEffect(() => {
    if (!username || username.length < 2) { setAvailable(null); setAvailReason(null); return; }
    const timer = setTimeout(async () => {
      setChecking(true);
      try {
        const res = await fetch(
          `${API_BASE}/api/auth/username/check/${encodeURIComponent(username)}`,
          { credentials: "include" },
        );
        if (res.ok) {
          const data = await res.json() as { available: boolean; reason?: string | null };
          setAvailable(data.available);
          setAvailReason(data.reason ?? null);
        }
      } catch { setAvailable(null); }
      setChecking(false);
    }, 400);
    return () => clearTimeout(timer);
  }, [username]);

  const handleSubmit = useCallback(async () => {
    if (!available || !username || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await authFetch(`${API_BASE}/api/auth/username/claim`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ username }),
      });
      if (res.ok) {
        setDone(true);
        setOpen(false);
        await refreshProfile();
      } else {
        const data = await res.json().catch(() => ({})) as { error?: string };
        setError(data.error ?? "Could not claim username — please try another.");
      }
    } catch {
      setError("Network error — please try again.");
    }
    setSubmitting(false);
  }, [available, username, submitting, refreshProfile]);

  if (!open) return null;

  const teal  = "#2ECFA3";
  const dark  = "#0A1F16";
  const panel = "#0F2019";
  const muted = "#8aab99";
  const border = "#1e4030";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Claim your @username"
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "rgba(0,0,0,0.75)", backdropFilter: "blur(6px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "1rem",
      }}
    >
      <div style={{
        background: panel, border: `1px solid ${border}`, borderRadius: 20,
        padding: "2rem 1.75rem", width: "100%", maxWidth: 400,
        boxShadow: "0 24px 64px rgba(0,0,0,0.55)",
      }}>
        {/* Logo mark */}
        <div style={{ display: "flex", gap: 2, alignItems: "center", marginBottom: "1.5rem" }}>
          <span style={{ fontSize: 22, fontWeight: 900, color: "#FFF", fontFamily: "system-ui" }}>L</span>
          <span style={{ fontSize: 22, fontWeight: 900, color: teal,  fontFamily: "system-ui" }}>O</span>
          <span style={{ fontSize: 22, fontWeight: 900, color: "#FFF", fontFamily: "system-ui" }}>OP</span>
        </div>

        <h2 style={{ color: "#FFF", fontWeight: 800, fontSize: 22, margin: "0 0 8px", fontFamily: "system-ui" }}>
          Claim your @username
        </h2>
        <p style={{ color: muted, fontSize: 14, margin: "0 0 1.5rem", fontFamily: "system-ui", lineHeight: 1.55 }}>
          Your username is your identity across Loop, Messenger, and the full RALD ecosystem.
          Set it once — you can change it later, but only once every 30 days.
        </p>

        {/* Input */}
        <div style={{ position: "relative", marginBottom: "0.5rem" }}>
          <span style={{
            position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)",
            color: teal, fontSize: 16, fontWeight: 700, pointerEvents: "none",
            fontFamily: "system-ui",
          }}>@</span>
          <input
            value={username}
            onChange={e => {
              const v = e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 20);
              setUsername(v);
              setAvailable(null);
              setError(null);
            }}
            onKeyDown={e => { if (e.key === "Enter") handleSubmit(); }}
            placeholder="yourname"
            maxLength={20}
            autoFocus
            style={{
              width: "100%", boxSizing: "border-box",
              background: "#0a1a11",
              border: `1.5px solid ${available === true ? teal : available === false ? "#ef4444" : border}`,
              borderRadius: 12, padding: "0.75rem 0.75rem 0.75rem 2.2rem",
              color: "#FFF", fontSize: 16, fontFamily: "system-ui", outline: "none",
              transition: "border-color 0.15s",
            }}
          />
        </div>

        {/* Availability / error feedback */}
        <div style={{ minHeight: 20, marginBottom: "0.75rem" }}>
          {checking && (
            <p style={{ color: muted, fontSize: 13, margin: 0, fontFamily: "system-ui" }}>Checking availability…</p>
          )}
          {!checking && available === true && !error && (
            <p style={{ color: teal, fontSize: 13, margin: 0, fontFamily: "system-ui" }}>✓ @{username} is available</p>
          )}
          {!checking && available === false && (
            <p style={{ color: "#ef4444", fontSize: 13, margin: 0, fontFamily: "system-ui" }}>
              {availReason ?? "Username already taken"}
            </p>
          )}
          {error && (
            <p style={{ color: "#ef4444", fontSize: 13, margin: 0, fontFamily: "system-ui" }}>{error}</p>
          )}
        </div>

        {/* Namespace preview */}
        {available === true && (
          <div style={{
            background: "#0a1a11", borderRadius: 10, padding: "0.75rem 1rem",
            marginBottom: "1.25rem", border: `1px solid ${border}`,
          }}>
            <p style={{ color: muted, fontSize: 12, fontFamily: "system-ui", margin: 0, lineHeight: 1.7 }}>
              Claiming @{username} also reserves:<br />
              <span style={{ color: teal }}>✉ {username}@rald.me</span>{" "}
              <span style={{ color: "#4a7a5a", fontSize: 11 }}>(RALD email alias)</span><br />
              <span style={{ color: teal }}>🌐 {username}.rald.me</span>{" "}
              <span style={{ color: "#4a7a5a", fontSize: 11 }}>(profile URL)</span>
            </p>
          </div>
        )}

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={!available || submitting || !username}
          style={{
            width: "100%", padding: "0.875rem", borderRadius: 14, border: "none",
            cursor: (available && !submitting) ? "pointer" : "not-allowed",
            background: (available && !submitting) ? teal : "#1a3a2a",
            color: (available && !submitting) ? dark : "#4a7a5a",
            fontWeight: 800, fontSize: 16, fontFamily: "system-ui",
            transition: "background 0.15s, color 0.15s",
          }}
        >
          {submitting ? "Claiming…" : username ? `Claim @${username}` : "Claim your @username"}
        </button>

        <p style={{ color: "#4a7a5a", fontSize: 11, textAlign: "center", margin: "1rem 0 0", fontFamily: "system-ui" }}>
          Username changes are allowed once every 30 days.
        </p>
      </div>
    </div>
  );
}
