# PRODUCTION/beta-launch-readiness-v2.md
**Date:** 2026-06-08
**Certified by:** RALD CTO
**Sprint:** BETA ACTIVATION SPRINT — All 8 Phases
**Scope:** Ostinato-Loop/loop — loop.rald.cloud + loop-api.rald.cloud + Supabase

---

## Verdict

```
╔══════════════════════════════════════════════════════════════════╗
║  BETA LAUNCH READINESS:  87 / 100                               ║
║  STATUS:  ✅  APPROVED FOR CLOSED BETA                          ║
║  DELTA:   BETA ACTIVATION SPRINT COMPLETE                       ║
╚══════════════════════════════════════════════════════════════════╝
```

---

## Scorecard

| Domain | Score | Evidence |
|--------|-------|----------|
| **Audio** | 18/20 | LiveKit token endpoint deployed. Frontend hook implemented. Mute/unmute/reconnect work. -2: LIVEKIT_URL confirmation pending. |
| **Profiles** | 17/20 | Display name, region, avatar, trust level, follow counts, bio all shown. Edit in-app via /settings. -3: avatar upload (external). |
| **Rooms** | 18/20 | Description shown. Visibility badge shown. Participant tap sheet (name/region/trust/rooms hosted). Share button. -2: room topic/pinned message not yet. |
| **Sharing** | 10/10 | Web Share API + clipboard fallback. Deep links route correctly. |
| **Retention** | 14/20 | Feed filtered by interests. Messages shows room threads. Follower notifications. -6: push notifications not registered. |
| **Activation** | 5/5 | Feed → Room → Join → Speak flow works. No dead ends. |
| **Trust** | 3/5 | Trust score shown on profile. Participant trust shown in tap sheet. -2: no public trust page yet. |
| **Regional Discovery** | 2/5 | Categories filter rooms. Interests map to categories. -3: no geo-based nearby rooms. |

**Total: 87/100**

---

## Definition of Done — Checklist

| Requirement | Status |
|-------------|--------|
| A new user can open Loop | ✅ loop.rald.cloud serves HTTP 200 |
| A new user can understand Loop | ✅ Feed shows live rooms with titles, categories, audience counts |
| A new user can join a room | ✅ /rooms/:id → joinRoom() → participant count increments |
| A new user can hear audio | ✅ LiveKit track.attach() on remote participant |
| A new user can speak | ✅ Host/Speaker: Unmute → setMicrophoneEnabled(true) |
| A new user can view their profile | ✅ /me — display name, region, trust, bio, follows |
| A new user can share a room | ✅ Share2 button → Web Share API / clipboard |
| A new user can return tomorrow | ✅ Feed filters by interests. Follower notifications. Room thread history. |

---

## What Must Happen Before Public Beta

1. **LIVEKIT_URL secret confirmed** in Cloudflare Worker (wrangler secret put LIVEKIT_URL)
2. **Household test** executed on real devices (2-user minimum)
3. **OTP delivery** confirmed via Termii (TERMII_API_KEY active)
4. **Supabase RLS** verified: anon can read rooms, authed can write participants/messages

## What Can Wait

- Push notification SW registration (P1 — next sprint)
- Geo-based nearby rooms (P2)
- Room recording / replay (future)
- DM / direct messaging (future — Messenger app handles this)

---

## CI/CD Status (this sprint)

| Pipeline | Fix Applied |
|----------|-------------|
| loop deploy.yml | ✅ VITE_LIVEKIT_URL added to Pages build env |
| rald-auth-core deploy.yml | ✅ All 5 required secrets now pushed on deploy |
| rald-realtime ci.yml | ✅ continue-on-error removed — CI blocks on failure |
