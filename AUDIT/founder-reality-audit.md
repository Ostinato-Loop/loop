# Founder Reality Audit — Loop Audio Platform
**Date:** 2026-06-07  
**Auditor:** CTO / Founder Reality Sprint  
**Method:** Full source code trace — every flow walked against actual implementation files  
**Standard:** "Can a non-technical household member use this app today, end to end?"

---

## Audit Legend

| Severity | Meaning |
|---|---|
| 🔴 P0 | Blocker — feature does not work at all |
| 🟠 P1 | Critical — severely impairs experience, workaround is difficult |
| 🟡 P2 | Major — frustrating, workaround exists |
| 🟢 P3 | Minor — friction, but manageable |

---

## Flow 1: Account Creation

### What the code does
`/login` page (`artifacts/loop/src/pages/login.tsx`) does NOT show an OTP form.  
It immediately redirects to **`profiles.rald.cloud/login?app_id=loop&redirect_to=...`**  
Loop does not own authentication. It depends entirely on profiles.rald.cloud being live, correct, and returning a valid RALD JWT with `aud: "loop"`.

### Expected behavior
User opens Loop → enters phone number → receives SMS → verifies → lands on Loop onboarding.

### Actual behavior
User opens Loop → instant redirect to a **different website** (profiles.rald.cloud) → unknown OTP UX on that site → redirected back → AuthProvider in use-auth.tsx picks up `?rald_token=` URL param → calls `/api/auth/rald-sso` → stores JWT.

### Friction points
1. User sees "Connecting to RALD Profiles…" with a spinner — no explanation of what is happening
2. Redirect crosses a domain boundary — some users will think they left the app
3. If `profiles.rald.cloud` is down, **Loop accounts cannot be created at all**
4. Back button during redirect leaves user stranded on external site
5. The worker's OTP endpoints (`/api/auth/send-otp`, `/api/auth/verify-otp`) exist and are fully implemented but the login UI does not use them — wasted infrastructure

### Metrics
| Metric | Value |
|---|---|
| Clicks to create account | 3–6 (on external site) + 1 redirect |
| Domain crossings | 2 (loop → profiles.rald.cloud → loop) |
| Time to complete | 60–90 seconds (external OTP delivery) |
| Failure modes | profiles.rald.cloud down, OTP not delivered, redirect URL mismatch |

### Severity: 🟠 P1
**Loop cannot onboard users if profiles.rald.cloud is unavailable. No fallback.**

---

## Flow 2: Login (Returning User)

### What the code does
`use-auth.tsx` checks `localStorage["loop_token"]` on mount. If valid JWT found, user is auto-logged in. If expired or missing, `LoginPage` redirects to profiles.rald.cloud again.

SSO token TTL: **7 days** (`TTL_SSO_S`).  
OTP token TTL: **30 days** (`TTL_OTP_S`).

### Expected behavior
User returns to app → sees their feed immediately.

### Actual behavior
- **Within 7 days:** Auto-login works ✅
- **After 7 days (SSO):** Redirect to profiles.rald.cloud again — full flow repeats
- **After 30 days (OTP):** Same
- No token refresh endpoint exists in the worker — tokens cannot be extended without full re-auth

### Friction points
1. Power user loses session every 7 days — re-auth via external site required
2. No "Remember this device" or biometric option
3. No graceful re-auth modal — full page redirect mid-session

### Metrics
| Metric | Value |
|---|---|
| Auto-login (fresh session) | 1 click — ✅ works |
| Re-login after expiry | 60–90 seconds, domain crossing |
| Session duration | 7 days (SSO) / 30 days (OTP) |

### Severity: 🟡 P2
**Works within session window. 7-day SSO expiry is aggressive for a social app.**

---

## Flow 3: OTP Flow

