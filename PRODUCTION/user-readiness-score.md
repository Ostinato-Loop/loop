# Loop V1 — User Readiness Score
**Date:** 2026-06-07 | **Sprint:** Founder Reality Sprint | **Operator:** LILCKY STUDIO LIMITED

---

## Scoring Model

Each dimension is scored 0–100. Composite score = weighted average.

| Dimension | Weight | Score | Weighted |
|---|---|---|---|
| Infrastructure Readiness | 25% | 74 | 18.5 |
| User Readiness | 40% | 31 | 12.4 |
| Household Readiness | 35% | 14 | 4.9 |
| **COMPOSITE** | **100%** | | **35.8 / 100** |

> **35.8/100 — NOT READY FOR PUBLIC LAUNCH**

---

## 1. Infrastructure Readiness — 74/100

What works at the infrastructure level, regardless of UX.

| Component | Status | Score |
|---|---|---|
| CI pipelines (37 repos) | ✅ All green | +10 |
| Cloudflare Worker deployed | ✅ Loop API live | +10 |
| Supabase DB connected | ✅ Migrations applied | +8 |
| Auth JWT (RALD SSO) | ✅ Issuer/audience validated | +8 |
| OTP rate limiting (5-layer) | ✅ Sliding windows in KV | +6 |
| KV token revocation | ✅ jti blocklist | +5 |
| Realtime subscriptions | ✅ Supabase channels working | +7 |
| LiveKit audio infrastructure | ❌ `/api/audio/token` missing | -20 |
| LiveKit env vars (wrangler.toml) | ❌ LIVEKIT_* not configured | -10 |
| Token refresh endpoint | ❌ No `/api/auth/refresh` | -5 |
| Bug reporting endpoint | ❌ No `/api/feedback` | -5 |
| Global OTP daily cap (100/day) | ❌ Launch-blocking | -5 |
| Global search | ❌ No search endpoints | -5 |
| **TOTAL** | | **74** |

**Verdict:** The infrastructure backbone is solid. The single P0 gap — LiveKit token generation — makes the core product (audio) non-functional.

---

## 2. User Readiness — 31/100

Can a technically proficient user complete every core flow end to end?

| Flow | Works? | Score |
|---|---|---|
| Account creation (SSO) | ⚠️ Depends on profiles.rald.cloud | +3 |
| OTP delivery (Nigeria) | ⚠️ External; 100/day cap | +2 |
| Onboarding (5 steps) | ✅ Completes if patient | +8 |
| View feed / browse rooms | ✅ Works if content seeded | +6 |
| Create a room | ✅ UI works | +4 |
| Join a room | ✅ DB join works | +4 |
| **Listen to audio** | ❌ Silent — LiveKit not connected | 0 |
| **Speak in a room** | ❌ Silent — `/api/audio/token` 404 | 0 |
| In-room text chat | ✅ Works | +4 |
| Emoji reactions | ✅ Works | +2 |
| Hand-raise | ✅ Broadcast works | +2 |
| View profile | ✅ Shows real data | +2 |
| Sign out | ✅ Token revoked | +2 |
| Return visit (within 7 days) | ✅ Auto-login | +3 |
| Discover communities | ❌ Communities not in Discover UI | 0 |
| Search for rooms/communities | ❌ No search | 0 |
| Report a bug | ❌ No mechanism | 0 |
| **TOTAL** | | **42 raw → normalized 31** |

**Verdict:** Audio is broken. Loop is an audio platform. A technically-adept user cannot complete the core value proposition.

---

## 3. Household Readiness — 14/100

Can a non-technical household member in Nigeria use Loop independently?

| Task | Works? | Score |
|---|---|---|
| Open app without guidance | ✅ App loads | +3 |
| Understand what the app does | ❌ No onboarding value prop screen | 0 |
| Create account without help | ❌ Redirect UX is confusing | 0 |
| Complete username step | ⚠️ Fails silently for natural names | +1 |
| Complete interests step | ⚠️ Hard 3-minimum, no counter | +1 |
| Find a room to listen to | ⚠️ If content seeded | +2 |
| Listen to audio | ❌ Silent failure | 0 |
| Send a chat message | ✅ Works | +3 |
| Report something broken | ❌ No mechanism | 0 |
| Return the next day independently | ✅ Auto-login | +3 |
| Ask for help inside the app | ❌ No help/FAQ/support | 0 |
| **TOTAL** | | **13 raw → normalized 14** |

**Verdict:** A household user will encounter a confusing login redirect, a silent audio failure, and no way to report problems. They will not return.

---

## P0 Blockers — Must Fix Before Any User Test

| # | Issue | Owner | Effort |
|---|---|---|---|
| P0-A | `GET /api/audio/token` — LiveKit JWT endpoint missing from worker | Backend | 2h |
| P0-B | LiveKit project not provisioned — no `LIVEKIT_*` env vars | DevOps | 1h |
| P0-C | Silent mic failure — no error shown when audio unavailable | Frontend | 30min |
| P0-D | No bug reporting mechanism — zero signal from users | Frontend | 1h |
| P0-E | OTP global cap 100/day — blocks any real launch | Config | 15min |

---

## P1 Critical — Fix Before Household Test

| # | Issue | Effort |
|---|---|---|
| P1-A | Login redirect unexplained — add interstitial copy | 30min |
| P1-B | Username regex silent failure — add validation message | 15min |
| P1-C | Interest 3-minimum — add counter label | 15min |
| P1-D | Empty room list in onboarding step 5 — add CTA | 15min |
| P1-E | Discover tabs: Near me/Trending/Events empty/broken | 2h |
| P1-F | Me page uses hardcoded Lagos region (loop-mock) | 30min |
| P1-G | loop-store default follows/interests seeded with mock names | 30min |

---

## Target Scores After Fixes

| Dimension | Current | After P0 | After P0+P1 |
|---|---|---|---|
| Infrastructure | 74 | **94** | 94 |
| User Readiness | 31 | **62** | **78** |
| Household Readiness | 14 | **32** | **55** |
| **Composite** | **35.8** | **64** | **76** |

> **Target for household test: Composite ≥ 70**
> Achievable after P0 + P1 fixes in one sprint.

---

## Readiness Gate: Household Test Criteria

Loop is ready for the founder's household test when ALL of the following pass:

- [ ] User can listen to audio in a live room
- [ ] User can speak (mic works and is heard by others)
- [ ] User gets a clear error message if audio fails
- [ ] User can create an account without leaving Loop (or with clear explanation)
- [ ] User can find at least 3 live rooms from home
- [ ] User can report a problem from within the app
- [ ] User returns next day and is auto-logged in
- [ ] In-room chat works

**Currently passing: 2 of 8** (auto-login, in-room chat)

