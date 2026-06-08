# AUDIT/regional-belonging-audit.md
**Date:** 2026-06-08
**Sprint:** LOOP HUMAN CONNECTION SPRINT
**Auditor:** RALD CTO
**Principle:** "I found my people" requires knowing where people are from.

---

## What Regional Belonging Means for Loop

Loop is built for Africa. Regional belonging is not a feature — it is the product.

A user in Kano asking "is there anyone from Kano talking about local politics right now?" is the exact use case Loop must serve. Everything in this audit measures how well Loop serves that question.

---

## Regional Data Architecture

### What We Capture
| Field | Where | Values |
|-------|-------|--------|
| country | profiles.country | "Nigeria", "Ghana", "Kenya", etc. |
| state_id | profiles.state_id | "lagos-state", "kano-state" (slugified) |
| lga_id | profiles.lga_id | Local government area |
| lcda_id | profiles.lcda_id | Local council development area |
| language | profiles.language | "en", "ha", "yo", "ig", "sw", "fr", "ar", "pt" |
| interests | profiles.interests | ["Football", "Politics", "Music", ...] |

### What Rooms Capture
| Field | Where | Values |
|-------|-------|--------|
| language | rooms.language | Same language codes as profiles |
| category | rooms.category | community, news, commentary, etc. |

### Gap: Rooms have no region/country field
Rooms are created by hosts who have regions. To find "rooms from Kano," you must JOIN rooms → profiles on host_id. This is not currently done in any API endpoint or query.

---

## Regional Belonging Audit — Screen by Screen

### Feed (/feed)
**Question: Can I find rooms from my city/state right now?**
- ✅ "Picked for you" uses profile.interests mapped to categories
- ❌ No filtering by profile.country or state_id
- ❌ "For you" = category match, not regional match
- ❌ No "Rooms in Lagos" or "Rooms in Hausa" section
**Score: 2/10 for regional belonging**

### Discover (/discover) — POST-SPRINT
**Question: Can I find people from my area?**
- ✅ Near me tab now shows "Set your region" prompt when region unset (was silently broken)
- ✅ Near me filters by language when region is set (language as regional proxy)
- ✅ People search finds users by name/handle
- ❌ No geographic filter on People tab ("People from Lagos")
- ❌ No "People from your area" section on Discover
- ❌ People suggestions use "mutual_score" (connection graph) not regional proximity
**Score: 4/10 for regional belonging (was 1/10 before sprint — Near me was a broken promise)**

### Room (/rooms/:id) — POST-BETA-SPRINT
**Question: Do I know where the people I'm talking to are from?**
- ✅ Participant tap sheet shows region (country · state)
- ✅ I can learn who someone is AFTER they start speaking
- ❌ I don't know who's from my region BEFORE deciding to join
- ❌ Host's region not shown on room cards
**Score: 6/10 for regional belonging**

### Profile (/me)
**Question: Does my profile represent where I'm from?**
- ✅ Region (country · state · LGA) displayed on profile
- ✅ Settings page has full region hierarchy picker
- ✅ Region shown in participant sheets
- ❌ Region not prominent enough — shown in small text below bio
**Score: 7/10 for regional belonging**

### Onboarding (/onboarding)
**Question: Does onboarding ask where I'm from?**
- ❌ Onboarding captures: username, display_name, language, interests — NO REGION
- The 5-step onboarding flow skips country/state/LGA entirely
- Users complete onboarding without declaring their region
- This is why Near me is empty for most users
**Score: 1/10 — Critical gap**
**Action: Add a "Where are you from?" step to onboarding. Region is as important as interests for Loop's mission.**

---

## Regional Belonging Scorecard

| Screen | Score | Primary Gap |
|--------|-------|------------|
| Onboarding | 1/10 | No region step |
| Feed | 2/10 | No regional room filter |
| Discover | 4/10 | No people-by-region filter |
| Room | 6/10 | Region visible in participant sheet only |
| Profile | 7/10 | Region not prominent |
| **Average** | **4/10** | |

---

## The Root Cause

**Onboarding does not collect region.**

Every downstream problem flows from this:
- Near me tab is empty for most users (no country set)
- Feed can't filter by region (no region on rooms)
- People suggestions use social graph, not geography
- "I found my people" is aspirational, not real

---

## Action Plan

### Sprint N+1 — Onboarding Region (P0)
Add a "Where are you from?" step between language and interests.
Capture: country (required) + state_id (optional).
Impact: Fills Near me tab. Enables regional room discovery.

### Sprint N+2 — Regional Room Discovery (P1)
Add region-based room filtering:
- Feed: "Rooms in your state" section (JOIN rooms with profiles on host_id → filter by host's state_id)
- Discover: "People from [country]" section using profile.country

### Sprint N+3 — Regional Identity in Rooms (P2)
Show host's region on room cards: "Adaeze · Lagos · hosting"
Show "3 people from your area are in this room"

---

## Verdict

Loop's data model supports full regional belonging. The profile schema captures country, state, LGA, and language. The gap is in surfacing it — especially during onboarding where the first impression is formed.

**Fix onboarding first. Every other regional belonging improvement flows from that.**
