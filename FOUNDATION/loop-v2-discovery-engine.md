# FOUNDATION/loop-v2-discovery-engine.md
**Version:** 2.0
**Date:** 2026-06-07
**Status:** APPROVED FOUNDATION — implementation reference
**Classification:** Architecture

---

## Purpose

This document defines the Regional Discovery Engine architecture for Loop V2: how users find rooms, communities, creators, and topics. Discovery is the product. Everything else serves it.

---

## Discovery Principle

```
Layer 1: Where you are     (State → LGA → LCDA)
Layer 2: What you care about (Interests)
Layer 3: Who you trust      (Follow graph)
Layer 4: What is new        (Freshness)
```

No exceptions. A user who sets their region to Ojodu LCDA sees Ojodu content first. Always. Global viral content never surfaces before local relevant content.

---

## Feed Architecture

The discovery feed is composed of **four independent ranked lists** that are interleaved into one unified feed. Each list has its own algorithm. They are never merged into a single score.

```
Feed composition (default weights — tunable):

  Regional Feed       40%  — rooms/communities anchored to user's region
  Interest Feed       30%  — rooms matching user's stated interests
  Follow Feed         20%  — rooms hosted by accounts user follows
  Discovery Feed      10%  — algorithmically surfaced outside user's normal scope
```

### Feed Tabs

The UI presents the feed in tabs:

| Tab | Content | Civic content included? |
|-----|---------|------------------------|
| Home | Regional + Interest interleaved | No (Civic has its own tab) |
| Civic | Civic-only (News, Emergency, Traffic, Weather) | Yes — exclusively |
| Trending | State-level trending rooms | No civic |
| Following | Rooms from followed accounts | Only if user follows civic creator |
| Explore | Discovery outside home region | No civic |

**Civic content is never in the Home, Trending, Explore, or Following tabs.** It exists only in the Civic tab. This is an inviolable constraint — not a product decision.

---

## Regional Discovery Algorithm

### Input signals

| Signal | Weight | Notes |
|--------|--------|-------|
| Region match (exact LCDA) | 10× | Highest signal |
| Region match (LGA) | 5× | |
| Region match (State) | 2× | |
| Is live now | 3× | Multiplies region score |
| Audience count | log(count) | Logarithmic — prevents rich-get-richer |
| Retention score | 1.5× | Rooms with high retention get boosted |
| Recency | decay(age_minutes) | Half-life: 60 minutes for live; 4 hours for scheduled |
| Creator badge level | 1.0–1.5× | LCDA=1.0, LGA=1.2, State=1.4, National=1.5 |
| Community pinned | 2× | Rooms pinned by community admins in user's communities |

### The Anti-Viral Cap

No single room score can exceed 5× the second-ranked room score in a regional feed. This prevents one viral room from consuming the entire regional feed. Overflow rooms are moved to the Trending tab.

### Regional Score Formula

```
regional_score(room, user) =
  region_match_weight(room.region_id, user.region_id)
  × live_multiplier(room.is_live)
  × log(1 + room.audience_count)
  × retention_multiplier(room.avg_retention_pct)
  × recency_decay(room.created_at, room.is_live)
  × badge_multiplier(room.host.highest_badge)
  × community_pin_multiplier(room.community_id, user.communities)

Capped at: min(score, 5 × second_highest_score_in_feed)
```

---

## Interest Discovery Algorithm

Interest discovery runs independently of regional discovery. A user with "Football" interest sees Football rooms from their state first, then national, then global.

### Interest-region pairing

```
interest_regional_score(room, user) =
  interest_match_score(room.category, user.interests)     // 0–1
  × region_proximity_weight(room.region_id, user.region_id)  // 0–1 (1=same region, 0=different country)
  × engagement_velocity(room)                               // reactions per listener per minute
  × log(1 + room.audience_count)
  × recency_decay(room.created_at)
```

### Engagement Velocity (anti-spam)

Velocity = `(reactions + hand_raises + speaker_joins) / (listeners × minutes_active)`

A room with 3 listeners generating 100 reactions has abnormally high velocity → flagged, not boosted. Velocity is normalised by audience size.

---

## Follow Graph Discovery

Follow graph discovery is the simplest algorithm:

```
follow_score(room, user) =
  1 (if room.host_id in user.following_ids)
  × is_live_boost(room.is_live)       // live = 3×
  × recency_decay(room.created_at)

Order: live rooms first, then by recency
No complex scoring — following someone is the strongest social signal possible
```

---

## Discovery Feed (Exploration)

The 10% Explore allocation surfaces rooms outside the user's normal scope. Rules:

- Minimum distance: at least one region level above user's LCDA (i.e. at least LGA level content, could be a different LGA)
- No civic content
- Minimum quality bar: ≥ 10 listeners OR host with LGA badge or higher
- Diversity constraint: max 2 rooms from the same creator in one Explore batch
- Freshness: rooms < 3 hours old preferred

**Why 10%:** Exploration must be small enough to feel curated, not overwhelming. Users should feel they're discovering something, not being spammed with random content.

---

## Default Discovery by Region Setup

### Onboarding Discovery

When a user first joins, before they've set interests or followed anyone:

```
User sets:    Country = Nigeria, State = Lagos, LGA = Ikeja, LCDA = Ojodu

Default feed = ALL live rooms in Ojodu LCDA
             + ALL live rooms in Ikeja LGA  (if Ojodu is empty)
             + ALL live rooms in Lagos State (if Ikeja is empty)

Priority:
  1. Live rooms (any type except Civic — Civic has its own tab)
  2. Scheduled rooms in next 2 hours
  3. Recently active rooms (ended < 30 min ago)
  4. Recently created rooms (created < 24h ago)
```

