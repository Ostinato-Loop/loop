# AUDIT/fraud-prevention-review.md
**Sprint:** V2 Creator Promotion & Community Growth Engine  
**Date:** 2026-06-07  
**Auditor:** CTO Office — LILCKY STUDIO LIMITED

---

## Verdict: ✅ FRAMEWORK DOCUMENTED — Implementation is Phase 3+

---

## Fraud Vectors Identified

| Vector | Risk Level | Detection Method |
|--------|-----------|-----------------|
| Bot listener joins | HIGH | Session duration < 60s filter |
| Fake listener farms | HIGH | IP rate limiting (CF Worker) |
| Coordinated join campaigns | MEDIUM | Join velocity per IP |
| Repeated self-promotion | LOW | Creator excludes own rooms |
| Duplicate accounts | HIGH | OTP phone verification gate |
| Replayed events | MEDIUM | Event deduplication by traceId |

## Current Protections (Active Now)

| Protection | Where |
|-----------|-------|
| Auth required for event writes | `requireAuth()` on POST /activation/events |
| Allowlisted event types only | `ALLOWED_CLIENT_EVENTS` constant |
| traceId on all events | session_id column for dedup |
| No user-controlled URLs in fetch | SSRF prevention |
| RLS on activation_events | Users see only their own events |

## Planned Fraud Score (Phase 3+)

```
fraud_score = 0

if session_duration < 60s:  fraud_score += 30
if ip_joins_per_hour > 10:  fraud_score += 40
if is_duplicate_account:    fraud_score += 50

if fraud_score >= 50: exclude from promotion scoring
if fraud_score >= 80: flag for ops review
```

**Fraud Prevention — FRAMEWORK READY ✅**
