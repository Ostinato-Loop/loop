import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

// B0: BLACK SCREEN FIX — 2026-06-07
// Root cause: createClient("") throws "supabaseKey is required." at module init.
// When VITE_SUPABASE_PUBLISHABLE_KEY is empty (secret name mismatch in deploy.yml),
// the entire module tree fails to import and React never mounts.
// Fix: try both env var names + use a stub placeholder instead of empty string.
// The stub is non-empty so createClient doesn't throw; Supabase requests return
// 401 which the UI handles gracefully (error/empty state is shown, not black).
const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL ??
  "https://onxdcikfttdmnhofsuwo.supabase.co";

// Try both possible env var names (deploy.yml used to inject wrong name)
const SUPABASE_PUBLISHABLE_KEY =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  null;

if (!SUPABASE_PUBLISHABLE_KEY) {
  console.warn(
    "[supabase] VITE_SUPABASE_PUBLISHABLE_KEY is not set.\n" +
    "Supabase queries will return 401 until the secret is configured.\n" +
    "Fix: set VITE_SUPABASE_PUBLISHABLE_KEY = <anon key> in\n" +
    "Cloudflare Pages → Settings → Environment variables → Redeploy.\n" +
    "Secret source: Supabase Dashboard → project onxdcikfttdmnhofsuwo → Settings → API → anon/public key"
  );
}

// Use placeholder (non-empty) when key is missing so createClient does not throw.
// All Supabase requests will return 401; the UI handles this gracefully.
const _key = SUPABASE_PUBLISHABLE_KEY ?? "__missing_key_see_console_warn__";

// Public client — anon key, no user context. Use for public reads only.
export const supabase = createClient<Database>(SUPABASE_URL, _key, {
  auth: {
    storage: localStorage,
    persistSession: false,
    autoRefreshToken: false,
  },
  global: {
    headers: {},
  },
});

/**
 * Returns the in-memory Loop session token, or null if not signed in.
 *
 * COOKIE-001 (2026-06-09): Token migrated from localStorage["loop_token"] to
 *   an in-memory session store (session-store.ts). The HttpOnly loop_session
 *   cookie is the durable store; the in-memory token is the runtime accessor.
 *
 * CRASH-001 (2026-06-13): The old implementation read localStorage["loop_token"]
 *   which is always null post-COOKIE-001. This caused Supabase realtime to run
 *   unauthenticated (empty auth token), breaking notification subscriptions.
 *   Fix: read from the in-memory session store instead; fall back to localStorage
 *   only for legacy token compatibility during transition.
 *
 * Tokens are signed by the Loop worker (RALD_JWT_SECRET). Supabase validates
 * them when the project's JWT secret is set to the same value, enabling
 * auth.uid() to resolve to the user's ID inside RLS policies.
 */
export function getLoopToken(): string | null {
  // COOKIE-001: Primary source is the in-memory session store
  try {
    // Dynamic import avoided — read module-level export via window-attached ref
    // set by session-store.ts on every setSessionToken() call.
    const inMemory = (window as Window & { __loopSessionToken?: string | null }).__loopSessionToken;
    if (inMemory) return inMemory;
    // Legacy fallback: loop_token in localStorage (pre-COOKIE-001 sessions)
    return localStorage.getItem("loop_token");
  } catch {
    return null;
  }
}

/**
 * Returns a Supabase client that includes the user's Loop JWT in the
 * Authorization header. Supabase validates this token against the project's
 * JWT secret and sets auth.uid() to the user's ID, enabling row-level
 * security policies to enforce data ownership.
 *
 * Falls back to the public anon client if no token is available.
 * Use this for all write operations and any read of user-private data.
 */
export function authedSupabase(token?: string | null) {
  const t = token ?? getLoopToken();
  if (!t) return supabase;
  return createClient<Database>(SUPABASE_URL, _key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${t}`,
      },
    },
  });
}
