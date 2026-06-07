# FOUNDATION/community-permissions-matrix.md
**Sprint:** V2 Community Infrastructure — Phase 3  
**Date:** 2026-06-07  
**Author:** CTO Office — LILCKY STUDIO LIMITED  
**Scope:** Community membership permission model — roles, capabilities, enforcement

---

## Overview

Communities have a three-tier role hierarchy:
```
Owner > Admin/Moderator > Member
```

Role membership is stored in `community_members.role`.  
Granular moderator permissions are stored in `community_moderators.permissions` (JSONB).

---

## Role Definitions

| Role | Stored In | Description |
|------|-----------|-------------|
| `owner` | community_members.role | Community creator. Full control. Cannot be removed. Cannot leave without transferring ownership. |
| `admin` | community_members.role | Legacy elevated role (from V1 base schema). Treated as owner-level for edits and member management. |
| `moderator` | community_moderators.is_active=true | Appointed by owner. Specific permissions granted per-moderator via JSONB. |
| `member` | community_members.role | Standard member. Can join, leave, create rooms. |
| `banned` | community_members.role | Muted/banned. Cannot join rooms or participate. Excluded from member_count. |

---

## Capability Matrix

| Capability | owner | admin | moderator | member | banned |
|-----------|-------|-------|-----------|--------|--------|
| **Community settings** | | | | | |
| Edit name, description, cover | ✅ | ✅ | ❌ | ❌ | ❌ |
| Change visibility | ✅ | ✅ | ❌ | ❌ | ❌ |
| Change category | ✅ | ✅ | ❌ | ❌ | ❌ |
| Update interest_tags | ✅ | ✅ | ❌ | ❌ | ❌ |
| Delete community | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Membership management** | | | | | |
| View members list | ✅ | ✅ | ✅ | ✅ | ❌ |
| Remove member (non-admin) | ✅ | ✅ | 🔑 can_remove_members | ❌ | ❌ |
| Remove admin | ✅ | ❌ | ❌ | ❌ | ❌ |
| Ban member | ✅ | ✅ | 🔑 can_ban_members | ❌ | ❌ |
| Mute member | ✅ | ✅ | 🔑 can_mute_members | ❌ | ❌ |
| Join community | ✅ | ✅ | ✅ | ✅ | ❌ |
| Leave community | ❌* | ✅ | ✅ | ✅ | — |
| **Moderation** | | | | | |
| Appoint moderator | ✅ | ❌ | ❌ | ❌ | ❌ |
| Remove moderator | ✅ | ❌ | ❌ | ❌ | ❌ |
| Pin announcements | ✅ | ✅ | 🔑 can_pin_announcements | ❌ | ❌ |
| Approve rooms | ✅ | ✅ | 🔑 can_approve_rooms | ❌ | ❌ |
| Remove rooms | ✅ | ✅ | 🔑 can_remove_rooms | ❌ | ❌ |
| **Rules** | | | | | |
| View rules | ✅ | ✅ | ✅ | ✅ | ✅ |
| Create/edit rules | ✅ | ✅ | 🔑 can_edit_rules | ❌ | ❌ |
| Delete rules | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Rooms** | | | | | |
| View community rooms | ✅ | ✅ | ✅ | ✅ | ❌ |
| Create room in community | ✅ | ✅ | ✅ | ✅ | ❌ |
| Manage events | ✅ | ✅ | 🔑 can_manage_events | ❌ | ❌ |

`*` Owner cannot leave — must transfer ownership or delete the community.  
`🔑` = requires specific JSONB permission key to be `true`.

---

## Moderator Permission Keys

All keys default to `false` on appointment. Owner selects which to grant.

| Key | Description | Typical Use |
|-----|-------------|-------------|
| `can_remove_members` | Remove non-admin members | Content moderation |
| `can_mute_members` | Mute/temp-ban members | Behaviour management |
| `can_pin_announcements` | Pin community announcements | Information management |
| `can_approve_rooms` | Approve rooms before they go live | Room quality control |
| `can_remove_rooms` | Remove a room from community | Room moderation |
| `can_ban_members` | Hard-ban members | Safety enforcement |
| `can_edit_rules` | Create and edit community rules | Rules management |
| `can_manage_events` | Create, edit, cancel events | Events coordination |

---

## Permission Enforcement Points

### CF Worker (runtime enforcement)

All permission checks happen in the CF Worker **before** any Supabase write:

| Endpoint | Check |
|----------|-------|
| PATCH /api/communities/:id | role IN ('owner','admin') |
| DELETE /api/communities/:id | role = 'owner' |
| DELETE /api/communities/:id/members/:userId | role IN ('owner','admin') OR moderator.can_remove_members |
| POST /api/communities/:id/moderators | role = 'owner' |
| DELETE /api/communities/:id/moderators/:userId | role = 'owner' |
| POST /api/communities/:id/rules | role IN ('owner','admin') OR moderator.can_edit_rules |
| POST /api/communities/:id/rooms | membership EXISTS (any role except banned) |

### Supabase RLS (database enforcement)

RLS provides a second enforcement layer for direct API access:

| Table | Policy |
|-------|--------|
| communities | SELECT: public OR owner OR member |
| communities | INSERT: auth.uid() = owner_id |
| communities | UPDATE: owner OR admin |
| communities | DELETE: owner only |
| community_members | SELECT: self OR public community |
| community_members | INSERT: user_id = auth.uid() |
| community_members | DELETE: self OR owner |
| community_moderators | SELECT: active + public community |
| community_rules | SELECT: public community |

> Note: CF Worker uses `service_role` key which bypasses RLS. The Worker performs all permission checks before calling Supabase.

---

## Moderator Lifecycle

```
Member → Appointed by Owner → Moderator (is_active=true)
Moderator → Revoked by Owner → (is_active=false, revoked_at=timestamp)
Moderator (revoked) → Re-appointed → (is_active=true, revoked_at=null)
```

- Moderator rows are soft-revoked (never deleted) for audit trail
- Re-appointment upserts the existing row (merge-duplicates)
- Promoted moderators remain in `community_members` with role='member'
- Moderator status is checked via `community_moderators` join (not role column)

---

## Escalation Rules

1. **Owner cannot be removed** by any role including themselves
2. **Admin cannot remove admin** — only owner can remove admins
3. **Moderator cannot appoint other moderators** — owner-only power
4. **Moderator cannot remove rooms they did not create** without `can_remove_rooms`
5. **Banned member** is excluded from member_count (sync_community_member_count trigger handles role transitions)

---

## V2 Scope Note

This phase implements:
- ✅ Owner/admin/member role enforcement
- ✅ Moderator appointment and revocation
- ✅ Moderator permission checks on member removal and rules editing

**Not in V2 scope (future phases):**
- ❌ Civic layer (LGA civic authorities)
- ❌ State-level content moderation by government operators
- ❌ AI-assisted moderation
- ❌ Appeal workflow for banned members

---

**Phase 3 — COMPLETE ✅**