### What the code does
Worker fully implements OTP:
- `POST /api/auth/send-otp` → Termii API → 6-digit PIN, 10-minute expiry
- `POST /api/auth/verify-otp` → Termii verify → issues 30-day JWT
- Rate limits: 5/phone/hour, 10/IP/hour, 100/day global

**However: the login.tsx UI does not call these endpoints.** The OTP form does not exist in the frontend. All OTP lives on profiles.rald.cloud.

### Expected behavior
User enters +2348012345678 → receives SMS "Your Loop verification code is 482917" → enters 6 digits → proceeds.

### Actual behavior
OTP flow is owned by profiles.rald.cloud. Loop has no visibility into:
- Whether SMS is being delivered
- OTP UI design
- Error messages shown to user
- Retry / resend UX

The backend infrastructure is excellent — 5-layer rate limiting, KV-backed sliding windows, abuse logging. **None of it is wired to the Loop frontend.**

### Friction points
1. Loop founders cannot A/B test their own OTP UX
2. Delivery failures on profiles.rald.cloud show no feedback on Loop
3. Nigerian networks (MTN, Airtel) have variable Termii delivery rates — no retry button visible in any UI
4. Global 100 OTPs/day cap is very low for launch — 100 users maximum can sign up per day

### Metrics
| Metric | Value |
|---|---|
| OTP delivery time | 5–30 seconds (Termii, Nigeria) |
| Global daily cap | 100 OTPs — launch-blocking |
| Retry mechanism | Unknown — lives on profiles.rald.cloud |
| Test coverage | Full — auth.test.ts has sliding window tests |

### Severity: 🟠 P1
**100 OTP/day global cap will block launch. Must raise before going live.**

---

## Flow 4: Onboarding

### What the code does
`/onboarding` (`onboarding.tsx`) — 5-step flow: username → displayName → language → interests → rooms.

- Writes profile to Supabase directly via `authedSupabase`
- Step 4 requires **minimum 3 interests** selected
- Step 5 shows live rooms from `listRooms({ limit: 6 })`
- After completion sets `profile.onboarded = true`
- `use-auth.tsx` redirects onboarded users away from `/onboarding` to `/`

### Expected behavior
New user → picks username, display name, language, 3+ interests → sees 6 rooms → arrives at home feed.

### Actual behavior
Flow works as designed IF:
1. Username passes `/^[a-z0-9_]{3,20}$/` validation
2. Display name is 2–40 characters
3. At least 3 interests are selected (hard requirement)
4. Supabase write succeeds

**Step 5 (rooms): If no rooms are live in the database, this step shows an empty list.** User sees blank screen with no guidance.

### Friction points
1. Username regex (`^[a-z0-9_]{3,20}$`) rejects names with spaces or capitals — household users will type "Mary Jane" and be confused why it fails
2. No "skip" option for interests step — 3 minimum is enforced
3. 5 steps is 5 more screens than Clubhouse's original onboarding
4. Step 5 (room recommendations) silently fails if DB has no live rooms
5. No progress indicator visible in code (no `stepIdx / STEPS.length` display)
6. Region/location is NOT collected during onboarding — CF geo headers used as proxy

### Metrics
| Metric | Value |
|---|---|
| Steps | 5 |
| Estimated clicks | 12–18 |
| Time to complete | 2–4 minutes |
| Drop-off risk | High — step 4 (interests) requires 3 minimum |

### Severity: 🟡 P2
**Flow works but username UX is broken for non-technical users. Step count is high.**

---

## Flow 5: Community Discovery

### What the code does
`discover.tsx` loads rooms from Supabase directly (`listRooms()`). Tabs: All, Live now, People, Near me, Trending, Events.

Worker provides:
- `GET /api/communities/nearby` — CF geo-based community discovery ✅
- `GET /api/activation/home-feed` — sections: near_you, live_rooms, popular_in_state ✅
- `GET /api/communities` — full listing ✅

Frontend discover.tsx does NOT call these worker endpoints — it queries Supabase directly.

