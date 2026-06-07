# Usability Audit — Loop V1
**Date:** 2026-06-07 | **Standard:** Nielsen's 10 Usability Heuristics applied to Loop V1

---

## H1: Visibility of System Status

**FAIL — Multiple violations**

| Issue | Location | Severity |
|---|---|---|
| Mic button shows green when audio is broken | room.tsx | P0 |
| No audio connecting/connected indicator | room.tsx | P1 |
| SSO redirect shows generic spinner | login.tsx | P1 |
| Search button looks interactive but does nothing | feed.tsx | P1 |
| Notification bell looks interactive but does nothing | feed.tsx | P1 |
| Token expiry — user not warned before session ends | global | P2 |
| No "OTP sending…" spinner during /api/auth/send-otp | — | P2 |

**Priority fix:** Room audio state must be truthfully visible. If audio is unavailable: mic disabled + "Audio unavailable" badge.

---

## H2: Match Between System and the Real World

**PARTIAL PASS**

- "Raise hand" terminology ✅ — universal audio room convention
- "Community" ✅ — clear
- "Region / LGA / LCDA" ⚠️ — LCDA is Nigeria-specific; not every Nigerian knows it
- "Civic" communities ⚠️ — unclear to household users
- "RALD" brand ❌ — unknown to first-time users. "Why is this 'RALD Profiles'? I thought it was Loop."

**Issue USA-001 [P2]:** The SSO redirect introduces "RALD" brand with no explanation. Loop users don't know what RALD is.
- Fix: Pre-redirect screen should say "Loop uses RALD for secure sign-in" — not just show a spinner.

---

## H3: User Control and Freedom

**FAIL — Multiple violations**

**Issue USA-002 [P1]:** During SSO redirect, user cannot cancel. They are taken to an external site with no way back to Loop (browser back takes them away from Loop).

**Issue USA-003 [P2]:** Onboarding has no "Back" button between steps. User cannot go back from "Interests" to "Display Name" to correct a mistake. Only "Next" exists.
- Fix: Add back navigation between onboarding steps.

**Issue USA-004 [P2]:** Onboarding has no "Skip" for optional steps. Interests is forced (minimum 3), but language and rooms should be skippable.
- Fix: Add "Skip for now" on rooms step at minimum.

**Issue USA-005 [P2]:** No way to edit profile after onboarding without contacting support (edit profile button inactive — FE-024).
- Fix: Wire edit profile.

---

## H4: Consistency and Standards

**PARTIAL PASS**

- All screens use AppShell + BottomNav ✅
- Card styles are consistent (rounded-2xl, border-border) ✅  
- Two profile page implementations (me.tsx vs me-launch.tsx) ❌

**Issue USA-006 [P2]:** Categories on the feed ("Africa", "Civic") don't match the Discover filter categories ("Community", "News", "Commentary"). Same app, different taxonomy.
- Fix: Align category naming across Feed and Discover.

---

## H5: Error Prevention

**FAIL**

**Issue USA-007 [P1]:** Room creation has no confirmation step. User may accidentally create a public room with a typo in the title — no preview or confirm dialog.
- Fix: Show title/category preview before creating, with confirm button.

**Issue USA-008 [P1]:** "Leave room" (End/Exit button) has no confirmation. Host can accidentally end the room for all participants.
- Fix: Add confirmation dialog for host: "End Room? This disconnects everyone."

**Issue USA-009 [P2]:** Onboarding username step accepts the username on Next without availability check. User may reach the final step only to fail when profile is saved to Supabase (duplicate username → 23505 error from Supabase).
- Fix: Add debounced username availability check (GET /profiles?username=eq.X&select=id) before advancing.

---

## H6: Recognition Rather than Recall

**PASS**

- Category icons + labels on Discover ✅
- Room card shows host avatar, title, listener count ✅
- Interest chips show labels ✅
- Bottom nav has labels ✅

---

## H7: Flexibility and Efficiency of Use

**PARTIAL**

- No keyboard shortcuts (expected on mobile)
- No "quick create" from home ✅ (FAB button exists)
- No recently joined rooms ❌

**Issue USA-010 [P3]:** No "Continue where I left off" — no recently joined rooms shown on feed or profile.

---

## H8: Aesthetic and Minimalist Design

**PASS** — RALD design system is clean, dark, neon accent. No visual clutter. ✅

**Issue USA-011 [P3]:** `me-launch.tsx` has duplicate stats block and theme toggle from loop-mock that are disconnected from real state. Adds UI noise.

---

## H9: Help Users Recognize, Diagnose, and Recover from Errors

**FAIL — Critical**

| Scenario | Current | Should Show |
|---|---|---|
| Audio fails | Mic shows green (false positive) | "Audio unavailable — check connection" |
| Supabase error on feed | Empty state (no diff from "no rooms") | "Couldn't load rooms — tap to retry" |
| Invalid room ID | Silent redirect to home | "Room not found — it may have ended" |
| Username taken | Generic 23505 error from Supabase | "This username is taken. Try another." |
| Onboarding interests < 3 | Button disabled, no message | "Select at least 3 interests (X/3)" |
| Network offline | No indication | "You're offline. Reconnecting…" |
| OTP not delivered | Unknown (external) | Retry after 60s with different carrier |

**Issue USA-012 [P0]:** Audio false positive is the most dangerous error: user believes they are broadcasting when they are not. This is worse than a visible error.

---

## H10: Help and Documentation

**FAIL**

- No help/FAQ section ❌
- No "How it works" onboarding tour ❌
- No tooltip on unfamiliar terms (LCDA, civic, etc.) ❌
- No bug report mechanism ❌

**Issue USA-013 [P1]:** No in-app help. A non-technical user who is confused has no recourse.
- Fix: Add "Help" or "?" link in profile → FAQ or contact form.

---

## Usability Score by Heuristic

| Heuristic | Score (0–10) | Key Issue |
|---|---|---|
| H1 Visibility of status | 2/10 | Audio false positive |
| H2 Real-world match | 6/10 | RALD brand confusion |
| H3 User control | 3/10 | SSO redirect, no onboarding back |
| H4 Consistency | 6/10 | Two profile pages, category mismatch |
| H5 Error prevention | 3/10 | No confirmations, no username check |
| H6 Recognition | 7/10 | Good icons and labels |
| H7 Efficiency | 5/10 | FAB exists, no shortcuts |
| H8 Minimalist design | 8/10 | Clean RALD system |
| H9 Error recovery | 2/10 | False positives, silent failures |
| H10 Help | 1/10 | Nothing |
| **Average** | **4.3/10** | |

