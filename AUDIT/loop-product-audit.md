# Loop Product Audit — Phase 1: Full Product State
**Ecosystem:** RALD / LILCKY STUDIO LIMITED  
**Repo:** Ostinato-Loop/loop  
**Audit Date:** 2026-06-06  
**Auditor:** CTO Office  
**Status:** SUPERSEDES loop-v2-product-audit.md  

---

## Executive Summary

Loop is a live audio social platform built on React + Vite (SPA), a Hono Cloudflare Worker API, and Supabase (Postgres + Realtime). As of this audit, the product is **not shippable**. Six Priority-0 (launch-blocking) defects exist in core user flows. The audio layer — the most fundamental capability of a live audio app — has **zero implementation**. The strategic direction for V2 is confirmed: **Communities replace Rooms as the primary organizing structure**.

---

## 1. Codebase Inventory

| Layer | Technology | Location | Status |
|---|---|---|---|
| Frontend SPA | React 18 + Vite + TypeScript | `artifacts/loop/` | Partial — missing critical flows |
| API / Edge | Hono + Cloudflare Worker | `artifacts/cloudflare-worker/` | Partial — missing audio, auth gaps |
| Database | Supabase (Postgres + Realtime) | Supabase project | Schema exists, RLS incomplete |
| Auth | Custom HS256 JWT + Supabase | Worker `src/auth.ts` | Functional but fragile |
| State | Zustand (`loop-store.ts`) | `artifacts/loop/src/store/` | Sparse — missing room/audio state |
| Design System | `rald-design-system` repo | External | Partially consumed |

---

## 2. Screen-by-Screen Audit

### 2.1 Feed (`feed.tsx`)
**Purpose:** Home screen — renders live rooms and trending content.

| Finding | Severity | Detail |
|---|---|---|
| Empty state is permanent | P0 | API call returns rooms but the "empty" branch renders unconditionally due to missing state hydration |
| Category chip filter | P0 | `onPress` handler calls `setActiveCategory` but query is never re-fetched with the new filter; UI updates, data does not |
| Trending section | P2 | Hardcoded placeholder array — never calls `/trending` endpoint |
| Pull-to-refresh | P2 | Implemented but resets to empty state due to the same hydration bug |
| Error boundary | P3 | No error UI — network failures render blank |

### 2.2 Room Launch (`room-launch.tsx`)
**Purpose:** Pre-join screen before entering a live room.

| Finding | Severity | Detail |
|---|---|---|
| No audio SDK | P0 | `handleJoinRoom` calls `router.push('/room')` with no audio session initialization anywhere in the codebase |
| Host = Listener UI | P0 | Host and listener see identical controls — no mic toggle, no kick, no speaker queue |
| Raise Hand — no handler | P0 | `<RaiseHandButton>` renders but has no `onClick` prop and no backing store action |

### 2.3 Room (`room.tsx`)
**Purpose:** The active live room experience.

> **Critical:** `room.tsx` is more complete than `room-launch.tsx` (has Supabase Realtime participant grid, floating reactions, speaker list). It is **not routed** in `App.tsx` — `room-launch.tsx` is used instead. This complete component is sitting unused.

| Finding | Severity | Detail |
|---|---|---|
| Not routed | P0 | `room.tsx` must replace `room-launch.tsx` as the `/room/:id` route |
| Audio SDK absent | P0 | Even `room.tsx` contains no audio SDK calls — the component handles UI state only |
| Participant grid | P2 | Works via Supabase Realtime but falls back to empty array on error |
| Reactions | P2 | Floating emoji reactions work client-side only — not persisted or broadcast |

### 2.4 Messages (`messages.tsx`)
**Purpose:** Direct messaging between users.

| Finding | Severity | Detail |
|---|---|---|
| External redirect | P0 | Tapping Messages redirects the user outside the app entirely. No in-app messaging exists |
| Messenger repo exists | P1 | `Ostinato-Loop/messenger` has Tencent RTC integrated — needs evaluation for adoption vs. replacement |

### 2.5 Discover (`discover.tsx`)
**Purpose:** Browse rooms and users.

| Finding | Severity | Detail |
|---|---|---|
| Search non-functional | P2 | Input fires but calls a stub — returns no results |
| Room cards | P2 | Render correctly from API but join CTA routes to the unworking room-launch flow |
| User profiles | P3 | Avatar and display name only — no follow state, no profile detail |

### 2.6 Create (`create.tsx` + `create-sheet.tsx`)
**Purpose:** Create a new room.

| Finding | Severity | Detail |
|---|---|---|
| Form validates locally | P2 | Room name, topic, and privacy are validated client-side |
| No audio pre-check | P0 | Creation succeeds but the created room is immediately un-joinable (no audio) |
| Schedule room | P3 | UI exists, no backend support for scheduled rooms |

### 2.7 Onboarding (`onboarding.tsx`)
**Purpose:** New user setup.

| Finding | Severity | Detail |
|---|---|---|
| Completes successfully | ✅ | Username, avatar, interests flow works end-to-end |
| Interest selection | P3 | Interests saved to Supabase but never used for recommendation seeding |

### 2.8 Login (`login.tsx`)
**Purpose:** Auth entry.

| Finding | Severity | Detail |
|---|---|---|
| OTP flow works | ✅ | Phone OTP via Supabase Auth functional |
| JWT issuance | P2 | Worker issues HS256 JWT but secret rotation has no zero-downtime path |

