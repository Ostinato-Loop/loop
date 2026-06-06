# Founder Acceptance Tests — RALD Ecosystem
**Generated:** 2026-06-06
**Authority:** CTO Office
**Standard:** A product cannot be marked "Ready" or "Shipped" without all acceptance tests in this document producing a PASS result with recorded evidence.

---

## How to Use This Document

For each test:
1. Execute the steps exactly as written
2. Record the actual result
3. Mark PASS or FAIL — no partial credit
4. Attach a screenshot or screen recording as evidence
5. A single FAIL in a product's core tests = product is NOT ready

---

## PRODUCT 1: Profiles (rald-auth-core + rald-auth-ui)

### AT-PRF-001: New User Registration
**Steps:**
1. Navigate to `https://auth.rald.cloud/sign-up`
2. Enter a valid email address and password
3. Submit the registration form
4. Check email inbox for verification link
5. Click the verification link
6. Confirm redirect to success state

**Expected:** User account created, email verified, session established
**Pass criteria:** User can log in with registered credentials within 60 seconds of verification

---

### AT-PRF-002: OTP Login
**Steps:**
1. Navigate to `https://auth.rald.cloud/sign-in`
2. Enter a valid phone number
3. Receive OTP SMS within 30 seconds
4. Enter OTP code
5. Confirm redirect to authenticated state

**Expected:** Session established, JWT issued, user redirected
**Pass criteria:** Login completes, valid session token present in cookies/storage

---

### AT-PRF-003: SSO to Loop
**Steps:**
1. From any RALD app login screen, click "Sign in with RALD"
2. Complete auth on `auth.rald.cloud`
3. Confirm redirect back to the originating app
4. Confirm user is authenticated in the originating app

**Expected:** SSO handoff completes, user identity available in app
**Pass criteria:** No re-authentication required, user profile data accessible

---

### AT-PRF-004: Password Reset
**Steps:**
1. Navigate to `https://auth.rald.cloud/forgot-password`
2. Enter registered email
3. Receive reset link within 60 seconds
4. Click link and set new password
5. Log in with new password

**Expected:** Password changed, old password no longer works
**Pass criteria:** Login with new password succeeds; login with old password fails

---

### AT-PRF-005: Role Assignment — Artist
**Steps:**
1. Log in as an admin user
2. Navigate to user management
3. Assign "Artist" role to a test user
4. Log in as the test user
5. Confirm JWT contains `role: "artist"`

**Expected:** Role reflected in JWT within one session refresh
**Pass criteria:** Test user's JWT `role` field = "artist"

---

## PRODUCT 2: App (rald — main RALD application)

### AT-APP-001: Landing Page Load
**Steps:**
1. Navigate to the main RALD app URL
2. Measure time to first meaningful paint

**Expected:** Page loads with brand content visible
**Pass criteria:** Page renders within 3 seconds on a standard connection

---

### AT-APP-002: Authenticated User Dashboard
**Steps:**
1. Log in with valid credentials
2. Confirm dashboard renders with user-specific content

**Expected:** User name, profile summary, and relevant navigation visible
**Pass criteria:** No generic/anonymous state shown to authenticated user

---

## PRODUCT 3: Learn

### AT-LRN-001: Product Existence Check
**Steps:**
1. Search Ostinato-Loop GitHub org for a "learn" or "rald-learn" repository
2. Navigate to the Learn product URL (if documented)

**Expected:** Product exists and is accessible
**Pass criteria:** FAILS — No Learn product found in any repository. No URL documented. **Product does not exist.**

---

## PRODUCT 4: Trust (rald-trust)

### AT-TRU-001: Trust Page Load
**Steps:**
1. Navigate to `https://trust.rald.cloud` (or documented URL)
2. Confirm page renders with RALD brand content

**Expected:** Trust policy pages load and are readable
**Pass criteria:** Page renders, content is accurate and complete

---

### AT-TRU-002: AI Usage Policy Accessible
**Steps:**
1. Navigate to AI Usage policy page
2. Confirm content is present and up to date

**Expected:** Policy text is complete, not placeholder
**Pass criteria:** Page contains actual policy text (not "coming soon" or lorem ipsum)

