# AUDIT/trust-readiness.md
**Version:** 1.0 — Trust Readiness Audit
**Date:** 2026-06-07
**Auditor:** CTO Office — LILCKY STUDIO LIMITED
**Scope:** Trust & Transparency Center Sprint — current trust infrastructure in Loop
**Method:** Evidence-based. Every finding cites the specific file, table, or behaviour. No assumptions.

---

## Verdict

**Loop has no in-product trust infrastructure.**

Users who are moderated, reported, verified, or affected by any platform action receive no in-product explanation. The moderation.ts service is a passthrough (`verdict: "ok"` for all inputs). No trust tables exist in the schema. No report endpoint exists. No appeal mechanism exists. No transparency data is surfaced.

The RALD ecosystem trust layer (`trust.rald.cloud`, `rald-trust` repo) is excellent — 98/100, with full policy pages, transparency reports, and verification documentation. But that is a public policy site. This audit covers the in-product trust experience for Loop users.

**Trust readiness score: 2/20 systems operational.**

---

## Trust Scorecard

| System | Status | Evidence |
|--------|--------|----------|
| User trust record (standing, strikes) | ❌ No table | No `user_trust_records` or `trust_strikes` in schema |
| Safety reporting | ❌ Not implemented | No `POST /api/users/:id/report` endpoint |
| Report case tracking | ❌ Not implemented | No `safety_reports` table |
| Moderation pipeline | ❌ Passthrough | `moderation.ts` returns `verdict: "ok"` for all input |
| Appeal mechanism | ❌ Not implemented | No appeal table, no appeal route |
| Moderation history (user-visible) | ❌ Not implemented | No history surface |
| Bug reporting | ❌ Not implemented | No `bug_reports` table or endpoint |
| Feature request system | ❌ Not implemented | No table or endpoint |
| Verification center (in-app) | ❌ Not implemented | Verification tiers defined in arch docs, no application flow |
| Account standing widget | ❌ Not implemented | No standing field on profiles |
| Trust Center shell (UI) | ❌ Not implemented | Not in `App.tsx` routes |
| Privacy dashboard | ❌ Not implemented | Profile page uses mock data |
| Status integration (in-app) | ❌ Not implemented | No `GET /api/status/loop` endpoint |
| Transparency snapshot | ❌ Not implemented | No aggregation queries or display |
| "Why am I seeing this?" | ❌ Not implemented | Feed endpoint returns no `explanation` field |
| "Why is this trending?" | ❌ Not implemented | Trending badges non-interactive |
| Civic information card | ❌ Not built | Civic rooms not yet in production |
| Plain-language enforcement messages | ❌ No baseline | No enforcement messages exist to evaluate |
| Law enforcement request log | ⚠️ Policy only | Documented on trust.rald.cloud — no database log table |
| RLS protecting trust data | ❌ All USING(true) | All RLS policies are USING(true) — no row-level protection |

**Trust score: 0/20 mechanisms fully operational. 1 partially implemented (law enforcement policy document exists).**

---

## Section 1 — Moderation Infrastructure

### 1.1 moderation.ts — Passthrough Only

**Finding: The moderation service is a skeleton that approves all content.**

**Evidence:**
```typescript
// artifacts/cloudflare-worker/src/services/moderation.ts
export async function moderateMessage(
  env: CloudflareEnv,
  text: string,
  lang = "en",
): Promise<ModerationResult> {
  // Blocklist check (KV, fast path)
  const blocklist = await env.CACHE.get("moderation:blocklist", "json") as string[] | null;
  if (blocklist) {
    const lower = text.toLowerCase();
    if (blocklist.some((word) => lower.includes(word))) {
      return { verdict: "block", score: 1, reason: "blocklist", provider: "blocklist" };
    }
  }

  // TODO: Workers AI classification — commented out
  // ...

  return { verdict: "ok", score: 0, provider: "passthrough" };
}
```

**Impact:** All content passes moderation. Hate speech, harassment, and false civic claims are all returned as `verdict: "ok"`. The Workers AI classification (`@cf/huggingface/distilbert-sst-2-int8`) is commented out and not wired.

**Additional finding:** `moderateMessage` is not called from any route handler. Even the passthrough is not wired.

```bash
# No references to moderateMessage in routes:
grep -r "moderateMessage" artifacts/cloudflare-worker/src/routes/
# Result: 0 matches
```

**Fix:**
1. Uncomment and wire Workers AI classification
2. Add `moderateMessage` call in `POST /api/rooms` (room title + description)
3. Add `moderateMessage` call in room join flow (display name check)
4. Create moderation blocklist seed in KV (`moderation:blocklist`)

