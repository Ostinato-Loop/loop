# PRODUCTION/trust-launch-readiness.md
**Version:** 1.0 — Trust & Transparency Center Launch Readiness
**Date:** 2026-06-07
**Auditor:** CTO Office — LILCKY STUDIO LIMITED
**Scope:** Trust & Transparency Center Sprint — production gate
**Prerequisite:** Production score 91/100 (`loop-readiness-v3.md`) ✅

---

## Overview

This document is the go/no-go production checklist for the Trust & Transparency Center. It gates deployment of all ten trust systems defined in `FOUNDATION/trust-center-v1.md`.

**Trust infrastructure must be deployed before Loop launches publicly.** A platform that takes moderation actions without an appeal path, or collects user data without a deletion mechanism, is not legally or ethically launchable — regardless of production certification scores.

---

## Current State

| Area | Status |
|------|--------|
| RALD Trust Center (trust.rald.cloud) | ✅ Live — 98/100 |
| RALD Status Page (status.rald.cloud) | ✅ Live — 96/100 |
| Loop in-product trust layer | ❌ 0/20 systems |
| Moderation pipeline | ❌ Passthrough only |
| RLS — all tables | ❌ All USING(true) |
| Appeal mechanism | ❌ Not implemented |
| NDPR compliance (deletion/export) | ❌ Not implemented |

---

## Gate Structure

Six gates. Sequential. No bypasses.

```
Gate 1: Security Foundation ── RLS fixed, moderation wired
Gate 2: Trust Schema ────────── All trust tables in production
Gate 3: Safety Reporting ────── Users can report and track cases
Gate 4: NDPR Compliance ─────── Deletion and export functional
Gate 5: Trust Center UI ─────── In-product trust surfaces visible
Gate 6: Transparency Baseline ─ Explanation fields + transparency data
```

---

## Gate 1: Security Foundation

**Owner:** Backend Engineer + Database Engineer
**Mandate:** No trust data can be stored safely while all RLS policies are `USING(true)`. This gate fixes the security layer before trust tables are created.

### RLS Remediation

- [ ] All existing `USING(true)` policies audited — complete list in `AUDIT/02-security-audit.md` SEC-005
- [ ] `profiles` UPDATE policy: `USING(auth.uid() = id)` — self-update only
- [ ] `rooms` READ policy: public rooms only or host/participant
- [ ] `rooms` DELETE policy: `USING(auth.uid() = host_id)` — host-only delete
- [ ] `notifications` READ policy: `USING(auth.uid() = recipient_id)` — recipient only
- [ ] `friend_requests` READ policy: parties only
- [ ] `room_participants` READ policy: room members only

```sql
-- Verify: zero USING(true) policies remain after remediation
SELECT policyname, tablename, qual
FROM pg_policies
WHERE schemaname = 'public'
  AND qual = '(true)';
-- Expected: 0 rows (or only tables that genuinely require world-readable access)
```

### Moderation Service

- [ ] Workers AI classification active: `env.AI.run("@cf/huggingface/distilbert-sst-2-int8", { text })` uncommented and wired
- [ ] `moderateMessage` called on room creation (title + description)
- [ ] `moderateMessage` called on display name set/update
- [ ] KV key `moderation:blocklist` seeded with baseline Nigerian-context blocklist (minimum 100 terms)
- [ ] Blocked content returns 400 with specific message: "Content not allowed — see Community Rules"
- [ ] Warned content (score 0.7–0.9) is stored but flagged for human review queue

### Service Role Scope

- [ ] Public room reads use `SUPABASE_ANON_KEY` — not service role
- [ ] Service role reserved for: auth writes, trust writes, notification fan-out, admin operations
- [ ] No service role key referenced in `artifacts/loop/src/` (frontend) — zero references

**Gate 1 Pass Criteria:** Zero `USING(true)` policies in `pg_policies`. Moderation service returns a mix of verdicts on test inputs. No service role usage in frontend bundle.

---

## Gate 2: Trust Schema

**Owner:** Database Engineer
**Mandate:** All trust tables created in production with correct RLS before any trust feature ships.

### Tables Required

- [ ] `user_trust_records` — account standing, strike count, restrictions
- [ ] `trust_strikes` — strike history with rule citation and review method
- [ ] `safety_reports` — case tracking for safety reports
- [ ] `bug_reports` — bug tickets with auto-generated IDs
- [ ] `feature_requests` — user-submitted feature requests with voting
- [ ] `civic_room_verifications` — civic verification audit trail
- [ ] `civic_room_reports` — crowdsourced civic accuracy signals
- [ ] `promotion_audit_log` — trending promotion events (from community-promotion-system.md)

