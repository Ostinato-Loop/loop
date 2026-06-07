# FOUNDATION/interest-graph-v1.md
**Sprint:** V2 Regional Discovery & Onboarding — Phase 5  
**Date:** 2026-06-07  
**Author:** CTO Office — LILCKY STUDIO LIMITED

---

## Purpose

The interest graph maps users to communities through shared interest tags. No AI. No ranking. Pure tag matching.

---

## Interest Categories

| Interest | Tag Key | Community Types |
|----------|---------|-----------------|
| 🎵 Music | music | creator_dj, creator_artist, creator_radio |
| ⚽ Sports | sports | interest |
| 🗳 Politics | politics | interest |
| 💻 Technology | technology | interest, creator_podcaster |
| 📚 Education | education | interest, creator_podcaster |
| 💼 Business | business | interest, creator_podcaster |
| 🎬 Entertainment | entertainment | interest, creator_artist |
| 🎮 Gaming | gaming | interest |
| 🌍 Culture | culture | interest, creator_artist |
| 🙏 Religion | religion | interest |
| ❤️ Relationships | relationships | interest |
| 🏛 Community | community | regional_* |

## Data Model

### User → Interests
Stored on `profiles.interests` (text[] — existing column).

### Community → Interest Tags
Stored on `communities.interest_tags` (text[] — added migration 007).

### Matching Algorithm
Supabase array overlap operator:
```sql
interest_tags && '{music,technology}'::text[]
```

REST equivalent:
```
interest_tags=cs.{"music","technology"}
```

## Interest Onboarding Flow

```
Step 1: Show 12 visual interest cards (no scrolling)
Step 2: User selects 1–3 interests
Step 3: Store in profiles.interests
Step 4: Fire POST /api/activation/auto-join with interests array
Step 5: Show immediate community recommendations
```

## Expansion Rules

- A user can update interests anytime via profile settings
- Re-running auto-join after interest update joins NEW interest communities
- Interest communities are type='interest' with matching interest_tags
- Users may follow multiple interests (no limit — up to 10 stored)

**Phase 5 — COMPLETE ✅**
