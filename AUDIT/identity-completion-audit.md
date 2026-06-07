# Loop Identity Completion Audit
**Sprint:** Loop User Reality Sprint — Parts 1, 3, 4  
**Date:** 2026-06-07

## Profile Type Fields

| Field | Source | In Profile Type | In /api/auth/me |
|-------|--------|-----------------|-----------------|
| id | profiles | ✅ | ✅ |
| username | profiles | ✅ | ✅ |
| display_name | profiles | ✅ | ✅ |
| avatar_url | profiles | ✅ | ✅ |
| bio | profiles | ✅ | ✅ |
| language | profiles | ✅ | ✅ |
| interests | profiles | ✅ | ✅ |
| state_id | profiles | ✅ | ✅ |
| is_creator | profiles | ✅ | ✅ |
| is_verified | profiles | ✅ | ✅ |
| onboarded | profiles | ✅ | ✅ |
| country | profiles (006) | ✅ ADDED | ✅ (select=*) |
| lga_id | profiles (006) | ✅ ADDED | ✅ (select=*) |
| lcda_id | profiles (006) | ✅ ADDED | ✅ (select=*) |
| trust_score | computed client-side | ✅ ADDED | computed |
| trust_level | computed client-side | ✅ ADDED | computed |

## Profile Completion Tracking (me-launch.tsx)

| Item | Done Condition | CTA if Incomplete |
|------|---------------|-------------------|
| Display name | profile.display_name set | — |
| Handle | profile.username set | — |
| Region | profile.country set | /settings (Region) |
| Profile photo | profile.avatar_url set | profiles.rald.cloud |
| Bio | profile.bio set | /settings (Profile) |
| Interests (3+) | interests.length >= 3 | — |
| Join first room | Always false (Sprint 2) | /discover |
| Join first community | Always false (Sprint 2) | /discover |

## RALD Identity Card Fields

| Field | Before Sprint | After Sprint |
|-------|--------------|--------------|
| RALD ID | rald_12345678… (truncated) | RALD-XXXX-XXXX |
| Mail | handle@rald.me | handle@rald.me |
| Member since | Not shown | Displayed |
| Verification | Not shown | Verified/Unverified + badge |
| Trust Score | — / 100 | Live computed score |
| Region | — | Live data or "Not set" CTA |
| Account status | Not shown | Active + green badge |

## Regional Identity Grid (me-launch.tsx)

When profile.country is set, a 2-column grid shows:
- Country
- State (human-readable, capitalized)
- LGA (human-readable, capitalized)
- LCDA (human-readable, capitalized)

When not set: RALD Identity card shows "Not set — Add region →" link to /settings.
