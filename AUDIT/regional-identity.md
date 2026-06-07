# AUDIT: Regional Identity Experience
**Phase 7 — Regional Identity Experience**
Loop V1 UX Dominance Sprint · LILCKY STUDIO LIMITED · 2026-06-07

---

## Loop's Competitive Advantage

Loop is not Twitter. Loop is not Clubhouse. Loop is **African regional audio** — where your country, state, LGA, and LCDA matter. This is the product's core differentiator and must be present everywhere relevant.

---

## Current Regional Data in Profile Schema

Fields available on `profile`:
- `country` — e.g., "Nigeria"
- `state_id` — e.g., "lagos"
- `lga_id` — e.g., "ikeja"
- `lcda_id` — e.g., "onigbongbo" (where available)

The `regionString()` function in `communities.tsx` correctly assembles these:
```
Nigeria · Lagos · Ikeja
```

---

## Where Region Currently Appears

| Screen | Regional Data Shown | Quality |
|--------|---------------------|---------|
| Communities header | "Nigeria · Lagos State · Ikeja" via MapPin | ✅ Good |
| Discover "Near me" tab | "Near [state_id]" in section header | ⚠️ State only, no country/LGA |
| Notifications | Nudge to set region if not set | ✅ Good |
| Profile (`/me`) | **Nowhere** | ❌ Missing |
| Feed (`/`) | **Nowhere** | ❌ Missing |
| Discover header | **Nowhere** | ❌ Missing |
| Room cards | **Nowhere** | ❌ Missing |
| Trust Center | Mentioned in transparency text | ❌ Static text only |

---

## Where Region MUST Appear

### 1. Profile — Under Username (HIGHEST PRIORITY)

```
Emeka O.  ✓
@emeka_o
📍 Lagos, Lagos State, Nigeria
```

If region not set:
```
📍 Set your region → 
```
Links to `/settings`. Shown in muted text with a call-to-action.

---

### 2. Feed Header — Regional Context

The feed header currently shows only the Loop logo and Search/Bell buttons. Add a subtle regional indicator:

```
[Loop logo]  Loop          🔍 🔔
📍 Lagos, Nigeria  · Live now
```

This tells the user: "This feed is tuned for your area."

---

### 3. Discover — Region Filter Chip

Add "Your area" as a pinned first chip in the category row:

```
[ Your area 📍 ] [ All ] [ Community ] [ News ] [ Commentary ] ...
```

When "Your area" is active: filter rooms to user's state/country first.

---

### 4. Room Cards — Regional Tag

Room cards should show regional context when the room is regionally anchored:

```
[ LIVE ] [ Community ] Lagos, Nigeria
The future of tech in West Africa
142 listening
```

Regional tag appears below the category badge when `room.region_id` is set.

---

### 5. Notifications — Regional Activity

Regional notifications should be a first-class category:

```
🏘️ Community activity near Lagos
3 new rooms started in your area this morning
[ See nearby rooms → ]
```

---

### 6. Communities — Region Labels on Cards

Community cards in `/communities` already use `region_id`. Surface this explicitly:

```
[Globe icon] Lagos Tech Community
             📍 Lagos State, Nigeria
             1,234 members · 3 rooms
```

---

### 7. Onboarding — Missing Regional Step

**Critical:** Onboarding has no regional setup step. This is Loop's core feature.

Add step between "Interests" and "Rooms":

**Step 4.5 — Where are you from?**
```
Set your region

Your country, state, and LGA help us surface nearby rooms, 
communities, and people you might know.

[Country selector: Nigeria / Kenya / Ghana / ...]
[State selector: Lagos / Abuja / ...]
[LGA selector: Ikeja / Victoria Island / ...]

Your location is not shared publicly.
Only your country is shown on your profile.

[ Continue ]   [ Skip for now ]
```

---

### 8. Trust Center — Regional Trust Levels

The trust system should acknowledge regional contribution:

"You are a Verified Voice in Lagos State" — not just generically.

Regional trust markers:
- **Local Voice**: Hosted a room in your LGA
- **State Contributor**: Active in your state community
- **Regional Pillar**: Trusted across multiple states

---

## Regional Data Completeness — Current Stats

Based on notification nudges: `!profile.country` triggers a "Set your region" nudge. This means a significant portion of users have not set their region.

**Why this happens:** Onboarding does not ask for region. Region setup is buried in `/settings`.

**Fix:** Add regional setup to onboarding (Phase 4.5 above). This is the single highest-impact change for Loop's differentiation.

---

## Regional Identity Checklist

- [ ] Region shown on profile under username
- [ ] Region shown in feed header (subtle, not intrusive)
- [ ] "Your area" chip in Discover category row
- [ ] Room cards show region tag (when region_id set)
- [ ] Regional notifications category
- [ ] Community cards show region label
- [ ] Regional step added to onboarding
- [ ] Trust levels include regional context
- [ ] Settings allows editing country, state, LGA, LCDA
- [ ] "Not set" region is always paired with a clear CTA to set it

---

## Message to User

The regional identity system should make every user feel:

> "This platform knows I'm from Lagos. It's not built for London or New York — it's built for me."

No other audio platform does this. It is Loop's reason for existing. Every screen is an opportunity to reinforce it.
