# FOUNDATION/progressive-profile-system.md
**Sprint:** V3 Frictionless Onboarding — Phase 4  
**Date:** 2026-06-07  
**Author:** CTO Office — LILCKY STUDIO LIMITED

---

## Principle

Do NOT ask for profile information upfront. Collect it progressively, only when required by a user action.

---

## What Is NOT Asked During Onboarding

| Field | When Asked Instead |
|-------|--------------------|
| Profile photo | When user starts their first room |
| Bio | When user applies for verification |
| Username | When user first wants to speak |
| Social links | When user applies for Loop Verified |
| Creator type | When user taps "Start Room" |
| Business profile | When user creates business community |

---

## Progressive Unlock Triggers

```
Action: User taps "Start Room"
→ Ask: "What kind of creator are you?" (Phase 5)
→ Then: Display name + photo

Action: User joins creator community
→ Ask: More creator details

Action: User applies for verification
→ Ask: Social links, ID (for official verified only)

Action: User creates business community
→ Ask: Business name, type, location
```

---

## Profile Completion State Machine

```
State 0: Anonymous (interests only in localStorage)
  ↓ (OTP/SSO)
State 1: Authenticated (phone/email, no profile)
  ↓ (auto-populated from onboarding choices)
State 2: Located (country, state, LGA, LCDA set)
  ↓ (first room join)
State 3: Named (display_name set)
  ↓ (start room)
State 4: Creator profile (creator_type, avatar)
  ↓ (verification request)
State 5: Verified profile (links, is_verified)
```

Each state unlocks new capabilities, not more forms.

---

## API Support

```
PATCH /api/profiles { display_name, avatar_url }   — State 3
PATCH /api/profiles { creator_type }               — State 4
POST  /api/verification/request                    — State 5 (future)
```

**Phase 4 — COMPLETE ✅**
