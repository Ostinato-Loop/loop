# FOUNDATION/trust-center-v1.md
**Version:** 1.0 — Trust & Transparency Center Sprint
**Date:** 2026-06-07
**Status:** APPROVED — Engineering Reference
**Authority:** CTO Office — LILCKY STUDIO LIMITED

**Ecosystem context:**
- `trust.rald.cloud` (`rald-trust` repo) — RALD ecosystem-wide trust center. Score: 98/100. Already live.
- `status.rald.cloud` (`rald-status` repo) — RALD public status page. 16 services monitored. Already live.

This document specifies the **Loop-native trust layer** — the in-product trust surfaces that surface inside the Loop app itself, distinct from the public-facing trust.rald.cloud policy site. These are product features, not policy pages.

> "Users should always know: what happened, why it happened, who handled it, what happens next."

---

## Design Principle

Trust is not a settings page. Trust is infrastructure — embedded in every action, every enforcement, every error message.

| Anti-pattern | Loop approach |
|---|---|
| "Contact support" → dead email | Named reviewer + ticket ID + estimated time |
| "Violation of Community Guidelines" | Specific rule cited, with excerpt from room that triggered it |
| "Account under review" | Progress bar: Reported → Reviewed → Decision → Communicated |
| "This content was removed" | What it was, why it was removed, who reviewed it, what the user can do |
| Policy page in footer | In-context trust card surfaced at the moment the user needs it |

---

## The Ten Trust Systems

### 1. Trust Center (In-App)

**What it is:** A dedicated section inside Loop where users can access their trust record, community guidelines, appeal history, and contact trust team. Not a policy link. A live dashboard of the user's relationship with Loop.

**Entry point:** Profile → Trust & Safety (shield icon in Me tab)

**Trust Center Sections:**

```
My Trust Profile
├── Account Standing           → Good standing / Under review / Restricted
├── Active Restrictions        → What is restricted, until when, why
├── Strike History             → All strikes: what happened, date, reviewer
├── Appeals                    → Open and resolved appeals
└── Verification Status        → Current tier + how to upgrade

Community Guidelines
├── Audio Room Rules           → With examples of violations
├── Civic Content Rules        → Evidence requirements, what not to say
├── Creator Rules              → Hosting responsibilities
└── Regional Rules             → LCDA/LGA-specific expectations

Report History
├── Reports I Filed            → Status: pending / reviewed / actioned / dismissed
└── Reports Filed Against Me   → Outcome of each, with reason

Contact Trust Team
├── Escalate an Appeal
├── Submit Safety Report
└── Report a Bug
```

**Account Standing Widget:**

The standing widget is visible everywhere in the user's profile — not only in the Trust Center. It is a persistent signal:

```
┌─────────────────────────────────────┐
│ ✅ Good Standing                    │
│ Your account has no active strikes  │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ ⚠️ Under Review                     │
│ Strike: 1 — Civic content violation │
│ Reviewed: Jun 12 · Appeal available │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ 🔴 Restricted — Rooms              │
│ Room hosting restricted until Jul 1 │
│ Reason: Rule 3 — Unverified claims  │
│ [Appeal] [Read the rule]            │
└─────────────────────────────────────┘
```

**Data Model:**

```sql
CREATE TABLE user_trust_records (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  standing        TEXT        NOT NULL DEFAULT 'good'
                              CHECK (standing IN ('good','under_review','restricted','suspended','banned')),
  strike_count    SMALLINT    NOT NULL DEFAULT 0,
  restrictions    JSONB       NOT NULL DEFAULT '[]',
  -- [{ type: 'room_hosting', reason: 'civic_violation', until: timestamp, rule_id: 3 }]
  reviewed_at     TIMESTAMPTZ,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (user_id)
);

CREATE TABLE trust_strikes (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES profiles(id),
  type            TEXT        NOT NULL CHECK (type IN (
                                'civic_false_report', 'civic_unverified_claim',
                                'harassment', 'spam', 'impersonation',
                                'hate_speech', 'platform_manipulation',
                                'audio_misconduct'
                              )),
  severity        TEXT        NOT NULL CHECK (severity IN ('warning','minor','major','critical')),
  rule_id         SMALLINT,
  description     TEXT        NOT NULL,
  evidence_ref    TEXT,       -- room_id, report_id, or audit log ref
  reviewed_by     UUID        REFERENCES profiles(id), -- NULL for automated
  review_method   TEXT        CHECK (review_method IN ('automated','human','human_escalated')),
  appealed        BOOLEAN     NOT NULL DEFAULT false,
  appeal_outcome  TEXT        CHECK (appeal_outcome IN ('upheld','overturned','partial')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at      TIMESTAMPTZ -- NULL = permanent
);
```

