# FOUNDATION/transparency-framework.md
**Version:** 1.0 — Loop Transparency Framework
**Date:** 2026-06-07
**Status:** APPROVED — Governance Reference
**Authority:** CTO Office — LILCKY STUDIO LIMITED

**Related:**
- `trust.rald.cloud/transparency` — RALD ecosystem transparency reports (live)
- `FOUNDATION/trust-center-v1.md` — in-product trust surfaces
- `FOUNDATION/civic-layer-design.md` — civic content architecture
- `FOUNDATION/community-promotion-system.md` — promotion algorithm

---

## The Four Questions

Every interaction between Loop and a user that involves an action affecting that user must answer these four questions. Not in a policy page. In the product. At the moment the action occurs.

```
1. What happened?     → Specific, not generic
2. Why did it happen? → The actual reason, with the rule cited
3. Who handled it?    → Review method and level (not individual name)
4. What happens next? → Specific next state, timeframe, options
```

A moderation action that cannot answer all four questions to the user in plain language is not ready to ship.

---

## Transparency Layers

Loop's transparency operates at three layers, each with different audiences and cadences.

### Layer 1 — Real-Time, In-Product (always on)

Every action on the platform generates an event that is immediately visible to the affected user in plain language.

| Trigger | What user sees | Timing |
|---------|---------------|--------|
| Safety report submitted | Case ID, expected review time | Immediate |
| Report reviewed — action taken | Outcome category, rule cited | Within review window |
| Report reviewed — no action | "No violation found" + case closed | Within review window |
| Strike issued | Strike card: what happened, rule, outcome, trajectory | Immediate |
| Account restricted | Restriction type, duration, reason, appeal link | Immediate |
| Account suspended | Duration, reason, appeal process | Immediate |
| Verification approved | New tier badge, what it unlocks | Immediate |
| Verification declined | Specific reason, resubmit guidance | Immediate |
| Room removed | Which room, why, by whom (review level) | Immediate |
| Room promoted to trending | Which level, why (which signals triggered it) | Immediate |
| Civic room verified | Verification level, verifier tier | Immediate |
| Civic room closed as false | Reason, consequence for reporter | Immediate |
| Feature request status changed | New status, Loop response | Within 7 days |
| Bug report resolved | Fix version, resolution description | On resolution |

### Layer 2 — Quarterly, In-App Snapshot (Trust Center)

The Trust Center exposes a rolling 30-day and 90-day aggregate of Loop-wide trust data. Updated quarterly. Visible to all users.

**Metrics published quarterly:**

```
Safety & Moderation
  Total safety reports received in period
  Reports actioned (% and count)
  Reports dismissed — no violation (% and count)
  Reports pending at end of period
  Average time from report to decision (P50, P95)
  Appeals filed / upheld / overturned
  Accounts restricted (count, by category)
  Accounts suspended (count, by category)
  Accounts permanently banned (count, by category)

Civic Layer
  Civic rooms created (count, by type)
  Civic rooms verified (count, by verification level)
  Civic false reports confirmed (count, by category)
  Civic appeals filed / upheld

AI-Assisted Actions
  Content flags raised by AI
  Flags escalated to human review
  Flags resulting in action
  Flags overturned by human review
  Average AI-to-human review handoff time

Community Health
  Active communities this period
  Communities with 0 safety incidents
  Communities escalated for moderation intervention

Platform Integrity
  Bug reports filed / resolved / response time
  Feature requests submitted / planned / shipped
  Law enforcement requests (count, jurisdiction, data disclosed)
```

### Layer 3 — Semi-Annual, Public Report (trust.rald.cloud)

Published as part of the RALD ecosystem transparency report on trust.rald.cloud/transparency, with a Loop-specific section. Semi-annual cadence: H1 (published June) + H2 (published December).

**Loop section in the transparency report:**

```
Loop — H1 2026 Transparency Data

Platform Status at period end:
  Active users: [X]
  Communities: [X]
  Rooms hosted: [X]

Moderation:
  Safety reports received: [X]
  Accounts actioned: [X]
  Appeals upheld: [X] of [X] filed

Civic Integrity:
  Civic rooms created: [X]
  False report rate: [X]%
  Government escalations: [X]

Legal:
  Law enforcement requests: [X]
  Requests complied with: [X]
  Users notified (where permitted): [X]

Bugs & Product:
  Bug reports resolved: [X]
  Average resolution time: [X] days
  Feature requests shipped: [X]
```

