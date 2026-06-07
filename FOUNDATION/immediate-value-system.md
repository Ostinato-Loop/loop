# FOUNDATION/immediate-value-system.md
**Sprint:** V3 Frictionless Onboarding — Phase 3  
**Date:** 2026-06-07  
**Author:** CTO Office — LILCKY STUDIO LIMITED

---

## Mission

After interests + location: show people talking near the user. Immediately. Before auth.

---

## Screen: "People talking near you"

### Content Shown

```
🎤 Lagos Music Lovers — 82 listeners LIVE
🎤 Ikeja Tech Talk — 24 listeners
🎤 Nigerian Hip Hop — 156 listening
🎤 Lagos Football — 38 watching
🎤 Young Entrepreneurs LG — 18 listening
```

No empty screens. No "follow people" suggestions. No profile setup. No follow wall.

### API Used

```
GET /api/activation/first-room
  (no auth, CF geo headers)
```

Response cascade: LCDA → LGA → State → National

### Design Constraints

| Constraint | Implementation |
|-----------|---------------|
| No profile creation | Show rooms before auth |
| No follow suggestions | Rooms only at this step |
| No empty screen | Cascade guarantees results |
| Immediate value | < 3 API calls before showing rooms |

### Tap to Listen

User taps a room → guest mode (listen only, no account required in V2).

If user wants to speak or join community:
→ Auth prompt appears at that moment
→ Quick OTP or SSO

---

## Why This Converts

Traditional social onboarding shows profile forms → abandonment.
Loop shows conversations → engagement. The value is immediate and visceral:  
*"These people are talking about things I care about, right now."*

**Phase 3 — COMPLETE ✅**
