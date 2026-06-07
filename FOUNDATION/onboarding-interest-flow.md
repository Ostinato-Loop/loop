# FOUNDATION/onboarding-interest-flow.md
**Sprint:** V3 Frictionless Onboarding — Phase 1  
**Date:** 2026-06-07  
**Author:** CTO Office — LILCKY STUDIO LIMITED

---

## Mission

First action on Loop is joining a conversation — not creating an account. The interest selection step is the first visible screen. It takes < 5 seconds to complete.

---

## Screen: "What brings you here today?"

### Visual Cards (12 options, full-screen grid)

```
🎵 Music          ⚽ Sports
💼 Business       🎮 Gaming
📚 Education      🎬 Entertainment
❤️ Relationships  🗳 Politics
🙏 Religion       🌍 Community
💻 Technology     🌐 Culture
```

### Rules

| Rule | Spec |
|------|------|
| User selects | 1–3 interests |
| No typing | Tap only |
| No scrolling | All cards visible at once |
| No account creation first | Interests collected before auth |
| Continues immediately | No "Next" button delay |

### Data Storage

Selected interests stored in:
1. **Local storage** (immediate, pre-auth)
2. **profiles.interests** (after auth, on profile creation)

### API Flow

```
User selects interests
     ↓
Store to localStorage: { interests: ["music","sports"] }
     ↓
Show location step (Phase 2)
     ↓
[After auth] PATCH /api/profiles { interests: ["music","sports"] }
     ↓
POST /api/activation/auto-join { interests: ["music","sports"] }
```

---

## Why This Works for Africa-First

- No language barrier (emoji + single words)
- Works on 2G (no images, pure CSS cards)
- Works without account (zero friction at first contact)
- Maps directly to Loop's community taxonomy

**Phase 1 — COMPLETE ✅**