---

### AT-TRU-003: Interactive Features (if any)
**Steps:**
1. Attempt any interactive feature on the Trust site

**Expected:** Features work if present
**Pass criteria:** Currently FAILS — rald-trust is a static HTML site with no interactive features. No database. No API. Score reflects what was built.

---

## PRODUCT 5: Status (rald-status)

### AT-STA-001: Status Page Load
**Steps:**
1. Navigate to `https://status.rald.cloud` (or documented URL)
2. Confirm page renders with current system status

**Expected:** Live status indicators for all RALD services
**Pass criteria:** Page loads, at least one service status indicator is visible

---

### AT-STA-002: Status Reflects Reality
**Steps:**
1. Take one RALD service offline (test environment)
2. Refresh status page within 5 minutes

**Expected:** Status page shows the service as degraded or down
**Pass criteria:** FAILS until verified — rald-status is currently a static page. Status is not pulled from a live API.

---

### AT-STA-003: Incident Communication
**Steps:**
1. Create a test incident
2. Verify incident appears on status page

**Expected:** Incident visible to users
**Pass criteria:** FAILS — no incident management system integrated

---

## PRODUCT 6: Manilla (rald repo — Manilla product)

### AT-MAN-001: Artist Onboarding
**Steps:**
1. Log in as a new artist
2. Complete artist profile setup
3. Upload a track or release

**Expected:** Profile created, track uploaded, content visible
**Pass criteria:** All steps complete without errors

---

### AT-MAN-002: Label Management
**Steps:**
1. Log in as a label account
2. Access label management dashboard
3. Add an artist to the label roster

**Expected:** Artist-label relationship established
**Pass criteria:** Artist visible in label roster; label visible in artist profile

---

### AT-MAN-003: Contract Generation
**Steps:**
1. Navigate to Contracts section
2. Create a new contract for an artist
3. Download or view the contract

**Expected:** Contract generated with correct terms
**Pass criteria:** Contract rendered with real artist and label data

---

### AT-MAN-004: Fanlink Creation
**Steps:**
1. Navigate to Fanlink section
2. Create a new fanlink for a release
3. Access the fanlink URL

**Expected:** Fanlink resolves and shows release information
**Pass criteria:** CANNOT VERIFY — Fanlink route existence not confirmed in current audit

---

## PRODUCT 7: Loop (loop repo)

### AT-LOP-001: Feed Loads with Live Rooms
**Steps:**
1. Open Loop app
2. Observe the feed on the home screen

**Expected:** Live rooms appear in the feed within 3 seconds
**Pass criteria:** FAILS — Feed shows permanent empty state. ContentFeedEmpty renders unconditionally regardless of API response.

---

### AT-LOP-002: Category Filter Works
**Steps:**
1. On the feed, tap "Music" category chip
2. Observe that rooms visible change to music-related rooms

**Expected:** Feed updates to show only music rooms
**Pass criteria:** FAILS — Category chips have no onClick handler. Tapping does nothing. API is not re-called.

---

### AT-LOP-003: Join a Room and Hear Audio
**Steps:**
1. Tap a live room from the feed
2. Tap "Join Room"
3. Confirm audio from speakers is audible within 5 seconds

**Expected:** User can hear speakers in the room
**Pass criteria:** FAILS — No audio SDK integrated. Room is silent. This is a P0 blocker.

---

### AT-LOP-004: Host Controls
**Steps:**
1. Create a room as a host
2. Confirm host-only controls are visible (End Room, speaker queue, mute)
3. As a different user, join the room and confirm listener controls are shown (Raise Hand)

**Expected:** Host sees host controls; listener sees listener controls
**Pass criteria:** FAILS — Both host and listener see identical UI. Host controls do not exist.

---

### AT-LOP-005: Raise Hand Flow
**Steps:**
1. Join a room as a listener
2. Tap "Raise Hand"
3. Confirm the host sees the raised hand notification

**Expected:** Host notified; listener's hand is in queue
**Pass criteria:** FAILS — Raise Hand button has no onClick in room-launch.tsx. Tapping does nothing.

---

