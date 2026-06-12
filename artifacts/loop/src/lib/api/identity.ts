/**
 * Loop — RALD Identity Intelligence API Client
 *
 * Thin wrapper around auth.rald.cloud/identity/*.
 * Products call getIdentityIntelligence() before showing any onboarding
 * step or data-collection prompt — RALD never asks for what it already has.
 *
 * The Loop JWT is valid at auth.rald.cloud because both services share
 * RALD_JWT_SECRET (Loop Worker signs → rald-auth-core verifies).
 *
 * LILCKY STUDIO LIMITED · 2026-06-12
 */

import { getSessionToken } from "@/lib/session-store";

const RALD_AUTH = "https://auth.rald.cloud";

export type IdentityIntelligence = {
  username:              boolean;
  username_verified:     boolean;
  email:                 boolean;
  email_verified:        boolean;
  phone:                 boolean;
  phone_verified:        boolean;
  profile_photo:         boolean;
  country:               boolean;
  state:                 boolean;
  city:                  boolean;
  language:              boolean;
  trust_level:           string;
  creator_verified:      boolean;
  business_verified:     boolean;
  civic_verified:        boolean;
  mail_reserved:         boolean;
  mail_address:          string | null;
  completed_onboarding:  boolean;
  _values: {
    username:      string | null;
    email:         string | null;
    phone:         string | null;
    profile_photo: string | null;
    country:       string | null;
    display_name:  string | null;
    bio:           string | null;
  };
};

/** Fetch the full RALD intelligence snapshot for the current user. Returns null on error. */
export async function getIdentityIntelligence(): Promise<IdentityIntelligence | null> {
  const token = getSessionToken();
  if (!token) return null;
  try {
    const res = await fetch(`${RALD_AUTH}/identity/intelligence`, {
      headers: { Authorization: `Bearer ${token}` },
      signal:  AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    return res.json() as Promise<IdentityIntelligence>;
  } catch {
    return null;
  }
}

/** Update a single capability field in identity_capabilities. */
export async function updateIdentityField(field: string, value: unknown): Promise<boolean> {
  const token = getSessionToken();
  if (!token) return false;
  try {
    const res = await fetch(`${RALD_AUTH}/identity/intelligence`, {
      method:  "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body:    JSON.stringify({ field, value }),
      signal:  AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Dismiss an onboarding prompt so it won't re-surface in any RALD product. */
export async function dismissIdentityPrompt(prompt: string): Promise<void> {
  const token = getSessionToken();
  if (!token) return;
  try {
    await fetch(`${RALD_AUTH}/identity/memory/dismiss`, {
      method:  "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body:    JSON.stringify({ prompt }),
      signal:  AbortSignal.timeout(5000),
    });
  } catch { /* non-fatal */ }
}

/** Record the current onboarding step in identity_memory for cross-product resumption. */
export async function recordOnboardingStep(step: string, product = "loop"): Promise<void> {
  const token = getSessionToken();
  if (!token) return;
  try {
    await fetch(`${RALD_AUTH}/identity/memory/step`, {
      method:  "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body:    JSON.stringify({ step, product }),
      signal:  AbortSignal.timeout(5000),
    });
  } catch { /* non-fatal */ }
}

// ── Sprint 3: ONE RALD canonical-redirect helpers ────────────────────

export type IdentityAction =
  | "profile" | "username" | "security" | "sessions" | "devices"
  | "verification" | "recovery" | "developer" | "privacy" | "country"
  | "workspace" | "delete";

const ACTION_PATHS: Record<IdentityAction, string> = {
  profile:      "/account",
  username:     "/account",
  country:      "/account",
  verification: "/account",
  workspace:    "/account",
  security:     "/security",
  sessions:     "/security",
  devices:      "/security",
  privacy:      "/privacy",
  delete:       "/privacy",
  recovery:     "/login",
  developer:    "/developer",
};

/**
 * Resolve the canonical profiles.rald.cloud URL for an identity action.
 * Calls GET /identity/canonical-redirect; falls back to constructing from ACTION_PATHS.
 */
export async function getIdentityCanonicalUrl(
  action: IdentityAction,
  returnTo?: string,
): Promise<string> {
  const token  = getSessionToken();
  const params = new URLSearchParams({ action, app_id: "loop" });
  if (returnTo) params.set("return_to", returnTo);
  try {
    const res = await fetch(`${RALD_AUTH}/identity/canonical-redirect?${params}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      signal:  AbortSignal.timeout(4000),
    });
    if (!res.ok) throw new Error("non-ok");
    const data = await res.json() as { canonical: string };
    return data.canonical;
  } catch {
    const path = ACTION_PATHS[action] ?? "/account";
    const url  = new URL(`https://profiles.rald.cloud${path}`);
    url.searchParams.set("app_id", "loop");
    if (returnTo) url.searchParams.set("return_to", returnTo);
    return url.toString();
  }
}

/**
 * Immediately navigate the user to profiles.rald.cloud for a given identity action.
 * Uses an optimistic direct URL — no network round-trip so the redirect is instant.
 */
export function redirectToIdentity(action: IdentityAction, returnTo?: string): void {
  const rt   = returnTo ?? window.location.href;
  const path = ACTION_PATHS[action] ?? "/account";
  const params = new URLSearchParams({ app_id: "loop", return_to: rt });
  window.location.href = `https://profiles.rald.cloud${path}?${params}`;
}

export type IdentityCapabilities = {
  canonical_identity_host:     string;
  supports_username_change:    boolean;
  supports_email_change:       boolean;
  supports_phone_change:       boolean;
  supports_mfa:                boolean;
  supports_device_management:  boolean;
  supports_session_management: boolean;
  supported_actions:           string[];
};

/**
 * Fetch capability flags so Loop can self-configure which identity actions to surface.
 * See GET /identity/capabilities on rald-auth-core.
 */
export async function getIdentityCapabilities(): Promise<IdentityCapabilities | null> {
  const token = getSessionToken();
  if (!token) return null;
  try {
    const res = await fetch(`${RALD_AUTH}/identity/capabilities`, {
      headers: { Authorization: `Bearer ${token}` },
      signal:  AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    return res.json() as Promise<IdentityCapabilities>;
  } catch {
    return null;
  }
}

