# Household Usability Audit — Loop Audio Platform
**Date:** 2026-06-07  
**Auditor:** Founder Reality Sprint  
**Test Persona:** Non-technical household member in Lagos, Nigeria  
**Device assumption:** Android mid-range (Tecno Spark, 4G), 200–500ms latency  
**Literacy:** Comfortable with WhatsApp. Has never used Clubhouse or Twitter Spaces.

---

## Who is the household tester?

> **Mama Chidi** (55, trader, Alimosho LGA, Lagos)  
> Uses WhatsApp daily. Sends voice notes. Has a Spotify account (daughter set it up).  
> Never heard of Clubhouse. Opened the Loop link from her son's WhatsApp message.  
> Expectation: "It looks like a radio app where people talk."

> **Chidi Jr.** (22, student, UNILAG)  
> Uses TikTok, Twitter Spaces, Instagram. Understands apps.  
> Will find friction but will push through if value is clear.

> **Uncle Emeka** (40, civil servant, Abuja)  
> Uses Facebook and YouTube. Follows politics heavily.  
> Opened Loop link from a WhatsApp forward: "Breaking: NASS discussion live on Loop"

---

## Test 1: Mama Chidi opens the app for the first time

### What she sees
A spinner and the text **"Connecting to RALD Profiles…"** — then she is taken to a **different website**.

### What she thinks
"This app sent me somewhere else. Is it a scam? Let me go back."

### What she does
Presses the back button. Closes the app.

### Time to abandon: **< 5 seconds**
### Abandonment reason: Unexplained redirect to unknown domain

**Verdict: FAIL ❌**  
A household user who doesn't know what RALD is will not trust a redirect to `profiles.rald.cloud` with no explanation.

**Fix required:**
- Either: Show an OTP screen directly in Loop (the worker supports it — `/api/auth/send-otp` is implemented)
- Or: Add copy before redirect: "Loop uses RALD for secure sign-in. You'll be taken to RALD to verify your phone number, then brought back."

---

## Test 2: Chidi Jr. creates an account

### What he does
1. Opens Loop. Sees redirect prompt. Understands it — "oh it's an SSO thing." ✅
2. Goes to profiles.rald.cloud. Enters phone number.
3. Receives SMS (assumed Termii delivers in ~10s). Enters OTP code.
4. Redirected back to Loop.
5. Onboarding screen: prompted to choose a username.

### Friction at Step 5 — Username
Chidi types: **`Chidi Jr`** → rejected (space not allowed by regex `/^[a-z0-9_]{3,20}$/`)  
Types: **`ChidiJr`** → rejected (uppercase)  
Types: **`chidijr`** → ✅ accepted  

No explanation shown for why first two attempts failed.

### Friction at Step 6 — Interests
Must select **at least 3**. Chidi selects 1 (Tech), 2 (Football) — hits Next.  
Button remains disabled. No error message. He taps again. Nothing.  
He eventually notices he needs 3 minimum — selects Music. Advances.

### Friction at Step 7 — Rooms recommended
Shows 6 rooms from DB. **If DB has zero live rooms (likely on Day 0): blank screen.**  
Chidi hits "Done" anyway — advances to home feed.

### Time to complete onboarding: **3–5 minutes**  
### Clicks: ~20  
**Verdict: PASS with major friction ⚠️**

---

## Test 3: Uncle Emeka tries to find the politics discussion

### What he does
1. Opens app (after SSO, assuming profiles.rald.cloud worked)
2. Sees home feed. Looks for NASS discussion.
3. Goes to Discover tab.
4. Sees category tabs: Community, News, Commentary, Radio, DJ Session, Education, Business
5. Taps "News" — filters to news rooms
6. Sees empty screen if no news rooms are live in DB

### The problem
**"Near me", "Trending", "Events"** tabs are either empty or "coming soon."  
There is no search bar. Uncle Emeka types nothing — there is no input.  
He scrolls through 0 results and gives up.

**If zero rooms exist in DB: Uncle Emeka sees Loop as an empty, broken app.**

### Verdict: FAIL ❌ (cold-start content problem)

---

## Test 4: Chidi Jr. tries to create a room about UNILAG admissions

### What he does
1. Taps the "+" create button (bottom nav)
2. Sees: Room, Discussion, Event, Post, Article
3. Discussion → "Discussion coming soon" — dead end
4. Taps "Room" — form appears ✅
5. Fills title: "UNILAG 2026 Admission — Ask Me Anything"
6. Picks category: Education
7. Picks visibility: Public
8. Taps "Create" / "Go Live"

### What happens
Room is created in Supabase. He is navigated to `/rooms/:id`.  
Room page loads. He sees himself as the host (Crown icon) ✅  
He taps the mic button. Mic icon turns green. He speaks.

**No one hears him.** The mic is showing as "on" but LiveKit is not connected because `/api/audio/token` returns 404.

He doesn't know this. He thinks people can hear him.

