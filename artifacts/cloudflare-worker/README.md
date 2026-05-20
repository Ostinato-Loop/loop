# Loop API — Cloudflare Worker

Business logic layer for Loop V1. Augments Supabase (which handles realtime presence, auth, and chat) with edge-powered recommendations, AI commentary, civic data, and async task processing.

## Architecture

```
React frontend (Vite, artifacts/loop)
  ├── Supabase Realtime  ← room presence, chat, speaker queue (V1)
  ├── Supabase Auth      ← phone OTP + session tokens
  └── /api proxy
        └── Cloudflare Worker (this service)
              ├── GET  /api/health
              ├── GET  /api/trending
              ├── GET  /api/rooms/recommendations
              └── POST /api/rooms/:roomId/queue-summary
```

Supabase realtime is NOT replaced. The Worker handles non-realtime enrichment only.

## Local development

### Prerequisites

```bash
npm install -g wrangler
# or: pnpm add -g wrangler
```

### Setup

```bash
cd artifacts/cloudflare-worker

# Copy dev secrets template
cp .dev.vars.example .dev.vars
# Fill in .dev.vars with real values (git-ignored)

# Install dependencies
pnpm install

# Start local dev server (http://localhost:8787)
pnpm dev
```

`wrangler dev` reads `.dev.vars` automatically. D1/KV/R2 are simulated locally.

### Testing routes

```bash
# Health check (no auth required)
curl http://localhost:8787/api/health

# Trending (requires Supabase JWT)
TOKEN=$(supabase auth token)   # or grab from browser devtools
curl -H "Authorization: Bearer $TOKEN" http://localhost:8787/api/trending

# Recommendations
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8787/api/rooms/recommendations?limit=5&lang=yo"
```

## Environment setup

### Non-secret vars (wrangler.toml `[vars]`)

| Variable | Purpose |
|---|---|
| `ENVIRONMENT` | `development` / `staging` / `production` |
| `SUPABASE_URL` | Your Supabase project URL |
| `CORS_ORIGIN` | Allowed frontend origin |

### Secrets (`wrangler secret put`)

```bash
wrangler secret put SUPABASE_SERVICE_ROLE_KEY
wrangler secret put OPENROUTER_API_KEY
wrangler secret put SPORTSMONKS_API_KEY
wrangler secret put MUX_TOKEN
wrangler secret put LIVEKIT_API_KEY
wrangler secret put COSON_API_KEY
wrangler secret put TENCENT_API_KEY
wrangler secret put CLOUDFLARE_API_TOKEN
```

Never commit actual secret values. `.dev.vars` is git-ignored.

## Deployment

```bash
# Ensure you are logged in
wrangler login

# Create D1 database (first time only)
wrangler d1 create loop-db
# → copy the database_id into wrangler.toml

# Create KV namespace (first time only)
wrangler kv:namespace create CACHE
# → copy the id into wrangler.toml

# Create R2 bucket (first time only)
wrangler r2 bucket create loop-media

# Create task queue (first time only)
wrangler queues create loop-tasks

# Deploy
pnpm deploy
```

## Service layer

Each service module is independently swappable:

| Module | File | Current status | Future |
|---|---|---|---|
| Recommendations | `src/services/recommendations.ts` | Returns empty list | D1 query → AI ranking |
| Commentary AI | `src/services/commentary.ts` | Placeholder | Workers AI / OpenRouter |
| Translation | `src/services/translation.ts` | Passthrough | Workers AI m2m100 |
| Moderation | `src/services/moderation.ts` | Passthrough | Workers AI + KV blocklist |
| Civic / Sports | `src/services/civic.ts` | Placeholder | SportsMonks, COSON |

## Bindings reference

| Binding | Type | Purpose |
|---|---|---|
| `DB` | D1 Database | Room metadata, user records, interests |
| `CACHE` | KV Namespace | Sessions, trending cache, rate limits, blocklist |
| `MEDIA` | R2 Bucket | Avatars, audio clips, room covers |
| `TASK_QUEUE` | Queue | AI summaries, moderation reviews, notifications |
| `ROOM_SESSION` | Durable Object | Future: stateful per-room state, hand-raise queue |
| `AI` | Workers AI | Text classification, translation, summarisation |

## Scaling notes

- **KV caching**: all expensive operations cache in KV with a TTL. Trending caches for 5 min; translations for 1 hr; room summaries for 24 hr.
- **Queue workers**: heavy tasks (AI summaries, notification fan-out) go through `TASK_QUEUE` so the HTTP response path stays under 50 ms.
- **Durable Objects**: `RoomSession` is scaffolded but inactive in V1. Activate when sub-100ms globally-consistent room state is needed (speaker queues, participant counts at scale).
- **Workers AI**: free tier includes 10k neurons/day. Route heavy LLM calls through OpenRouter (OPENROUTER_API_KEY) for high-volume production use.

## TypeScript

```bash
# Typecheck only (no wrangler needed)
pnpm typecheck

# Regenerate env bindings from wrangler.toml
pnpm cf-typegen
```

## Package dependencies

```
artifacts/cloudflare-worker
  └── @workspace/loop-shared-types   (packages/shared-types)

packages/api-client
  └── @workspace/loop-shared-types   (packages/shared-types)

artifacts/loop (frontend)
  └── @workspace/loop-api-client     (packages/api-client)  ← optional, add when ready
```
