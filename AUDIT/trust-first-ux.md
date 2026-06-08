# AUDIT/trust-first-ux.md
**Date:** 2026-06-08
**Sprint:** LOOP HUMAN CONNECTION SPRINT
**Auditor:** RALD CTO
**Principle:** Trust is not a feature. It is the precondition for every connection.

---

## Trust Architecture in Loop

Loop implements trust at 4 levels:

### Level 1 — Identity Verification
- **Phone OTP via Termii** — real phone number required
- **RALD SSO** — one verified identity across all RALD apps
- **Username namespace** — 3-20 chars, unique, alphanumeric+underscore
- **Display name** — human-readable, required

### Level 2 — Behavioural Trust Score
Computed from profile completeness signals (computeTrustScore in use-auth.ts):

| Signal | Points |
|--------|--------|
| Display name set | +10 |
| Avatar uploaded | +20 |
| Bio written | +15 |
| Region (country) set | +15 |
| State/LGA set | +10 |
| Interests selected | +10 |
| Language set | +10 |
| Onboarding completed | +10 |

**Trust Levels:** Member (0-19) → Active Member (20-39) → Contributor (40-59) → Verified Contributor (60-79) → Trusted Leader (80+)

### Level 3 — Role Trust in Rooms
| Role | Trust Signal |
|------|-------------|
| Host | Created and is responsible for the room |
| Moderator | Trusted by host to manage the room |
| Speaker | Invited to speak by host/moderator |
| Listener | Anonymous participant — lowest trust |

Role trust is visible via badges on speaker avatars in the room view.

### Level 4 — Social Trust Graph
- Follow relationships create a directed trust graph
- Followed users' rooms surface in notifications
- "People you may know" via mutual connection scoring
- Report system allows community-level moderation

---

## Trust UX Audit — Screen by Screen

### Login
- ✅ Explains WHY RALD is used (security, not convenience)
- ✅ "Your data is never shared with third parties" — explicit promise
- ✅ 2.2s interstitial before redirect — no surprise domain change
- ❌ No explanation of what phone number is used for after login
**Verdict:** Acceptable. Add phone use disclosure in future sprint.

### Onboarding
- ✅ Captures real identity signals (username, display name, language, interests)
- ✅ These directly populate the trust score
- ✅ Minimum 3 interests required — commitment signal
- ❌ Trust score never mentioned during onboarding — missed framing opportunity
- ❌ No explanation of how trust unlocks features
**Action:** Add "Your trust score starts at X after onboarding" to the interests step.

### Room — Trust Signals Visible to Participants
- ✅ Host badge on speaker avatar (Crown icon + amber badge in header)
- ✅ Verified badge (BadgeCheck blue) on speaker avatars
- ✅ Creator star (amber) on creator-tier speakers
- ✅ Trust level shown in participant tap sheet
- ✅ Role badge (Host/Mod/Speaker) in tap sheet
- ✅ Region shown in tap sheet — proximity = trust signal
- ❌ No way to see if a speaker is "new" vs "experienced" without tapping them
**Verdict:** Room trust signals are the best in the app.

### Profile / Me
- ✅ Trust score + level + progress bar prominently displayed
- ✅ "X pts to next level" shown
- ✅ Profile completion tracker with 8 specific actions
- ✅ Trust Center page exists (/trust-center)
- ❌ Trust score is computed client-side from profile fields — not verified server-side
**Security note:** Trust score must be validated server-side before granting elevated room roles.

### Discover — People Tab
- ✅ Verified badge on person cards
- ✅ Connection/mutual score shown
- ✅ Report user option via ⋮ menu
- ✅ Follow button is clear (follow = trust signal)
- ❌ No context on HOW the mutual score is computed — feels opaque

---

## Trust Anti-Patterns to Avoid

| Anti-Pattern | Why It Breaks Trust | Status |
|-------------|-------------------|--------|
| External redirect without explanation | Unexpected domain hop feels like phishing | ✅ Fixed (login interstitial) |
| "Edit profile" links to external URL | Breaks in-app trust, loses context | ✅ Fixed (now routes to /settings) |
| "Near me" shows all rooms | False regional relevance promise | ✅ Fixed (honest prompt when no region) |
| Avatar nudge links to external profiles.rald.cloud | Action goes outside the app | ✅ Fixed (now /settings) |
| "Connect" button for one-way follow | "Connect" implies mutual — dishonest for unidirectional follow | ✅ Fixed (now "Follow") |
| continue-on-error in CI | Code quality gate is decorative | ✅ Fixed (rald-realtime CI) |
| Missing secrets in deploy | Worker boots with broken auth | ✅ Fixed (rald-auth-core deploy) |

---

## Trust Score Formula Recommendation

The current formula (computed client-side from profile fields) should be augmented with:

| Signal | Suggested Points |
|--------|-----------------|
| Active in ≥1 room (has room_participants row) | +15 |
| Hosted ≥1 room | +20 |
| Has ≥5 followers | +15 |
| Account age > 7 days | +10 |
| No reports filed against user | +10 |

These signals require server-side computation. Recommend adding a `trust_score` column to the profiles table computed via a Supabase trigger or scheduled function.

---

## Verdict

Loop's trust architecture is the right foundation. Phone verification + regional identity + behavioural scoring creates a trust system that is genuinely differentiated from anonymous platforms. The open question is whether trust is FELT by users during the connection experience — not just computed invisibly.

**Trust must be visible at the moment of connection — before a user speaks or follows, not after.**