### Time: 2 minutes to create  
### Clicks: 8  
### Audio: ❌ Silent  
**Verdict: FAIL — Critically deceptive UX ❌**

The host believes they are live. They are not. This is worse than a hard error — it's a false positive.

---

## Test 5: Mama Chidi tries to listen to a room

### What she does (if she got through login — she didn't, so this is hypothetical)
1. Taps a room card: "Yoruba market prices — Alimosho"
2. Room page loads
3. Sees avatars of speakers
4. Hears **nothing**

### What she thinks
"The audio is not working. Network problem."  
She turns off WiFi. Turns it back on. Still nothing.  
She leaves.

### Verdict: FAIL — Core product is silent ❌

---

## Test 6: Chidi Jr. sends a chat message during a room

### What he does
1. Is inside a room
2. Types "When does the Q&A start?" in the chat input
3. Taps send
4. Message appears immediately ✅

### Verdict: PASS ✅  
In-room text chat works. This is the only interactive feature that works reliably.

---

## Test 7: Uncle Emeka encounters a bug and wants to report it

### What he does
App shows blank screen on Discover.  
He looks for "Report a problem" → nothing.  
Taps his profile → no feedback option.  
Long-presses → nothing.  
Shakes the phone → nothing.  
Closes the app.

### Verdict: FAIL — No feedback mechanism ❌

---

## Test 8: Mama Chidi opens the app again the next day

### What happens
She made it through login 2 days ago (token valid for 7 days).  
Opens app → spinner for 1–2 seconds → home feed loads ✅  
She sees the same empty state as yesterday.  
Closes app.

**Within the 7-day window: auto-login works.**  
**The experience after login is still broken (audio, empty discovery).**

---

## Household Usability Score by Feature

| Feature | Works for Household? | Why |
|---|---|---|
| Opening the app | ✅ | App loads |
| Understanding what the app is | ❌ | No value proposition on first screen |
| Creating an account | ❌ | Unexplained redirect; no OTP form in Loop |
| Username creation | ⚠️ | Regex rejects natural names silently |
| Onboarding completion | ⚠️ | 5 steps, hard 3-interest minimum, silent errors |
| Finding rooms to listen to | ⚠️ | Works if content seeded; empty otherwise |
| Filtering by category | ✅ | Category filter works |
| Searching for a specific topic | ❌ | No search |
| Creating a room | ⚠️ | UI works; audio broken |
| Listening to audio in a room | ❌ | No audio — LiveKit not connected |
| Speaking in a room | ❌ | No audio — mic shows active but silent |
| Sending a chat message | ✅ | Works reliably |
| Raising hand to speak | ✅ | UI sends hand-raise broadcast |
| Reacting with emojis | ✅ | Floating reactions work |
| Reporting a problem | ❌ | No mechanism |
| Returning the next day | ✅ | Within 7-day window |
| Re-logging in after token expires | ⚠️ | External redirect again |

### Score: 5/17 features work reliably for a non-technical household user

---

## Critical UX Bugs (beyond audio)

### Bug 1: Deceptive mic state
When LiveKit fails silently, the host's mic shows as green/active. They believe they are broadcasting. **This is the worst kind of failure** — a false positive. Fix: On LiveKit connection failure, mic should show as permanently disabled with an error toast: "Audio is unavailable — check your connection."

### Bug 2: Username validation silently rejects
No error text is shown when username fails the regex. Add: "Username can only contain letters (a–z), numbers (0–9), and underscores. No spaces or capitals."

### Bug 3: Interest minimum not explained
The "Next" button is disabled when fewer than 3 interests are selected, but no label says "select at least 3." Add a counter: "2/3 minimum selected."

### Bug 4: Empty Discover with no guidance
When no rooms exist, Discover shows empty state with component placeholder text. Add: "No rooms are live right now. Be the first to start one!" + Create button.

### Bug 5: Redirect UX on login
`profiles.rald.cloud` redirect has no pre-amble. Add a 2-second interstitial: "Taking you to RALD to verify your phone…" before redirect.

### Bug 6: Room creation with no sharing
After creating a room, there is no "Share this room" button. A room with zero listeners is not valuable. Add share sheet immediately after creation.

---

## Household Readiness Verdict

> **Loop is not ready for household testing.**  
> 
> The two things every household user will try first — **listening to a room** and **speaking** — produce silent failures with no error messages.
> 
> The app creates a false impression of working. This is more dangerous than being openly broken.
>
> The only reliably working features are: in-room text chat, emoji reactions, and returning within a 7-day session window.

### Minimum requirements before household test
1. ✅ `/api/audio/token` worker endpoint (LiveKit JWT generation)
2. ✅ LiveKit Cloud project provisioned (AWS Lagos PoP recommended)
3. ✅ Error state when audio fails (not silent)
4. ✅ Seed at least 5 real rooms in DB before test
5. ✅ Bug reporting button anywhere in the app
6. ✅ Username validation error messages
7. ✅ Interest minimum counter (2/3 minimum selected)

