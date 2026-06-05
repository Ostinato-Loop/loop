# ERROR_HANDLING_AUDIT.md
  **Project:** Loop — LILCKY STUDIO LIMITED
  **Date:** 2026-06-05
  **Sprint:** RALD Hardening & Reliability

  ---

  ## Audit Summary

  Users must never see SQL errors, database names, table names, stack traces,
  or internal worker errors. This document records every error surface found
  and what was done about it.

  ---

  ## 1. Raw Supabase errors reaching the UI — FIXED

  ### Before

  `listRooms()` and `createRoom()` in `src/lib/api/rooms.ts` threw raw Supabase
  error objects directly. The discover page rendered them verbatim:

  ```tsx
  {error && <p className="text-sm text-destructive">{error}</p>}
  ```

  A real user would see:
  ```
  Could not find the table 'public.rooms' in the schema cache — PGRST205
  ```

  or
  ```
  insert or update on table "rooms" violates foreign key constraint
  "rooms_host_id_fkey" on table "profiles" — 23503
  ```

  ### After

  **`src/lib/api/rooms.ts` — `sanitiseRoomError()` added:**

  | Error code | What happened | What user sees |
  |---|---|---|
  | PGRST205 | Schema cache miss | `listRooms` → silent `[]`; `createRoom` → "Service temporarily unavailable. Try again shortly." |
  | 42501 | RLS permission denied | "You don't have permission to perform this action." |
  | 23503 | FK violation (profile missing) | "Your profile isn't set up yet. Please complete onboarding first." |
  | 23505 | Duplicate key | "A room with these details already exists." |
  | Any other | Unknown Supabase/Postgres error | "Something went wrong. Please try again." |

  **`src/pages/discover.tsx` — error display upgraded:**

  ```tsx
  // Before — raw text, no context
  {error && <p className="text-sm text-destructive">{error}</p>}

  // After — styled warning banner
  {error && (
    <div className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 flex items-center gap-2.5">
      <span className="text-base" aria-hidden>⚠️</span>
      <p className="text-sm font-medium text-destructive">{error}</p>
    </div>
  )}
  ```

  ---

  ## 2. Identity mismatch causing FK violation on every room creation — FIXED

  ### Before

  The RALD SSO bridge (`rald-sso.ts`) created the Loop profile with
  `id = supabaseId` (Supabase Auth UUID) but the RALD JWT carried
  `rald.id` (RALD system UUID). These are two different UUIDs.

  When `createRoom(user.id, ...)` was called:
  - `user.id` = `rald.id` (RALD UUID, e.g. `a1b2c3d4-...`)
  - `host_id` in INSERT = `a1b2c3d4-...`
  - Profile in DB = `id: "f5e6d7c8-..."` (Supabase UUID)
  - Result: **FK violation on every room creation attempt**

  The raw error (`23503 violates foreign key constraint`) would have reached
  the user as "Your profile isn't set up yet" (after sanitiseRoomError). But
  the real cause was an invisible identity mismatch, not a missing profile.

  ### After

  `rald-sso.ts` — `upsertProfile()` now uses `id = rald.id`:

  ```typescript
  const profile: Record<string, unknown> = { id: rald.id }; // ← was: supabaseId
  ```

  Identity axiom established:
  - `profiles.id` = `rald.id`
  - `user.id` (frontend) = `rald.id`
  - `host_id` (createRoom) = `rald.id`
  - All three point to the same UUID. No mismatch.

  Profile upsert is also now idempotent (`Prefer: resolution=merge-duplicates`)
  so repeat logins don't fail silently.

  **Verified live:** Profile INSERT (201) → Room INSERT with same UUID as host_id (201) → Participant INSERT (201). Full create-room flow operational.

  ---

  ## 3. Fake data surfaces that mislead users — FIXED

  ### Messages page

  Before: hardcoded conversations (Maya Okonkwo, Chidi Eze, Fatima Al-Hassan,
  Kwame Mensah, etc.) shown to every user as if they were real.

  After: honest empty states.
  - Direct tab: "Your conversations live in RALD Messenger" + link to messenger.rald.cloud
  - Rooms tab: "Once you join or host a room, your room chats will appear here" + discover CTA

  ### Create sheet (+ button)

  Before: 6 create options shown as equally available. Clicking Discussion, Event,
  Community, Post, or Article silently showed the "Start a room" form with no
  explanation — completely disorienting.

  After:
  - Audio Room: fully live, no badge
  - Discussion, Event, Community, Post, Article: dimmed with "Soon" badge
  - Clicking a coming-soon type shows an honest placeholder page:
    "`Discussion — Public threaded discussions are coming soon.`"
    with a CTA to start a room instead

  ---

  ## 4. Worker error handler — VERIFIED SAFE

  `artifacts/cloudflare-worker/src/index.ts`:

  ```typescript
  app.onError((err, c) => {
    console.error("[loop-api]", err);
    return c.json(
      { error: c.env.ENVIRONMENT === "production" ? "Internal error" : err.message },
      500,
    );
  });
  ```

  In production: users see `{"error":"Internal error"}` — safe.
  In development: developers see the real message — useful.

  ---

  ## 5. SSO error surface — VERIFIED SAFE

  `src/hooks/use-auth.tsx`:

  ```typescript
  const msg = err.error ?? `RALD SSO failed (${res.status})`;
  console.error("[rald-sso] exchange rejected:", msg);
  setSsoError(msg);
  ```

  The `ssoError` string is available to components but is set to the API response
  message, not a raw stack trace. The worker `/api/auth/rald-sso` only ever returns:
  - `"rald_token is required"`
  - `"Invalid or expired RALD token"`

  Both are user-safe.

  ---

  ## 6. Remaining error gaps (not yet addressed)

  | Surface | Gap | Priority |
  |---|---|---|
  | `onboarding.tsx` catch block | `toast.error(err.message)` — may expose raw Supabase error text | Medium |
  | `/api/auth/me` endpoint | Returns raw profile from Supabase; if profile query fails, error shape is unspecified | Low |
  | `room-launch.tsx` / `feed.tsx` | Not yet audited for raw error exposure | Medium |
  | Realtime / WebSocket errors | Not yet handled; Supabase Realtime errors surface to console only | Low |

  ---

  ## Verification Evidence

  All fixes verified against live Supabase instance `onxdcikfttdmnhofsuwo`:

  ```
  Profile INSERT (rald.id)            → 201 ✅
  Profile upsert (repeat, idempotent) → 200 ✅
  Room INSERT (host_id = rald.id)     → 201 ✅ (room 45ed5724)
  Participant INSERT                  → 201 ✅
  ```

  End-to-end room creation flow confirmed operational.
  