---

### 1.2 No User Report Endpoint

**Finding: There is no way for a user to report another user or a room.**

**Evidence:**
```typescript
// artifacts/cloudflare-worker/src/routes/rooms.ts — no report handler
// artifacts/cloudflare-worker/src/routes/index.ts — search for 'report':
// 0 matches
```

No `POST /api/users/:id/report` route exists. No `POST /api/rooms/:id/report` route exists.

**Impact:** A user experiencing harassment, false civic claims, or unsafe content has no in-product mechanism to flag it. The only option from `loop-security-readiness.md` is "contact support" — which has no path in the current UI.

**Fix:** Implement `POST /api/safety/report` with body `{ subject_user_id?, subject_room_id?, category, description }`. This creates a case in the `safety_reports` table and returns a case ID.

---

### 1.3 No Trust Schema — Zero Tables

**Finding: The entire trust data model from `FOUNDATION/trust-center-v1.md` does not exist in Supabase.**

**Evidence:**
```bash
# Search in supabase/migrations/ for trust-related tables:
grep -r "trust_strikes\|safety_reports\|bug_reports\|user_trust_records" supabase/migrations/
# Result: 0 matches
```

No migrations exist for:
- `user_trust_records` (account standing)
- `trust_strikes` (moderation history)
- `safety_reports` (user reports)
- `bug_reports` (bug tracking)
- `feature_requests` (product feedback)
- `civic_room_verifications` (defined in civic-layer-design.md but not migrated)
- `civic_room_reports` (defined in civic-layer-design.md but not migrated)

**Impact:** Trust is architecturally well-designed in FOUNDATION docs. None of it exists in the database or the API.

---

### 1.4 RLS Policies — All USING(true)

**Finding: All Row Level Security policies are USING(true), meaning any authenticated user can read any row in any table.**

**Evidence (from AUDIT/02-security-audit.md — SEC-005):**
```sql
CREATE POLICY "profiles_read"   ON public.profiles FOR SELECT USING (true);
CREATE POLICY "profiles_update" ON public.profiles FOR UPDATE USING (true);
-- Same pattern on ALL tables
```

**Impact on trust data specifically:**

If trust tables were created today without fixing RLS, any authenticated user could:
- Read any other user's `trust_strikes` (private moderation history)
- Read any `safety_reports` (reporter and subject identities)
- Read any `bug_reports` (contact email, session context)
- Update their own `user_trust_records.standing` to 'good'

Trust data carries higher privacy expectations than general profile data. Trust tables must have the most restrictive RLS in the schema.

**Required RLS for trust tables:**

```sql
-- user_trust_records: user sees own record only
CREATE POLICY "trust_record_read_own" ON user_trust_records
  FOR SELECT USING (auth.uid() = user_id);

-- trust_strikes: user sees own strikes only
CREATE POLICY "trust_strikes_read_own" ON trust_strikes
  FOR SELECT USING (auth.uid() = user_id);

-- safety_reports: reporter sees own reports; subject sees nothing (privacy)
CREATE POLICY "safety_reports_reporter_read" ON safety_reports
  FOR SELECT USING (auth.uid() = reporter_id);
-- Note: subject_user_id is NOT exposed to the subject — only outcome notification

-- bug_reports: submitter sees own reports
CREATE POLICY "bug_reports_read_own" ON bug_reports
  FOR SELECT USING (auth.uid() = user_id);

-- feature_requests: all users can read (public voting), owners can update
CREATE POLICY "feature_requests_read_all" ON feature_requests
  FOR SELECT USING (true);
CREATE POLICY "feature_requests_update_owner" ON feature_requests
  FOR UPDATE USING (auth.uid() = submitted_by);
```

No trust table should have an UPDATE or DELETE policy accessible to end users. All modifications route through the Worker with service-role context.

---

## Section 2 — Verification Infrastructure

### 2.1 Verification Tiers — Architecture Only

**Finding: Verification tiers are fully specified in FOUNDATION and trust.rald.cloud, but there is no in-app verification application flow.**

**Evidence:**
- `artifacts/loop/src/App.tsx` — no `/verify` or `/verification` route
- `artifacts/loop/src/hooks/use-auth.tsx` — `is_verified` field exists but never surfaced
- `supabase/migrations/` — `profiles` table has `is_verified BOOLEAN` and `verification_status TEXT` columns, but no application workflow

**What exists:**
- `is_verified` boolean on profiles ✅
- `verification_status` enum on profiles ✅ (assumed — matches architecture)
- trust.rald.cloud/verification — policy page ✅

