# WIZMAC — RALD Ecosystem Knowledge Map & Operations Brain

> **WIZMAC** = Workspace Intelligence, Zero-friction Messaging, Auth, Commerce
>
> This is the institutional memory of RALD. All architecture decisions, incidents,
> migrations, and weekly plans live here. If it is not in WIZMAC, it does not exist.
>
> Organisation: Ostinato-Loop (GitHub)
> Author: LILCKY STUDIO LIMITED

---

## 1. Ecosystem Overview

The RALD Platform is a suite of apps that behave as ONE product under ONE identity.

```
profiles.rald.cloud          ← Identity Authority (THE truth)
    │
    ├── loop.rald.cloud        ← Loop (audio rooms, feed, communities)
    ├── messenger.rald.cloud   ← Loop Messenger (DMs, voice, calls)
    ├── tv.rald.cloud          ← RALD TV (entertainment layer)
    ├── ai.rald.cloud          ← RALD AI (intelligence layer)
    ├── pay.rald.cloud         ← PayRALD (commerce layer)
    └── git.rald.cloud         ← GitRALD (builder layer)
```

### Identity Axiom (Phase H / Phase 1)
> **profiles.rald.cloud is the ONLY identity issuer. No app re-signs tokens.**

- Users sign in at `profiles.rald.cloud`.
- Profiles issues a RALD Master JWT (HS256, `RALD_JWT_SECRET`).
- Apps receive the JWT via `?rald_token=` query param on redirect.
- Apps call their own `/api/auth/rald-sso` to validate and bootstrap a session.
- Apps call `/api/auth/logout` on sign-out, then redirect to `profiles.rald.cloud/logout`.

---

## 2. Product Registry

| Product | Status | Domain | Stack | Owner Repo |
|---------|--------|--------|-------|------------|
| Profiles | Production | profiles.rald.cloud | — | rald |
| Loop | Production | loop.rald.cloud | React Router DOM v7, Vite, Supabase | loop |
| Messenger | Production | messenger.rald.cloud | Wouter, Vite, CF Worker, D1 | messenger |
| RALD Auth Core | Production | auth.rald.cloud | TypeScript | rald |
| PayRALD | Development | pay.rald.cloud | — | payrald |
| RALD TV | Planned | tv.rald.cloud | — | — |
| RALD AI | Planned | ai.rald.cloud | — | rald-ai |
| GitRALD | Development | git.rald.cloud | — | gitrald-core |

---

## 3. Domain Registry

| Domain | Points To | Purpose |
|--------|-----------|---------|
| profiles.rald.cloud | Profiles app | Identity, login, registration |
| loop.rald.cloud | Loop SPA | Audio rooms, feed, communities |
| messenger.rald.cloud | Messenger SPA | DMs, voice, calls |
| auth.rald.cloud | rald-auth-core | SSO, search, graph API |
| pay.rald.cloud | PayRALD | Payments, wallets |
| git.rald.cloud | GitRALD | Developer tools |
| rald.me | Marketing | Public-facing brand site |

---

## 4. Architecture Registry

### 4.1 Repos (GitHub: Ostinato-Loop)

| Repo | Description | Stack |
|------|-------------|-------|
| `loop-audio-ui-ux` | **Reference** feed/room/profile UI | TanStack Router, Vite |
| `loop-messenger-ui-ux` | **Reference** messenger/communities/calls UI | TanStack Router, Vite |
| `loop` | **Production** Loop app (feed, rooms) | React Router DOM v7, Vite |
| `messenger` | **Production** Messenger app | Wouter, Vite |
| `rald` | **Core** auth, WIZMAC, Constitution, governance | TypeScript |
| `payrald` | PayRALD app | TBD |
| `rald-ai` | RALD AI service | TBD |
| `gitrald-core` | GitRALD core | TBD |

### 4.2 Auth Flow

```
1. User visits loop.rald.cloud
2. No token → redirect to profiles.rald.cloud/login?app_id=loop&redirect_to=loop.rald.cloud
3. Profiles issues RALD JWT, redirects to loop.rald.cloud/?rald_token=JWT
4. Loop AuthProvider detects rald_token → stores as rald_master_token in localStorage
5. Loop calls POST /api/auth/rald-sso {rald_token} → validates JWT → returns {access_token}
6. access_token stored in localStorage as loop_token
7. Silent auth: GET /api/auth/silent validates rald_session cookie on each reload
8. Logout: POST /api/auth/logout (clears cookie) → redirect to profiles.rald.cloud/logout
```

### 4.3 RALD JWT Claims
```json
{
  "id":    "rald_user_id",
  "phone": "+234...",
  "email": "user@rald.me",
  "role":  "user|creator|admin",
  "sso_v": 2,
  "exp":   1234567890
}
```

