# CI Root-Cause Analysis — Ostinato-Loop Org
**Date:** 2026-06-06  
**Scope:** All repos in Ostinato-Loop GitHub org (100+ scanned)  
**Repos with failures:** 2 — `loop` (PR #1, branch `feat/governance-2026-06-06`), `rald-auth-ui` (main)  
**Final status:** All CI checks green ✅

---

## Executive Summary

| Repo | Branch | Failures found | Failures fixed | Final CI |
|------|--------|---------------|----------------|----------|
| loop | feat/governance-2026-06-06 | 4 jobs (Lint 13 errors, TypeCheck 4 errors, Tests 1 failure, Security 5 CVEs) | All | ✅ success |
| rald-auth-ui | main | 1 job (Lint 1 error) | All | ✅ success |

---

## Repo: `loop` — PR #1 (`feat/governance-2026-06-06`)

### Job 1: Lint — 13 errors → 0

**Root cause:** Code introduced in the governance sprint included unused imports and dead helper functions that were written but never wired into the UI.

| File | Violation | Fix |
|------|-----------|-----|
| `src/components/rooms/room-card.tsx` | `Radio` imported, never used | Removed from import |
| `src/hooks/use-toast.ts` | `actionTypes` assigned but only consumed as a `typeof` type — ESLint flags runtime-unused vars even when used as a type alias | Prefixed `_actionTypes`; added `varsIgnorePattern: '^_'` to `eslint.config.mjs` |
| `src/pages/me-launch.tsx` | `Link` import; entire `PersonRow`, `Activity`, `fmt` function bodies (dead code, never rendered); destructured `follows`, `toggleFollow`, `notifPrefs`, `setNotifPref` from `useLoop` (unused); orphaned imports `MessageCircle`, `Bell`, `BellOff`, `BellRing`, `NotifLevel`, `Person` type | Removed `Link` import; deleted the three dead functions entirely (they were never called and `_PersonRow` internally called `useState`, causing a secondary `react-hooks/rules-of-hooks` error when the function name started with `_`); removed all orphaned imports and type |
| `src/pages/room-launch.tsx` | `Share2` imported, never used | Removed from import |
| `src/pages/room.tsx` | `Shield` imported, never used | Removed from import |
| `src/tests/auth.test.ts` | `vi` imported, never used | Removed from import |

**Config change:** `artifacts/loop/eslint.config.mjs` — added `varsIgnorePattern: '^_'` alongside the existing `argsIgnorePattern: '^_'` so underscore-prefixed variables (intentionally unused/forward-declared) are permitted.

---

### Job 2: TypeCheck — 4 errors → 0

**Root cause:** `feed.tsx` was written against a stale mental model of the `Room` type before the schema was finalised. Three field names were wrong and the `RoomCategory` type was not imported.

| File | Line | Error | Fix |
|------|------|-------|-----|
| `src/pages/feed.tsx` | — | `RoomCategory` type used via inline `import(...)` dynamic cast — not valid in a TSX expression context | Added `type RoomCategory` to the static import from `@/lib/api/rooms` |
| `src/pages/feed.tsx` | 204 | `room.topic` — property does not exist on `Room` | Changed to `room.description` (actual field) |
| `src/pages/feed.tsx` | 205 | `room.topic` (second reference) | Changed to `room.description` |
| `src/pages/feed.tsx` | 209 | `room.participant_count` — property does not exist on `Room` | Changed to `room.audience_count` (actual field) |

**Lesson:** The `Room` type in `@/lib/api/rooms` uses `description: string | null` and `audience_count: number`. Any future feature touching the Room model should reference those types directly rather than guessing field names.

---

### Job 3: Tests — 1 failure → 0

**Root cause:** The `slugify` test in `community.test.ts` had an incorrect expected value.

| File | Test | Wrong expectation | Correct expectation | Why |
|------|------|-------------------|---------------------|-----|
| `src/tests/community.test.ts` | `slugify('Afro-beats & Jazz!')` | `'afro-beats--jazz'` (double dash) | `'afro-beats-jazz'` (single dash) | The slugify function: lowercases → strips non-alphanum except `\s` and `-` → collapses `\s+` to `-` → collapses `-+` to `-`. The input already has a `-`, the `&` and space around it become `-`, but the final collapse step reduces all consecutive dashes to one. The test author forgot the final collapse. |

---

### Job 4: Security Audit — 5 CVEs → 0

**Root cause:** `devDependencies` in `artifacts/loop/package.json` pinned `vitest@^2.0.0` and `happy-dom@^14.0.0`, both of which have known vulnerabilities.

| Package | Old version | CVEs | Fixed version |
|---------|-------------|------|---------------|
| `vitest` | ^2.0.0 | GHSA-5xrq-8626-4rwp (critical) — arbitrary file read when Vitest UI server is exposed | ^3.2.4 |
| `@vitest/coverage-v8` | ^2.0.0 | (same vitest ecosystem) | ^3.2.4 |
| `happy-dom` | ^14.0.0 | GHSA-96g7-g7g9-jxw8, GHSA-37j7-fg3j-429f, GHSA-w4gp-fjgq-3q4g (moderate) | ^20.8.9 |

**Fix applied at two levels:**
1. `artifacts/loop/package.json` — version ranges bumped directly.
2. `pnpm-workspace.yaml` `overrides` section — workspace-level overrides added (`vitest: ">=3.2.4"`, `@vitest/coverage-v8: ">=3.2.4"`, `happy-dom: ">=20.8.9"`) so the constraint is enforced across all workspace packages regardless of individual `package.json` declarations. Both packages also added to `minimumReleaseAgeExclude` so the supply-chain delay policy doesn't block installation of the patched versions.

---

## Repo: `rald-auth-ui` — main branch

### Job: Biome Lint — 1 error → 0

**Root cause:** `src/pages/Dashboard.tsx` line 663 used `<a href="#">` with an `onClick` handler to trigger sign-out. This is an accessibility violation (`a11y/useValidAnchor` / `useSemanticElements`): anchor elements must navigate somewhere; interactive-only actions must use `<button>`.

| File | Line | Violation | Fix |
|------|------|-----------|-----|
| `src/pages/Dashboard.tsx` | 663 | `<a href="#" onClick={e => { e.preventDefault(); onSignOut(); }}>` | Replaced with `<button type="button" onClick={() => { onSignOut(); }}>` with matching styles |

---

## Commits pushed

### loop — `feat/governance-2026-06-06`
| Commit | Change |
|--------|--------|
| `cb36d501` | fix(typecheck): RoomCategory import + description/audience_count field names |
| `38b1caa5` | fix(tests): correct slugify expectation |
| `ea27fa57` | fix(lint): remove unused Radio import |
| `24711094` | fix(lint): prefix actionTypes → _actionTypes |
| `9524b20a` | fix(lint): remove unused Link + dead PersonRow/Activity/fmt |
| `cde04d30` | fix(lint): remove unused Share2 |
| `43468aa4` | fix(lint): remove unused Shield |
| `5a4dc247` | fix(lint): remove unused vi import |
| `b3a6a139` | fix(security): upgrade vitest 2→3.2.4, happy-dom 14→20.8.9 |
| `f924e89d` | fix(lint): add varsIgnorePattern to eslint.config.mjs |
| `57f01142` | fix(lint): remove dead PersonRow/Activity/fmt + unused useLoop destructuring |
| `25bf27a4` | fix(security): workspace overrides for vitest + happy-dom |
| `efa8fb23` | fix(lint): remove orphaned imports after dead code deletion |

### rald-auth-ui — `main`
| Commit | Change |
|--------|--------|
| `c43cb6d6` | fix(lint): replace `<a href="#">` with `<button>` for sign-out |

---

## Patterns & Recommendations

1. **Type-first discipline.** Always import types from the API layer (`@/lib/api/*`) before writing component code that touches those shapes. The `Room` field name mismatches (topic/participant_count vs description/audience_count) would have been caught at authoring time with IDE TypeScript support.

2. **Dead code tracking.** `me-launch.tsx` had three complete helper functions (`PersonRow`, `Activity`, `fmt`) that were written but never rendered. A lint rule like `@typescript-eslint/no-unused-vars` catches this, but only if the CI runs it pre-merge. Enforce lint on PRs, not just post-merge.

3. **Lock devDep versions to secure ranges.** The workspace `overrides` mechanism in `pnpm-workspace.yaml` is the right place to enforce minimum secure versions across all packages. Add new CVE overrides there as advisories are published — do not rely solely on individual `package.json` bumps.

4. **Semantic HTML for interactive elements.** `<a>` is for navigation. `<button>` is for actions. This is both an a11y and a lint-enforced rule in Biome. Any interactive-only click handler belongs in a `<button>`.
