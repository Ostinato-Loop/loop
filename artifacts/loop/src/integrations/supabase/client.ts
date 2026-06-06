import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? "https://onxdcikfttdmnhofsuwo.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "";

if (!SUPABASE_PUBLISHABLE_KEY) {
  console.error(
    "[supabase] VITE_SUPABASE_PUBLISHABLE_KEY is not set.\n" +
    "All Supabase operations (listRooms, createRoom, onboarding) will fail with 401.\n" +
    "Fix: Supabase Dashboard → project onxdcikfttdmnhofsuwo → Settings → API → anon/public key\n" +
    "Then set VITE_SUPABASE_PUBLISHABLE_KEY in Cloudflare Pages → Settings → Environment variables → Redeploy."
  );
}

// Public client — anon key, no user context. Use for public reads only.
export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
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
 * Returns the stored Loop access token, or null if not signed in.
 * Tokens are signed by the Loop worker (RALD_JWT_SECRET). Supabase validates
 * them when the project's JWT secret is set to the same value, enabling
 * auth.uid() to resolve to the user's ID inside RLS policies.
 */
export function getLoopToken(): string | null {
  try {
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
  return createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
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