---

### 2. Bug Reporting System

**What it is:** An in-app bug reporting surface that captures context automatically, routes to the engineering team, and gives the user a ticket ID and status.

**Entry point:** Any error state → "Report this bug" button. Also: Profile → Trust & Safety → Report a Bug.

**Bug Report Form (in-app sheet):**

```
What happened?
[Describe what you were doing and what went wrong]

Severity (how is this affecting you?)
○ I can work around it
○ A feature I need is broken
● The app crashed / I'm stuck

Attach screenshot?  [Auto-captured if crash] [Browse]

Your contact email (optional, for follow-up)
[_____________________]

[Submit Report]
```

**Auto-captured context (never shown to user without permission):**

```typescript
type BugReportContext = {
  app_version: string;           // "loop-v2.1.0"
  platform: 'ios' | 'android' | 'web';
  screen: string;                // current route: "/rooms/abc-123"
  user_agent: string;
  session_duration_seconds: number;
  last_3_actions: string[];      // anonymised: ["tap_room_card","tap_join","tap_raise_hand"]
  error_boundary_caught: boolean;
  console_errors: string[];      // last 5 JS errors in session
  network_status: 'online' | 'offline' | 'slow';
  supabase_last_error: string | null;
};
```

**Routing:**

```
Bug Report submitted
  → Auto-classify: crash / UI bug / API error / performance / other
  → Insert into `bug_reports` table
  → Generate ticket ID: LBG-{year}{month}-{sequential}
  → Display to user: "Ticket LBG-202607-0047 received. We'll investigate."
  → Notify engineering Slack channel (via RALD Event Bus)
  → If severity = crash: immediate PagerDuty alert

Status updates sent to user (if email provided):
  → "LBG-202607-0047: Under review" (within 48h)
  → "LBG-202607-0047: Fixed in v2.1.1" (when resolved)
```

**Database:**

```sql
CREATE TABLE bug_reports (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id       TEXT        UNIQUE NOT NULL, -- LBG-202607-0047
  user_id         UUID        REFERENCES profiles(id),
  description     TEXT        NOT NULL CHECK (length(description) BETWEEN 5 AND 2000),
  severity        TEXT        NOT NULL CHECK (severity IN ('low','medium','high','crash')),
  category        TEXT        CHECK (category IN ('ui','api','crash','performance','auth','audio','other')),
  context         JSONB       NOT NULL DEFAULT '{}',  -- BugReportContext
  screenshot_url  TEXT,
  contact_email   TEXT,
  status          TEXT        NOT NULL DEFAULT 'received'
                              CHECK (status IN ('received','triaged','in_progress','fixed','wont_fix','duplicate')),
  resolved_in_version TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

### 3. Safety Reporting System

**What it is:** A structured in-room and in-profile reporting flow for safety concerns. Every report generates a case with a case ID, tracks through a defined review workflow, and communicates the outcome to the reporter.

**Trigger surfaces:**
- Inside a room: long-press on a speaker → "Report"
- Profile page: ⋮ menu → "Report this user"
- Community announcement: ⋮ → "Report this post"
- Civic room: ⋮ → "Report — false information"

**Report Categories:**

```
Reporting [User Display Name]

Why are you reporting this?

○ Harassment or bullying
○ Hate speech or discrimination
○ Threatening behaviour
○ False identity / impersonation
○ Spam or platform manipulation
○ Civic false report (incorrect emergency/traffic)
● Sexual content or exploitation
○ Minor at risk
○ Something else
```

**For civic false reports — additional field:**

```
What is incorrect about this civic report?
○ The incident did not happen
○ The location is wrong
○ The incident already resolved
○ This is a duplicate of another room
○ The creator has a conflict of interest
```

**Case Workflow:**

```
REPORTED
  → Case ID: LSR-{year}{month}-{sequential}
  → Reporter notified: "Thank you. Case LSR-202607-0082 opened."
  → Auto-triage: severity score based on category
    - Minor at risk / sexual exploitation → P0 (immediate human review)
    - Threats → P1 (review within 1 hour)
    - Harassment / hate speech → P2 (review within 4 hours)
    - Civic false report → P2 (review within 2 hours)
    - Spam / other → P3 (review within 24 hours)