### 2.9 Me / Profile (`me-launch.tsx`, `live.tsx`)
**Purpose:** User profile and settings.

| Finding | Severity | Detail |
|---|---|---|
| Profile reads | ✅ | Displays correctly from Supabase |
| Edit profile | P2 | Form exists but PUT handler returns 405 in production |
| Follower counts | P3 | Always zero — aggregation query missing |

---

## 3. API / Cloudflare Worker Audit

### 3.1 Route Coverage

| Route | Implemented | Issues |
|---|---|---|
| `POST /auth/otp` | ✅ | — |
| `POST /auth/verify` | ✅ | HS256 secret not rotatable live |
| `GET /rooms` | ✅ | Missing filter by category |
| `POST /rooms` | ✅ | No audio session bootstrapped |
| `GET /rooms/:id` | ✅ | — |
| `DELETE /rooms/:id` | ✅ | — |
| `GET /trending` | ⚠️ | Stub — returns empty array |
| `POST /rooms/:id/join` | ⚠️ | Sets DB presence only — no audio token issued |
| `POST /rooms/:id/leave` | ✅ | — |
| Messaging routes | ❌ | Not implemented |
| Community routes | ❌ | Not implemented — V2 requirement |

### 3.2 Durable Objects — Room Session

`room-session.ts` manages room lifecycle via a Cloudflare Durable Object.

| Finding | Severity |
|---|---|
| Single-region by default | P1 |
| No audio WebRTC signaling | P0 |
| 10-participant hardcoded limit in business logic | P1 |
| No cleanup on abnormal disconnect | P2 |

### 3.3 Middleware

| Finding | Severity |
|---|---|
| Auth middleware checks JWT correctly | ✅ |
| No rate limiting on OTP endpoint | P1 |
| CORS allows all origins (`*`) | P1 |
| No request body size limit | P2 |

---

## 4. State Management Audit (`loop-store.ts`, `people.ts`, `rooms.ts`)

| Store Slice | State | Issues |
|---|---|---|
| Auth | ✅ Functional | — |
| Rooms list | ⚠️ Partial | Filter state not wired to fetch |
| Current room | ❌ Missing | No audio state, no speaker queue, no role state |
| Messages | ❌ Missing | — |
| Notifications | ❌ Missing | — |
| Communities | ❌ Missing | V2 requirement |

---

## 5. Database Schema Audit

Schema defined across `migrations/001` and `migrations/002`.

| Table | Present | RLS | Issues |
|---|---|---|---|
| `profiles` | ✅ | ✅ | — |
| `rooms` | ✅ | ⚠️ Partial | No community FK |
| `room_participants` | ✅ | ⚠️ Partial | Role enum lacks `host`/`co-host` distinction |
| `follows` | ✅ | ✅ | — |
| `interests` | ✅ | ✅ | — |
| `messages` | ❌ | ❌ | Not in schema |
| `communities` | ❌ | ❌ | V2 requirement |
| `events` | ❌ | ❌ | V2 requirement |

---

## 6. CI / Build Audit

| Check | Present | Notes |
|---|---|---|
| TypeScript typecheck | ✅ | Runs on push |
| Security audit (`pnpm audit`) | ✅ | Runs on push |
| ESLint | ❌ | Not configured |
| Tests | ❌ | No test suite exists |
| Branch protection | ❌ | Direct pushes to `main` possible |
| Deployment gating | ❌ | `deploy.yml` deploys on any `main` push regardless of CI outcome |

---

## 7. Priority Matrix — All Findings

| ID | Description | Severity | Affected Screen | Effort |
|---|---|---|---|---|
| P0-001 | No audio SDK integrated | P0 | Room, Room Launch, Create | XL |
| P0-002 | Host ≠ Listener UI missing | P0 | Room Launch, Room | L |
| P0-003 | Raise Hand has no handler | P0 | Room Launch | S |
| P0-004 | Feed empty state — state hydration bug | P0 | Feed | M |
| P0-005 | Messages external redirect | P0 | Messages | XL |
| P0-006 | Category chip filter broken | P0 | Feed | S |
| P0-007 | `room.tsx` not routed — complete component unused | P0 | App routing | S |
| P1-001 | OTP endpoint has no rate limiting | P1 | Auth | S |
| P1-002 | CORS allows all origins | P1 | Worker | S |
| P1-003 | Durable Object single-region | P1 | Infrastructure | L |
| P1-004 | Messenger repo (Tencent RTC) — evaluate or replace | P1 | Messages | XL |
| P2-001 | Search returns no results | P2 | Discover | M |
| P2-002 | Edit profile 405 in production | P2 | Me | S |
| P2-003 | Trending hardcoded | P2 | Feed | M |
| P2-004 | Reactions not broadcast | P2 | Room | M |
| P2-005 | No request body size limit | P2 | Worker | S |
| P3-001 | Follower counts always zero | P3 | Me, Profiles | S |
| P3-002 | Interests not used for recommendations | P3 | Onboarding | M |
| P3-003 | Scheduled rooms — no backend | P3 | Create | L |

---

## 8. Strategic Direction Confirmed

**V2 is Communities-first.** Every room belongs to a community. Rooms are ephemeral events within a community's timeline. The community is the durable identity users subscribe to, moderate, and grow.

See `/FOUNDATION/loop-v2-readiness.md` for full architecture brief.

---

*End of Phase 1 — Product Audit*