**Cold-start guarantee:** A user sees content on day one even with zero follows and zero interests set. This is the core user promise of the Regional Network.

---

## Search Architecture

Search is not part of the discovery algorithm — it is a separate system.

### Search scopes

| Scope | What it searches | Default? |
|-------|-----------------|---------|
| My Region | Rooms, communities, creators in user's LGA | Yes |
| My State | Rooms, communities, creators in user's state | On toggle |
| National | All of Nigeria | On toggle |

### Search ranking

```
search_score(result, query) =
  text_similarity(result.name, query)         // full-text match
  × region_proximity(result.region, user.region) // local bias
  × is_live_boost(result.is_live)             // live rooms rank higher
  × creator_badge_boost(result.creator_badge) // verified creators rank higher in search
```

### Search anti-spam

- Rate limit: 30 searches / minute / user
- Keyword blacklist applied before search execution
- Results with >5 abuse reports in last 30 days demoted to bottom of results

---

## Community Discovery

Communities are discovered through:

1. **Regional Community Tab** — communities anchored to user's LGA, then State
2. **Interest matching** — communities whose category matches user's interests
3. **Creator following** — communities owned by followed creators
4. **Search** — explicit search by name or slug

### Community Ranking (in Regional Tab)

```
community_score(community, user) =
  region_match_weight(community.region_id, user.region_id)
  × log(1 + community.member_count)
  × has_active_room_now(community)    // 3× if live room in community
  × recency_of_last_activity(community)  // decay over 7 days
  × is_verified_community(community)  // 1.2× for verified communities
```

---

## Creator Discovery

Creators are discovered through:

1. **Regional Creator Tab** — top creators in user's LGA, ranked by badge tier then attendance
2. **Interest matching** — creators whose room categories match user's interests
3. **Post-room exposure** — creators whose rooms the user attended (suggested "follow this creator")
4. **Search** — explicit search by display name or username

### Creator Discovery Ranking

```
creator_score(creator, user) =
  badge_tier_weight(creator.highest_badge)     // National=4, State=3, LGA=2, LCDA=1
  × region_match_weight(creator.region, user.region)
  × log(1 + creator.total_attendance_30d)
  × retention_quality(creator.avg_retention_pct)
  × recency_of_last_room(creator.last_room_at)  // decay over 14 days
  × NOT creator.is_suspended
```

---

## Trending Algorithm

Trending is State-level. There is no national trending feed (too much dilution). There is no LCDA trending feed (too sparse).

**Trending = State-level leaderboard of rooms by velocity**

```
trending_score(room) =
  audience_velocity(room)           // listeners gained in last 15 min
  + reaction_velocity(room)         // reactions in last 15 min
  + speaker_activity_velocity(room) // hand-raises in last 15 min

Updated: every 5 minutes
Window: rolling 30 minutes
Cap: top 20 rooms per state
```

**Trending has a diversity constraint:**
- Max 3 rooms from the same creator
- Max 5 rooms from the same category
- 0 civic rooms (civic is never in Trending)

---

## Freshness and Recency Decay

All algorithms apply a time-decay function to prevent old content from occupying discovery slots.

### Decay functions

**For live rooms:**
```
decay(age_minutes) = e^(-age_minutes / 60)
// Half-life: 60 minutes
// A 2-hour-old live room has 13% of the score of a brand-new live room
```

**For ended rooms:**
```
decay(age_hours) = e^(-age_hours / 4)
// Half-life: 4 hours
// An 8-hour-old ended room has 2% discovery weight
// Ended rooms effectively disappear from discovery within 12 hours
```

**For communities (activity decay):**
```
decay(age_days) = e^(-age_days / 7)
// Half-life: 7 days
// An inactive community disappears from discovery within ~21 days
```

---

## Anti-Gaming Controls

| Attack | Control |
|--------|---------|
| Audience farming | Logarithmic audience scaling; bot detection |
| Reaction flooding | Per-user reaction rate limit (10/minute); velocity normalisation |
| Keyword stuffing in room title | Title length cap (120 chars); ML classifier for spam signals |
| Creating many short rooms to boost room count | Minimum 5-minute duration for any room to count in creator scoring |
| Follow farming | Follows from accounts < 3 days old are weighted 0 in social signals |
| Geographic spoofing | IP geolocation cross-check against stated region; flag on mismatch |
| Creator badge farming | All growth metrics require 30-day trailing window; no single-event spikes |

---

## Personalisation Maturity Phases

| Phase | What's live | Personalisation level |
|-------|------------|----------------------|
| V2 Launch | Regional + Interest + Follow feeds | Low — region and interest are user-set, not inferred |
| V2.1 | Post-session signals (what rooms did user stay in?) | Medium — retention-based inference |
| V2.2 | Collaborative filtering (users like you also stayed in...) | High — explicit ML model |
| V3 | Real-time re-ranking based on session behaviour | Full personalisation |

**No ML personalisation at V2 launch.** Algorithmic personalisation requires a minimum dataset (>10,000 users with >5 sessions each). Launching ML before sufficient data = optimising for noise. The regional + interest system provides sufficient quality discovery at launch.

---

*End of FOUNDATION/loop-v2-discovery-engine.md*