UNDER REVIEW
  → Reporter notified: "Case LSR-202607-0082 is being reviewed."
  → Reviewer assigned (human for P0/P1, AI-assisted for P2/P3)

DECISION
  → Action taken: none / warning / strike / restriction / suspension / ban
  → Reporter notified of outcome category (not personal details of subject):
    "Case LSR-202607-0082: We reviewed the report. Action has been taken
     consistent with our Community Guidelines. We cannot share personal
     account details of the subject."
  → If no action: "We reviewed the report and found no violation.
     This case is closed. If you experience further issues, please report again."

CLOSED
  → Case archived for audit
  → Subject's trust record updated (if action taken)
  → Reporter's report history updated with outcome
```

**Database:**

```sql
CREATE TABLE safety_reports (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id         TEXT        UNIQUE NOT NULL,  -- LSR-202607-0082
  reporter_id     UUID        NOT NULL REFERENCES profiles(id),
  subject_user_id UUID        REFERENCES profiles(id),
  subject_room_id UUID        REFERENCES rooms(id),
  subject_community_id UUID   REFERENCES communities(id),
  category        TEXT        NOT NULL,
  subcategory     TEXT,
  description     TEXT        CHECK (length(description) <= 1000),
  priority        TEXT        NOT NULL CHECK (priority IN ('p0','p1','p2','p3')),
  status          TEXT        NOT NULL DEFAULT 'received'
                              CHECK (status IN (
                                'received','triaged','under_review',
                                'actioned','dismissed','escalated'
                              )),
  reviewer_id     UUID        REFERENCES profiles(id),
  review_method   TEXT        CHECK (review_method IN ('automated','human','human_escalated')),
  action_taken    TEXT        CHECK (action_taken IN (
                                'none','warning','strike','room_ban',
                                'hosting_restriction','suspension','ban'
                              )),
  action_detail   TEXT,
  reviewed_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

### 4. Feature Request System

**What it is:** A structured way for users to submit, vote on, and track feature requests — surfaced in the app, routed to product, and closed with an honest response.

**Entry point:** Profile → Trust & Safety → Suggest a Feature (also accessible from empty states and dead-end pages).

**Feature Request Form:**

```
What would you like Loop to do?

Title (required)
[e.g. "Schedule a room in advance"]

Describe the problem this solves (required)
[What situation are you in when you need this?]

How often would you use this?
○ Every day  ○ A few times a week  ● Occasionally

Your region
○ Lagos  ○ Kano  ○ Abuja  ● Other _______

[Submit Request]
```

**Voting:** All feature requests are public within the Loop Feature Board (accessible from the same Trust Center section). Users can upvote requests from others.

```
┌───────────────────────────────────────────────────────────────┐
│ 🗳 Schedule a room in advance                    ▲ 247 votes  │
│ Submitted by @adaeze_lagos · Jun 3               Status: OPEN │
│ "Radio stations need to publish their programme schedule..."  │
│                                                               │
│ Loop response: "On our V2 roadmap. Target: Q3 2026."         │
└───────────────────────────────────────────────────────────────┘
```

**Status lifecycle:**

```
OPEN → REVIEWED → PLANNED | DECLINED | DEFERRED → SHIPPED | CANCELLED
```

Every status change triggers a notification to all users who voted for the request.

**The honest decline message:**

When a feature request is declined, it gets a real reason — not "we'll pass it to the team":

```
"We reviewed this request. We're not building this because:
 [one of: out of scope for Loop's mission / high complexity for low usage signal /
  conflicts with civic separation architecture / requires infrastructure we don't have]
 This case is closed. You can submit a new request if your needs change."
```

---

### 5. Public Status Dashboard Integration

**What it is:** Loop's live service health, surfaced inside the app — not just on status.rald.cloud.

**In-app integration points:**

**a) System status banner (auto-shown during incidents):**

