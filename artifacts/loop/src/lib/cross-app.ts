/**
 * RALD Cross-App SSO Navigation
 *
 * Resolves WS1-F2 / WS3-F1: when a Loop user navigates to Messenger, Profiles,
 * or any other RALD app, their session is passed via a short-lived handoff token
 * so they land directly on the destination page without re-authenticating.
 *
 * COOKIE-001 (2026-06-09): rald_master_token removed from localStorage.
 * Cross-app nav now uses POST /api/auth/rald-sso/handoff (5-minute handoff token).
 * getSessionToken() from session-store is the source of truth for auth state.
 *
 * Usage:
 *   import { openMessenger } from "@/lib/cross-app";
 *   <button onClick={() => openMessenger("/chats")}>Open Messenger</button>
 */

import { getSessionToken } from "@/lib/session-store";

export const RALD_APPS = {
  loop:      "https://loop.rald.cloud",
  messenger: "https://chat.rald.cloud",
  profiles:  "https://profiles.rald.cloud",
  business:  "https://business.rald.cloud",
  payrald:   "https://payrald.rald.cloud",
} as const;

export type RaldAppId = keyof typeof RALD_APPS;

const RALD_AUTH_UI = (import.meta.env.VITE_RALD_AUTH_URL as string | undefined) ?? "https://profiles.rald.cloud";
const API_BASE     = (import.meta.env.VITE_API_BASE_URL  as string | undefined) ?? "";

/**
 * Navigate to any RALD app with cross-app SSO.
 *
 * 1. If the user has an active session, gets a 5-minute handoff token from the
 *    Loop Worker and navigates with it.
 * 2. If no session (or handoff fails), falls back to profiles.rald.cloud for
 *    sign-in / registration, preserving the intended destination via redirect_to.
 */
export function openRaldApp(appId: RaldAppId, path = "/"): void {
  const appUrl = RALD_APPS[appId];
  const token  = getSessionToken();

  if (token) {
    fetch(`${API_BASE}/api/auth/rald-sso/handoff`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ app_id: appId, redirect_to: path }),
    })
      .then(res => (res.ok ? res.json() : Promise.reject(new Error(`${res.status}`))) as Promise<{ handoff_token?: string }>)
      .then(data => {
        if (data.handoff_token) {
          window.location.href =
            `${appUrl}${path}?rald_token=${encodeURIComponent(data.handoff_token)}&app_id=${appId}`;
          return;
        }
        throw new Error("no handoff_token");
      })
      .catch(() => {
        // Handoff failed — fall back to re-auth preserving destination
        const redirectTo = encodeURIComponent(`${appUrl}${path}`);
        window.location.href = `${RALD_AUTH_UI}?redirect_to=${redirectTo}&app_id=${appId}`;
      });
  } else {
    const redirectTo = encodeURIComponent(`${appUrl}${path}`);
    window.location.href = `${RALD_AUTH_UI}?redirect_to=${redirectTo}&app_id=${appId}`;
  }
}

export const openMessenger = (path = "/chats") => openRaldApp("messenger", path);
export const openProfiles  = (path = "/")      => openRaldApp("profiles",  path);
export const openBusiness  = (path = "/")      => openRaldApp("business",  path);
export const openPayRald   = (path = "/")      => openRaldApp("payrald",   path);

/**
 * Navigate the user to profiles.rald.cloud for a specific identity action.
 * Uses cross-app SSO handoff so they land already authenticated.
 * Falls back to a direct redirect with return_to context preserved.
 *
 * ONE RALD (Sprint 3): all identity actions must route through canonical-redirect.
 */
export function openIdentityPortal(
  action:   "profile" | "username" | "security" | "sessions" | "devices"
          | "verification" | "recovery" | "developer" | "privacy"
          | "country" | "delete" = "profile",
  returnTo?: string,
): void {
  const pathMap: Record<string, string> = {
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
  const path  = pathMap[action] ?? "/account";
  const rt    = returnTo ?? window.location.href;
  const token = getSessionToken();

  if (token) {
    fetch(`${API_BASE}/api/auth/rald-sso/handoff`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        app_id:      "profiles",
        redirect_to: `${path}?app_id=loop&return_to=${encodeURIComponent(rt)}`,
      }),
    })
      .then(res => (res.ok ? res.json() : Promise.reject()) as Promise<{ handoff_token?: string }>)
      .then(data => {
        if (data.handoff_token) {
          window.location.href = `${RALD_APPS.profiles}${path}?rald_token=${encodeURIComponent(data.handoff_token)}&app_id=loop&return_to=${encodeURIComponent(rt)}`;
          return;
        }
        throw new Error("no token");
      })
      .catch(() => {
        window.location.href = `${RALD_APPS.profiles}${path}?app_id=loop&return_to=${encodeURIComponent(rt)}`;
      });
  } else {
    window.location.href = `${RALD_APPS.profiles}${path}?app_id=loop&return_to=${encodeURIComponent(rt)}`;
  }
}

