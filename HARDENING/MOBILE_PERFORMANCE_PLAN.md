# MOBILE PERFORMANCE PLAN
**Date:** 2026-06-08  
**Scope:** loop web app (loop.rald.cloud) — primary mobile delivery vehicle until native apps ship  
**Target users:** Nigerian mobile users on 3G/4G, mid-range Android devices (Tecno, Infinix, Itel), 100–10,000 users  
**Source of truth:** `loop/artifacts/loop/` — React + Vite, Tailwind, shadcn/ui, LiveKit, Supabase

---

## Current State

The `loop` app was built mobile-first (thumb navigation, bottom nav, mobile-first CSS). This is correct. However, several performance issues will cause real pain on African networks.

### What's already right
- `use-network-status.ts` — detects connection quality (2G/3G/4G/WiFi)
- `offline-banner.tsx` — visible disconnect state
- `_redirects` — SPA routing works without re-downloading JS
- Bottom nav — thumb-first navigation
- `public/opengraph.jpg` (28KB) — compressed social image

### What needs fixing
- Bundle size unknown — no Vite bundle analysis configured
- LiveKit SDK is large (~300KB gzip) — loaded on every page, not lazy-loaded
- Supabase client initialises on every import — one connection per module if not singletonised
- No image lazy loading for avatars and room covers
- No service worker — app re-downloads on every visit on slow connections
- Animations run at full fidelity regardless of `prefers-reduced-motion` or network quality

---

## Targets

| Metric | Current (estimated) | Target (100 users) | Target (10,000 users) |
|--------|--------------------|--------------------|----------------------|
| First Contentful Paint (3G) | ~4–6s | < 2.5s | < 2.0s |
| Time to Interactive (3G) | ~7–10s | < 4.0s | < 3.5s |
| JS bundle (gzip) | ~800KB–1.2MB est. | < 400KB | < 300KB |
| Audio join latency (3G) | Unknown | < 3s | < 2s |
| Room list load | Unknown | < 1.5s | < 1.0s |
| Offline → reconnect | Undefined | < 5s automatic | < 3s |
| Lighthouse mobile score | Unknown | > 75 | > 85 |

---

## Performance Plan — 5 Areas

---

### Area 1: Bundle Size

**Problem:** LiveKit `livekit-client` SDK (~300KB gzip), combined with shadcn/ui components (many unused in critical path), will inflate the initial JS bundle.

**Fix 1.1 — Lazy-load LiveKit**
Only load `livekit-client` when user enters a live room.

```typescript
// loop/artifacts/loop/src/pages/room.tsx
// BEFORE (loaded on every page):
import { Room as LiveKitRoom } from 'livekit-client'

// AFTER (loaded only when room page mounts):
const { Room: LiveKitRoom } = await import('livekit-client')
```

**Fix 1.2 — Vite bundle analysis**  
Add to `loop/artifacts/loop/vite.config.ts`:
```typescript
import { visualizer } from 'rollup-plugin-visualizer'
plugins: [react(), visualizer({ open: true, gzipSize: true })]
```
Run `pnpm build --filter @workspace/loop` and inspect the treemap. Remove or lazy-load any chunk > 50KB that isn't on the critical path.

**Fix 1.3 — Code-split by route**  
All page components are already imported in `App.tsx`. Add `React.lazy()`:
```typescript
const RoomPage = React.lazy(() => import('./pages/room'))
const DiscoverPage = React.lazy(() => import('./pages/discover'))
const SettingsPage = React.lazy(() => import('./pages/settings'))
```
Wrap router in `<Suspense fallback={<FullScreenSpinner />}>`.

**Fix 1.4 — Tree-shake unused shadcn components**  
`components/ui/` contains 40+ components. Many (calendar, carousel, chart) are not used in the core user journey. Verify imports — only import what renders on screen.

---

### Area 2: Network Resilience

**Problem:** African mobile networks drop and reconnect frequently. The app must handle this gracefully rather than showing blank screens.

**Fix 2.1 — Extend `use-network-status.ts` to classify connection**

```typescript
// loop/artifacts/loop/src/hooks/use-network-status.ts
// Current: detects online/offline
// Add: connection quality tier
type ConnectionQuality = '4g' | '3g' | '2g' | 'offline'

function getConnectionQuality(): ConnectionQuality {
  const connection = (navigator as any).connection
  if (!connection) return '4g'
  if (connection.effectiveType === '4g') return '4g'
  if (connection.effectiveType === '3g') return '3g'
  return '2g'
}
```

**Fix 2.2 — Adaptive room list polling**  
Current: auto-refresh every 10s (from `loop-core`).  
With quality detection:
- 4G WiFi: poll every 10s
- 3G: poll every 30s
- 2G: manual refresh only, show "Last updated X min ago"

**Fix 2.3 — Exponential backoff on Supabase reconnect**  
```typescript
// loop/artifacts/loop/src/integrations/supabase/client.ts
// Add reconnection config:
const supabase = createClient(url, key, {
  realtime: {
    params: { eventsPerSecond: 2 },
  },
  global: {
    headers: { 'x-loop-client': 'mobile-web' }
  }
})
```

**Fix 2.4 — Offline-first room list**  
Cache the last-seen room list in `sessionStorage`. On reconnect, show cached rooms immediately while refreshing.  
Cost: 10 lines. Impact: eliminates blank screen on reconnect.

**Fix 2.5 — Audio reconnect on network change**  
In `loop/artifacts/loop/src/hooks/use-livekit-room.ts`, listen for `navigator.connection` change events:
```typescript
window.addEventListener('online', () => {
  if (room.state === 'disconnected') room.connect(url, token)
})
```

---

### Area 3: Image and Media