```
┌─────────────────────────────────────────────────────────────┐
│ ⚠️  Loop rooms are experiencing delays                       │
│ Investigating since 14:32 WAT · View status.rald.cloud      │
│                                                [Dismiss]     │
└─────────────────────────────────────────────────────────────┘
```

Shown only when Loop's status service has an active incident. Fetched from `status.rald.cloud/api/status` (or KV-cached version). Dismissed per-session.

**b) Error screen service status:**

When a room fails to load or a network request fails, the error screen includes:

```
Unable to load room
[Retry]

Is this a broader issue?
● All Loop services operational
  (or)
⚠️ Loop rooms: degraded performance — Known issue
   Last updated: 5 minutes ago
```

**c) Scheduled maintenance awareness:**

Before a scheduled maintenance window, a notice appears in the app 24h before:

```
Loop will be unavailable for maintenance
Tomorrow, June 10 · 2:00 AM – 4:00 AM WAT
Planned upgrade to improve room stability.
```

**Status API integration:**

The Cloudflare Worker exposes a lightweight status check:

```typescript
// GET /api/status/loop
// Fetches from status.rald.cloud and caches in KV for 60s
type LoopStatus = {
  operational: boolean;
  has_active_incident: boolean;
  incident_summary: string | null;
  incident_url: string | null;
  next_maintenance: MaintenanceWindow | null;
  fetched_at: number;
};
```

---

### 6. Transparency Reports Module

**What it is:** Loop-specific transparency data, surfaced in the Trust Center and published semi-annually via trust.rald.cloud. Distinct from RALD-wide transparency — Loop publishes Loop-specific numbers.

**Data tracked for transparency reporting:**

| Category | Metric | Updated |
|---|---|---|
| Safety reports | Total received / actioned / dismissed | Quarterly |
| Civic false reports | Total / confirmed false / appealed | Quarterly |
| Accounts suspended | Count by strike type | Semi-annually |
| Accounts banned | Count, reason category | Semi-annually |
| Appeals filed | Total / upheld / overturned | Semi-annually |
| AI moderation actions | Count by type, all human-reviewed | Semi-annually |
| Law enforcement requests | Count, data disclosed count | Semi-annually |
| Civic room verifications | Total / verified / rejected | Quarterly |
| Bug reports | Total / resolved / response time | Quarterly |
| Feature requests | Total / shipped / declined | Quarterly |

**In-app transparency snapshot (in Trust Center):**

```
Loop at a glance — Last 30 days

Safety reports filed:          47
  → Actioned:                  31 (66%)
  → Dismissed (no violation):  12 (26%)
  → Under review:               4 (8%)

Average review time:           3.2 hours
Appeals upheld:                 2 of 8 filed

Civic false reports confirmed:  3
Accounts restricted:            8
Accounts suspended:             2
```

**Full transparency reports** are published on trust.rald.cloud/transparency with Loop-specific data appended to the RALD ecosystem report.

---

### 7. Moderation History Viewer

**What it is:** Every user can see a complete, plain-language history of every moderation action taken on their account — what happened, what rule was cited, who reviewed it, what the outcome was, and what they can do next.

**Entry point:** Trust Center → My Trust Profile → Strike History

**Moderation event card:**

```
┌─────────────────────────────────────────────────────────────┐
│ ⚠️  Warning — June 5, 2026                                  │
│                                                             │
│ What happened                                               │
│ You hosted a room making unverified claims about an         │
│ emergency incident. The room was closed.                    │
│                                                             │
│ Rule cited                                                  │
│ Civic Rule 2: Claims require source attribution.            │
│ [Read the full rule]                                        │
│                                                             │
│ How it was reviewed                                         │
│ Human review · Loop Civic Team                              │
│                                                             │
│ Outcome                                                     │
│ 1 warning issued. No hosting restriction.                   │
│ 2 more civic warnings within 90 days = 30-day hosting ban   │
│                                                             │
│ [Appeal this decision]                                      │
└─────────────────────────────────────────────────────────────┘
```

**What every moderation card must contain:**

