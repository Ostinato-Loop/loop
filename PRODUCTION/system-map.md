# Loop V1 — System Map
*Generated: 2026-06-08 | Phase 1 of V1 Stabilization Sprint*

---

## Architecture Overview

```
User Device (Browser / PWA)
        │
        ▼
loop.rald.cloud  (Cloudflare Pages)
        │  React + Vite SPA
        │  Serves static assets
        │
        ├── GET /api/*  → loop-api.rald.cloud (Cloudflare Worker)
        │       │
        │       ├── /api/auth           auth.ts router
        │       │     ├── POST /send-otp          → Termii API (SMS)
        │       │     ├── POST /verify-otp        → Supabase (profile upsert)
        │       │     ├── GET  /silent            → Supabase JWT refresh
        │       │     └── POST /rald-sso          → RALD SSO exchange
        │       │
        │       ├── /api/auth/rald-sso  rald-sso.ts router
        │       │     └── POST /        → profiles.rald.cloud (RALD JWT verify)
        │       │
        │       ├── /api/rooms          rooms.ts router
        │       │     ├── GET  /        → Supabase rooms table
        │       │     ├── POST /        → Supabase insert + LiveKit room create
        │       │     ├── GET  /:id     → Supabase + LiveKit token
        │       │     └── DELETE /:id  → Supabase + LiveKit room close
        │       │
        │       ├── /api/communities    communities.ts router
        │       │     └── GET /        → Supabase communities table
        │       │
        │       ├── /api/regions        regions.ts router
        │       │     └── GET /        → Supabase or static Nigerian state list
        │       │
        │       ├── /api/audio          audio.ts router
        │       │     └── POST /token  → LiveKit access token
        │       │
        │       ├── /api/feedback       feedback.ts router
        │       │     └── POST /       → Supabase feedback table
        │       │
        │       └── /api/health         health.ts router
        │             └── GET /        → uptime + sha + env check
        │
        ├── Supabase (PostgreSQL + Row Level Security)
        │       Tables: profiles, rooms, communities, notifications,
        │               feedback, room_participants, follows
        │       Auth: Supabase JWT issued by worker, not Supabase auth
        │
        ├── LiveKit Cloud (Audio)
        │       → Room creation, join tokens, participant events
        │       → Fallback: Tencent RTC (configured but inactive)
        │
        ├── Termii (OTP SMS)
        │       → Send + verify OTP for phone auth
        │       → Africa-focused SMS provider
        │
        └── profiles.rald.cloud (RALD Identity)
                → SSO source of truth for RALD ecosystem
                → Returns rald_id, display_name, avatar, email
```

---

## Services

| Service | URL | Stack | Status |
|---------|-----|-------|--------|
| Frontend SPA | loop.rald.cloud | React 18 + Vite + TailwindCSS | ✅ Live |
| API Worker | loop-api.rald.cloud | Cloudflare Workers + Hono | ✅ Live |
| Database | Supabase (eu-west) | PostgreSQL 15 + RLS | ✅ Live |
| Audio | LiveKit Cloud | WebRTC + LiveKit Server | ✅ Live |
| OTP | Termii | REST API | ✅ Live |
| Identity | profiles.rald.cloud | RALD Auth (external) | ✅ Live |
| CDN | Cloudflare Pages | Edge network | ✅ Live |

---

## All Routes (Frontend → Worker)

### Auth routes (`/api/auth/*`)
| Method | Path | Purpose |
|--------|------|---------|
| POST | /api/auth/send-otp | Send OTP via Termii |
| POST | /api/auth/verify-otp | Verify OTP, return JWT |
| GET | /api/auth/silent | Refresh session (silent) |
| POST | /api/auth/rald-sso | Exchange RALD token for Loop JWT |

### Room routes (`/api/rooms/*`)
| Method | Path | Purpose |
|--------|------|---------|
| GET | /api/rooms | List rooms (supports ?category, ?limit) |
| POST | /api/rooms | Create room |
| GET | /api/rooms/:id | Get room + LiveKit token |
| DELETE | /api/rooms/:id | Close/delete room |

