# Loop Trust & Connection Audit
**Date:** 2026-06-08  
**Auditor:** Zero-Illusion Audit Sprint  
**Scope:** Follow, trust, connection, and social graph features — what is real vs. claimed

---

## Social Graph Architecture (Actual)

The profiles table in Supabase contains:
- `id` (UUID — RALD UUID for SSO users, Supabase UUID for OTP users)
- `display_name`, `username`, `bio`, `avatar_url`, `interests`
- `state_id`, `is_verified`
- Standard timestamps

**What does NOT exist:**
- A `follows` or `followers` table in the current migration set
- A `connections` or `friends` table
- A `trust_scores` table
- Any relationship graph API endpoints in the worker

---

## Connection Feature Audit

### "Follow" System
| Aspect | Status | Evidence |
|---|---|---|
| Follow button in PersonCard | 🟡 UI exists | PersonCard renders a "Connect" button |
| Follow action | 🟡 UI-only | `toggleFollow()` from `useLoop()` (loop-store.ts) — local state only, no API call |
| Follower count | 🟡 Placeholder | Always 0 in `me-launch.tsx` (`followersList.length`) |
| Following count | 🟡 Placeholder | Always 0 (`followingList.length`) |
| Follow persistence | ❌ None | `useLoop()` store is in-memory — resets on page reload |
| Backend follow API | ❌ None | No `/api/follows` endpoint in worker |
| Follower notifications | ❌ None | No notification system |

**Truth:** The "Follow" concept is front-end only. No data persists. Two users cannot actually follow each other in any meaningful way. This is honest — the UI shows 0 followers/following rather than fake numbers.

### "Connect" System
| Aspect | Status | Evidence |
|---|---|---|
| Connect button | 🟡 UI exists | PersonCard has a "Connect" button |
| Connect action | ❌ No handler | Button renders but has no onClick beyond toggleFollow |
| Connection persistence | ❌ None | Same as follow — local state only |
| Connection API | ❌ None | No `/api/connections` endpoint |

**Truth:** "Connect" button does nothing server-side. It is an honest dead-end (no false confirmation shown).

### Trust Score
| Aspect | Status | Evidence |
|---|---|---|
| Trust score display | 🟡 Placeholder | `me-launch.tsx` shows "— / 100" |
| Trust calculation | ❌ None | No trust algorithm, no table, no API |
| "Verified contributor" badge | 🟡 Hardcoded | IdRow shows "Verified contributor" — not from user data |
| `is_verified` field | 🟡 Exists in DB | `profiles.is_verified` column exists; defaults false |
| Verification flow | ❌ None | No way to get verified in the product |

**Truth:** Trust score is cosmetic. The "— / 100" display is honest. "Verified contributor" label is hardcoded for all users — this is misleading and should be removed or made conditional on `profile.is_verified`.

---

## In-Room Connection

### Room Participant Awareness
| Aspect | Status | Evidence |
|---|---|---|
| See other participants | 🟢 ALIVE | Supabase Realtime `room_participants` table |
| Participant names | 🟢 ALIVE | Joined from profiles table |
| Speaker detection | 🟢 ALIVE | LiveKit `isSpeaking` event |
| Click participant → profile | 🟡 Partial | No navigation from room to user profile |

---

## Messaging
| Aspect | Status | Evidence |
|---|---|---|
| Room chat | 🟢 ALIVE | Supabase `messages` table + Realtime |
| Direct messages | 🟡 Placeholder | "Messaging coming soon" in Messages page |
| @ mentions | ❌ None | No mention parsing in chat |

---

## Required Actions for Human Connection

To make the connection system real (Sprint 2):

1. **Create `follows` table** in Supabase migration:
   ```sql
   CREATE TABLE follows (
     follower_id UUID REFERENCES profiles(id),
     followed_id UUID REFERENCES profiles(id),
     created_at TIMESTAMPTZ DEFAULT now(),
     PRIMARY KEY (follower_id, followed_id)
   );
   ```

2. **Add `/api/follows` endpoint** to worker:
   - `POST /api/follows { followed_id }` — create follow
   - `DELETE /api/follows/:followed_id` — unfollow
   - `GET /api/follows/counts?user_id=...` — follower/following counts

3. **Wire PersonCard "Connect" button** to call the API.

4. **Update `me-launch.tsx`** to fetch and display real counts.

5. **Remove hardcoded "Verified contributor"** — make conditional on `profile.is_verified`.

---

## Verdict

The trust and connection system is honestly incomplete — no fake numbers, no false connections. The UI placeholders (0 followers, "— / 100" trust) are zero-illusion compliant. The "Verified contributor" label is the only dishonest element and should be fixed immediately.

---
*Generated: 2026-06-08 | Sprint: Zero-Illusion Audit*
