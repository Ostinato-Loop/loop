/**
   * Loop People Discovery — API Client
   *
   * Calls rald-auth-core endpoints to power two surfaces:
   *   1. GET /search/related  — ranked people search (auth required)
   *   2. GET /graph/suggestions — "People you may know" (friends-of-friends)
   *
   * Auth: uses the in-memory session token from session-store.
   * COOKIE-001 (2026-06-09): rald_master_token removed from localStorage.
   * getSessionToken() is now the single source of truth for auth state.
   *
   * LILCKY STUDIO LIMITED
   */

  import { getSessionToken } from "@/lib/session-store";

  const RALD_CORE_URL  = (import.meta.env.VITE_RALD_CORE_URL as string | undefined) ?? "https://auth.rald.cloud";

  function safeError(ctx: string, status: number): Error {
    if (status === 401 || status === 403) return new Error("Session expired. Please sign in again.");
    if (status === 404) return new Error("People search is not available yet.");
    if (status === 429) return new Error("Too many requests. Try again in a moment.");
    if (status >= 500) return new Error("Server error. Try again shortly.");
    return new Error("Could not load people. Please try again.");
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

  export async function searchRelatedPeople(
    query: string,
    limit = 20,
  ): Promise<PersonResult[]> {
    const token = getSessionToken();
    if (!token) return [];

    const url = new URL(`${RALD_CORE_URL}/search/related`);
    url.searchParams.set("q",     query);
    url.searchParams.set("limit", String(Math.min(limit, 50)));

    let r: Response;
    try {
      r = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
    } catch {
      throw new Error("Network error. Check your connection and try again.");
    }

    if (r.status === 404) {
      console.warn("[people] /search/related endpoint not found — returning []");
      return [];
    }
    if (!r.ok) throw safeError("/search/related", r.status);

    const j = await r.json() as { results: PersonResult[]; count: number };
    return j.results ?? [];
  }

  // ── GET /graph/suggestions ────────────────────────────────────────────────────

  export async function getPeopleSuggestions(limit = 10): Promise<PersonSuggestion[]> {
    const token = getSessionToken();
    if (!token) return [];

    const url = new URL(`${RALD_CORE_URL}/graph/suggestions`);
    url.searchParams.set("limit", String(Math.min(limit, 50)));

    let r: Response;
    try {
      r = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
    } catch {
      throw new Error("Network error. Check your connection and try again.");
    }

    if (r.status === 404) {
      console.warn("[people] /graph/suggestions endpoint not found — returning []");
      return [];
    }
    if (!r.ok) throw safeError("/graph/suggestions", r.status);

    const j = await r.json() as { suggestions: PersonSuggestion[]; count: number };
    return j.suggestions ?? [];
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────

  export function hasRaldIdentity(): boolean {
    return getSessionToken() !== null;
  }
