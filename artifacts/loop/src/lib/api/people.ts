/**
 * Loop People Discovery — API Client
 *
 * Calls rald-auth-core endpoints to power two surfaces:
 *   1. GET /search/related  — ranked people search (auth required)
 *   2. GET /graph/suggestions — "People you may know" (friends-of-friends)
 *
 * Auth: uses the RALD master token (rald_master_token) stored by the
 * cross-app SSO flow. If the user has no master token they are not connected
 * to the RALD identity graph and only empty results are returned.
 *
 * LILCKY STUDIO LIMITED
 */

const RALD_CORE_URL  = (import.meta.env.VITE_RALD_CORE_URL as string | undefined) ?? "https://auth.rald.cloud";
const RALD_TOKEN_KEY = "rald_master_token";

function getRaldToken(): string | null {
  try { return localStorage.getItem(RALD_TOKEN_KEY); }
  catch { return null; }
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type PersonResult = {
  user_id:          string;
  username:         string | null;
  display_name:     string | null;
  avatar_url:       string | null;
  is_verified:      boolean;
  connection_score: number;
  rald_id:          string;
};

export type PersonSuggestion = {
  user_id:      string;
  username:     string | null;
  display_name: string | null;
  avatar_url:   string | null;
  is_verified:  boolean;
  mutual_score: number;
  rald_id:      string;
};

// ── GET /search/related ───────────────────────────────────────────────────────

/**
 * Search for people the authenticated user actually knows, ranked by
 * relationship closeness (shared chats > contacts > mutual connections > shared rooms).
 *
 * @param query  Search string (username / display name prefix)
 * @param limit  Max results (1–50, default 20)
 * @returns      Ranked array of PersonResult
 */
export async function searchRelatedPeople(
  query: string,
  limit = 20,
): Promise<PersonResult[]> {
  const token = getRaldToken();
  if (!token) return [];

  const url = new URL(`${RALD_CORE_URL}/search/related`);
  url.searchParams.set("q",     query);
  url.searchParams.set("limit", String(Math.min(limit, 50)));

  const r = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) throw new Error(`[people] /search/related → ${r.status}`);

  const j = await r.json() as { results: PersonResult[]; count: number };
  return j.results ?? [];
}

// ── GET /graph/suggestions ────────────────────────────────────────────────────

/**
 * "People you may know" — friends-of-friends ranked by aggregated
 * connection_score across all paths.
 *
 * @param limit  Max results (1–50, default 10)
 * @returns      Ranked array of PersonSuggestion
 */
export async function getPeopleSuggestions(limit = 10): Promise<PersonSuggestion[]> {
  const token = getRaldToken();
  if (!token) return [];

  const url = new URL(`${RALD_CORE_URL}/graph/suggestions`);
  url.searchParams.set("limit", String(Math.min(limit, 50)));

  const r = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) throw new Error(`[people] /graph/suggestions → ${r.status}`);

  const j = await r.json() as { suggestions: PersonSuggestion[]; count: number };
  return j.suggestions ?? [];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns true if the current user has a RALD identity token (connected to graph). */
export function hasRaldIdentity(): boolean {
  return getRaldToken() !== null;
}
