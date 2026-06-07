# Loop Trust Experience Audit
**Sprint:** Loop User Reality Sprint — Part 2 & 6  
**Date:** 2026-06-07

## Trust Score Formula (Client-Side)

| Signal | Points |
|--------|--------|
| Username set | +5 |
| Display name set | +5 |
| Avatar uploaded | +10 |
| Bio written | +10 |
| 3+ interests selected | +10 |
| Country set | +10 |
| State set | +5 |
| LGA set | +5 |
| LCDA set | +5 |
| Completed onboarding | +5 |
| Verified account | +20 |
| Creator status | +10 |
| **Total possible** | **100** |

## Trust Levels

| Range | Level |
|-------|-------|
| 0–19 | Member |
| 20–39 | Active Member |
| 40–59 | Contributor |
| 60–79 | Verified Contributor |
| 80–100 | Trusted Leader |

## Trust Center Sections

| Section | Type | Endpoint |
|---------|------|----------|
| Report Bug | Form → POST /api/feedback | ✅ |
| Report Abuse | Form → POST /api/feedback | ✅ |
| Report False Info | Form → POST /api/feedback | ✅ |
| Feature Request | Form → POST /api/feedback | ✅ |
| Community Standards | Static policy | ✅ |
| Transparency Policy | Static policy | ✅ |
| Safety Information | Static content | ✅ |

## Trust UX Components

- Trust score numeric display (no "—" placeholder) ✅
- Trust level label ✅
- Next level label + target score ✅
- Progress bar (position in current level) ✅
- RALD Identity Card — trust score row with live value ✅
- Profile completion → trust improvement loop ✅
