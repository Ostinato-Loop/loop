# AUDIT/retention-readiness.md
**Date:** 2026-06-08
**Auditor:** RALD CTO — BETA ACTIVATION SPRINT Phase 6
**Scope:** Return loop — why would a user come back tomorrow?

---

## Retention Mechanisms in Production

### What the User Sees on Return

| Surface | Content | Source |
|---------|---------|--------|
| Feed (/feed) | Live rooms NOW — filtered by their interests | Supabase rooms + profile.interests |
| Feed "Picked for you" | Rooms matching their top interest category | listRooms({ category: interests[0] }) |
| Messages (/messages) | Rooms they participated in + last message | room_participants + room_messages JOIN |
| Profile (/me) | Followers count (real), following count (real) | /api/follows/me/counts |
| Profile activity tab | "Rooms" they've been in — threads with last message | Supabase room_participants + rooms |
| Notifications (/notifications) | New followers, trust level nudges, profile completion | /api/follows/me/followers |

### Answer: Why Would a User Come Back Tomorrow?

**Three loops are in place:**

1. **Content Loop** — Feed is live. If someone in their network or region starts a room, it appears immediately. Category filter lets them zero in on what they care about (Civic, Music, Sports etc.).

2. **Social Loop** — Follow system is live. New follower notifications bring users back. The profile page shows follower growth.

3. **Completion Loop** — Profile completion tracker creates an 8-step engagement funnel. Incomplete items (region, avatar, interests) each have a specific action link.

### What's Missing (P1, not blocking beta)

| Feature | Gap | Effort |
|---------|-----|--------|
| Push notifications | /api/notifications endpoint exists, SW not registered | 1 sprint |
| "Rooms you follow" section | Follow data exists, no feed section yet | 0.5 sprint |
| Suggested nearby rooms | Regions in DB, no geo-filter on feed | 1 sprint |
| Room replay / recording | Not planned for V1 | Future |

---

## Verdict: Core retention loop exists. Social + content + completion loops are all functional.
Push notifications are the highest-leverage next step for Day 2 return rate.
