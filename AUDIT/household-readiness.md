# AUDIT: Household Readiness
**Phase 10 — Founder Household Test**
Loop V1 UX Dominance Sprint · LILCKY STUDIO LIMITED · 2026-06-07

---

## Test Setup

Simulate a Nigerian household: 2 adults, 3 teenagers. Same household. Same region (Lagos, Ikeja LGA). All discovering Loop for the first time.

---

## Simulation: 2 Users — Adult Couple

### User A — Emeka (35, Lagos, tech-savvy)

**Day 0:**
1. Opens Loop → RALD redirect → OTP → Back to Loop
2. Onboarding: picks username "emeka_o", selects English, picks Tech/Football/Music
3. Final onboarding step: 2 live rooms available ("Tech in Africa", "Afrobeats Friday")
4. Joins "Tech in Africa" → hears audio conversation
5. Returns to feed → sees "Tech in Africa" room he was in
6. Navigates to `/me` — sees "0 0 0" stats → confused, doubts his session saved
7. Checks notifications → no unread badge, navigates manually → sees "Set your region" nudge
8. Sets region in settings → navigates back to communities → sees Lagos Community

**Result:** Emeka had a successful session but was confused by the broken stats. He's likely to return for the tech room tomorrow.

**Friction score:** 6/10 (RALD redirect + broken stats + no bell badge)

---

### User B — Adaeze (33, Lagos, moderate tech)

**Day 0:**
1. Opens Loop → RALD redirect → unfamiliar domain → **closes app** (abandons)

**Result:** Adaeze never completes onboarding. The RALD redirect is unexplained and feels unsafe.

**Friction score:** 1/10 (hard abandon at login)

**Fix required:** Login page must explain RALD before redirecting. "Loop uses RALD — a trusted Nigerian identity service — to verify your phone number. You'll be back here in 30 seconds."

---

## Simulation: 5 Users — Extended Family

### Adding User C — Seun (17, Lagos, very tech-savvy)

**Day 0:**
1. Completes onboarding quickly — picks Afrobeats, Football, Comedy
2. No live rooms at the time → sees dead end at onboarding final step
3. Navigates to Discover → sees "Discussions coming soon" taking up half the screen
4. Switches to "People" tab → no RALD identity → dead empty state
5. **Confused:** "What am I supposed to do here?"

**Result:** Seun finds no initial action. High likelihood of leaving.

---

### User D — Grandma Ngozi (62, Igbo speaker)

**Day 0:**
1. Opens Loop → RALD redirect → abandons immediately
2. Even if she completes login: onboarding shows "Lowercase letters, numbers, underscores" — technical jargon
3. Language selection shows 8 options — she picks Igbo
4. Interests: "What moves you?" — picks Faith, Local news, Music

**Result:** Language selection works. But login and username steps are too technical.

**Fix required:** Simplified login explanation. Username step should say "Create your nickname" not "Pick your handle."

---

### User E — Tunde (15, Lagos, high social media literacy)

**Day 0:**
1. Completes onboarding — picks Football, Hip-hop, Comedy
2. Joins a room immediately (there's a football discussion live)
3. Returns to profile — sees 0/0/0 stats → posts a screenshot to friends mocking the bug
4. **Reputational risk:** Broken stats visible to a teenager with social reach

**Result:** Feature works (room join) but broken stats creates reputational risk.

---

## Simulation: 10 Users — Community Group

### Scenario: A church youth group (10 members, same LGA)

**Setup:** A youth leader invites 10 group members to try Loop. They all sign up on the same evening.

**What works:**
- Multiple users can join the same room simultaneously ✅ (LiveKit)
- Room shows "X listening" count increasing ✅
- Communities page shows regional communities ✅

**What breaks:**
- 5 of 10 abandon at RALD redirect (no explanation)
- Of the 5 who complete onboarding: 3 hit the dead end (no live rooms at 9pm)
- No "invite a friend" feature visible anywhere
- No "group room" concept — they'd need to find each other's rooms manually
- No household/group recognition — they each appear as strangers to each other

**Critical missing feature for household/group use:**
- Invite link: "Share this link to join me on Loop" → friend joins and lands in your room
- No direct link to a specific room visible from the room page

---

## Household Readiness Checklist

| Feature | Status | Priority |
|---------|--------|----------|
| Login explanation before RALD redirect | ❌ | P0 |
| Onboarding in non-English languages | ✅ (language select) — but UI still English | P1 |
| Username step simplified ("Create your nickname") | ❌ | P1 |
| Room shareable link (invite to specific room) | ❌ | P0 |
| Broken stats (0/0/0) | ❌ | P0 |
| "Invite a friend" feature anywhere in app | ❌ | P1 |
| Non-RALD users can still use People tab | ❌ | P1 |
| Events coming soon tab removed | ❌ | P1 |
| Regional content visible on Day 0 | Partial | P1 |
| Multiple household members see each other | ❌ (no social graph between household) | P2 |

---

## Would a Family Naturally Continue Using Loop?

**2-user household (tech-savvy couple):** Yes, with fixes — one of two has a successful first session. Retention depends on regional rooms being active.

**5-user household (mixed ages):** No. The 62-year-old and the moderate-tech adult both abandon at login. The teenager is confused by empty states.

**10-user community group:** No. Half abandon before onboarding completes. The other half hit dead empty states or broken features.

---

## Priority Fixes for Household Readiness

1. **Login page — explain RALD before redirect** (30-second window to explain, not just "Signing you in")
2. **Room share link** — copy/share link to any room so users can invite family directly
3. **Stats real data** — 0/0/0 is a credibility killer, especially with screenshots
4. **Onboarding final step alternatives** — never leave a new user with nothing to do
5. **People tab RALD gate** — add a CTA to set up RALD; don't leave it as a dead end
6. **Username step** — say "Create your nickname" not "Pick your handle"