### RLS on Trust Tables (mandatory before creation)

- [ ] `user_trust_records`: `SELECT USING(auth.uid() = user_id)`. No UPDATE/DELETE for users.
- [ ] `trust_strikes`: `SELECT USING(auth.uid() = user_id)`. No INSERT/UPDATE/DELETE for users.
- [ ] `safety_reports`: `SELECT USING(auth.uid() = reporter_id)`. Subject cannot read own reports filed by others. No user UPDATE/DELETE.
- [ ] `bug_reports`: `SELECT USING(auth.uid() = user_id)`. UPDATE status by system only.
- [ ] `feature_requests`: `SELECT USING(true)`. INSERT by any authenticated user. UPDATE votes by any authenticated user (increment only).
- [ ] `civic_room_verifications`: `SELECT USING(true)` (public audit trail). INSERT by Civic Team only (service role).
- [ ] `civic_room_reports`: `SELECT USING(auth.uid() = reporter_id)`. INSERT by authenticated users. One report per user per room.

### Verification

```sql
-- Verify all trust tables exist
SELECT tablename FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'user_trust_records', 'trust_strikes', 'safety_reports',
    'bug_reports', 'feature_requests', 'civic_room_verifications',
    'civic_room_reports', 'promotion_audit_log'
  )
ORDER BY tablename;
-- Expected: 8 rows

-- Verify RLS enabled on all trust tables
SELECT tablename, rowsecurity FROM pg_tables
WHERE tablename IN ('user_trust_records','trust_strikes','safety_reports','bug_reports')
  AND schemaname = 'public';
-- All: rowsecurity = true

-- Test: cannot read another user's trust record
-- (Test with two JWT tokens — authenticated user A cannot SELECT user B's trust_strikes)
```

### Trust Record Seeding

- [ ] `user_trust_records` row created for all existing profiles (INSERT ... ON CONFLICT DO NOTHING)
- [ ] New user trigger: `user_trust_records` row auto-created on profile INSERT

```sql
CREATE OR REPLACE FUNCTION create_trust_record_for_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO user_trust_records (user_id)
  VALUES (NEW.id)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_create_trust_record
  AFTER INSERT ON profiles
  FOR EACH ROW EXECUTE FUNCTION create_trust_record_for_new_user();
```

**Gate 2 Pass Criteria:** All 8 tables in production. RLS verified by cross-user read test. Trust records seeded for all existing users. New user trigger confirmed.

---

## Gate 3: Safety Reporting System

**Owner:** Backend Engineer + Frontend Engineer
**Mandate:** Every user can file a safety report, receive a case ID, and track the outcome.

### API Readiness

- [ ] `POST /api/safety/report` — authenticated, returns case ID (format: LSR-YYYYMM-NNNN)
- [ ] Body validation: `category` is required, `subject_user_id` or `subject_room_id` is required (min 1)
- [ ] Rate limiting: max 5 reports per user per 24 hours (anti-abuse)
- [ ] `GET /api/safety/reports` — authenticated, returns reporter's own cases only (RLS enforced)
- [ ] Auto-triage: priority assigned on submission (p0/p1/p2/p3) based on category
- [ ] P0 cases (minor at risk / sexual exploitation): immediate Slack/PagerDuty alert

### Notification Flow

- [ ] On case creation: notification to reporter with case ID and expected review time
- [ ] On case status update: notification to reporter with outcome category
- [ ] Outcome message uses plain language (no prohibited phrases — see transparency-framework.md)
- [ ] Appeal link included in outcome notification if action was taken

### Moderation History

- [ ] `GET /api/trust/strikes` — authenticated, returns own strikes only
- [ ] Strikes include: type, severity, rule_id, description, review_method, expires_at
- [ ] Every strike record has `description` that passes the four-question standard (what/why/who/what next)

### Civic Report Fast Track

- [ ] Civic false reports trigger separate review queue (SLA: 2 hours, vs 4h standard)
- [ ] Civic false report confirmed → `civic_room_reports.report_type = 'false_information'` count incremented
- [ ] At 5 confirmed civic reports against a user: automatic civic posting restriction + Trust Team review

**Gate 3 Pass Criteria:** Integration test: submit report → case ID returned → status query returns case → status change notification sent. P0 cases confirmed alerting in staging Slack channel.

---

## Gate 4: NDPR Compliance

**Owner:** Backend Engineer
**Mandate:** Loop cannot collect personal data from Nigerian users without providing the right to deletion and access. NDPR Art. 3.1(b) and 3.1(c) are non-negotiable.

### Account Deletion

