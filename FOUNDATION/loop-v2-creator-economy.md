# FOUNDATION/loop-v2-creator-economy.md
**Version:** 2.0
**Date:** 2026-06-07
**Status:** APPROVED FOUNDATION — implementation reference
**Classification:** Architecture

---

## Purpose

This document defines the Creator Economy architecture for Loop V2: the Growth Ladder, badge system, promotion criteria, abuse prevention, and creator governance model.

No monetisation is in scope for this document. The Creator Economy is the *reputation and trust infrastructure* on which any future monetisation must rest.

---

## The Creator Growth Ladder

Creators advance through four badge tiers. Each badge represents verified earned trust within a geographic scope. Badges are earned — never bought, never assigned by hand.

```
                    ┌──────────────────────────────┐
                    │  🏛  National Badge           │  Top ~500 creators
                    │  Scope: All of Nigeria        │
                    └──────────────┬───────────────┘
                                   ↑ Promotion criteria
                    ┌──────────────────────────────┐
                    │  🗺  State Badge              │  Top ~100 per state
                    │  Scope: One state             │
                    └──────────────┬───────────────┘
                                   ↑ Promotion criteria
                    ┌──────────────────────────────┐
                    │  🏙  LGA Badge                │  Top ~50 per LGA
                    │  Scope: One Local Gov. Area   │
                    └──────────────┬───────────────┘
                                   ↑ Promotion criteria
                    ┌──────────────────────────────┐
                    │  🏘  LCDA Badge               │  Entry tier
                    │  Scope: One LCDA             │
                    └──────────────────────────────┘
                                   ↑ Entry criteria
                    ┌──────────────────────────────┐
                    │  👤  Regular User             │  All users
                    └──────────────────────────────┘
```

---

## Entry: Regular User → LCDA Badge

### Criteria (all must be met)

| Signal | Threshold | Window |
|--------|-----------|--------|
| Rooms hosted in LCDA | ≥ 5 rooms | Last 60 days |
| Total audience | ≥ 100 unique listeners | Last 60 days |
| Avg listener retention | ≥ 40% (listeners staying > 50% of room duration) | Last 60 days |
| Active speaking sessions | ≥ 10 sessions as speaker (not just listener) | Last 60 days |
| No active abuse strikes | 0 strikes | Current |
| Account age | ≥ 14 days | — |
| Profile completion | Name, avatar, region set | — |

### Process

1. System evaluates daily. When thresholds are met, a badge candidate is flagged.
2. Candidate waits 7-day review window (automated + community report review).
3. If no credible abuse reports: LCDA badge is granted automatically.
4. Notification sent: "You've earned the Ojodu LCDA Creator badge."

---

## Tier 1 → 2: LCDA Badge → LGA Badge

### Criteria (all must be met within the LCDA badge scope)

| Signal | Threshold | Window |
|--------|-----------|--------|
| Rooms hosted | ≥ 20 rooms | Last 90 days |
| Total audience | ≥ 1,000 unique listeners | Last 90 days |
| Avg listener retention | ≥ 50% | Last 90 days |
| Cross-LCDA reach | ≥ 3 distinct LCDAs in audience | Last 90 days |
| Community growth | Own community ≥ 100 members | Current |
| Abuse record | 0 strikes in last 90 days | Last 90 days |
| Hold LCDA badge | ≥ 30 days | — |

---

## Tier 2 → 3: LGA Badge → State Badge

### Criteria

| Signal | Threshold | Window |
|--------|-----------|--------|
| Rooms hosted | ≥ 50 rooms | Last 180 days |
| Total audience | ≥ 10,000 unique listeners | Last 180 days |
| Avg listener retention | ≥ 55% | Last 180 days |
| Cross-LGA reach | ≥ 5 distinct LGAs in audience | Last 180 days |
| Community membership | Own community ≥ 1,000 members | Current |
| Abuse record | 0 strikes in last 180 days | Last 180 days |
| Hold LGA badge | ≥ 60 days | — |
| Peer endorsements | ≥ 3 endorsements from existing State Badge holders | Current |

**Peer Endorsement Rule:** State Badge promotion requires social proof from existing State-level creators. This prevents algorithmic gaming by requiring real relationship signals.

---

## Tier 3 → 4: State Badge → National Badge

### Criteria

| Signal | Threshold | Window |
|--------|-----------|--------|
| Rooms hosted | ≥ 200 rooms | Last 365 days |
| Total unique listeners | ≥ 100,000 across career | Lifetime |
| States reached | ≥ 10 distinct states in audience | Last 365 days |
| Avg listener retention | ≥ 60% | Last 365 days |
| Community membership | Own community ≥ 10,000 members | Current |
| Abuse record | 0 strikes in last 365 days | Last 365 days |
| Hold State badge | ≥ 90 days | — |
| Loop editorial review | Manual review by Loop Trust & Safety | Required |

