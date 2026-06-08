# RETENTION ENGINE PLAN
**Date:** 2026-06-08  
**Mission:** Make a user return tomorrow. Make them bring a friend next week.  
**Source of truth:** `loop` repo — social graph, follows, notifications, communities, Supabase  
**Infrastructure available:** `rald-notify` (SMS via Termii, email via Resend, push via Web Push API)

---

## The Fundamental Problem

A user joins a room. The room ends. There is no mechanism to pull them back.

The infrastructure exists to fix this. `rald-notify` is built. The social graph schema is applied. `use-push-permission.ts` is implemented in the frontend. `notification-prompt.tsx` is built. **None of it is wired to room lifecycle events.**

This plan wires what exists.

---

## Why Users Return to Audio Platforms

From the user return analysis audit:

| Return Driver | Mechanism | Current Status |
|---|---|---|
| "Someone I follow just went live" | Follow → push notification | Follow schema ✅, notification ❌ not triggered |
| "I belong to a community with regulars" | Community membership | Communities ✅, community rooms ✅, notifications ❌ |
| "I was in a conversation yesterday — there's a follow-up today" | Room scheduling | Not implemented |
| "3 rooms in my region right now" | Regional discovery | `009_rald_region_registry.sql` ✅, UI ✅, needs wire-up |
| "I started my profile — I want to finish it" | Progressive profile completion | Partial — `onboarded` field exists |
| "Someone followed me" | Social notification | Schema ✅, not triggered |

---

## Retention Engine Architecture

```
Room Lifecycle Events (Cloudflare Worker)
  │
  ├── room:started → notify followers of host
  ├── room:ended   → prompt host to schedule next
  ├── user:followed → notify followed user
  └── user:joined_community → welcome notification

  ↓
rald-notify Worker (already deployed)
  ├── push: Web Push API (use-push-permission.ts ready)
  ├── sms:  Termii (Nigerian mobile — requires balance top-up)
  └── email: Resend (active)

  ↓
User returns tomorrow
```

---

## Plan by Layer

---

### Layer 1: Follow Notifications (Highest Impact, Lowest Cost)

**What exists:**
- `loop/supabase/migrations/011_follows.sql` — `follows` table applied
- `loop/artifacts/loop/src/hooks/use-follow.ts` — follow/unfollow calls
- `loop/artifacts/loop/src/lib/api/follows.ts` — API routes
- `rald-notify` — notification delivery
- `use-push-permission.ts` — permission already requested

**What's missing:** When a user creates a room, `rald-notify` is not called for their followers.

**Fix 1.1 — Wire room creation to follower notifications**

In `loop/artifacts/cloudflare-worker/src/services/` (add file `notifications.ts`):
```typescript
export async function notifyFollowers(
  env: Env,
  hostId: string, 
  room: { id: string; title: string }
): Promise<void> {
  // 1. GET /follows?following_id=hostId from Supabase
  // 2. For each follower, POST https://notify.rald.cloud/push with:
  //    { userId, title: `${hostDisplayName} is live`, body: room.title, url: `/room/${room.id}` }
  // 3. Fire-and-forget via ctx.waitUntil() — don't block the room creation response
}
```

Call from room creation handler: `ctx.waitUntil(notifyFollowers(env, userId, room))`

**Fix 1.2 — "Someone followed you" notification**  
In `loop/artifacts/loop/src/lib/api/follows.ts` follow action, after Supabase insert, call `rald-notify`:
```typescript
await fetch('https://notify.rald.cloud/push', {
  method: 'POST',
  body: JSON.stringify({ 
    userId: followedUserId,
    title: `${followerName} started following you`,
    body: 'Tap to view their profile',
    url: `/profile/${followerUsername}`
  })
})
```

---

### Layer 2: Community Pulse (Medium Cost, High Retention Impact)

**What exists:**
- Full community schema (9 migrations applied)
- `communities.tsx` page — browse, join, view
- `community.$id.tsx` — community detail with rooms
- `NearbyCommunitiesResponse` type with region detection

**What's missing:** Community activity notifications ("There's a room happening in your community right now")

**Fix 2.1 — Community room notification**  
When a room is created inside a community (`room.community_id IS NOT NULL`), notify all community members who have push enabled:
```typescript
// Add to room creation handler
if (roomInput.communityId) {
  ctx.waitUntil(
    notifyCommunityMembers(env, roomInput.communityId, room)
  )
}
```

**Fix 2.2 — "Community milestone" notification**  
When a community reaches 10, 50, 100 members — one-time congratulation notification to the owner. Creates pride and attachment.

**Fix 2.3 — Weekly community digest (email)**  
Sunday evening: send each community member a digest via Resend.  
Content: rooms count this week, top speaker, member growth.  
Implementation: Supabase scheduled function (Edge Functions cron).

---

### Layer 3: Room End → Next Room Intent

**What exists:**
- Room end state in `loop/artifacts/loop/src/pages/room.tsx`
- Profile page with schedule concept referenced in audit

**What's missing:** At room end, capture the host's intent to return.

**Fix 3.1 — Post-room scheduling prompt**  
When the host ends a room, show a bottom sheet:

```
"Want to host again?"
[Tomorrow at 8pm] [This weekend] [Pick a time]
[Skip]
```

