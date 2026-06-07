# FOUNDATION/civic-participation-onboarding.md
**Sprint:** V3 Frictionless Onboarding — Phase 6  
**Date:** 2026-06-07  
**Author:** CTO Office — LILCKY STUDIO LIMITED

---

## Principle

Civic onboarding is NEVER triggered during signup. It unlocks through participation.

---

## Trigger Conditions

Civic onboarding appears after a user participates in civic rooms:

| Room Category | Trigger Threshold |
|--------------|-------------------|
| Traffic | 1 participation |
| Weather | 1 participation |
| Emergency | 1 participation |
| Community Notice | 2 participations |
| Town Hall | 1 participation |

## Unlock Screen

After threshold reached:

> "Help verify information in your community."
>
> You've been participating in local conversations. Would you like to help your neighbours get accurate, trusted information?
>
> [Become a Community Reporter]  [Not now]

## Community Reporter Flow

```
User taps "Become a Community Reporter"
          ↓
POST /api/activation/badges/:communityId {
  badge_type: "reporter",
  metadata: { triggered_by: "civic_participation" }
}
          ↓
User receives Community Reporter badge in their LCDA community
          ↓
Badge appears on their profile card
```

## What Community Reporters Can Do

- Mark rooms as "civic" category
- Flag misinformation to community moderator
- Co-host Town Hall rooms
- Receive civic verification requests

## Verification Pathway

After 30 days as Community Reporter with positive engagement:
- Eligible for `community` verification mark (awarded by community owner)
- Eligible for `loop` verification mark (awarded by platform)
- Government/institution path: `official` verification (manual ops review)

## Data Model

- Civic participation counted via `room_attended` events with civic room category
- Reporter badge stored in `community_leader_badges (badge_type='reporter')`
- Civic verifications in `civic_verifications` table

**Phase 6 — COMPLETE ✅**
