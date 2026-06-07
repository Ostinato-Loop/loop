# FOUNDATION/creator-onboarding-v1.md
**Sprint:** V3 Frictionless Onboarding — Phase 5  
**Date:** 2026-06-07  
**Author:** CTO Office — LILCKY STUDIO LIMITED

---

## Trigger

Creator onboarding fires ONLY when user taps **"Start Room"** for the first time.

Never shown during general onboarding.

---

## Screen: "What kind of creator are you?"

### Options (visual cards)

```
🎤 Musician          🎧 DJ
🎙 Podcaster         🎭 Comedian
📰 Journalist        🏛 Community Leader
🏢 Business          🧠 Educator
```

### Rules

- User selects 1 type only
- No "skip" option (required to start a room)
- Immediately after selection: ask for Display Name + Photo
- Bio is optional and collected later

### Minimal Profile Capture

After type selection:
```
1. Display Name  (text field, required)
2. Profile Photo (image upload, optional — can add later)
3. [No bio, no links, no other fields]
```

### Creator Type → Community Mapping

| Creator Type | Community Type | Badge Awarded |
|-------------|----------------|---------------|
| Musician | creator_artist | artist |
| DJ | creator_dj | dj |
| Podcaster | creator_podcaster | host |
| Comedian | creator_artist | artist |
| Journalist | creator_radio | reporter |
| Community Leader | regional_* | volunteer |
| Business | interest | host |
| Educator | interest | host |

### API Flow

```
User selects "DJ"
     ↓
PATCH /api/profiles {
  creator_type: "dj",
  is_creator: true,
  display_name: "DJ Kolade",
  avatar_url: "..."
}
     ↓
POST /api/rooms { title, category: "dj-session", community_id }
```

**Phase 5 — COMPLETE ✅**