1. **What happened** — plain language, specific to the incident (not "violated community guidelines")
2. **Rule cited** — the specific rule, with a link to read the full text
3. **How it was reviewed** — automated / human / escalated (named level, not individual reviewer)
4. **Outcome** — specific restriction or none
5. **Trajectory warning** — "X more [type] within [window] = [next consequence]"
6. **Appeal link** — always present, even for warnings

**Expired strikes:** Strikes that expire are not deleted — they are marked `expired` and remain visible in the history for the user's reference. This is their record, not ours.

**Zero-history state:**

```
┌───────────────────────────────────────┐
│ ✅ Clean record                        │
│ No moderation actions on your account │
│ Keep following our Community Rules    │
└───────────────────────────────────────┘
```

---

### 8. Verification Center

**What it is:** The in-app surface where users apply for and track their verification status across all 4 tiers. Distinct from the trust.rald.cloud/verification policy page — this is the live application and status tracker.

**Entry point:** Trust Center → Verification Status (also accessible from Profile → edit)

**Verification Tiers:**

| Tier | Badge | Requirements | Unlocks |
|------|-------|-------------|---------|
| Community | ✓ (grey) | Active for ≥ 30 days, ≥ 5 rooms hosted, no active strikes | Civic room creation, LGA promotion eligibility |
| Journalist | ✓ (blue) | Professional press card or media affiliation proof | Civic news rooms, Source attribution badge |
| Official | ✓ (blue shield) | Government or institutional email + ID | Civic official rooms, government-level promotion |
| Verified Creator | ✓ (green) | ≥ 100 cumulative unique listeners, ≥ 10 rooms | Creator profile page, promotion dashboard |

**Verification Application Flow:**

```
STEP 1: Select tier to apply for
STEP 2: Review requirements (checklist — green/red per criterion met)
STEP 3: Upload supporting documents (ID scan, press card, institution letter)
STEP 4: Confirm data handling consent
STEP 5: Submit

Status shown in real time:
  → Submitted (Jun 5 · 14:32 WAT)
  → Under review — estimated 3–5 business days
  → [Decision date]: Approved / Declined

If declined:
  Specific reason: "Your press card appears expired. Please resubmit with a
   current card or a letter on company letterhead."
  Reapply available: Yes, immediately with new documents.
```

**Verification data handling:**

```
Documents uploaded for verification are:
- Stored encrypted at rest (AES-256 in RALD Media / Cloudflare R2)
- Retained for 90 days after decision, then permanently deleted
- Never used for any purpose other than verifying the stated claim
- Never shared with third parties
- Reviewable only by Loop Trust Team (minimum 2-person review for government tier)
```

This data handling statement is shown inline in the application form — not buried in the privacy policy.

---

### 9. Privacy Dashboard

**What it is:** A live view of exactly what data Loop holds about the user, what it's used for, and controls to change or delete it. Not a policy page. Not a settings menu. A real-time data transparency surface.

**Entry point:** Trust Center → My Data (also linkable from trust.rald.cloud)

**Privacy Dashboard Sections:**

**a) What we have:**

```
Your Loop data
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Profile              [View] [Edit]
  Display name, bio, avatar, interests

Region               [View] [Edit]
  Lagos State, Ikeja LGA
  Used for: Regional feed, community auto-join
  Not shown on your public profile

Rooms hosted         [View]
  12 rooms · 847 total listener-minutes

Rooms attended       [View]
  47 rooms attended

Notifications        [Manage]
  Push: ON · In-app: ON · Email: OFF

Activity data        [View]
  Session dates and durations (no content logged)

Push token           [Revoke]
  Device: iPhone 15 · Registered Jun 1, 2026
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**b) What we do NOT have:**

```
Data Loop does not collect or hold:
  × Your contacts (we never request address book access)
  × Your location continuously (region set manually in profile)
  × Audio recordings of your rooms (no server-side recording in V1)
  × Your messages (end-to-end encrypted via Loop Messenger)
  × Any data from other apps on your device
```

This section is not marketing. It is a factual statement backed by the architecture. If the architecture changes (e.g., if audio recording is added in V2), this section must be updated before the feature ships.

**c) Controls:**

```
[Export my data]      → Download ZIP of all Loop data within 48 hours
[Delete my account]   → Permanent deletion (NDPR Art. 3.1(c) right to erasure)
[Opt out of AI]       → Disable all AI-assisted features (feed personalisation,
                         recommendation engine, content moderation AI)
