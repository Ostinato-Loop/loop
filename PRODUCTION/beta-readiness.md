# PRODUCTION: Loop Public Beta Readiness Assessment
**LILCKY STUDIO LIMITED · 2026-06-07**

---

## Verdict: ⚠️ NOT READY — 8 blockers must be cleared first

Loop has a solid technical foundation. The Cloudflare Worker, Supabase, LiveKit, and Cloudflare Pages deploy pipeline are all architecturally sound. But 8 specific issues prevent a public beta launch. All are fixable without major rework.

---

## Blocker 1 — Broken Profile Stats (P0)

**What:** `me.tsx` hardcodes `"0"` for Rooms, Followers, Following.
**Impact:** Every user sees `0 0 0` on their profile even if they've joined 10 rooms and have 50 followers. Destroys credibility. Screenshots circulate.
**Fix:** Fetch from `/api/follows/me/counts` (Worker endpoint exists and works). Wire in `useEffect` on profile page.
**Effort:** 1 hour

---

## Blocker 2 — Trust Center Shows Wrong Content (P0)

**What:** `/trust-center` shows a bug/abuse reporting menu. A user's trust score is never shown anywhere in the app.
**Impact:** The core product differentiator is invisible. "Trust Score" is a marketing promise Loop cannot currently demonstrate to any user.
**Fix:** Redesign Trust Center first screen: show computed `getTrustLevel(computeTrustScore(profile))` score + level + progress. Reporting moves to secondary section.
**Effort:** 1 day

---

## Blocker 3 — Login RALD Redirect Unexplained (P0)

**What:** Login page shows "Signing you in" then silently redirects to `profiles.rald.cloud` — an unknown domain to the user.
**Impact:** Moderate-to-low tech literacy users abandon at login. Estimated 40–60% drop-off before reaching onboarding.
**Fix:** Show one sentence: "Loop uses RALD to verify your identity. You'll be back in 30 seconds." before the redirect.
**Effort:** 30 minutes

---

## Blocker 4 — Onboarding Dead End When No Live Rooms (P0)

**What:** Onboarding final step ("Jump into a room") shows "No live rooms right now — check back soon" with no alternative action.
**Impact:** Any user who completes onboarding when no rooms are live has literally nothing to do. They close the app. For early beta (low room density), this is most users.
**Fix:** Show 3 alternatives: Join regional community / Complete profile / Invite someone. See `empty-state-elimination.md` for spec.
**Effort:** 2 hours

---

## Blocker 5 — JWT Unicode Bug (P0 — Worker)

**What:** `signJwt` in `lib/jwt.ts` used `btoa(JSON.stringify(payload))`. `btoa()` only handles Latin-1. Any email or name with Unicode characters (common in Africa, the Arab world) throws DOMException, crashing the auth flow.
**Status:** ✅ FIXED in this commit — `base64urlEncode()` added using `TextEncoder`.
**Impact if not fixed:** Any user with a non-ASCII email/name cannot authenticate.

---

## Blocker 6 — CORS Wildcard + Credentials Bug (P0 — Worker)

**What:** `corsHeaders()` set `Access-Control-Allow-Credentials: true` even when `Allow-Origin` was `*`. The CORS spec (§3.2.3) forbids this. Browsers silently reject such responses.
**Impact:** `/api/auth/silent` (cookie-based token refresh) fails in development (`wrangler dev`) where `CORS_ORIGIN="*"`. Silent refresh never succeeds → users see 401 flashes on page focus.
**Status:** ✅ FIXED in this commit — credentials header now conditional on `origin !== "*"`.

---

## Blocker 7 — Brittle Supabase Private Property Access (P1 — Worker)

**What:** `routes/regions.ts` and `routes/activation.ts` used `createClient()` then extracted private internal properties via `as unknown as { supabaseUrl: string }`. These property names are undocumented Supabase internals.
**Impact if they change:** `regions` and `activation` routes silently return 500 — region search, community auto-join, and first-room cascade all break.
**Status:** ✅ FIXED in this commit — routes now use direct `fetch()` with url/key from env.
**Effort:** Done.

---

## Blocker 8 — Profile Settings Items Non-Functional (P0 — UX)

**What:** Settings list on `/me` page (Notifications, Language, Privacy, Audio quality) has no `onClick` handlers — items look tappable but do nothing.
**Note:** Settings page at `/settings` IS fully built with 6 real sections. The profile page just doesn't link to it.
**Fix:** On each settings list item, add `onClick={() => navigate("/settings")}`.
**Effort:** 15 minutes

---

## What IS Ready for Beta

