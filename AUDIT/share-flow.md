# AUDIT/share-flow.md
**Date:** 2026-06-08
**Auditor:** RALD CTO — BETA ACTIVATION SPRINT Phase 4
**Scope:** Room sharing — deep links, Web Share API, clipboard fallback

---

## What Was Built

### Share Button
- Located in room header (Share2 icon), top-right of title area
- Visible to all participants (host, speakers, listeners)

### Share Flow
```
shareRoom() →
  navigator.share available?
    YES → navigator.share({ title, text, url }) — native share sheet (iOS/Android)
    NO  → navigator.clipboard.writeText(url) — copy to clipboard + toast
```

### Deep Link Format
```
https://loop.rald.cloud/rooms/{roomId}
```
- This URL is already handled by App.tsx route: /rooms/:roomId → RoomPage
- The _redirects file in Cloudflare Pages handles SPA fallback: /* → /index.html 200
- Deep links open correctly on web and in any browser

### Verification Checklist
| Requirement | Status |
|-------------|--------|
| Copy Link | ✅ Clipboard API with toast feedback |
| Native Share API | ✅ navigator.share() on supported devices |
| Deep Links room/{id} | ✅ /rooms/:roomId route + SPA _redirects |
| Shared links open correctly | ✅ RoomPage loads from URL param |

---

## Verdict: Share flow is complete. Phase 4 requirements met.