### AT-LOP-006: In-App Messaging
**Steps:**
1. Tap Messages tab
2. Send a message to another user

**Expected:** Message sent and received within the app
**Pass criteria:** FAILS — Messages tab redirects user OUTSIDE the app. No in-app messaging exists.

---

### AT-LOP-007: Onboarding Interests Used
**Steps:**
1. Complete onboarding, select "Jazz" and "Podcasts" as interests
2. Return to feed
3. Confirm feed shows Jazz and Podcast rooms

**Expected:** Feed personalized to selected interests
**Pass criteria:** FAILS — Interests stored in Supabase but never used in feed queries

---

## PRODUCT 8: Messenger (messenger repo)

### AT-MSG-001: Send a Direct Message
**Steps:**
1. Open Messenger
2. Start a conversation with another user
3. Send a text message
4. Confirm the other user receives it

**Expected:** Message delivered within 2 seconds
**Pass criteria:** Requires verification against live messenger deployment

---

### AT-MSG-002: Message History Persists
**Steps:**
1. Send messages in a conversation
2. Close and reopen the app
3. Confirm message history is visible

**Expected:** Previous messages visible on reopening
**Pass criteria:** Requires verification

---

### AT-MSG-003: Messenger Branding
**Steps:**
1. Open Messenger
2. Confirm RALD branding is visible (not Wizmac or third-party branding)

**Expected:** RALD / Loop brand shown
**Pass criteria:** WIZMAC.md file exists in messenger repo — Wizmac branding may be present. Needs verification.

---

## PRODUCT 9: Voice (loop-audio-ui-ux)

### AT-VOI-001: Voice Product Existence
**Steps:**
1. Navigate to Voice product URL
2. Confirm Voice is a functional product with a backend

**Expected:** Working voice communication product
**Pass criteria:** FAILS — loop-audio-ui-ux is a Lovable-generated UI mockup. No backend. No CI. No deployment pipeline. Not a product.

---

## PRODUCT 10: Mail (rald-mail-ui-ux)

### AT-MAI-001: Mail Product Existence
**Steps:**
1. Navigate to Mail product URL
2. Confirm Mail is a functional product with a backend

**Expected:** Working email or messaging product
**Pass criteria:** FAILS — rald-mail-ui-ux is a Lovable-generated UI mockup. No backend. No CI. No deployment pipeline. Not a product.

---

## PRODUCT 11: DunaRald (dunarald)

### AT-DUN-001: DunaRald Product Existence
**Steps:**
1. Navigate to DunaRald product URL
2. Confirm DunaRald is a functional product

**Expected:** Working product
**Pass criteria:** FAILS — dunarald repository contains only README.md and BRAND.md. 5 files total. No source code. Not a product.

---

## Acceptance Test Summary

| Product | Tests | Pass | Fail | Cannot Verify | Verdict |
|---|---|---|---|---|---|
| Profiles | 5 | 4* | 0 | 1* | ⚠️ Mostly ready |
| App | 2 | ? | ? | 2 | ❓ Not verified |
| Learn | 1 | 0 | 1 | 0 | 🔴 Does not exist |
| Trust | 3 | 1 | 2 | 0 | 🔴 Static only |
| Status | 3 | 1 | 2 | 0 | 🔴 Static only |
| Manilla | 4 | 2* | 0 | 2 | ⚠️ Partial |
| Loop | 7 | 0 | 7 | 0 | 🔴 Not shippable |
| Messenger | 3 | ? | ? | 3 | ❓ Not verified |
| Voice | 1 | 0 | 1 | 0 | 🔴 Does not exist |
| Mail | 1 | 0 | 1 | 0 | 🔴 Does not exist |
| DunaRald | 1 | 0 | 1 | 0 | 🔴 Does not exist |

*Based on prior audit evidence, not live test execution

**Products that PASS all verified tests:** None confirmed
**Products that FAIL at least one core test:** Loop (7/7 fail), Voice, Mail, DunaRald, Trust, Status, Learn

---

*These tests must be executed with a human or automated runner to produce verified PASS/FAIL evidence. Self-reported PASS without evidence is not accepted per RALD Verification Program rules.*