| Component | Status | Notes |
|-----------|--------|-------|
| Cloudflare Worker (Hono) | ✅ Ready | Correct architecture, all routes functional |
| Auth: Phone OTP via Termii | ✅ Ready | Rate limiting, abuse logging, JWT issuance |
| Auth: RALD SSO | ✅ Ready | Token validation, profile upsert, re-signing |
| Auth: Token revocation | ✅ Ready | KV-based jti blocklist |
| Supabase D1 + Realtime | ✅ Ready | All migrations documented |
| LiveKit audio rooms | ✅ Ready | JWT signing, requires secrets to be pushed |
| Communities API | ✅ Ready | Full CRUD, membership, moderation |
| Follows/relationship graph | ✅ Ready | Follow, unfollow, counts, lists |
| Moderation | ✅ Ready | Report user/room/message, block |
| Region search | ✅ Ready | RPC + ILIKE fallback |
| Community activation | ✅ Ready | Auto-join, first-room cascade, home feed |
| CI: lockfile check | ✅ Ready | New workflow added in this commit |
| Cloudflare Pages deploy | ✅ Ready | Build + deploy pipeline in deploy.yml |
| Feed UI | ✅ Ready | Category filters, interest recommendations |
| Discover UI | ⚠️ Partial | Dead "coming soon" sections |
| Communities UI | ✅ Ready | Join, search, regional indicator |
| Notifications UI | ✅ Ready | Real follower data + synthetic nudges |
| Room creation | ✅ Ready | `/create` route accessible |
| Push notifications | ⚠️ Partial | Prompt exists but not shown during onboarding |
| Settings page | ✅ Ready | All 6 sections fully functional |
| Trust Center | ❌ Not ready | Wrong content (see Blocker 2) |
| Profile stats | ❌ Not ready | Hardcoded zeros (see Blocker 1) |
| Profile settings link | ❌ Not ready | Dead list items (see Blocker 8) |

---

## Secrets Verification Checklist

Before beta launch, verify ALL secrets are pushed to the worker production environment:

```bash
cd artifacts/cloudflare-worker
pnpm exec wrangler secret list --env production
```

Must show:
- [ ] `RALD_JWT_SECRET`
- [ ] `SUPABASE_SERVICE_ROLE_KEY`
- [ ] `TERMII_API_KEY`
- [ ] `TERMII_SENDER_ID`
- [ ] `LIVEKIT_API_KEY`
- [ ] `LIVEKIT_API_SECRET`
- [ ] `LIVEKIT_URL`

And verify these GitHub Secrets exist (for CI deploy):
- [ ] `CLOUDFLARE_API_TOKEN`
- [ ] `CLOUDFLARE_ACCOUNT_ID`
- [ ] `RALD_JWT_SECRET`
- [ ] `SUPABASE_SERVICE_ROLE_KEY`
- [ ] `SUPABASE_ANON_KEY`
- [ ] `SUPABASE_URL`
- [ ] `TERMII_API_KEY`
- [ ] `TERMII_SENDER_ID`
- [ ] `LIVEKIT_API_KEY`
- [ ] `LIVEKIT_API_SECRET`
- [ ] `LIVEKIT_URL`

---

## DNS Verification Checklist

- [ ] `loop.rald.cloud` → Cloudflare Pages (orange cloud proxied)
- [ ] `loop-api.rald.cloud` → Cloudflare Worker route (orange cloud proxied)
- [ ] `auth.rald.cloud` → RALD SSO service (accessible)
- [ ] `profiles.rald.cloud` → RALD Profiles service (accessible)

---

## Beta Launch Order of Operations

1. Clear Blockers 1, 3, 4, 8 (code changes — ~4 hours total)
2. Redesign Trust Center (Blocker 2 — ~1 day)
3. Deploy: `git push origin main` → CI runs → worker + pages deploy
4. Verify secrets are set: `wrangler secret list --env production`
5. Apply D1 migrations: `wrangler d1 migrations apply loop-db --env production`
6. Run smoke test checklist (see `worker-configuration-guide.md`)
7. Test full onboarding flow on a real phone
8. Test room creation and joining
9. Verify trust score appears on profile
10. **Go live**

---

## Estimated Time to Beta

| Task | Hours |
|------|-------|
| Fix profile stats (Blocker 1) | 1h |
| Fix login RALD explanation (Blocker 3) | 0.5h |
| Fix onboarding empty room step (Blocker 4) | 2h |
| Fix profile settings link (Blocker 8) | 0.25h |
| Trust Center redesign (Blocker 2) | 8h |
| Remove "coming soon" from Discover | 1h |
| End-to-end QA on real phone | 2h |
| **Total** | **~15 hours** |

---

## Post-Beta (V2 Priorities)

After public beta is stable:
1. Regional onboarding step (country + state + LGA)
2. Room share links
3. Invite a friend feature
4. Community detail page
5. Trust score on profile
6. Push notification strategy
7. Swipe gestures (see `FOUNDATION/swipe-experience.md`)
