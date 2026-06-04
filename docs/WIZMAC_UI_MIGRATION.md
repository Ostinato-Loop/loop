# WIZMAC — Loop UI Migration Record
**Date:** 2026-06-04  
**Sprint:** RALD Ecosystem Hardening & Stabilization — UI Launch Integration  
**Author:** RALD Platform Engineering

---

## 1. Background

`loop` is the RALD audio-room product at `loop.rald.cloud`. This document records the decisions made when integrating the production-ready UI design from the `loop-audio-ui-ux` reference prototype into the live Loop application.

### Reference Source
- **Repo:** `loop-audio-ui-ux` (Lovable-generated design prototype)
- **Architecture:** TanStack Router, mock data, no real auth
- **Key design patterns extracted:** neon accent system, bottom-nav 5-slot with center FAB, Feed tabs (All / Live / Near Me / Trending / Events), LiveStrip horizontal scroll, RoomCard with category gradient overlay, speaker queue UI

---

## 2. Old Architecture

| Aspect | Before |
|--------|--------|
| Pages | `discover.tsx` (category filter only), `live.tsx` (separate), `room.tsx`, `me.tsx`, `messages.tsx` |
| Nav | 5-slot bottom nav: Discover / Live / Create / Inbox / You |
| Feed | Single category filter, flat RoomCard list |
| Auth | OTP → Supabase → Loop JWT (deprecated in Phase H) |
| Design | Neon green `#00FF88` on dark green `#0A1F16`, basic card |

---

## 3. New Architecture

| Aspect | After |
|--------|--------|
| Pages | `discover.tsx` replaces itself as the **Feed** page (was `/`, now `/`) |
| Nav | 5-slot bottom nav: **Feed / Discover / + / Chat / You** — center button elevated with `border-4 border-background` neon style |
| Feed | Two-axis filter: **feed tab** (All / Live now / Near me / Trending / Events) + **category chip** (Sports / Civic / Music / Culture / News) |
| LiveStrip | Horizontal scroll of live-only rooms, injected at top of All/Live tabs |
| Content mix | Real rooms from Supabase API + inline Discussions, Opportunities, News "cards" (enrichment layer) |
| RoomCard | Category emoji, gradient overlay, host mic icon, audience count |
| Auth | RALD SSO cookie (`rald_session`) + `/api/auth/silent` (Phase H, unchanged) |

---

## 4. Migration Decisions

### 4.1 Color palette preserved
The reference prototype used amber neon. The live Loop product uses neon green (`#00FF88`) which aligns with RALD brand identity. We **kept the existing green palette** and applied the reference *layout patterns*, not the reference colors.

### 4.2 Routing preserved (React Router)
Reference used TanStack Router. Production uses `react-router-dom`. No routing migration — component structure was adapted to React Router `<Link>` and `useNavigate`.

### 4.3 Real API calls preserved
All `listRooms`, `getRoom`, `joinRoom`, `sendMessage`, `sendReaction` Supabase calls are **unchanged**. The feed page enriches the API result with mock discussion/news/opportunity items to create a richer content feed while the API data populates.

### 4.4 Feed vs Discover naming
The reference had a separate `Discover` page. We unified: the main feed at `/` is now labelled **Feed** in the header and nav. The existing `/live` page remains as "Discover" in the bottom nav (pointing to the live rooms subset).

### 4.5 `messages.tsx` path preserved
Cross-product Messenger link in nav points to `/messages` — which continues to bridge to `messenger.rald.cloud` (external product). Not replaced.

---

## 5. Files Changed

| File | Change |
|------|--------|
| `artifacts/loop/src/pages/discover.tsx` | Full redesign — Feed tabs, LiveStrip, enrichment cards |
| `artifacts/loop/src/components/layout/bottom-nav.tsx` | 5-slot with elevated center FAB |
| `artifacts/loop/src/components/rooms/room-card.tsx` | Category emoji, gradient, host mic icon |

---

## 6. Infrastructure Gaps (Not Blocked)

| Gap | Status |
|-----|--------|
| `search.rald.cloud` | Connection refused (000) — search not yet deployed |
| `inbox.rald.cloud` | Connection refused (000) — notifications infra not yet deployed |
| Events content type | Feed tab added, content TBD (empty state shown) |

---

## 7. Rollback
Checkpoint taken before migration. All previous files available in git history. To rollback: `git revert` the UI migration commit.