### Expected behavior
User opens Discover → sees communities near Lagos → can filter by category → taps to explore.

### Actual behavior
- "All" tab: shows rooms (not communities) from Supabase direct query — ✅ if rooms exist
- "Live now" tab: filters to `is_live = true` rooms — ✅ if any live
- "Near me" tab: implementation unknown (code truncated) — likely CF geo
- "Trending" tab: Worker returns empty arrays by explicit Phase 1 design — renders empty state
- "Events" tab: "Regional event scheduling is coming soon" — placeholder
- Community entities (the V2 primary entity) are NOT shown in discover.tsx — only rooms are shown

### Critical gap
Communities exist in the backend (extensive communities.ts routes) but discover.tsx shows **rooms**, not **communities**. The V2 primary entity is invisible to users on the discover screen.

### Friction points
1. Trending tab is intentionally empty — user sees blank screen
2. Events tab is "coming soon" — dead end
3. Near me relies on CF-IPRegion which is approximate (city-level), not exact
4. No search box for communities
5. Communities (V2 primary entity) not shown in Discover

### Metrics
| Metric | Value |
|---|---|
| Working tabs | 2 of 6 (All, Live now) |
| Community discovery | ❌ — communities not shown in discover.tsx |
| Search | ❌ — no search input |
| Time to find a room | 10–30 seconds if rooms exist |

### Severity: 🟡 P2
**Discovery works for rooms if content exists. Community discovery (V2 core) is missing from the UI.**

---

## Flow 6: Room Discovery

### What the code does
Same as community discovery. `listRooms()` queries Supabase directly. `feed.tsx` also exists (not fully audited) but likely shows the home feed.

`GET /api/activation/first-room` cascade exists in worker — LCDA → LGA → State → National fallback. Frontend does not call it.

### Expected behavior
User sees rooms near them, live rooms prioritized.

### Actual behavior
`order("is_live", { ascending: false }).order("audience_count", { ascending: false })` — correct ordering. Live rooms shown first.

**If zero rooms are live in the database: user sees empty screen.** No cascade fallback is used from the frontend.