### 4.4 Cross-App Navigation

| From | To | Method |
|------|----|--------|
| Loop → Messenger | `openMessenger(path)` in `use-auth.tsx` | Appends `?rald_token=MASTER_TOKEN` |
| Loop → Profiles | `openProfiles(path)` in `use-auth.tsx` | Appends `?rald_token=MASTER_TOKEN` |
| Any app → Loop | Redirect to `loop.rald.cloud?rald_token=TOKEN` | Same SSO flow |

### 4.5 Loop App Internal Routes

```
/               → FeedPage      (real rooms from Supabase + mock content items)
/discover       → DiscoverPage  (real rooms from Supabase)
/rooms/:roomId  → RoomPage      (real Supabase realtime room)
/messages       → MessagesPage  (links to Messenger)
/me             → MeLaunchPage  (profile + RALD Identity section)
/create         → CreatePage
/create/:kind   → CreatePage    (room|discussion|event|community|post|article)
/login          → LoginPage     (redirects to profiles if SSO available)
/onboarding     → OnboardingPage (5-step: username, name, language, interests, rooms)
```

### 4.6 Messenger App Internal Routes

```
/               → RootRedirect  (→ /chats if authed, → /auth if not)
/auth           → AuthPage      (RALD SSO exchange)
/onboarding     → OnboardingPage (display name + avatar)
/chats          → ChatsPage     (real D1 conversations + Supabase realtime)
/chats/:convId  → ChatsPage     (conversation view)
/communities    → CommunitiesPage (launch UI — mock pending backend)
/calls          → CallsPage     (launch UI — mock pending backend)
/profile        → ProfilePage
/settings       → SettingsPage
```

### 4.7 Fail-Fast Rules (Production)

- **Loop API**: `RALD_JWT_SECRET` missing → all auth routes return 503, explicit error message.
- **Loop API**: Missing Supabase env → profile lookup returns null (non-blocking).
- **Messenger Worker**: `MESSENGER_DB` D1 binding missing → `dbMiddleware` returns 400.
- **All apps**: Missing env returns structured JSON error. Zero silent failures.

---

## 5. Incident Registry

| # | Date | System | Description | Cause | Resolution | Status |
|---|------|--------|-------------|-------|------------|--------|
| 001 | 2026-06 | Loop Feed | Feed showed hardcoded mock data to all users | Feed.tsx used loop-mock.ts instead of real API | Wired listRooms() Supabase call with mock fallback | Resolved |
| 002 | 2026-06 | Loop Nav | BottomNav not visible on Feed and Me pages | AppShell wrapper missing from feed.tsx and me-launch.tsx | Added AppShell import and wrapper | Resolved |
| 003 | 2026-06 | Loop Nav | /search Link had no route, silently redirected to / | Dead route with no catch | Changed to `<button>` (search overlay pending) | Resolved |
| 004 | 2026-06 | loop-store.ts | Duplicate `import from "react"` statements | Sprint refactor did not consolidate imports | Merged into single `import React, { ... }` | Resolved |
| 005 | 2026-06 | loop.rald.cloud | App shell loads (HTTP 200) but user cannot experience the app | Loop API in production is missing env vars (RALD_JWT_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) and/or the /api server is not deployed behind the domain | Set env vars in the production deployment platform. Verify `loop.rald.cloud/api/health` returns 200 before re-testing SSO. | Open |

---

## 6. Decision Registry

| # | Date | Decision | Rationale | Owner |
|---|------|----------|-----------|-------|
| D001 | 2026-06 | profiles.rald.cloud is sole identity provider | No identity fragmentation across products. One RALD ID. | LILCKY STUDIO |
| D002 | 2026-06 | Loop uses React Router DOM v7, not TanStack Router | Production app must have stable routing; reference UI used TanStack | LILCKY STUDIO |
| D003 | 2026-06 | Messenger uses Wouter, not React Router DOM | Messenger is a separate SPA; lighter router preferred | LILCKY STUDIO |
| D004 | 2026-06 | RALD JWT (HS256) is the cross-app token | Simplest shared secret approach; avoids per-app key management | LILCKY STUDIO |
| D005 | 2026-06 | Messenger CF Worker uses D1 (not Supabase) | Edge worker compatibility; low-latency for realtime messaging | LILCKY STUDIO |
| D006 | 2026-06 | Loop SPA uses Supabase directly for rooms/profiles | Loop is a more traditional SPA; Supabase realtime fits | LILCKY STUDIO |
| D007 | 2026-06 | Feed wired to real listRooms() with mock fallback | Prevent empty states on pre-launch; graceful degradation | LILCKY STUDIO |
| D008 | 2026-06 | Username regex allows ASCII only (a-z, 0-9, _) | URL-safe usernames; display name is the place for Unicode | LILCKY STUDIO |
| D009 | 2026-06 | Notification types LOCKED to 3: direct_message, friend_request, connection_accepted | Trust & Retention Sprint principle: no notification noise. Every other type disabled at DB constraint level — cannot be bypassed by application code. | LILCKY STUDIO |
| D010 | 2026-06 | DM webhook (/api/notify/dm) authenticated with MESSENGER_WEBHOOK_KEY, not RALD JWT | Messenger CF Worker is a separate trusted service, not a user agent. Shared secret is simpler than cross-service JWT issuance. | LILCKY STUDIO |
| D011 | 2026-06 | friend_requests table uses enum-like TEXT CHECK constraint (pending/accepted/declined/cancelled) | Keeps all social graph state in Supabase, queryable, RLS-protected, and auditable. No separate state machine service needed at pre-scale. | LILCKY STUDIO |

