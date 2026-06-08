# AUDIT/human-connection-audit.md
**Date:** 2026-06-08
**Sprint:** LOOP HUMAN CONNECTION SPRINT
**Auditor:** RALD CTO
**Framework:** Every screen scored against 5 connection questions.

---

## The 5 Questions

1. Does this help people **meet**?
2. Does this help people **talk**?
3. Does this help people **trust**?
4. Does this help people **belong**?
5. Does this help people **return**?

Score: 0 (No) / 1 (Partial) / 2 (Yes)

---

## Screen Audit

### Login (/login)
| Question | Score | Evidence |
|----------|-------|----------|
| Meet | 0 | It's a gate, not a meeting place |
| Talk | 0 | No interaction |
| Trust | 2 | RALD SSO with phone verification. 2-second interstitial explains the redirect. No unexpected domain hop. |
| Belong | 1 | "Loop uses RALD to verify your phone" — some identity context |
| Return | 0 | No return mechanism at login stage |
**Total: 3/10**
**Verdict:** Acceptable as a gate. Keep it fast. Do not add friction here.

---

### Onboarding (/onboarding)
| Question | Score | Evidence |
|----------|-------|----------|
| Meet | 1 | Final step shows recommended rooms — people to meet. But rooms are generic, not personalized. |
| Talk | 0 | No conversation happens during onboarding |
| Trust | 2 | Username + display name established. Language + interests captured. Trust score system explained in trust-center. |
| Belong | 2 | Interests selection (Football, Afrobeats, Politics…) — users declare community membership |
| Return | 1 | Interests saved to profile drive future feed personalization |
**Total: 6/10**
**Verdict:** Strong on identity formation. Weak on immediate connection payoff. The final "rooms" step should surface a room with someone already in it — not just any live room.
**Action:** In a future sprint, show "X people with your interests are in these rooms right now" at the rooms step.

---

### Feed (/feed) — POST-SPRINT
| Question | Score | Evidence |
|----------|-------|----------|
| Meet | 2 | RoomCard now shows host name + verified badge. "Adaeze · hosting" tells you WHO is speaking before you join. |
| Talk | 1 | Tapping a card joins a room. Chat + audio available inside. |
| Trust | 1 | Category and "Live" badge give context. Host verified badge visible. |
| Belong | 1 | "Picked for you" section matches user interests |
| Return | 1 | Interest-filtered feed gives users a reason to check back |
**Total: 6/10 (was 4/10 before sprint)**
**Key fix applied:** Host name now displayed on every room card.
**Remaining gap:** No social proof — "3 people you follow are in this room." This is the highest-leverage feed improvement for connection.

---

### Discover (/discover) — POST-SPRINT
| Question | Score | Evidence |
|----------|-------|----------|
| Meet | 2 | People tab: "People you may know" + search. Follow button (renamed from "Connect" to "Follow"). |
| Talk | 1 | Joining a room from Discover leads to conversation |
| Trust | 1 | Verified badges on person cards. Connection score shown. Report system in place. |
| Belong | 2 | Near me tab now shows honest regional logic: prompt to set region if unset, language-filtered rooms if set |
| Return | 1 | Following someone creates a relationship that surfaces in notifications |
**Total: 7/10 (was 5/10 before sprint)**
**Key fixes applied:** Near me tab is now honest (no fake regional filtering). "Connect" renamed to "Follow" — honest one-way relationship language.

---

### Room (/rooms/:id) — POST-BETA-SPRINT
| Question | Score | Evidence |
|----------|-------|----------|
| Meet | 2 | Participant tap sheet: name, region, trust, rooms hosted. You learn who you're talking with. |
| Talk | 2 | Audio (LiveKit), chat, emoji reactions — three modes of expression |
| Trust | 2 | Role badges (Host/Mod/Speaker). Trust level in participant sheet. Verified badge. |
| Belong | 2 | Live participant count. Audience grid. "Someone joined" / "Someone left" activity toasts. |
| Return | 1 | Share button creates word-of-mouth return. Room thread appears in Messages after leaving. |
**Total: 9/10**
**Best screen in the app.** Room is where Loop's mission lives.
**Remaining gap:** No "who else you follow is here" signal. No room topic/agenda pinned for context before speaking.

---

### Messages (/messages)
| Question | Score | Evidence |
|----------|-------|----------|
| Meet | 1 | Shows rooms you've been in. Clicking goes back into the room (if live). |
| Talk | 2 | Room threads show last message + real timestamp |
| Trust | 1 | Room context is preserved — you remember the conversation |
| Belong | 2 | "Your rooms" — a personal history of communities joined |
| Return | 2 | Real-time subscription updates unread counts |
**Total: 8/10**
**Verdict:** Strong. The "Direct" tab's honest empty state ("DMs coming soon") is correct — do not fake it.

---

### Notifications (/notifications) — POST-SPRINT
| Question | Score | Evidence |
|----------|-------|----------|
| Meet | 2 | "X is live now" — direct CTA to join a live room from someone you follow |
| Talk | 1 | "Join room" action → room audio/chat |
| Trust | 2 | New follower notifications with avatar + handle. Trust score nudges. |
| Belong | 1 | Profile completion nudges connect completeness to belonging |
| Return | 2 | Live room notifications are the strongest Day-2 return trigger in the app |
**Total: 8/10 (was 5/10 before sprint)**
**Key fixes applied:** "Someone you follow is live" notifications now surface live rooms from followed users. Avatar nudge no longer links externally.

---

### Profile / Me (/me)
| Question | Score | Evidence |
|----------|-------|----------|
| Meet | 1 | Follow counts visible. Edit profile leads to /settings. |
| Talk | 1 | Activity tab shows room threads |
| Trust | 2 | Trust score, level, progress bar, verified badge, creator star |
| Belong | 2 | Region displayed. Interests shown. Profile completion tracker. |
| Return | 1 | Follower count growth is a return signal |
**Total: 7/10**

---

## Summary Table

| Screen | Pre-Sprint | Post-Sprint | Delta |
|--------|-----------|-------------|-------|
| Login | 3/10 | 3/10 | — |
| Onboarding | 6/10 | 6/10 | — |
| Feed | 4/10 | 6/10 | +2 |
| Discover | 5/10 | 7/10 | +2 |
| Room | 9/10 | 9/10 | — (already high) |
| Messages | 8/10 | 8/10 | — |
| Notifications | 5/10 | 8/10 | +3 |
| Profile/Me | 7/10 | 7/10 | — |
| **App Average** | **5.9/10** | **6.75/10** | **+0.85** |

---

## Highest Remaining Connection Gaps (Next Sprint)

| Gap | Screen | Impact | Effort |
|----|--------|--------|--------|
| "3 people you follow are in this room" | Feed, Room | Very High | Medium |
| Room topic/agenda pinned at top | Room | High | Low |
| "People like you joined X rooms today" | Onboarding final step | High | Low |
| Push notifications SW | Notifications | Very High | Medium |
| Direct messages (1-to-1) | Messages | High | High |