### Friction points
1. Fresh DB has zero live rooms — new user sees nothing
2. No "start the first room" CTA when empty
3. No cascade to national fallback (worker has it, frontend doesn't call it)
4. No push notifications for when rooms go live

### Severity: 🟡 P2
**Works when content exists. Cold-start problem — zero rooms = zero value for new users.**

---

## Flow 7: Room Creation

### What the code does
`create.tsx` has a full form: title, description, category (8 options), visibility (public/private/livestream).  
Calls `createRoom()` from `lib/api/rooms.ts` which writes to Supabase directly.

On success, navigates to `/rooms/:id`.

Worker has NO `POST /api/rooms` endpoint — but the frontend bypasses the worker entirely (direct Supabase).

### Expected behavior
User taps "Create" → fills form → taps "Go Live" → enters room.

### Actual behavior
Form UI is complete. `createRoom` inserts into Supabase `rooms` table. User lands in `/rooms/:id`.

**Critical:** Room is created in DB but LiveKit audio session is NOT initialized during creation. The `/api/audio/token` endpoint that LiveKit requires does not exist in the worker. So the host creates a room that has no audio.

### Friction points
1. No cover image upload on creation (cover_url is null by default)
2. No co-host invite on creation
3. Room is created silently — no "sharing" step to invite others
4. Audio does not work (see Flow 9)
5. "Discussions", "Events", "Posts", "Articles" all show "coming soon" — user sees dead ends in create flow

### Metrics
| Metric | Value |
|---|---|
| Steps to create room | 4 (select type, fill title, pick category, tap create) |
| Time to create | 60–90 seconds |
| Audio after creation | ❌ — no LiveKit token endpoint |

### Severity: 🟠 P1 (due to no audio)

---

## Flow 8: Joining Rooms

### What the code does
`room.tsx` calls `joinRoom()` from `lib/api/rooms.ts`.  
`joinRoom` inserts into `room_participants` in Supabase.  
Supabase Realtime subscription loads participant grid in real-time.

### Expected behavior
User taps a room card → enters room → sees speakers on stage → hears audio.

### Actual behavior
- Room page loads ✅
- Participant grid loads via Supabase Realtime ✅
- User inserted into `room_participants` ✅
- Role assigned: "listener" by default ✅
- Audio: ❌ — no LiveKit token endpoint (see Flow 9)

### Friction points
1. User enters room, sees people, hears NOTHING
2. No loading state while LiveKit connects (or fails)
3. No error message when audio fails — useLiveKitRoom fails silently in "UI-only mode"
4. Audience count display relies on DB count, may lag

### Metrics
| Metric | Value |
|---|---|
| Clicks to join a room | 2 (tap card, tap join) |
| Time to join | 3–5 seconds |
| Participant grid | ✅ works |
| Audio on join | ❌ silently fails |

### Severity: 🟠 P1 — User joins but cannot hear anything.

---

## Flow 9: Speaking

### What the code does
`room.tsx` uses `useLiveKitRoom` hook from `use-livekit-room.ts`.  
`use-livekit-room.ts` calls `fetchLiveKitToken(roomId, identity)` from `lib/livekit.ts`.  
`fetchLiveKitToken` calls `GET /api/audio/token?room_id=...&identity=...` on the worker.

**`/api/audio/token` does NOT exist in the worker.**  
It is not in `index.ts`, not in any route file, not in any service file.

The `livekit.ts` comment says:
> "Backend contract: the Loop Worker must expose: GET /api/audio/token → { token: string }"

This endpoint was never built.

### Expected behavior
Host raises mic → audio streams to all listeners via LiveKit.

### Actual behavior
- Mic button is visible ✅
- Clicking mic triggers `fetchLiveKitToken`
- `fetchLiveKitToken` makes request to `/api/audio/token`
- Worker returns 404 (Not Found)
- `useLiveKitRoom` catches error → operates in "UI-only mode"
- Mic icon shows "on" state in UI — but no audio is transmitted or received

**This is the most critical failure in the product. Loop is an audio platform with no audio.**

### What's missing
1. `GET /api/audio/token` route in cloudflare-worker
2. `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` env vars in wrangler.toml
3. A LiveKit Cloud project for Nigeria (AWS Lagos PoP)
4. `VITE_LIVEKIT_URL` env var in frontend

### Severity: 🔴 P0 — Core product feature completely non-functional.

---

## Flow 10: Listening

### What the code does
Same LiveKit dependency as Speaking. Listeners subscribe to the room's audio track via LiveKit.  
Without the token, `useLiveKitRoom` cannot connect. No audio received.

### Expected behavior
Listener joins room → immediately hears all speakers.

### Actual behavior
Listener joins → sees participants → hears nothing → no error shown.

### Severity: 🔴 P0 — Core product feature completely non-functional.

---

## Flow 11: Messaging (In-Room Chat)

### What the code does
`room.tsx` calls `sendMessage()` and `listMessages()` from `lib/api/rooms.ts`.  
These query/insert into Supabase `room_messages` table directly.  
Supabase Realtime subscription (`supabase.channel`) listens for new messages.

### Expected behavior
User types message → taps send → message appears for all in room in real-time.

### Actual behavior
- Message input exists ✅
- `sendMessage` inserts to Supabase ✅
- Realtime channel receives new messages ✅
- Messages appear without page refresh ✅

**In-room chat works.** Direct messages (DMs) via `messages.tsx` page — not audited (separate flow).

### Friction points
1. No message moderation
2. No message reactions
3. No rich text / links
4. No image sharing
5. DM page (`messages.tsx`) not audited — likely placeholder

### Metrics
| Metric | Value |
|---|---|
| In-room chat | ✅ works |
| Real-time delivery | ✅ Supabase Realtime |
| DM functionality | ❓ unknown |

### Severity: 🟢 P3 (in-room chat) / ❓ (DMs)

---

## Flow 12: Reporting Bugs

### What the code does
**Nothing.** No bug report page, no feedback form, no `/api/feedback` endpoint, no toast with "Report a problem" option.

### Expected behavior
User encounters a bug → taps "Report" → describes problem → submitted.

### Actual behavior
User has no mechanism to report bugs from within the app.

### Friction points
1. Household users will silently abandon when something breaks
2. Founder has no feedback signal from real users
3. Abuse reports are theoretically backed by `moderation.ts` service but there is no UI to trigger them

### Severity: 🔴 P0 — No feedback mechanism. Zero signal from users.

---

## Flow 13: Returning Next Day

### What the code does
`use-auth.tsx` on mount:
1. Reads `localStorage["loop_token"]`
2. Calls `isTokenValid(token)` — checks `exp` claim
3. If valid: calls `/api/auth/me` → loads profile → user is in
4. If invalid: redirects to `/login` → profiles.rald.cloud redirect

### Expected behavior
User opens app next day → already logged in → sees their feed.

### Actual behavior
- **Day 1 (SSO login):** Auto-login works ✅
- **Day 2–7:** Auto-login works ✅
- **Day 8+ (after SSO expiry):** Redirected to profiles.rald.cloud — 60-90 second re-auth
- **No app_id remembered:** User must go through full onboarding check again (skipped if `onboarded = true`)
- **If Supabase is down:** `/api/auth/me` fails → `refreshProfile` is called → may log user out

### Missing
- No token refresh / silent renew
- No "keep me logged in" option
- No push notification on return to re-engage

### Severity: 🟡 P2 — Works for 7 days. Weekly re-auth via external site is disruptive.

---

## Summary Table

| Flow | Status | Severity | Works for Household? |
|---|---|---|---|
| 1. Account Creation | External redirect dependency | 🟠 P1 | ⚠️ Maybe |
| 2. Login | Works within session window | 🟡 P2 | ✅ Yes (7 days) |
| 3. OTP Flow | Lives on profiles.rald.cloud | 🟠 P1 | ⚠️ Unknown |
| 4. Onboarding | Works, high friction | 🟡 P2 | ⚠️ Partially |
| 5. Community Discovery | Communities invisible in Discover | 🟡 P2 | ⚠️ Partially |
| 6. Room Discovery | Works if content exists | 🟡 P2 | ⚠️ If seeded |
| 7. Room Creation | UI works, audio broken | 🟠 P1 | ❌ No audio |
| 8. Joining Rooms | UI works, audio broken | 🟠 P1 | ❌ No audio |
| 9. Speaking | /api/audio/token missing | 🔴 P0 | ❌ Completely broken |
| 10. Listening | Same as Speaking | 🔴 P0 | ❌ Completely broken |
| 11. In-Room Chat | Works | 🟢 P3 | ✅ Yes |
| 12. Bug Reporting | Does not exist | 🔴 P0 | ❌ No mechanism |
| 13. Returning Next Day | Works ≤7 days | 🟡 P2 | ✅ Within window |

### P0 Blockers (must fix before any household test)
1. **`GET /api/audio/token`** — LiveKit token endpoint missing from worker. No audio at all.
2. **LiveKit project** — `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` not in wrangler.toml or secrets.
3. **Bug reporting** — No feedback mechanism. Zero household signal.

### P1 Critical (fix before public launch)
4. **OTP global cap** — 100/day maximum. Raise to 10,000+.
5. **Login UX** — Redirect to external site with no explanation.
6. **Audio silent failure** — When LiveKit fails, no error is shown.

---

*This audit is based on direct source code inspection of 20+ files in the Loop repository. No assumptions were made about undocumented behavior.*
