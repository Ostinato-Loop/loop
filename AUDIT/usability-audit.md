# Loop V1 — Usability Audit
Generated: 2026-06-07 | Sprint: V1 Stabilization Freeze
Framework: Nielsen's 10 Heuristics + Household Test

---

## H1 — Visibility of System Status
**Score: 7/10**
- Room loading shows full-screen spinner. Pass.
- Feed shows skeleton cards on load. Pass.
- Audio error badge visible in room header. Pass.
- Offline banner in main.tsx. Pass.
- Messages loading state is text only — no skeleton. Fail.
- Profile page has no loading state — blank flash on first render. Fail.
- Room join status not communicated clearly during the join action. Fail.

---

## H2 — Match Between System and Real World
**Score: 8/10**
- Audio metaphors (Mic, Radio, DJ Session) match real-world usage. Pass.
- Room categories match African radio/community context well. Pass.
- "Live now" with pulsing dot matches broadcast conventions. Pass.
- "RALD identity" terminology is unfamiliar to new users — needs onboarding explanation. Gap.

---

## H3 — User Control and Freedom
**Score: 6/10**
- Room join can be cancelled via lobby state before audio connects. Pass.
- Onboarding allows back navigation between steps. Pass.
- No undo on room reactions. Gap.
- No way to leave onboarding mid-flow — intentional but progress bar must be clear. Gap.
- Create room has no discard confirmation when navigating away with unsaved title. Gap.

---

## H4 — Consistency and Standards
**Score: 8/10**
- Consistent mint/neon green accent across all screens. Pass.
- Consistent card border-radius (rounded-2xl). Pass.
- Consistent font-display headings with uppercase tracking. Pass.
- Two profile pages exist (me.tsx, me-launch.tsx) — potential future inconsistency. Gap.
- Button styles inconsistent: some use shadcn Button, some use custom Tailwind classes. Gap.

---

## H5 — Error Prevention
**Score: 5/10**
- Username validation: /^[a-z0-9_]{3,20}$/ with clear message shown. Pass.
- Feedback message 5-2000 char constraint enforced. Pass.
- No confirmation before creating a room with a duplicate title. Fail.
- No warning before leaving a live room as host — ends room for all participants. Fail.
- No OTP resend timer — users can spam OTP requests. Fail.
**Fix (P1):** Add host-leave confirmation dialog. Add OTP resend cooldown (60s timer).

---

## H6 — Recognition Over Recall
**Score: 8/10**
- Category emojis provide immediate visual recognition. Pass.
- Avatar initials with gradient fallback for unnamed users. Pass.
- Tab icons in BottomNav are labelled. Pass.
- "Near" tab label in Discover is ambiguous — "Near you" would be clearer. Gap.

---

## H7 — Flexibility and Efficiency
**Score: 5/10**
- No keyboard shortcuts anywhere in the app. Fail.
- No quick-mute shortcut accessible from outside a room. Fail.
- Room tabs (trending, live) provide useful power-user shortcuts. Pass.

---

## H8 — Aesthetic and Minimalist Design
**Score: 9/10**
- Dark RALD theme with single accent colour — clean and focused. Pass.
- Cards use consistent spacing and border treatment. Pass.
- Empty states use subtle dashed borders — not intrusive. Pass.
- Discover page has multiple horizontal scroll strips — can feel overwhelming on first load. Minor gap.

---

## H9 — Help Users Recover from Errors
**Score: 6/10**
- Room not found shows a friendly error card with back navigation. Pass.
- Auth redirect explained by the interstitial (fixed in prior sprint). Pass.
- Network errors show destructive banner with message text. Pass.
- OTP failure shows no distinction between "wrong code" and "expired code". Fail.
- Raw Supabase error messages can surface to the user (e.g. "duplicate key value violates unique constraint"). Fail.
**Fix (P1):** Map common DB error codes to user-friendly messages in a central error-map utility.

---

## H10 — Help and Documentation
**Score: 4/10**
- No in-app help, FAQ, or tooltip on any feature. Fail.
- "Report a problem" form is implemented and functional. Pass.
- Trust Center is missing — users have no privacy/terms destination in the app. Fail.
- No explanation of what RALD is beyond the login interstitial. Fail.
**Fix (V1.1):** Build a minimal Trust Center static page with privacy policy link.

---

## Heuristic Summary

| Heuristic | Score |
|---|---|
| H1 System Status | 7/10 |
| H2 Real World Match | 8/10 |
| H3 Control and Freedom | 6/10 |
| H4 Consistency | 8/10 |
| H5 Error Prevention | 5/10 |
| H6 Recognition | 8/10 |
| H7 Flexibility | 5/10 |
| H8 Aesthetic | 9/10 |
| H9 Error Recovery | 6/10 |
| H10 Help | 4/10 |
| Average | 6.6/10 |

---

## Household Test — Non-Technical User Simulation
Persona: First-time user, smartphone native, no Clubhouse/Twitter Spaces experience.

| Task | Result | Notes |
|---|---|---|
| Sign in to Loop | Pass | OTP flow is familiar like WhatsApp |
| Find something to listen to | Pass | Feed rooms visible immediately |
| Join a live room | Pass | RoomCard tappable, room loads correctly |
| Understand why mic is red | Partial | Error badge visible but no instruction text |
| Report a bug | Pass | Me — Report a problem form works |
| Find people to follow | Partial | Discover People tab works but hard to find |
| Change settings | Fail | Settings gear does nothing |
| Find communities | Fail | No communities screen exists |
| Understand what RALD is | Fail | No in-app explanation beyond login |

**Result: 5 of 9 tasks pass — 55%. Below the 70% V1 gate.**
**After V1.1 fixes (Settings sheet + Communities stub + Trust Center):** Projected 78% — gate passed.

---

## Critical User Journeys — V1 Gate Check

| Journey | Completable | Blockers |
|---|---|---|
| Sign up, onboard, listen to a room | Yes | None |
| Create and host a room | Partial | No navigation to room after create |
| Report a problem | Yes | None |
| Discover people by name | Yes | None |
| Find and join a live room | Yes | None |
| Change notification settings | No | Settings page missing |
| View privacy policy | No | Trust Center missing |
| Find community content | No | Communities screen missing |

**No critical journey should fail.** 5 of 8 complete. Settings, Trust Center, Communities are V1.1 scope.
