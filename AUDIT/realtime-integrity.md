# AUDIT/realtime-integrity.md
## Loop V1 — Realtime Integrity Report
**Generated:** 2026-06-08 | **Sprint:** V1 Stabilization — Phase 6

---

## Summary

| Check | Status |
|---|---|
| Room creation | ✅ Working |
| Room joining (LiveKit) | ✅ Working |
| Participant count update | ✅ Working |
| Audio publishing | ✅ Working |
| Audio subscribing | ✅ Working |
| Room chat | ✅ Working (LiveKit DataChannel) |
| Room exit (graceful) | ✅ Working |
| Room close (host exit) | ✅ Working |
| Presence (who's in room) | ✅ Working |
| Reconnection / failover | ⚠️ Partial (LiveKit auto-reconnect) |
| Tencent RTC fallback | ⚠️ Configured, not active |
| RealtimeKit | ❌ Not in use (LiveKit chosen) |

---

## LiveKit Integration

### Token Flow
```
1. Frontend calls POST /api/rooms (create) or GET /api/rooms/:id (join)
2. Worker creates LiveKit room (if create) + generates participant token
3. Token grants: canPublish=true (host), canPublish=false (listener)
4. Frontend uses token to connect to LiveKit Cloud (WSS)
5. Audio track published (host) / subscribed (listener) automatically
```

### Room Lifecycle
```
Host creates room → LiveKit room created → participants join
                 ↓
Host exits → DELETE /api/rooms/:id → LiveKit room closed → all participants disconnected
                 ↓
Participant exits → LiveKit disconnect event → participant count decremented
```

### Verified Scenarios

| Scenario | Status | Notes |
|----------|--------|-------|
| Host creates room, joins audio | ✅ | LiveKit token with canPublish=true |
| Listener joins, hears host | ✅ | LiveKit token with canPublish=false |
| Multiple listeners | ✅ | Up to LiveKit plan limit |
| Participant count shown in UI | ✅ | audience_count from Supabase |
| Room chat (text) | ✅ | LiveKit DataChannel |
| Host mutes self | ✅ | LiveKit track mute |
| Host ends room | ✅ | DELETE + LiveKit room close |
| Listener leaves | ✅ | LiveKit disconnect |
| Network drop reconnect | ⚠️ | LiveKit auto-reconnect (5 retries) |
| Token expiry in room | ⚠️ | Requires room rejoin (1h token) |

---

## Tencent RTC Fallback

**Status:** Configured in codebase but NOT active in production.
- Tencent credentials set up in env.ts
- No active traffic routing to Tencent
- LiveKit is primary and only active transport

**Recommendation:** Define a clear failover trigger. Currently undefined.

---

## Real-time Presence

Presence is implemented via:
1. LiveKit `participantConnected` / `participantDisconnected` events → local state
2. Supabase `audience_count` column updated on join/leave

**Known gap:** audience_count in Supabase may lag behind LiveKit events by 2-5 seconds.
Not a user-facing issue at current scale.

---

## Audio Quality

| Parameter | Value | Status |
|-----------|-------|--------|
| Codec | Opus | ✅ |
| Sample rate | 48kHz | ✅ |
| Channels | Mono (voice) | ✅ |
| Noise suppression | LiveKit built-in | ✅ |
| Echo cancellation | Browser native | ✅ |
| Bitrate | Adaptive (LiveKit) | ✅ |

---

## Recommendations

1. **Token renewal in-room:** Implement token refresh before 1h expiry to prevent disconnection.
2. **Failover definition:** Define when to trigger Tencent RTC fallback (e.g., LiveKit unreachable for 10s).
3. **Supabase audience_count sync:** Add Supabase Realtime listener to sync count without polling.
4. **Recording:** LiveKit recording not configured — decide if rooms should be archivable.
5. **Room capacity:** No max participant limit set. Recommend 1000 listeners for V1.
