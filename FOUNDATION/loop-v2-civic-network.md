# FOUNDATION/loop-v2-civic-network.md
**Version:** 2.0
**Date:** 2026-06-07
**Status:** APPROVED FOUNDATION — implementation reference
**Classification:** Architecture

---

## Purpose

This document defines the Verified Civic Network architecture for Loop V2: how civic rooms are created, sourced, moderated, escalated, and kept separate from entertainment content.

Loop's civic layer is its most structurally important differentiator. Done correctly, Loop becomes a trusted public infrastructure tool for Nigeria. Done incorrectly, it becomes a misinformation amplifier. This document specifies the controls that make the former possible.

---

## The Inviolable Separation Rule

> **Civic content and Entertainment content NEVER appear in the same ranked list.**

This is not a design preference. It is an architectural constraint enforced at every layer:
- Database: `is_civic` flag on Room and Interest records
- API: civic and entertainment endpoints are separate
- Discovery: civic rooms ranked by a separate algorithm (civic relevance, not engagement)
- Frontend: civic content displayed in a dedicated "Civic" tab — never in the main feed
- Moderation: civic and entertainment moderation teams are separate

**Why:** Engagement-based ranking is toxic for civic content. A false emergency alert generates enormous engagement. A real public safety warning from a local official may have low engagement if it's not sensational. Mixing civic and entertainment ranking destroys trust in both.

---

## Civic Room Types

### 1. News Rooms

Local news, breaking stories, government announcements.

**Creation requirements:**
- Journalist-verified OR Official-verified creator
- Source URL required (no source = cannot start room)
- Headline claim limited to 120 characters
- No opinion language in room title (enforced by text classifier pre-publish)

**Moderation:** Loop Civic Team review within 2 hours of creation. High-engagement rooms reviewed within 30 minutes.

---

### 2. Emergency Rooms

Crime, missing persons, disasters, public safety crises.

**Emergency room sub-types:**

| Sub-type | Example | Auto-create? | Verification required |
|----------|---------|-------------|----------------------|
| Crime alert | "Robbery reported Oshodi axis" | No (human) | Community-verified min |
| Missing person | "Missing: Chidi Okafor, 8 years old, Surulere" | No | Community-verified min |
| Infrastructure failure | "Bridge collapse Ogun Road" | Partial (see below) | Community-verified min |
| Natural disaster | "Flooding Badagry coastal road" | Yes (see Weather) | None (system-created) |
| Health emergency | "Cholera outbreak report, Kano South" | No | Official-verified required |
| Government alert | "LASEMA evacuation notice, Victoria Island" | No | Government-verified required |

**Evidence workflow:**
```
Creator submits room with:
  - Claim (max 200 chars)
  - Source type: "eyewitness" | "official_statement" | "media_report" | "document"
  - Evidence: URL, photo, audio clip, or document
  - Location: must be within creator's verified region ± 2 levels

System checks:
  1. Creator verification tier ≥ "community"
  2. Source URL resolves (if URL provided)
  3. Location claim is consistent with creator's registered region
  4. No duplicate active Emergency room for same incident within 500m

If all checks pass: Room created with "UNVERIFIED" badge
Civic Team review: within 60 minutes for Emergency rooms

On confirmation: badge changes to "VERIFIED"
On rejection: room closed; creator notified; false report counter incremented
```

---

### 3. Traffic Rooms

Real-time road incident reporting. Strictly informational.

**Creation triggers:**

**Manual (human-initiated):**
- LGA-verified or higher creator
- Location must be within their registered region
- Category: "traffic_incident", "road_closure", "accident", "congestion"

**Auto-generated:**
- Trigger: 2+ geo-tagged reports from different device fingerprints within 500m within 15 minutes
- System creates room with type "traffic_auto"
- Status: "COMMUNITY-REPORTED — not verified"
- If an LGA-verified creator joins and confirms: status upgrades to "LGA-CONFIRMED"

**Expiry rules:**
- Auto-generated: 2 hours from last update; max 4 hours hard cap
- Human-created: manual close by host; max 6 hours
- No extension permitted — create a new room if incident persists

**Prohibited in Traffic Rooms:**
- Opinion about road quality ("this road has always been bad")
- Political commentary
- Advertising
- Off-topic discussion

Violation: immediate room closure + report against host.

---

### 4. Weather Rooms

Hyper-local weather alerts. Loop is a first-responder tool when flooding hits a neighborhood.

**Data sources (ordered by authority):**

1. **Nigerian Meteorological Agency (NiMet)** — official forecast alerts
2. **Lagos State Emergency Management Agency (LASEMA)** — state-level emergency
3. **State Emergency Management Agency (SEMA)** — state-level emergency
4. **Community ground-truth** — user geo-tagged reports (confirmed by ≥ 3 reports from different IPs in same grid zone)

**Severity model:**