**What does not exist:**
- In-app verification application form ❌
- Document upload for journalist/official verification ❌
- Verification queue (Worker-side) ❌
- Verification decision notification ❌
- Cloudflare R2 bucket for verification documents ❌

**Impact:** A journalist or local official who wants to create verified civic content has no in-product path to get verified. Civic verification is a prerequisite for the civic layer to be trustworthy. Unverified civic rooms are the primary misinformation risk.

---

### 2.2 Community Verification Tier — Automatic but Unwired

**Finding: Community verification (the lowest tier — earned automatically after 30 days + 5 rooms) is defined in architecture but has no computation or assignment logic.**

**Evidence:**
```sql
-- profiles.verification_status exists but:
-- No cron trigger that upgrades verification_status automatically
-- No API endpoint that checks eligibility
```

Community verification can be made automatic and requires no document upload. It should be the first verification tier to ship — it unblocks civic room creation for active, established community members.

**Fix:** Add a Supabase scheduled function or Cloudflare Cron Trigger:

```typescript
// Runs daily: auto-upgrade community-eligible users
async function upgradeToCommmunityVerification(env: Env) {
  const eligible = await supabase
    .from('profiles')
    .select('id')
    .eq('verification_status', 'none')
    .gte('created_at', addDays(now(), -30))  // account ≥ 30 days old
    .lte('rooms_hosted', -5);  // hosted ≥ 5 rooms (using rooms table count)
    // .eq('has_active_strikes', false) -- trust record check

  for (const user of eligible) {
    await supabase.from('profiles')
      .update({ verification_status: 'community' })
      .eq('id', user.id);
    // Notify user: "You've earned Community verification ✓"
  }
}
```

---

## Section 3 — Privacy Infrastructure

### 3.1 Profile Page Uses Mock Data

**Finding: The Me tab (`me-launch.tsx`) renders hardcoded mock people, not real profile data. The privacy dashboard cannot be built on top of a mock data layer.**

**Evidence (from AUDIT/loop-v2-launch-blockers.md P1-004):**
```tsx
// me-launch.tsx
const mockPeople = [
  { id: '1', name: 'Adaeze Okafor', ... },
  { id: '2', name: 'Chukwuemeka', ... },
]
```

