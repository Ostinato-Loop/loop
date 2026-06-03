/**
 * RALD Cross-App SSO Navigation
 *
 * Resolves WS1-F2 / WS3-F1: when a Loop user navigates to Messenger, Profiles,
 * or any other RALD app, their session is passed via the rald_master_token so
 * they land directly on the destination page without re-authenticating.
 *
 * Usage:
 *   import { openMessenger } from "@/lib/cross-app";
 *   <button onClick={() => openMessenger("/chats")}>Open Messenger</button>
 */

export const RALD_APPS = {
  loop:      "https://loop.rald.cloud",
  messenger: "https://messenger.rald.cloud",
  profiles:  "https://profiles.rald.cloud",
  business:  "https://business.rald.cloud",
  payrald:   "https://payrald.rald.cloud",
} as const;

export type RaldAppId = keyof typeof RALD_APPS;

const RALD_TOKEN_KEY = "rald_master_token";
const RALD_AUTH_UI   = "https://accounts.rald.cloud";

function getRaldToken(): string | null {
  return localStorage.getItem(RALD_TOKEN_KEY);
}

function isTokenAlive(token: string): boolean {
  try {
    const [, b64] = token.split(".");
    const p = JSON.parse(atob(b64.replace(/-/g, "+").replace(/_/g, "/"))) as { exp?: number };
    return !p.exp || p.exp > Date.now() / 1000;
  } catch { return false; }
}

/**
 * Navigate to any RALD app with cross-app SSO.
 * If the user has a valid rald_master_token, passes it directly.
 * Otherwise routes through accounts.rald.cloud for sign-in/sign-up.
 */
export function openRaldApp(appId: RaldAppId, path = "/"): void {
  const appUrl    = RALD_APPS[appId];
  const raldToken = getRaldToken();

  if (raldToken && isTokenAlive(raldToken)) {
    const dest = `${appUrl}${path}?rald_token=${encodeURIComponent(raldToken)}&app_id=${appId}`;
    window.location.href = dest;
  } else {
    const redirectTo = encodeURIComponent(`${appUrl}${path}`);
    window.location.href = `${RALD_AUTH_UI}?redirect_to=${redirectTo}&app_id=${appId}`;
  }
}

export const openMessenger = (path = "/chats") => openRaldApp("messenger", path);
export const openProfiles  = (path = "/")      => openRaldApp("profiles",  path);
export const openBusiness  = (path = "/")      => openRaldApp("business",  path);
export const openPayRald   = (path = "/")      => openRaldApp("payrald",   path);