---

## Transparency Writing Standards

### What Transparency Is Not

| ❌ Opaque | ✅ Transparent |
|----------|--------------|
| "Violation of Community Guidelines" | "Rule 3: Civic claims require source attribution. Your room made an unverified emergency claim." |
| "Your account has been restricted" | "Room hosting is restricted for 30 days. Reason: 2 civic violations within 90 days." |
| "We reviewed your appeal" | "Your appeal was reviewed by our Trust & Safety team. The original decision was upheld. Reason: The second reviewer found the same evidence insufficient." |
| "Content was removed" | "The room 'Lagos flooding alert' was removed. Reason: Confirmed false report (duplicate of verified room LSR-202607-0019)." |
| "We take your safety seriously" | "47 safety reports were reviewed in June. 31 resulted in action. Average review time: 3.2 hours." |

### Plain Language Rules

All user-facing trust communications must:
1. **Name the specific thing** — not "content" but "your room titled X"
2. **Name the specific rule** — not "Community Guidelines" but "Civic Rule 2 — Source attribution required"
3. **Name the specific outcome** — not "appropriate action" but "1 warning issued / hosting restricted for 30 days"
4. **Name the review method** — not "our team" but "Human review · Loop Civic Team" or "AI flagged → Human confirmed"
5. **Name the next state** — not "further violations may result in action" but "2 more warnings = 30-day hosting restriction"
6. **Provide a path** — every enforcement message has at minimum one of: appeal link, guidance to avoid recurrence, rule link

### Prohibited Phrases in Trust Communications

The following phrases are banned from all Loop trust communications and will be flagged in code review:

```
"Community Guidelines" (without citing the specific rule)
"Appropriate action has been taken"
"We take this seriously"
"Further violations may result in"
"This decision is final"  (all decisions are appealable for 14 days)
"We cannot share details"  (we can share: what rule, what review method, what outcome)
"Our team will review"  (name the team and timeframe)
"Soon"  (name the SLA)
```

---

## Algorithmic Transparency

Every algorithmic decision affecting content visibility must be explainable. This applies to:

- Feed ranking (why is room X at the top?)
- Promotion ladder (why did room X reach LGA trending?)
- Interest matching (why is room X shown to user Y?)
- Civic verification (why was civic room X verified?)

### The "Why am I seeing this?" surface

Every room card has a ⓘ button. Tapping it opens:

```
Why you're seeing this room

This room is showing because:
  ● It's in your LCDA (Ojodu)
  ● It matches your interest: Music
  ● It's growing fast right now (47 listeners in the last 5 minutes)

Where it ranks: #2 in your local feed
When it was created: 18 minutes ago
Host verification: Community ✓
```

### The "Why is this trending?" surface

Every trending badge on a room is tappable. Tapping opens:

```
Why this room is trending in Ikeja LGA

Traction signals at this moment:
  Listeners: 127 (peak: 142)
  Retention: 71% stayed more than 5 minutes
  Participation: 23% raised their hand
  Shares: 14 external shares

Trending since: 12 minutes ago
Scope: LGA (next level: State requires score ≥ 200, current: 167)

Room hosts are never told their room is being considered for trending
before it reaches the threshold — gaming prevention.
```

### Promotion Audit Log (public)

Every trending promotion event is logged and visible in aggregate in the quarterly transparency snapshot. Individual room data is anonymised (no room titles or host IDs in the public log — only categories, regions, and score ranges).

---

## Civic Transparency — Separate Standard

Civic content carries a higher transparency burden. Users must be able to verify the basis of every civic claim shown to them.

### Civic Room Information Card

Every civic room card includes a visible information block:

```
┌──────────────────────────────────────────────────────────────┐
│ 🚨 Emergency — Verified                                      │
│ Flooding Alert — Badagry Coastal Road                        │
│                                                              │
│ About this room:                                             │
│ Created by: LASEMA Official (government-verified)            │
│ Source: NiMet Advisory #2026-0612 [View source ↗]           │
│ Verification: Official-Verified (Loop Civic Team + LASEMA)   │
│ Created: Jun 12 · 14:32 WAT                                  │
│ Last updated: 8 minutes ago                                  │
│ Auto-expires: Jun 12 · 20:32 WAT (6 hours)                  │
│                                                              │
│ [Report this room]    [Share alert]                          │
└──────────────────────────────────────────────────────────────┘
```