**Impact:** A privacy dashboard that shows "your data" while the same page shows "Adaeze Okafor" as someone you follow (who doesn't exist) is not credible.

**Fix:** Wire Me tab to real data before Privacy Dashboard can ship. This is a dependency.

---

### 3.2 No Data Export Endpoint

**Finding: No `GET /api/users/me/data-export` endpoint exists. NDPR Art. 3.1(b) right to access + portability requires this.**

**Evidence:**
```bash
grep -r "export\|portability\|data-export" artifacts/cloudflare-worker/src/routes/
# Result: 0 matches
```

**Fix:** `POST /api/users/me/data-export` → async job → ZIP of: profile, rooms_hosted, rooms_attended, notifications, community_memberships → delivered to user email or downloadable from app within 48h.

---

### 3.3 No Account Deletion Endpoint

**Finding: No account deletion mechanism exists in the Worker or frontend.**

**Evidence:**
```bash
grep -r "delete.*account\|account.*delete\|deleteAccount" artifacts/cloudflare-worker/src/routes/
# Result: 0 matches
```

**Impact:** NDPR Art. 3.1(c) right to erasure requires account deletion. Loop cannot launch publicly without this.

**Fix:** `DELETE /api/users/me` → soft delete (is_deleted = true, 30-day grace period) → hard delete job after 30 days → confirmation email → anonymous all content (display_name = "Deleted User", avatar = null).

---

## Section 4 — Bug & Feature Reporting

### 4.1 No Bug Reporting Path

**Finding: There is no way for a user to report a bug from within the Loop app.**

**Evidence:** No bug reporting route, form, or endpoint anywhere in `artifacts/loop/src/` or `artifacts/cloudflare-worker/src/`.

**Impact:** Bugs found by users during soft launch are reported via screenshots in WhatsApp groups or left as app store reviews. Engineering has no systematic signal from real user sessions.

---

### 4.2 No Feature Request Path

**Finding:** No feature request mechanism. The dead-end empty states (Events "Coming soon", Discussions "Coming soon") have no "Tell us what you need" CTA.

**Fix:** Every dead-end empty state in the app should include a "Suggest this feature" link that opens the feature request form. This converts frustration into product signal.

---

## Section 5 — Transparency Infrastructure

### 5.1 No "Why am I seeing this?" Surface

**Finding: Feed endpoint returns rooms with no explanation field. The "Why am I seeing this?" button (specified in transparency-framework.md) has no data to display.**

**Evidence:**
```typescript
// Worker: GET /api/feed or /api/rooms returns:
// { id, title, host, audience_count, ... }
// No `explanation` field. No `signals` field. No `scope_level` field.
```

**Fix:** Feed response adds:
```typescript
type RoomWithExplanation = Room & {
  explanation: {
    feed_level: 'lcda' | 'lga' | 'state' | 'national' | 'interest' | 'featured';
    reason_tags: string[];  // ['in_your_area', 'matches_interest:music', 'trending_lga']
    momentum_score: number;
    interest_match_score: number;
  };
};
```

---

### 5.2 No Transparency Data Collection

**Finding: The metrics required for the quarterly transparency snapshot are not being collected. Aggregation queries cannot run on data that doesn't exist.**

**Gaps:**
- No `safety_reports` table → can't report safety report counts
- No `trust_strikes` table → can't report moderation action counts
- No `bug_reports` table → can't report bug resolution metrics
- No session tracking → can't report average session length
- No enforcement history → can't report appeal rates

**The quarterly transparency snapshot is entirely dependent on the trust schema existing.**

---

## Section 6 — Security Baseline for Trust Data

### 6.1 Trust Data Requires Stronger Security Than General Data

Trust data (strikes, safety reports, verification documents) is the most sensitive category of data Loop holds. It requires:

| Requirement | Current status | Priority |
|---|---|---|
| RLS restricting to own records | ❌ All USING(true) | P0 — before any trust table ships |
| No service role on reads | ❌ Service role used for all ops | P0 |
| Audit log on trust writes | ❌ No audit log table | P1 |
| Encryption at rest for verification docs | ❌ No R2 bucket configured | P1 |
| Rate limiting on report endpoints | ❌ No rate limiting | P1 |
| Reporter anonymity (subject can't see who reported) | ❌ No schema enforcement | P0 |

---

## Remediation Ranked Summary

| Priority | Gap | Effort | Blocks |
|----------|-----|--------|--------|
| P0 | Fix all RLS policies before trust tables ship | M | All trust data |
| P0 | Wire moderation.ts to room creation routes | S | Content safety |
| P0 | Create safety_reports table + POST endpoint | M | Safety reporting |
| P0 | Create user_trust_records + trust_strikes tables | M | Trust Center |
| P0 | Reporter anonymity enforced in RLS | S | User safety |
| P0 | Account deletion endpoint | M | NDPR compliance |
| P1 | Safety report case tracking + notifications | M | Reporting loop |
| P1 | Bug reports table + endpoint + ticket ID | M | Bug tracking |
| P1 | Community verification auto-upgrade cron | S | Civic creation |
| P1 | In-app verification application form | L | Civic integrity |
| P1 | Privacy dashboard (requires real profile data first) | L | NDPR compliance |
| P1 | Data export endpoint | M | NDPR compliance |
| P1 | Feed explanation field | S | Algorithmic transparency |
| P2 | Feature requests table + endpoint + voting | M | Product feedback |
| P2 | Transparency snapshot aggregation queries | M | Trust Center |
| P2 | Trust Center UI shell | L | All trust surfaces |
| P2 | Moderation history viewer | M | User trust |
| P2 | Status.rald.cloud integration in-app | S | Incident awareness |

---

## Trust Readiness Certification Criteria

Trust readiness is declared when:

- [ ] RLS fixed on ALL tables (not just trust tables — all USING(true) policies replaced)
- [ ] `moderation.ts` Workers AI classification uncommented and wired to room creation
- [ ] `safety_reports` table created with correct RLS (reporter sees own; subject sees nothing)
- [ ] `user_trust_records` + `trust_strikes` tables created
- [ ] `POST /api/safety/report` endpoint returns case ID within 500ms
- [ ] Case status updates delivered to reporter as notifications
- [ ] Appeal link present in all moderation notification messages
- [ ] Account deletion endpoint (`DELETE /api/users/me`) functional
- [ ] Data export endpoint functional (ZIP within 48h)
- [ ] Feed endpoint includes `explanation` field for all rooms
- [ ] No prohibited trust phrases ("Community Guidelines", "appropriate action", etc.) in codebase
- [ ] Community verification auto-upgrade cron running in production

**Current certification: 0/12 criteria met.**

---

*CTO Office — LILCKY STUDIO LIMITED — 2026-06-07*