---

## 7. Migration History

| Migration | Date | Repo | Description | Reversible |
|-----------|------|------|-------------|------------|
| 0001 | 2026 | rald | Initial registered_apps table | Yes |
| 0002 | 2026 | rald | SSO sessions and refresh tokens | Yes |
| 0003 | 2026 | rald | User graph and connections | Yes |
| 0004 | 2026-06 | rald | lifecycle_state column on registered_apps; seeded Loop, Messenger, Profiles, Auth Core | Yes |
| **Loop-001** | 2026-06 | loop | Initial Supabase schema — users, rooms, room_members, connections | Yes |
| **Loop-002** | 2026-06 | loop | Notifications + friend_requests tables; Supabase triggers for auto-notify on friend_request and connection_accepted events; RLS policies | Yes |

**Migration Policy:**
- All migrations use `IF NOT EXISTS` / `IF EXISTS` guards.
- `ON CONFLICT DO UPDATE` used for seed data — never raw INSERT without conflict handling.
- Migrations are append-only. No migration may drop a column without a deprecation phase.
- Every migration must be tested on a staging database before production.

---

## 8. Community Registry

| Community | Status | Members | Platform |
|-----------|--------|---------|----------|
| AfroDevs Collective | Planned | — | Loop + Messenger |
| Lagos Tech Circle | Planned | — | Loop + Messenger |
| RALD Announcements | Active | All users | Messenger |
| University communities | Planned | — | Loop |
| Regional (city-level) | Planned | — | Loop |

**Note:** Communities in the UI (communities.tsx) are currently mock data pending backend implementation.

---

## 9. Expansion Registry

| Phase | Market | Status | Notes |
|-------|--------|--------|-------|
| Phase 1 | Nigeria (Lagos) | In progress | Core launch market |
| Phase 2 | Kenya (Nairobi) | Planned | English + Swahili |
| Phase 3 | Ghana (Accra) | Planned | English + Twi |
| Phase 4 | South Africa | Planned | English + Zulu |
| Phase 5 | Rest of Africa | Planned | Per-market localization |
| Phase 6 | Diaspora | Planned | UK, USA, Canada |

---

## 10. Weekly Planning Registry

| Week | Focus | Key Deliverables | Status |
|------|-------|-----------------|--------|
| 2026-W23 | Foundation Lockdown Sprint | Identity propagation, Loop launch UI, Messenger communities/calls, WIZMAC, Governance SQL | Completed |
| 2026-W24 | Feed Real Data + Constitution | Wire listRooms() to feed, write RALD Constitution, fix audit bugs, push to GitHub | In progress |
| 2026-W25 | TBD | Pending W24 completion | Planned |

**Weekly Planning Process:**
1. Each Monday: Update this registry with the week's focus and deliverables.
2. Each Friday: Mark completed items. Note blockers for the following week.
3. No sprint starts without a WIZMAC entry.

---

## 11. Design System

### Loop (Audio)
- Font: Bricolage Grotesque (display), DM Sans (body)
- Primary: `#00FF88` — neon green (RALD/Loop brand)
- Background: `#0A1F16` — deep commerce dark
- Live indicator: `#FF2E2E` red + pulse animation
- Orange accent: `#FF7A00`
- CSS tokens: `--neon`, `--neon-foreground`, `--orange`, `--live`
- Utility classes: `.neon-glow`, `.scrollbar-none`, `.live-dot`, `.safe-pb`

### Messenger
- Font: Inter (system)
- Primary: `#7C3AED` (purple/violet) or `#FF7A00` (orange variant)
- Background: `#0B0D0E` dark
- Surface: `#131618`
- CSS tokens: `--primary`, `--surface`, `--muted-foreground`