No civic claim is shown without: creator verification level, source attribution, verification level, and creation timestamp.

### Civic False Report Transparency

When a civic room is closed as a false report:

**Reporter sees:**
```
Room LSR-202607-0014 was reviewed.
Finding: Confirmed false report — no incident at stated location.
Source checked: No matching NiMet advisory. No community corroboration.
Room closed at: Jun 8 · 16:44 WAT
Host consequence: 1 civic warning (first offence)
```

**Room host sees:**
```
Your room "Flooding: Victoria Island" was reviewed following a report.
Finding: Civic Team found no evidence of the stated incident.
Rule cited: Civic Rule 1 — Claims must be verifiable at submission.
Review method: Human — Loop Civic Team
Outcome: Room closed. 1 warning issued.
Next: 2 more civic warnings within 90 days = 30-day civic posting restriction.
[Read the full rule] [Appeal this decision]
```

**Public record:**
The room's existence is preserved in the civic archive as `status: false_report_confirmed`. The title is redacted. The region and date are retained for post-incident analysis.

---

## Law Enforcement Transparency

### What Loop can and cannot disclose

| Request | Can comply | What we can provide |
|---------|-----------|---------------------|
| User account data (name, phone, region) | If lawful Nigerian court order | Account registration data only |
| Room participation records | If lawful court order | Who joined and when (no audio in V1) |
| Chat messages | Cannot — E2EE (Messenger) | We do not hold the keys |
| Live room audio | Cannot — not recorded in V1 | We do not hold recordings |
| Bulk/mass data | Cannot — no legal basis | We resist and challenge |
| Informal request (email/phone) | Cannot | Request must be formal legal instrument |
| Foreign government request (no Nigerian legal basis) | Cannot | Must route through Nigerian law |

### User notification policy

Loop notifies users of law enforcement requests affecting them before complying — unless:
- Notification is prohibited by the court order
- Notification would endanger a minor in a safety case
- Notification would obstruct an active investigation (with court-documented basis)

When notification is delayed, users are notified as soon as legally permitted.

### Law enforcement request log

All requests are logged and published in aggregate in the semi-annual transparency report:

```
Law Enforcement — H1 2026
  Requests received:           0
  Requests complied with:      0
  Requests challenged/refused: 0
  Data disclosed:              None
  Users notified:              N/A
```

When this number is non-zero, each entry in the public log contains: jurisdiction (not the specific case), data category (not individual data), and outcome (complied / challenged / refused).

---

## Transparency Failure Modes

These are conditions under which Loop's transparency commitment has failed. Engineering and product are responsible for preventing them.

| Failure Mode | Description | Prevention |
|---|---|---|
| Generic enforcement message | User receives "Community Guidelines violation" without specific rule | Require rule_id field in all enforcement actions — null is a CI failure |
| Unreachable appeal | Appeal option missing from enforcement notification | Appeal link is a required field in enforcement notification schema |
| Silent removal | Content removed without notifying the creator | Notification trigger fires before deletion — removal is blocked if notification fails |
| Stale transparency data | Quarterly snapshot not updated in > 120 days | Automated staleness check: if last_updated > 90 days, Trust Center shows warning |
| Civic claim without source | Civic room visible without source attribution | Civic room creation blocked if source_url is null and creator is not government-tier |
| Algorithmic opacity | "Why am I seeing this?" returns a generic answer | Feed endpoint must return `explanation` field — missing explanation = feed endpoint test failure |
| Law enforcement non-disclosure | LEO request processed without logging | All LEO requests route through Trust Team → RALD Legal → logged before compliance |

---

## Transparency Certification

Trust & Transparency Center is certified for production when:

- [ ] All 4 questions (what / why / who / what next) answered in every enforcement communication
- [ ] No prohibited phrases present in any trust communication (linted)
- [ ] "Why am I seeing this?" functional for all room cards
- [ ] "Why is this trending?" functional for all trending badges
- [ ] Quarterly transparency snapshot computed and rendered in Trust Center
- [ ] Civic information card rendered on all civic rooms with all required fields
- [ ] Law enforcement request log table exists and is append-only
- [ ] Appeal link present in 100% of enforcement notifications (tested by integration suite)
- [ ] Transparency report section at trust.rald.cloud updated with Loop-specific data

---

*CTO Office — LILCKY STUDIO LIMITED — 2026-06-07*
