# Loop User Readiness Report
**Date:** 2026-06-07  
**Target:** 100 real users in the next 7 days

---

## User Journey: New User Onboarding

1. User opens Loop → Login page with RALD SSO
2. Phone number entry → OTP → RALD JWT issued
3. Onboarding (5 steps): username → display name → language → interests → first room
4. Feed page — regional home feed via /api/activation/home-feed
5. Profile (/me) shows trust score, RALD identity, completion meter

**Journey status: COMPLETE** ✅

---

## User Journey: Returning User

1. Opens Loop → silent session check (/api/auth/silent)
2. If valid session → Feed (with home feed content)
3. Taps "You" → profile with real trust score, regional identity
4. Taps Settings → full settings (profile, region, notifications, privacy, appearance, account)
5. Taps Trust Center → can report issues, read policies

**Journey status: COMPLETE** ✅

---

## User Journey: Room Participation

1. Feed → live room card → tap → /rooms/:id
2. Room page with audience count, host, topic
3. Raise hand → request to speak
4. Leave room → return to feed

**Journey status: COMPLETE** ✅

---

## User Journey: Reporting a Problem

1. Profile → Report a problem (or /trust-center)
2. Choose: bug / abuse / false info / feature request
3. Fill form → Submit
4. POST /api/feedback → saved to Supabase feedback table
5. Confirmation screen: "Received — thank you"

**Journey status: COMPLETE** ✅

---

## Mobile UX Audit

All screens audited for 375px viewport (iPhone SE / entry-level Android):

| Screen | Overflow | Touch targets | Safe areas |
|--------|----------|--------------|------------|
| Feed | OK | OK | OK (pb-[env(safe-area-inset-bottom)]) |
| Me / Profile | OK | OK | OK |
| Settings | OK | OK | OK |
| Trust Center | OK | OK | OK |
| Onboarding | OK | OK | OK |
| Room | OK | OK | OK |

No clipped content, no horizontal scroll, all touch targets ≥ 44px. ✅

---

## Founder Dashboard Access

- Supabase: Dashboard → project `onxdcikfttdmnhofsuwo` → profiles, rooms, feedback tables
- Cloudflare: Worker analytics → API request volume per route
- Key metrics to track:
  - Daily active users (profiles.last_seen)
  - Rooms created per day
  - Average trust score
  - Onboarding completion rate
  - Feedback / bug reports

---

## Go-Live Checklist

- [x] RALD SSO login works (OTP + JWT)
- [x] Onboarding completes and sets profile.onboarded = true
- [x] Feed shows home feed content
- [x] Profile shows real identity (no "—" placeholders)
- [x] Settings save to Supabase
- [x] Trust Center forms submit to /api/feedback
- [x] No black screen / crash on load
- [x] All navigation items work
- [x] No dead links or "coming soon" in core flows
- [ ] Seed initial rooms for new users (Sprint 2)
- [ ] Seed initial community for each RALD region (Sprint 2)
