# AUDIT/05 — Loop Performance Audit
**Date:** 2026-06-06 | **Auditor:** RALD CTO / SRE  
**Method:** Source code analysis | **Repo:** Ostinato-Loop/loop

---

## Worker Performance
| Property | Value | Assessment |
|---|---|---|
| Runtime | Cloudflare Workers V8 isolate | No cold start ✅ |
| Framework | Hono | ~2ms overhead ✅ |
| Compatibility | nodejs_compat | ✅ |

---

## PERF-001 — HIGH: N+1 Profile Fetch Per Realtime Message

**Evidence (room.tsx realtime INSERT handler):**
```typescript
.on("postgres_changes", { event: "INSERT", table: "room_messages" }, async (payload) => {
  const { data: prof } = await supabase
    .from("profiles").select("username, display_name, avatar_url")
    .eq("id", m.user_id).maybeSingle();  // ← 1 HTTP request per incoming message
  setMessages(s => [...s, { ...m, profiles: prof }]);
})
```

50 active chatters × 1 msg/sec = 50 individual HTTP requests to Supabase per second, per client.  
At 100 concurrent users in a room: 5,000 Supabase requests/second across all clients.

**Fix — client-side profile cache:**
```typescript
const profileCache = useRef<Map<string, Profile>>(new Map());

// In realtime callback:
const cached = profileCache.current.get(m.user_id);
if (cached) {
  setMessages(s => [...s, { ...m, profiles: cached }]);
} else {
  const { data: prof } = await supabase.from("profiles").select("...").eq("id", m.user_id).maybeSingle();
  if (prof) profileCache.current.set(m.user_id, prof);
  setMessages(s => [...s, { ...m, profiles: prof }]);
}
```

---

## PERF-002 — MEDIUM: Speaking Indicators Are Simulated (Not Real Audio)

```typescript
const tick = setInterval(() => {
  const active = new Set<string>();
  speakers.forEach(sp => { if (Math.random() > 0.5) active.add(sp.user_id); });
  setSpeakingIds(active);
}, 1800);
```

Code comment in room.tsx confirms this is simulation, not real audio. Causes:
1. Full re-render of all SpeakerAvatar components every 1.8 seconds
2. CSS ring animations reset on every re-render
3. No correlation to actual audio

**Blocked by P0-001 (no audio).** When audio is implemented, replace with LiveKit VAD events.

---

## PERF-003 — MEDIUM: No Component Memoization

SpeakerAvatar and AudienceAvatar have no `React.memo()`. With 100 participants, the 1.8s tick causes:
- All 100 avatar components re-render
- All avatar gradient calculations re-run
- All CSS transitions reset

```typescript
const SpeakerAvatar = React.memo(({ p, speaking }: { p: ParticipantRow; speaking: boolean }) => { ... });
const AudienceAvatar = React.memo(({ p }: { p: ParticipantRow }) => { ... });
```

---

## PERF-004 — MEDIUM: 4 Supabase Calls on Room Join

```typescript
const [r, p, m] = await Promise.all([
  getRoom(roomId),         // GET /rest/v1/rooms?id=eq.{id}
  listParticipants(roomId), // GET /rest/v1/room_participants?room_id=eq.{id}&select=*,profiles(...)
  listMessages(roomId),    // GET /rest/v1/room_messages?room_id=eq.{id}&select=...
]);
await joinRoom(roomId, user.id); // 4th call, sequential
```

Minimum 2 network round-trips before room content renders.  
On 3G in West Africa (300-500ms RTT): 600-1000ms join latency.

**Fix:** Supabase RPC function returning room + participants + recent messages in one call:
```sql
CREATE OR REPLACE FUNCTION get_room_full(p_room_id uuid, p_user_id uuid)
RETURNS json AS $$ ... $$ LANGUAGE plpgsql;
```

---

## PERF-005 — HIGH: audience_count Never Updated

`rooms.audience_count` is the primary sort key in room listing but never updated.  
All rooms show 0. Sort order meaningless.

**Fix:** See AUDIT/03 for trigger SQL.

---

## PERF-006 — MEDIUM: DO Hand Queue Lost on Cold Start

RoomSession constructor does not load state from storage:
```typescript
// MISSING:
this.handQueue = (await this.state.storage.get<string[]>('handQueue')) ?? [];
```

After DO eviction (idle timeout), hand queue resets despite having been persisted.

**Fix:**
```typescript
constructor(state: DurableObjectState) {
  this.state = state;
  this.state.blockConcurrencyWhile(async () => {
    this.handQueue = (await this.state.storage.get<string[]>('handQueue')) ?? [];
  });
}
```

**Note:** Blocked by the DO not being wired to any route — this fix is for when audio + moderation is implemented.

---

## Supabase Query Performance

| Query | Indexes | Gap |
|---|---|---|
| GET /api/rooms (list) | is_live, visibility, category | audience_count always 0 makes sort meaningless |
| room_messages by room_id | room_id index | No (room_id, created_at DESC) index for pagination |
| room_participants join/leave | room_id + user_id + unique | ✅ Adequate |
| notifications by recipient | recipient_id + read_at partial | ✅ Well-indexed |

---

## Bundle Size
Worker estimated: 150-250KB (Supabase JS client dominant) — within Cloudflare Workers 1MB limit ✅  
Frontend bundle: Unverified — no bundle analyzer in CI pipeline.

---

## Performance Summary

| Finding | Severity | Action Priority |
|---|---|---|
| N+1 profile fetch per message | HIGH | Fix before 50+ concurrent users |
| audience_count never updated | HIGH | Fix this sprint |
| No component memoization | MEDIUM | Fix before beta |
| 4 DB calls on room join | MEDIUM | Fix with RPC in beta |
| DO queue lost on eviction | MEDIUM | Fix when audio/moderation is built |
| Simulated speaking indicators | MEDIUM | Blocked by no audio |
