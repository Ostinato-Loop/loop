# AUDIT/01 — Loop Architecture Audit
**Date:** 2026-06-06 | **Auditor:** RALD CTO | **Method:** Direct source code inspection — no assumptions  
**Scope:** artifacts/cloudflare-worker/ + artifacts/loop/ + supabase/ | **Repo:** Ostinato-Loop/loop

---

## Executive Summary

Loop is architecturally split across three runtimes with no coherent data access strategy. The Cloudflare Worker handles auth and room listing only. All room write operations (join, leave, message, reaction) bypass the Worker and go directly from the frontend to Supabase REST. Cloudflare D1 is provisioned but never used. Durable Objects are scaffolded but inactive. LiveKit appears in `.dev.vars.example` but has no type definition, no SDK import, and no implementation anywhere.

**Overall architecture health: 4/10 — YELLOW-RED**

---

## 1. Worker Routes (Verified from src/index.ts + route files)

| Method | Path | Auth | Status |
|---|---|---|---|
| GET | /health | None | ✅ Live |
| POST | /api/auth/send-otp | None | ✅ Implemented |
| POST | /api/auth/verify-otp | None | ✅ Implemented |
| GET | /api/auth/me | Bearer JWT | ✅ Implemented |
| POST | /api/auth/rald-sso | None | ✅ Implemented |
| GET | /api/auth/silent | Cookie | ✅ Implemented |
| GET | /api/rooms | None | ✅ Read-only listing |
| GET | /api/rooms/recommendations | Bearer | ✅ Implemented |
| POST | /api/rooms/:id/queue-summary | Bearer | ✅ Queue only |
| GET | /api/trending | None | ✅ Implemented |
| POST | /api/rooms (create) | — | **NOT IMPLEMENTED ❌** |
| GET | /api/rooms/:id (get by ID) | — | **NOT IMPLEMENTED ❌** |
| * | /api/rooms/:id/participants | — | **NOT IMPLEMENTED ❌** |
| * | /api/rooms/:id/messages | — | **NOT IMPLEMENTED ❌** |
| * | /api/rooms/:id/raise-hand | — | **NOT IMPLEMENTED ❌** |
| * | /api/rooms/:id/end | — | **NOT IMPLEMENTED ❌** |
| * | /api/rooms/:id/moderate | — | **NOT IMPLEMENTED ❌** |

**Critical finding: The Worker is read-only. All room writes (createRoom, joinRoom, leaveRoom, sendMessage, sendReaction, listParticipants) go directly from the frontend to Supabase REST, completely bypassing the Worker.**

---

## 2. Binding Inventory (Verified: wrangler.toml + env.ts)

| Binding | Type | Identifier | Used in Routes | Assessment |
|---|---|---|---|---|
| DB | D1 Database | loop-db (4616fcac-96e0-4150-a42f-3d020f45cd1d) | **No** | Dead weight — cost, zero benefit ❌ |
| CACHE | KV Namespace | 3c71da01b3174d6c9353adbfde7491a3 | Yes — OTP, rate-limit | ✅ |
| MEDIA | R2 Bucket | loop-media | **No** | Unused ❌ |
| TASK_QUEUE | Queue | loop-tasks | Yes — queue-summary | ✅ |
| ROOM_SESSION | Durable Object | RoomSession | **No route calls it** | Scaffold only ❌ |
| AI | Workers AI | — | **No** | Unused ❌ |
| SUPABASE_URL | Var | wrangler [vars] | Yes | ✅ |
| CORS_ORIGIN | Var | wrangler [vars] | Yes | ⚠️ Parsing unverified |
| RALD_JWT_SECRET | CF Secret | (unverified) | Yes — auth/me | ⚠️ Must verify in dashboard |

---

## 3. Durable Objects: RoomSession (src/durable-objects/room-session.ts)

Status: **Scaffold — code explicitly documents "not production"**

Capabilities implemented: hand-raise queue (/raise-hand, /lower-hand, /queue endpoints)

Problems:
- `handQueue` is class property (in-memory) NOT loaded from DO storage on cold start — queue lost on eviction
- No Worker route calls the DO
- `toggleHandRaise()` in room.tsx = `useState` only — toast "host will be notified" is false

---

## 4. Audio: NOT IMPLEMENTED (P0 Blocker)

Evidence:
- `LIVEKIT_API_KEY` in .dev.vars.example but absent from `CloudflareEnv` typedef
- No LiveKit, Daily, Agora, Twilio, or WebRTC dependency in any package.json
- `setMuted((m) => !m)` in room.tsx toggles React state only. No `getUserMedia`. No audio track.

---

## 5. Frontend Data Flow

```
Frontend → Supabase REST (direct — bypass Worker for all room writes)
Frontend → Supabase Realtime WebSocket (direct — bypass Worker for presence)
Frontend → loop-api.rald.cloud (Worker — auth only)
```

room.tsx uses:
- `getRoom`, `joinRoom`, `leaveRoom`, `listMessages`, `listParticipants`, `sendMessage`, `sendReaction`
  → All call Supabase REST directly via `@/lib/api/rooms`
- `supabase.channel()` with `postgres_changes` → Supabase Realtime

---

## 6. .dev.vars.example vs CloudflareEnv — Gaps

In .dev.vars.example but NOT in env.ts (dead/stale):
`LIVEKIT_API_KEY`, `MUX_TOKEN`, `SPORTSMONKS_API_KEY`, `COSON_API_KEY`, `TENCENT_API_KEY`, `CLOUDFLARE_API_TOKEN`

In env.ts (CloudflareEnv) but NOT in .dev.vars.example (critical gap):
**`RALD_JWT_SECRET`** ← developer onboarding failure path. Any developer following example deploys broken RALD SSO auth.

---

## 7. CORS Production Risk

- Default [vars]: `CORS_ORIGIN = "*"`
- Production [env.production.vars]: `CORS_ORIGIN = "https://loop.rald.cloud,https://loop.ostinato-loop.pages.dev"`
- Risk 1: If deployed without `--env production`, wildcard CORS goes live
- Risk 2: CORS middleware must parse comma-separated string — simple `===` comparison will reject all production requests

---

## 8. Orphaned Service Files

`civic.ts`, `commentary.ts`, `translation.ts` — no route imports them. Dead code deployed to production.

---

## 9. Recommendations

| Priority | Action |
|---|---|
| P0 | Integrate audio SDK (LiveKit) — frontend + Worker token endpoint |
| P0 | Add room write/moderation Worker routes (create, get, participants, messages, raise-hand, end, moderate) |
| P1 | Add RALD_JWT_SECRET to .dev.vars.example |
| P1 | Remove D1, R2, AI bindings or assign explicit purpose |
| P1 | Wire hand-raise through Worker → DO → host notification |
| P1 | Verify CORS middleware parses multi-origin string |
| P2 | Move all room writes behind Worker for server-side business logic enforcement |
| P2 | Remove or wire orphaned service files |
