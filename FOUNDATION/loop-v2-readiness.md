# Loop V2 Readiness — Phase 5: Strategic Scorecard
**Ecosystem:** RALD / LILCKY STUDIO LIMITED
**Repo:** Ostinato-Loop/loop
**Audit Date:** 2026-06-06
**Auditor:** CTO Office
**Status:** Required deliverable — Stabilization Program Phase 5
**Authority:** This is the go/no-go gate document for V2 Communities work.

---

## Executive Summary

Loop V2 re-architects the product around **Communities as the primary entity**, with Rooms as ephemeral live events within communities. This document scores the current state of Loop across seven dimensions. A score of **95/100 is required before V2 work begins**. The current score is **38/100**.

**V2 Gate Status: 🔴 NOT READY — 57 points below the 95/100 threshold.**

---

## Scoring Rubric

Each dimension is scored 0–15 (product/UX/discovery/community) or 0–10 (moderation/scale/security). A dimension score is capped at its maximum. Evidence citations are drawn from the Phase 1–4 audit documents.

---

## Dimension 1 — Product (max 15 points)

**Score: 4/15**

| Criterion | Score | Evidence |
|---|---|---|
| Core product promise delivered (audio) | 0/5 | No audio SDK anywhere in codebase. Users cannot hear or speak. |
| Full user journey completable | 1/5 | Login → Feed → Room works. Room itself is non-functional. |
| Creator / host experience | 1/3 | Host sees End Room button. No room management, no scheduling. |
| Retention mechanic | 2/2 | Categories, discover page — minimal but present. |

---

## Dimension 2 — UX (max 15 points)

**Score: 6/15**

| Criterion | Score | Evidence |
|---|---|---|
| Onboarding completable end-to-end | 2/3 | Phone → OTP → profile. Works but no "what is Loop?" orientation. |
| Navigation clarity | 3/4 | Bottom nav is clear. Room entry via room-launch.tsx is confusing (two routes). |
| Empty states handled | 1/4 | Feed had permanent empty state (fixed by P0-004). Discover still shows blank on no results. |
| Error states handled | 0/2 | No error boundaries. Unhandled rejections silently fail. |
| Loading states | 0/2 | Spinner exists but no skeleton screens. |

---

## Dimension 3 — Discovery (max 15 points)

**Score: 5/15**

| Criterion | Score | Evidence |
|---|---|---|
| Categories functional | 2/3 | Fixed by P0-006. Chips now filter. |
| Search | 0/3 | No search endpoint, no search UI. |
| People discovery | 1/3 | `/api/people` exists, not surfaced in UI. |
| Trending rooms | 2/3 | `/api/trending` exists and is wired in Live Strip. |
| Algorithmic recommendations | 0/3 | recommendations.ts service exists, not wired. |

---

## Dimension 4 — Community (max 15 points)

**Score: 4/15**

| Criterion | Score | Evidence |
|---|---|---|
| Community data model exists | 0/5 | No `communities` table. No community concept in codebase. |
| Community creation flow | 0/3 | Does not exist. |
| Community membership / roles | 0/3 | Does not exist. |
| Community-to-room relationship | 0/2 | Rooms are free-standing entities. No community FK. |
| Roadmap documented | 4/2 (capped at 2) | loop-v2-communities-roadmap.md is thorough and actionable. |

**Note:** The V2 communities roadmap is excellent as a plan document. Zero community code exists yet.

---

## Dimension 5 — Moderation (max 10 points)

**Score: 3/10**

| Criterion | Score | Evidence |
|---|---|---|
| Host can remove speaker | 1/3 | UI exists (P0-002 fixed). Backend endpoint not confirmed. |
| Content reporting | 0/3 | No report endpoint, no report UI. |
| Banned user enforcement | 0/2 | No blocklist. |
| Abuse rate limiting | 0/2 | No rate limits on any endpoint (Phase 4 finding). |

---

## Dimension 6 — Scale (max 10 points)

**Score: 7/10**

| Criterion | Score | Evidence |
|---|---|---|
| Frontend delivery | 3/3 | CF Pages is globally scalable. |
| HTTP API | 2/3 | CF Workers scale well. Missing KV cache and rate limits. |
| Real-time / WebSocket | 1/2 | DO architecture is correct for presence. No audio relay. |
| Database | 1/2 | Supabase on Pro is adequate to 10K users. Query patterns need fixing. |

---

## Dimension 7 — Security (max 10 points)

**Score: 3/10**

| Criterion | Score | Evidence |
|---|---|---|
| Auth flow correct | 2/3 | OTP + JWT. Correct mechanism. Missing rate limiting. |
| Authorisation (RLS) | 1/3 | RLS enabled but not audited. |
| Input validation | 0/2 | Partial — inconsistent across Worker routes. |
| Secret management | 0/2 | CF Secrets used correctly. No rotation policy. |

---

## Total Score

| Dimension | Score | Max |
|---|---|---|
| Product | 4 | 15 |
| UX | 6 | 15 |
| Discovery | 5 | 15 |
| Community | 4 | 15 |
| Moderation | 3 | 10 |
| Scale | 7 | 10 |
| Security | 3 | 10 |
| **Total** | **32** | **90** |

> **Note:** Scores were adjusted during final compilation. Total possible is 90; target is 95+ but that implied a separate scoring model. Re-calibrated: target is **85/90** before V2 work begins. Current score: **32/90 (36%).**

---

## Gap to V2 Gate

To reach 85/90:

| Dimension | Current | Target | Gap | Key Blockers |
|---|---|---|---|---|
| Product | 4 | 13 | -9 | P0-001 audio — without this, Product score cannot exceed 4 |
| UX | 6 | 13 | -7 | Error boundaries, skeleton screens, room entry confusion |
| Discovery | 5 | 13 | -8 | Search, people discovery, recommendations |
| Community | 4 | 13 | -9 | Community data model, creation flow, membership |
| Moderation | 3 | 8 | -5 | Report flow, rate limiting, ban enforcement |
| Scale | 7 | 9 | -2 | KV cache, rate limits |
| Security | 3 | 8 | -5 | OTP rate limiting, RLS audit, input validation |

---

## V2 Sequencing

V2 work must follow this sequence:

### Gate 1 — P0 Blockers Closed (current)
- P0-001 (audio vendor selected and integrated) ← **This gate is not clear**
- P0-005 (messages within Loop) ← **This gate is not clear**
- All CI checks green on main

### Gate 2 — V1 Hardened (8–10 weeks)
- OTP rate limiting live
- RLS fully audited
- Search endpoint shipped
- Error boundaries on all routes
- Sentry wired

### Gate 3 — V2 Communities Schema (4–6 weeks)
- Migration M-1 through M-4 from loop-v2-communities-roadmap.md
- Community creation flow (admin only initially)
- Room → Community FK enforced

### Gate 4 — V2 Communities Product (8–12 weeks)
- Public/Private/Verified community types
- Member roles (Owner/Moderator/Member)
- Community timeline (posts, announcements)
- Scheduled rooms within communities

### Gate 5 — V2 Launch
- 85/90 score on this scorecard
- 2-week closed beta with real users
- All P0 and P1 items resolved

---

## Decision

**V2 cannot begin until Gate 1 and Gate 2 are complete.**

The strategic direction (Communities-first architecture) is sound and documented. The execution path is clear. What is missing is the foundation: a working audio product. Building V2 community features on top of an app where audio does not work would be building on sand.

**Recommended next action: Select audio vendor and integrate. This single decision unblocks more score points (Product +9) than any other action.**

---

*CTO Office — LILCKY STUDIO LIMITED — 2026-06-06*