| Severity | Trigger | Room type | Discovery |
|----------|---------|-----------|-----------|
| Advisory | NiMet watch | System prompt to LGA creators | Regional tab only |
| Watch | NiMet warning | Auto-room created | Regional tab + State alert |
| Warning | Active incident OR ≥ 5 community reports | Auto-room + push notification | All tabs + Emergency banner |
| Extreme | NiMet RED alert OR Government declaration | Emergency escalation | System-wide banner; government notification |

**Auto-created Weather Room flow:**
```
NiMet API → webhook → Loop Weather Service
  → Parse severity, location (State + LGA level)
  → Create Weather Room:
      region_id:     "NG-LA-BAD"   (Badagry LGA, Lagos)
      room_type:     "weather"
      title:         "⛈ Flooding Alert — Badagry Coastal Road"
      description:   "NiMet advisory: heavy rainfall + coastal surge"
      source:        "nimet_api"
      severity:      "warning"
      auto_expires_at: now + 6h
      civic_verified: true  (NiMet-sourced rooms are auto-verified)

→ Notify: all users with lcda_id or lga_id matching room's region
→ Post to State-level civic alert feed
```

**Expiry:**
- Clears when: NiMet all-clear OR 6h inactivity OR manual close by government-verified creator
- Transition to archive: room closed, content preserved for post-event civic review

---

## False Report Handling

False reporting is the #1 civic safety risk. A bad actor filing false emergency reports can cause panic, erode trust, and ultimately kill the civic layer.

### False Report Definition

A report is "false" when:
- The Civic Team closes the room as "unsubstantiated" after evidence review
- An official authority (government-verified) contradicts the claim
- The creator admits the error

### Consequences by Report Type

| Report type | 1st offence | 2nd offence | 3rd offence |
|-------------|-------------|-------------|-------------|
| False Traffic | Warning + traffic report ban (30d) | Traffic ban (permanent) | Account review |
| False Weather | Warning | Civic reporting ban (90d) | Account suspension |
| False Emergency (crime, disaster) | 7-day suspension + strike | 30-day suspension + badge demotion | Permanent ban |
| False Emergency (health, government) | Permanent civic ban + account review | — | — |
| Coordinated false reporting (multiple accounts) | All accounts suspended; reported to NCC | — | — |

### Appeals

Every enforcement action is appealable within 14 days.
- Appeals reviewed by a separate Trust & Safety reviewer (not the original reviewer)
- Decision communicated in writing
- No re-appeal after decision on appeal

---

## Escalation Process

```
LCDA Room → Reported as high-severity
         → Loop Civic Team notified (< 60 min SLA)
         → Civic Team verifies: CONFIRMED or REJECTED

CONFIRMED → Room status = VERIFIED
           → If severity HIGH: escalate to LGA moderation team
           → If severity EXTREME: escalate to State moderation + government channel

EXTREME escalation path:
  Loop Trust & Safety
  → NEMA (National Emergency Management Agency) webhook
  → State SEMA webhook
  → Government-verified Loop account (LASEMA, SEMA, etc.) pinged
  → Media partner alert (if Loop has media partnerships)
```

### Government Escalation Protocol (Emergency)

When a room reaches "Extreme" severity:
1. Loop sends a structured alert to the relevant government agency via pre-agreed webhook
2. Government-verified accounts receive a "priority join" notification (they can join without queue)
3. A government-verified host can take over room hosting if original creator consents
4. Government-verified host can mute all speakers and broadcast a verified statement
5. Government-issued all-clear: room transitions to post-event archive mode

This protocol requires pre-established partnership agreements with NEMA, LASEMA, and state SEMA agencies. Architecture only — no implementation until partnerships are signed.

---

## Civic Team Structure

| Role | Scope | Staffing model |
|------|-------|----------------|
| LCDA Civic Monitor | 1–3 LCDAs | Top LCDA badge holder (volunteer + incentive) |
| LGA Civic Moderator | 1 LGA | State badge holder + Loop training + NDA |
| State Civic Lead | 1 State | Loop employee or trusted contractor |
| National Civic Director | National | Loop senior employee |
| Government Liaison | Federal + State | Loop partnership team |

**Volunteer Incentive Model:** LCDA Civic Monitors and LGA Civic Moderators are compensated through enhanced Creator badge visibility and future monetisation priority. No cash compensation until Loop monetisation is live.

---

## Civic Content Archive

All civic rooms are archived permanently. Rooms cannot be deleted by creators after they have been verified. This is non-negotiable:
- Emergency rooms form a public safety record
- Traffic rooms form a road incident database
- Weather rooms form a local climate record

Archive access:
- Public: room title, region, severity, date, outcome
- Creator: full room transcript (own rooms only)
- Researcher (future): API access with anonymised transcripts (post-approval)
- Government: full access to verified rooms in their jurisdiction (partnership agreement)

---

*Next document: FOUNDATION/loop-v2-discovery-engine.md*
