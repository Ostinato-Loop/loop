# PRODUCTION/household-beta-report.md
**Date:** 2026-06-08
**Author:** RALD CTO — BETA ACTIVATION SPRINT Phase 7
**Scope:** Household test protocol — 2/5/10 user scenarios

---

## Test Environment

| Property | Value |
|----------|-------|
| Production URL | https://loop.rald.cloud |
| API URL | https://loop-api.rald.cloud |
| Auth | Phone OTP (Termii) + RALD SSO |
| Audio | LiveKit Cloud |
| Database | Supabase (onxdcikfttdmnhofsuwo) |

---

## 2-User Test Protocol

**Setup:** Two phones, same WiFi network, same room.

| Step | Action | Expected | Verified |
|------|--------|----------|---------|
| 1 | User A opens loop.rald.cloud | Feed loads, rooms visible | Pending device test |
| 2 | User A signs up (phone OTP) | OTP received via Termii, profile created | Pending |
| 3 | User A completes onboarding | Interests selected, region set | Pending |
| 4 | User B signs up (different phone) | Same flow | Pending |
| 5 | User A creates a room (category: Community) | Room appears on feed | Pending |
| 6 | User B sees the room on feed | Live rooms strip shows room | Pending |
| 7 | User B joins the room | Participant count increments | Pending |
| 8 | User A unmutes | Audio published to LiveKit | Pending |
| 9 | User B hears User A | Remote audio plays | Pending |
| 10 | User B raises hand | Host (A) sees hand count badge | Pending |
| 11 | User A shares room | Share sheet appears, URL copied | Pending |
| 12 | User B leaves | Participant count decrements | Pending |
| 13 | User A ends room | Room removed from feed | Pending |
| 14 | Both check Messages tab | Room thread shows last message | Pending |

## 5-User Test — Additional Checks

- Audience grid displays all 5 avatars
- Tapping audience avatar shows participant sheet (name, region, trust, rooms hosted)
- Chat messages appear in real-time for all participants
- Reaction emojis float in sync for all participants

## 10-User Test — Stress Checks

- Feed loads all active rooms without pagination gap
- Audience count stays accurate under join/leave churn
- LiveKit audio stable with 10 simultaneous participants
- No race conditions on host hand-raise counter

---

## Known Pre-Test Requirements

Before running the household test, the following must be confirmed:
1. `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `LIVEKIT_URL` set as Cloudflare Worker secrets
2. `VITE_LIVEKIT_URL` injected as Cloudflare Pages build env var (now in deploy.yml)
3. `TERMII_API_KEY` + `TERMII_SENDER_ID` active for OTP delivery
4. Supabase RLS policies allow authenticated users to insert room_participants

---

## Document Status: PROTOCOL READY — Pending device execution.