- [ ] `DELETE /api/users/me` — authenticated, initiates soft-delete
- [ ] Soft delete: `profiles.is_deleted = true`, 30-day grace period
- [ ] Hard delete job: runs at 30 days — deletes profile, anonymises content
- [ ] Content anonymisation: rooms remain (public record) but `host_id → null`, `display_name → "Deleted User"`, `avatar_url → null`
- [ ] Community memberships: deleted immediately
- [ ] Trust records: archived (for legal/safety purposes), not deleted
- [ ] Confirmation email sent to user's registered phone (SMS) on initiation
- [ ] Re-activation available within 30-day grace period (`POST /api/users/me/reactivate`)

### Data Export

- [ ] `POST /api/users/me/data-export` — authenticated, initiates async export job
- [ ] Export ZIP contents: profile.json, rooms_hosted.json, rooms_attended.json, communities.json, notifications.json (last 90 days)
- [ ] Export delivered: downloadable link emailed/SMSed within 48 hours
- [ ] Export link expires: 7 days after generation
- [ ] Sensitive data excluded from export: other users' safety reports about the user (they can't see their reporters), verification documents (returned separately on request)

### Privacy Dashboard

- [ ] `GET /api/users/me/privacy-summary` returns: data categories, counts, retention periods, controls
- [ ] Privacy Dashboard renders in Trust Center with real data (not mock)
- [ ] "What we don't collect" section accurate and reviewed by CTO before shipping
- [ ] Push token visible with revoke option → `DELETE /api/users/me/push-token`

### Verification

```bash
# Deletion flow test:
curl -X DELETE /api/users/me -H "Authorization: Bearer $TEST_TOKEN"
# Expected: 200 { "status": "deletion_scheduled", "effective_at": "2026-07-07T..." }

# Verify soft delete:
SELECT is_deleted, deleted_at FROM profiles WHERE id = :test_user_id;
# Expected: is_deleted = true, deleted_at = now()

# Verify hard delete after 30 days:
# (run deletion scheduler manually in staging)
SELECT id FROM profiles WHERE id = :test_user_id;
# Expected: 0 rows
```

**Gate 4 Pass Criteria:** Deletion flow tested end-to-end in staging. Export ZIP generated and verified to contain correct data. Privacy dashboard renders real data for test user.

---

## Gate 5: Trust Center UI

**Owner:** Frontend Engineer
**Mandate:** The Trust Center is accessible from the Me tab and surfaces all trust data available.

### Shell and Navigation

- [ ] `/trust` route registered in `App.tsx`
- [ ] Entry point: Me tab → Shield icon → Trust & Safety
- [ ] Trust Center has 3 main sections: My Trust Profile, Community Guidelines, Contact Trust Team
- [ ] Back navigation from Trust Center returns to Me tab

### My Trust Profile