**Problem:** Avatar images and room covers can be large, loaded eagerly, and not resized for mobile viewports.

**Fix 3.1 — Lazy-load all avatars**  
In `loop/artifacts/loop/src/components/rooms/room-card.tsx` and all avatar usage:
```tsx
<img loading="lazy" decoding="async" src={avatarUrl} />
```

**Fix 3.2 — Supabase Storage image transforms**  
Supabase Storage supports URL-based image resizing. For all avatar/cover images:
```typescript
supabase.storage.from('avatars')
  .getPublicUrl(path, {
    transform: { width: 80, height: 80, resize: 'cover', format: 'webp' }
  })
```
Reduces a 500KB avatar to ~8KB for mobile. Use `format: 'webp'` — supported on all modern Android browsers.

**Fix 3.3 — Blur-up placeholder for room covers**  
Generate a 4x4 pixel base64 placeholder during upload. Display it while the full image loads. This eliminates layout shift.

---

### Area 4: Audio Performance

**Problem:** LiveKit audio is the core product feature. On 3G, WebRTC setup can take 5–8 seconds. Users will assume the app is broken.

**Fix 4.1 — Join optimistic UI**  
Show the room UI immediately on "Join" tap. Start the LiveKit connection in the background. Show a connecting state on the mic button. Users hear audio when the connection completes — they don't stare at a loading screen.

**Fix 4.2 — Adaptive audio bitrate**  
In `loop/artifacts/loop/src/lib/livekit.ts`, set adaptive bitrate based on connection quality:
```typescript
const audioPreset = connection === '2g' 
  ? AudioPresets.speechLowQuality  // 20kbps
  : AudioPresets.speechQuality      // 40kbps
```

**Fix 4.3 — Echo cancellation and noise suppression defaults**  
Ensure `getUserMedia` is called with:
```typescript
audio: {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  sampleRate: 16000  // 16kHz sufficient for voice; saves bandwidth
}
```

**Fix 4.4 — Handle mic permission denial gracefully**  
Current behaviour on permission denial: unknown. Required: show a clear explanation screen with instructions for re-enabling mic access in Safari/Chrome Android settings. Do not show a generic error.

---

### Area 5: Core Web Vitals

**Fix 5.1 — Prevent layout shift from async avatar loads**  
Set explicit `width` and `height` on all `<img>` tags or use CSS `aspect-ratio: 1` on avatar containers.

**Fix 5.2 — Preconnect to critical domains**  
In `loop/artifacts/loop/index.html`:
```html
<link rel="preconnect" href="https://auth.rald.cloud">
<link rel="preconnect" href="https://onxdcikfttdmnhofsuwo.supabase.co">
<link rel="dns-prefetch" href="wss://livekit.rald.cloud">
```

**Fix 5.3 — Font loading**  
If Inter is loaded from Google Fonts, add `font-display: swap` and preload the variable font file to prevent FOIT (Flash of Invisible Text) on slow connections.

**Fix 5.4 — Reduce Supabase realtime channels**  
Each `supabase.channel()` subscription holds an open WebSocket. Audit `loop/artifacts/loop/src/` — count the number of active realtime subscriptions. Maximum recommended: 3 per page. Merge channels where possible.

---

## Mobile Performance Checklist

```
IMMEDIATE — Affects first impressions (do before 100 users)
[ ] 1.1: Lazy-load livekit-client SDK
[ ] 1.2: Run Vite bundle analysis, identify and eliminate chunks > 50KB in critical path
[ ] 1.3: React.lazy() on all page components
[ ] 2.1: Add connection quality detection to use-network-status
[ ] 2.4: Cache room list in sessionStorage for offline-first recovery
[ ] 3.1: Add loading="lazy" to all avatar/cover images
[ ] 3.2: Use Supabase Storage transforms (WebP, 80x80 for avatars)
[ ] 4.1: Optimistic join UI — show room immediately, connect in background
[ ] 4.3: Set correct getUserMedia constraints (echo cancel, noise suppress, 16kHz)
[ ] 5.2: Add preconnect hints for auth.rald.cloud and Supabase

SPRINT 2 — Affects retention on slow networks (do before 1,000 users)
[ ] 2.2: Adaptive room list polling based on connection quality
[ ] 2.5: LiveKit auto-reconnect on network change
[ ] 4.2: Adaptive audio bitrate (20kbps on 2G, 40kbps on 3G+)
[ ] 4.4: Graceful mic permission denial with platform-specific instructions
[ ] 5.1: Explicit dimensions on all avatar images (prevent CLS)
[ ] 5.4: Audit and cap Supabase realtime channel count

SCALE — Required for 10,000 users
[ ] Add Supabase Pooler (transaction mode) for connection pooling
[ ] Implement service worker with Workbox for offline caching
[ ] Enable Cloudflare Images for automatic format/resize serving
[ ] Set up Lighthouse CI in GitHub Actions — block deploys that regress mobile score below 75
```

---

## Bandwidth Budget (Target)

| Asset | Budget | Notes |
|-------|--------|-------|
| Initial HTML | < 5KB | Shell only |
| Critical CSS | < 20KB gzip | Above-fold styles |
| Initial JS | < 80KB gzip | Auth + routing only |
| Deferred JS | < 300KB gzip | Room, discover, settings |
| LiveKit SDK | Load on demand | ~300KB, room page only |
| Avatar image | < 10KB | 80x80 WebP via Storage transform |
| Room cover | < 30KB | 400x200 WebP |
| Total initial load (3G) | < 300KB | Target < 3s FCP on 3G |

---

*Prepared for LILCKY STUDIO LIMITED — Loop Hardening Directive — 2026-06-08*