If the host sets a time:
1. Store in a new `room_schedules` table (simple: `host_id`, `community_id`, `scheduled_for`, `title`)
2. Notify all followers 30 minutes before via `rald-notify`
3. Show on host's profile: "Next room: Tomorrow at 8pm"

**Fix 3.2 — Post-room share card**  
After a room ends, generate a share card:
```
"I just hosted 'Lagos Tech Talk' on Loop
23 people listened | 45 minutes
Join me next time: loop.rald.cloud/@adewale"
```
Allow host to share directly to WhatsApp (the primary sharing surface in Nigeria).  
WhatsApp deep link: `https://wa.me/?text=` — no API needed.

---

### Layer 4: Progressive Profile Completion

**What exists:**
- `Profile` type: `username`, `display_name`, `avatar_url`, `bio`, `language`, `interests`, `is_creator`, `is_verified`, `onboarded`
- `loop/artifacts/loop/src/pages/settings.tsx` (22KB) — full settings UI
- `onboarded` boolean field on profile

**What's missing:** A visual completion prompt that drives users back to finish their profile.

**Fix 4.1 — Profile completion score**  
```typescript
function profileCompletionScore(profile: Profile): number {
  let score = 0
  if (profile.username) score += 20
  if (profile.display_name) score += 15
  if (profile.avatar_url) score += 20
  if (profile.bio) score += 20
  if (profile.language) score += 10
  if (profile.interests?.length) score += 15
  return score  // 0–100
}
```

**Fix 4.2 — In-room profile nudge**  
If a user speaks in a room and their `avatar_url` is null, show after the room:  
*"Speakers with photos get 3x more follows. Add yours in 10 seconds."*

**Fix 4.3 — RALD ID trust signal**  
Display the RALD ID prominently on profile (`RALD-A3F9KZ`).  
Add a one-sentence explanation: *"Your RALD ID proves you're a real person in the Loop community."*  
This creates identity investment — users with a visible RALD ID are more likely to return.

---

### Layer 5: Regional Belonging

**What exists:**
- `009_rald_region_registry.sql` — full Nigerian LGA/LCDA/state hierarchy (29KB)
- `NearbyCommunitiesResponse` type with `detected_region`, `merge_level`
- `loop/artifacts/loop/src/lib/regions-data.ts` (16KB) — full region dataset on the client

**What's missing:** The regions data is loaded but the discover page doesn't prominently surface "what's happening in your region."

**Fix 5.1 — Regional room count in discover header**  
```
Discover
──────────────────────
Lagos Island  •  3 rooms live now  •  147 members
```
Pull from: `GET /api/rooms?region=lagos-island` (filter by `region_id`).

**Fix 5.2 — "Be the first host in [region]" empty state**  
When a region has 0 active rooms:
```
No rooms in Kano yet.
Start the first one — people are waiting.
[Start a room]
```
This converts discovery empty states into creation prompts.

**Fix 5.3 — Regional leaderboard (lightweight)**  
Top 3 most active hosts in each region this week. Shown in the community/discover sidebar.  
Data: `room_participants` count grouped by `host_id` and `region`.

---

## Retention Metrics to Track

| Metric | Definition | Target (100 users) | Target (1,000 users) |
|--------|------------|--------------------|----------------------|
| D1 retention | Users who return within 24h of first session | > 25% | > 35% |
| D7 retention | Users who return within 7 days | > 12% | > 18% |
| Push opt-in rate | Users who accept push permission | > 40% | > 50% |
| Notification open rate | Push taps / push sent | > 30% | > 25% |
| Follow rate | Users who follow ≥1 person within first session | > 30% | > 40% |
| Community join rate | Users who join ≥1 community within first week | > 25% | > 35% |
| Profile completion | Users with avatar + bio + username set | > 40% | > 55% |

Track these in `raldtics-core` once deployed, or use Supabase `012_analytics.sql` migration (already applied).

---

## Implementation Order

```
Week 1 — Wire existing infrastructure
[ ] Fix 1.1: room:created → notify followers (ctx.waitUntil, no blocking)
[ ] Fix 1.2: user:followed → notify followed user
[ ] Fix 4.1: Profile completion score in settings page
[ ] Fix 5.1: Regional room count in discover header

Week 2 — Community and scheduling
[ ] Fix 2.1: community room → notify community members
[ ] Fix 3.1: Post-room scheduling prompt (host only)
[ ] Fix 3.2: WhatsApp share card after room ends

Week 3 — Long-term return mechanisms  
[ ] Fix 2.3: Weekly community digest (Resend + Supabase Edge Function cron)
[ ] Fix 4.2: In-room profile nudge for speakers without avatars
[ ] Fix 5.2: "Be the first host" regional empty states
[ ] Fix 5.3: Regional activity leaderboard
```

---

## One Rule for All Future Features

Before adding any retention feature, answer:

- **A. Why does a user need this?** (Real user pain, not product assumption)
- **B. How does this improve retention?** (D1 or D7 metric impact)
- **C. How does this improve trust?** (Does it show who the user is?)
- **D. How does this improve community?** (Does it connect people?)
- **E. How does this improve regional belonging?** (Does it make them feel at home?)

If none apply: do not build it.

---

*Prepared for LILCKY STUDIO LIMITED — Loop Hardening Directive — 2026-06-08*
