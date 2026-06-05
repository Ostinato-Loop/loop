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
  