[Contact privacy team] → privacy@rald.cloud
```

**d) Data retention summary:**

```
How long we keep your data:
  Profile data:        Until account deleted
  Room metadata:       2 years (then anonymised)
  Room audio:          Not recorded (V1)
  Notification logs:   90 days
  Safety reports:      3 years (legal requirement)
  Verification docs:   90 days after decision
  Bug reports:         1 year
  Session data:        90 days
```

---

### 10. How Loop Works — Knowledge Base

**What it is:** A structured, searchable in-app knowledge base that explains how Loop works — not legal text, not marketing, but honest product explanations that build user understanding and trust.

**Entry point:** Trust Center → How Loop Works. Also: contextual cards surfaced at relevant moments.

**Knowledge Base Sections:**

**a) How the feed works:**

```
Why do you see certain rooms?

Your home feed shows rooms from:
  1. Your LCDA (most local)
  2. Your LGA (if fewer than 3 local rooms)
  3. Your state (if fewer than 3 LGA rooms)
  4. Nigeria (if fewer than 3 state rooms)

Within each level, rooms are ranked by:
  • Momentum — how fast they're growing right now
  • Interest match — rooms tagged with your interests
  • Recency — newer rooms ranked higher

We don't use paid promotion. No room pays to be in your feed.
```

**b) How verification works:**

```
Why are some users verified?

Verification on Loop has 4 levels:
  Community (grey ✓) — active member who has hosted rooms
  Journalist (blue ✓) — verified press credentials
  Official (blue shield) — verified government/institution
  Verified Creator (green ✓) — established room host with a listener base

Verification confirms who someone claims to be.
It does not mean we endorse their views or content.
```

**c) How moderation works:**

```
How does Loop decide what to remove?

Content is flagged in two ways:
  1. User reports — members report concerning content
  2. Automated detection — our AI flags potential violations for human review

Every AI flag is reviewed by a human before action is taken.
We do not act on AI flags alone.

When content is reviewed:
  → Reviewer reads the full context (not just the flagged part)
  → Decision is logged: action taken + specific rule cited
  → Both the reporter and subject are notified of the outcome
  → Subject can appeal within 14 days
```

**d) How promotion works:**

```
How does a room become "Trending"?

Rooms earn promotion through verified traction — not payment, not platform preference.

The signals that matter:
  • How many people are listening
  • How long they stay (listener retention)
  • How many participate (raise hand, become speaker)
  • How many share the room

No room can pay to be promoted. The algorithm is the same for everyone.

Civic rooms have a separate system — they are promoted by urgency and verification,
not by audience size. A small but critical emergency room will always show above
a large entertainment room in the Civic tab.
```

**e) How Sekani (Loop AI) works:**

```
Does AI make decisions about my account?

Sekani assists our team in three ways:
  1. Feed personalisation — suggesting rooms that match your interests
  2. Content pre-screening — flagging potentially harmful content for human review
  3. Civic accuracy checks — verifying that civic claims have supporting sources

What Sekani does NOT do:
  × Make final moderation decisions
  × Access your private messages
  × Use your voice recordings to train AI models (without your consent)
  × Create content that appears to come from you

You can opt out of all AI features in your Privacy Dashboard.
```

---

## Trust Center Implementation Priority

| System | Priority | Dependencies | Effort |
|--------|----------|-------------|--------|
| Safety Reporting System | P0 | safety_reports table | 3 days |
| Moderation History Viewer | P0 | trust_strikes table | 2 days |
| Account Standing Widget | P0 | user_trust_records table | 1 day |
| Bug Reporting System | P1 | bug_reports table | 2 days |
| Verification Center | P1 | verification docs storage (R2) | 4 days |
| Privacy Dashboard | P1 | No new tables (reads existing) | 3 days |
| How Loop Works KB | P1 | Static content | 2 days |
| Trust Center Shell | P1 | All above sections | 2 days |
| Public Status Integration | P2 | status.rald.cloud API | 1 day |
| Transparency Reports Module | P2 | Aggregation queries | 2 days |
| Feature Request System | P2 | feature_requests table | 3 days |

**Total estimated build:** 25 engineering days for full Trust Center.

---

*CTO Office — LILCKY STUDIO LIMITED — 2026-06-07*