**National Badge is never automatic.** The final step is always a manual editorial review. National Badges carry moderation authority across all states. A single abusive National Badge holder can cause system-wide harm.

---

## Promotion Signal Definitions

### Attendance
Number of unique listeners who joined a room. Counted once per user per room regardless of rejoin.

**Abuse resistance:** Bots and alt-accounts detected via:
- Device fingerprint clustering
- Join-immediately-leave pattern (< 5 seconds = not counted)
- IP subnet diversity check

### Retention
Percentage of listeners who stayed for ≥ 50% of the room's total duration. This is the primary quality signal — it is hard to fake attention.

**Formula:**
```
retention_pct = (listeners_stayed_50pct / total_unique_listeners) × 100
```

Rooms shorter than 5 minutes are excluded from retention scoring.

### Engagement
Speaker activity during the room:
- Number of times the creator spoke (raised hand and was granted)
- Number of hand-raises granted to others
- Crowd reactions triggered during creator speech

### Speaking Activity
Total minutes the creator was active as a speaker (host microphone active). Listening is not creator activity.

### Reports
Abuse reports filed against the creator's rooms. Net report score:
```
report_score = (valid_reports × 10) + (dismissed_reports × -2)
```
High report score blocks promotion and triggers manual review.

### Verification Status
Determines civic eligibility. Unverified creators can earn LCDA–State badges. National badge requires at minimum "community" verification.

---

## Demotion

Badges are not permanent. Demotion triggers:

| Trigger | Action |
|---------|--------|
| 1 active abuse strike | Badge activity suspended (cannot host) for 30 days |
| 2 strikes in 180 days | Badge tier revoked; must re-earn from one tier below |
| 3 strikes in 365 days | Creator status permanently revoked; account review |
| False report pattern (reporting others maliciously) | Immediate 7-day suspension; strike issued |
| Sustained inactivity (< 2 rooms in 90 days) | Warning issued; second month = badge hibernation |

**Badge Hibernation:** A hibernated badge retains its history but loses moderation authority. Reactivation requires meeting minimum activity threshold again.

---

## Abuse Prevention — Creator Ladder Specific

### Signal Farming Prevention

| Attack vector | Defence |
|--------------|---------|
| Bot audience farms | Device fingerprint + join pattern analysis; audience de-duplication |
| Alt-account self-listening | Cross-device and IP cluster detection |
| Coordinated room flooding | Geographic clustering check — sudden surge from single subnet = flagged |
| Fake peer endorsements | Endorsements tracked; endorser loses 1 endorsement credit if endorsee is later found abusive |
| Badge-farming micro-rooms | Minimum room duration (5 min) and minimum listener threshold (3 unique) for any room to count toward badge progress |

### Civic Promotion Separation

Civic Verified creators (journalists, officials) have a separate verification path outside the Growth Ladder. A journalist does not need an LCDA badge — they apply for Civic Verification directly. However, Civic Verification DOES NOT grant:
- Regional moderation authority (ladder-earned)
- Discovery boost (algorithm-controlled)
- Community creation privileges (ladder-controlled)

These are independent systems that do not substitute for each other.

---

## Creator Verification Tiers

| Tier | Who qualifies | Granted by | Privileges |
|------|--------------|-----------|-----------|
| None | All users | — | Join rooms, speak, create basic rooms |
| Community | LCDA+ Badge holder (auto) | System | Create regional communities, host moderated rooms |
| Journalist | Press card holder (manual) | Loop Civic Team | Create Civic rooms, access source submission tools |
| Official | Government agency account | Loop × Government partnership | Create official Emergency/Weather rooms, government-verified badge |
| Government | Ministry or agency | Partnership agreement | Escalation channel, national alert broadcast |

---

## Manilla Creator Economy Integration (Future)

When Manilla integration is live:

```
Manilla Artist Flow:
  Artist is verified on Manilla
  → Receives "Manilla Verified Artist" badge in Loop (auto, cross-platform)
  → Artist community auto-created in their primary region
  → Release Rooms are auto-created on release dates
  → Artist's Loop creator level is independent of Manilla badge
    (they must still earn LCDA badge to unlock regional moderation)

Listening Room creator permissions:
  - Manilla Verified Artist: can create Listening Rooms in their home region
  - State Badge creator: can host artist listening rooms (if artist approves)
  - National Badge creator: can host release commentary rooms nationally
```

No revenue sharing, no tipping, no creator funds in scope. Architecture only.

---

*Next document: FOUNDATION/loop-v2-civic-network.md*