### Other routes
| Method | Path | Purpose |
|--------|------|---------|
| GET | /api/communities | List communities |
| GET | /api/regions | List Nigerian states |
| POST | /api/audio/token | LiveKit audio token |
| POST | /api/feedback | Submit feedback |
| GET | /api/health | Health check (returns sha, uptime, env) |

---

## All Secrets

### Cloudflare Worker secrets (via `wrangler secret put`)
| Secret | Purpose | Required |
|--------|---------|----------|
| RALD_JWT_SECRET | Token signing for OTP + SSO | FATAL |
| SUPABASE_SERVICE_ROLE_KEY | Server-side Supabase access | FATAL |
| TERMII_API_KEY | OTP SMS delivery | FATAL |
| TERMII_SENDER_ID | OTP sender ID | FATAL |
| LIVEKIT_API_KEY | Audio room management | WARNING |
| LIVEKIT_API_SECRET | Audio room management | WARNING |

### GitHub Actions secrets (for deploy.yml)
| Secret | Used for |
|--------|---------|
| CLOUDFLARE_API_TOKEN | Worker + Pages deploy |
| CLOUDFLARE_ACCOUNT_ID | Wrangler account |
| SUPABASE_URL | Build-time env var |
| SUPABASE_ANON_KEY | Build-time env var (VITE_SUPABASE_PUBLISHABLE_KEY) |
| RALD_JWT_SECRET | Worker secret push |
| SUPABASE_SERVICE_ROLE_KEY | Worker secret push |
| TERMII_API_KEY | Worker secret push |
| TERMII_SENDER_ID | Worker secret push |
| LIVEKIT_API_KEY | Worker secret push |
| LIVEKIT_API_SECRET | Worker secret push |

### Dead secret (should be removed)
| Secret | Status |
|--------|--------|
| LOOP_JWT_SECRET | Superseded by RALD_JWT_SECRET — delete from repo |

---

## All Integrations

| Integration | Type | Status |
|-------------|------|--------|
| Supabase | Database + Auth primitives | Active |
| LiveKit Cloud | Real-time audio | Active |
| Termii | SMS OTP | Active |
| profiles.rald.cloud | RALD SSO | Active |
| Tencent RTC | Audio fallback | Configured, inactive |
| OpenRouter | AI features | Not yet (key not set) |

---

## Frontend Page Map

| Route | Page | Guard |
|-------|------|-------|
| / | FeedPage | Auth required |
| /discover | DiscoverPage | Auth required |
| /live | LivePage | Auth required |
| /messages | MessagesPage | Auth required |
| /me | MeLaunchPage | Auth required |
| /rooms/:id | RoomPage | Auth required |
| /login | LoginPage | Public |
| /onboarding | OnboardingPage | Auth required, !onboarded |
| /create | CreatePage | Auth required |
| /create/:kind | CreatePage | Auth required |
| * | NotFound | Public |

---

## Data Flow: New User

```
1. Phone entry (login.tsx)
   └─→ POST /api/auth/send-otp → Termii SMS

2. OTP verification (login.tsx)
   └─→ POST /api/auth/verify-otp
       └─→ Supabase: upsert profiles (id, phone, created_at)
       └─→ Returns: { access_token, user }
       └─→ Stored: localStorage["loop_token"]

3. Onboarding (onboarding.tsx) — V2 Progressive Trust
   └─→ Step 1: display_name input
       └─→ Supabase: profiles.update({ display_name, username })
   └─→ Step 2: Enter Loop
       └─→ Supabase: profiles.update({ onboarded: true })

4. Feed (feed.tsx)
   └─→ GET /api/rooms → Supabase rooms list

5. Progressive data collection (contextual)
   └─→ Near me → Supabase: profiles.update({ state_id })
   └─→ Host room → prompt avatar (future)
   └─→ DM → prompt bio/handle (future)
```