### Shared Rules
- Both apps use `--primary` for their brand color (scoped per-app)
- Mobile-first: max-width 480px container, safe-area-inset support
- All interactive elements minimum 44px tap target
- `env(safe-area-inset-bottom)` on all sticky footers

---

## 12. Knowledge Registry

### African Market Context
- Nigeria: ~220M population, ~40% smartphone penetration, average 3G speeds
- Kenya: ~55M population, M-Pesa dominant, higher data literacy
- Ghana: ~33M population, strong English literacy, growing startup ecosystem
- Data costs: Nigeria ₦1,000–₦3,000/GB; Kenya KSh 50–150/GB

### Competitive Positioning
- WhatsApp: strongest competitor for messaging (3B users). RALD differentiates on identity + civic rooms.
- Telegram: channels and communities. RALD differentiates on local/regional context.
- TikTok/Instagram: content platforms. RALD's Loop is not a content feed — it is a conversation platform.
- Twitter/X: public discourse. RALD's audio rooms are the equivalent but with voice and local context.

### Technical Constraints Documented
- TRTC (Tencent RTC) used for Loop audio — data routes through Tencent infrastructure. Disclose to users.
- Supabase realtime used in both Loop (rooms) and Messenger (presence, typing). Rate limit: 10 events/second.
- CF Workers D1 is the Messenger message store — 500MB limit per database on free tier.

---

---

## 13. Notification Infrastructure

### 13.1 Allowed Notification Types (LOCKED — DO NOT EXTEND WITHOUT RALD CONSTITUTION AMENDMENT)

| Type | Trigger | Actor | Resource |
|------|---------|-------|---------|
| `direct_message` | Messenger CF Worker → POST /api/notify/dm | Sender user ID | Message ID (D1) |
| `friend_request` | DB trigger on friend_requests INSERT | Requester user ID | friend_request row ID |
| `connection_accepted` | DB trigger on friend_requests UPDATE (pending→accepted) | Acceptor user ID | friend_request row ID |

> **ALL OTHER NOTIFICATION TYPES ARE DISABLED AT DATABASE CONSTRAINT LEVEL.**
> The `notifications.type` column has a `CHECK` constraint. Any application code attempting to insert a different type will receive a Postgres error 23514.

### 13.2 API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/notifications` | Bearer (Loop JWT) | List notifications for current user. Optional `?type=` and `?limit=` filters. |
| `GET` | `/api/notifications/count` | Bearer (Loop JWT) | Returns `{ unread: number }` for notification badge. |
| `POST` | `/api/notifications/read` | Bearer (Loop JWT) | Mark notifications as read. Body: `{ ids?: string[] }` (omit to mark all). |
| `POST` | `/api/notify/dm` | `X-Messenger-Webhook-Key` header | Internal webhook called by Messenger CF Worker on DM send. |

### 13.3 Friend Request API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/friend-requests` | Bearer | Send a friend request. Body: `{ addressee_id: string }`. Returns 409 if duplicate. |
| `GET` | `/api/friend-requests` | Bearer | List incoming + outgoing requests. Optional `?direction=incoming\|outgoing`. |
| `PUT` | `/api/friend-requests/:id/accept` | Bearer | Accept an incoming request. Creates `connection_accepted` notification automatically. |
| `PUT` | `/api/friend-requests/:id/decline` | Bearer | Decline an incoming request. |
| `DELETE` | `/api/friend-requests/:id` | Bearer | Cancel an outgoing request. |

### 13.4 Required Environment Variables (Loop API — Production)

| Variable | Required | Description |
|----------|----------|-------------|
| `RALD_JWT_SECRET` | ✅ CRITICAL | Loop JWT signing secret. App will not start without it. |
| `SUPABASE_URL` | ✅ CRITICAL | Supabase project URL. |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ CRITICAL | Supabase service role key (bypasses RLS for server-side ops). |
| `MESSENGER_WEBHOOK_KEY` | ⚠️ Required for DM notifs | Shared secret between Loop API and Messenger CF Worker. `/api/notify/dm` returns 503 if not set. |

### 13.5 Supabase Triggers (Auto-provisioned by Migration Loop-002)

- `notify_on_friend_request` — fires on `INSERT` into `friend_requests`, inserts `friend_request` notification for the addressee.
- `notify_on_connection_accepted` — fires on `UPDATE` where status changes to `accepted`, inserts `connection_accepted` notification for the requester.

---

*WIZMAC v1.2 — Updated June 2026 — LILCKY STUDIO LIMITED*
*This document is the single source of truth for RALD platform operations.*