- [ ] Account standing widget renders with correct state (good/under_review/restricted/suspended)
- [ ] Strike history renders chronologically with full four-question cards
- [ ] Safety report history renders (reporter's own reports only, with case status)
- [ ] Verification status card renders with current tier and upgrade path
- [ ] All data fetched from real API endpoints (no mock data)

### Community Guidelines

- [ ] Audio Room Rules section renders (real content, not placeholder)
- [ ] Civic Content Rules section renders
- [ ] Creator Rules section renders
- [ ] Each rule is linkable (deep link from enforcement notifications)

### Bug Reporting

- [ ] Bug report form accessible from Trust Center → Report a Bug
- [ ] Bug report form auto-captures context (app version, current route, network status)
- [ ] Submitted report returns ticket ID displayed to user
- [ ] Bug report also accessible from error states (error boundary → "Report this bug")

### Feature Request Board

- [ ] Feature request form accessible from Trust Center → Suggest a Feature
- [ ] Feature board shows top 10 open requests with vote counts
- [ ] User can upvote existing requests (1 vote per request)
- [ ] User can see status of their own submitted requests

### Status Integration

- [ ] `GET /api/status/loop` proxied from status.rald.cloud (60s KV cache)
- [ ] Incident banner renders when `has_active_incident = true`
- [ ] Incident banner is dismissible per session
- [ ] Error screens include real-time service status check

**Gate 5 Pass Criteria:** Trust Center accessible from Me tab. All sections render real data. Bug report submitted → ticket ID displayed. Feature request board shows real requests with vote counts. Incident banner tested with mocked active incident.

---

## Gate 6: Transparency Baseline

**Owner:** Backend Engineer + CTO
**Mandate:** The minimum transparency data is being collected and the minimum explanation surfaces are present.

### Feed Explanation Field

- [ ] `GET /api/feed/regional` response includes `explanation` field for each room
- [ ] `explanation.feed_level` is populated (lcda/lga/state/national/interest/featured)
- [ ] `explanation.reason_tags` array is populated (minimum 1 tag per room)
- [ ] "Why am I seeing this?" button renders on room cards
- [ ] Tapping "Why am I seeing this?" opens explanation sheet with human-readable text

### Trending Explanation

- [ ] Trending badge on room cards is tappable
- [ ] Tapping opens trending explanation sheet with: current traction score, signals breakdown, scope level
- [ ] Score breakdown visible: listener count, retention %, participation %, share count

### Transparency Snapshot

- [ ] Monthly aggregation job runs and populates snapshot table
- [ ] Trust Center transparency section renders snapshot data (at minimum: report counts, action rates, average review time)
- [ ] Snapshot last-updated timestamp visible to user
- [ ] If snapshot is > 45 days old: stale data warning displayed

### Civic Information Card

- [ ] All civic room cards render the information block: creator verification level, source, verification level, timestamps, expiry
- [ ] Civic rooms without source attribution cannot be published (Worker validation)
- [ ] Civic room card "Report this room" link functional (routes to safety report with civic subcategory)

### Plain Language Enforcement

- [ ] ESLint rule or CI check flags prohibited trust phrases in notification templates
- [ ] All enforcement notification templates reviewed: each must pass the four-question standard
- [ ] Zero occurrences of: "Community Guidelines" (without rule citation), "appropriate action", "this decision is final"

**Gate 6 Pass Criteria:** Feed explanation field present on all rooms in staging. Trending badge tappable with real signal data. Transparency snapshot populated. Civic information card tested with real civic room. Prohibited phrase check passes in CI.

---

## Trust Launch Declaration Criteria

Trust & Transparency Center is declared production-ready when:

| Criterion | Threshold | Measurement |
|-----------|-----------|-------------|
| RLS violations | 0 `USING(true)` policies remaining | `pg_policies` query |
| Trust tables | 8/8 deployed with correct RLS | Schema verification |
| Safety reporting | Case ID returned within 500ms | Load test |
| Case outcome notification | Delivered within SLA by priority | Integration test |
| Account deletion | Functional, 30-day grace, confirmed | E2E test |
| Data export | ZIP delivered within 48h | E2E test |
| Appeal link present | 100% of enforcement notifications | Template audit |
| Feed explanation field | Present on 100% of room responses | API test |
| Prohibited phrases | 0 occurrences in codebase | CI lint |
| Moderation pipeline | Non-passthrough verdicts on test inputs | Integration test |

---

## Pre-Launch Trust Smoke Test

Run on staging 48 hours before Trust Center goes live:

```
[ ] 1. Create test user → check user_trust_records row auto-created
[ ] 2. File safety report → receive case ID in < 500ms
[ ] 3. Check safety report status via GET /api/safety/reports → own case visible
[ ] 4. Cannot read another user's trust record (cross-user RLS test)
[ ] 5. Cannot read another user's safety reports (cross-user RLS test)
[ ] 6. Trigger account deletion → receive confirmation → check is_deleted = true
[ ] 7. Request data export → receive download link within 48h
[ ] 8. Privacy dashboard renders real data (no "Adaeze Okafor" mock)
[ ] 9. Submit bug report → ticket ID (LBG-YYYYMM-NNNN) displayed
[ ] 10. Submit feature request → visible on feature board → another user can upvote
[ ] 11. "Why am I seeing this?" button opens with real explanation
[ ] 12. Trending badge opens signal breakdown panel
[ ] 13. Create civic room without source URL → creation blocked (Worker validation)
[ ] 14. Create civic room with source URL → civic information card renders correctly
[ ] 15. Moderation: create room with blocked content → 400 returned, room not created
[ ] 16. Trust Center accessible from Me tab → all 3 sections load
[ ] 17. Community Guidelines rules linkable (deep link from simulated enforcement notification)
[ ] 18. Mocked active incident → banner appears on feed page → dismissible
[ ] 19. Prohibited phrase search in codebase → 0 results
[ ] 20. Account standing widget: create test strike → widget shows ⚠️ Under Review
```

All 20 must pass before Trust Center is declared production-ready.

---

## Post-Launch Trust Operations

| Week | Action |
|------|--------|
| Week 1 | Monitor safety report volume — ensure no report backlog > 24h |
| Week 1 | Confirm civic verification queue processing < SLA |
| Week 2 | Review first batch of feature requests — begin product triage |
| Month 1 | First moderation history review — audit strike descriptions for plain-language quality |
| Month 2 | First transparency snapshot published in Trust Center |
| Month 3 | First Loop-specific data added to trust.rald.cloud H2 transparency report section |

---

*CTO Office — LILCKY STUDIO LIMITED — 2026-06-07*
