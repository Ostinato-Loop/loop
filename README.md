# Loop

African-first social audio platform

[![CI](https://github.com/Ostinato-Loop/loop/actions/workflows/ci.yml/badge.svg)](https://github.com/Ostinato-Loop/loop/actions/workflows/ci.yml)
[![Deploy Loop](https://github.com/Ostinato-Loop/loop/actions/workflows/deploy.yml/badge.svg)](https://github.com/Ostinato-Loop/loop/actions/workflows/deploy.yml)
[![Lockfile](https://github.com/Ostinato-Loop/loop/actions/workflows/lockfile-check.yml/badge.svg)](https://github.com/Ostinato-Loop/loop/actions/workflows/lockfile-check.yml)

## Architecture

| Layer | Technology |
|-------|-----------|
| Frontend | React + Vite (Cloudflare Pages) |
| API Worker | Cloudflare Worker (`loop-api`) |
| Auth | RALD SSO (OpenID Connect) |
| Database | Supabase (PostgreSQL) |
| Realtime | LiveKit |
| Media | Cloudflare R2 |

## Development

```bash
pnpm install
pnpm --filter @workspace/loop run dev
```

## Deployment

Push to `main` — GitHub Actions handles type-check, lint, and deploy.

| Route | URL |
|-------|-----|
| App | https://loop.rald.cloud |
| API | https://loop-api.rald.cloud |
