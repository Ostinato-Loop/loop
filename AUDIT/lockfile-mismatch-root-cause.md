# Lockfile Mismatch Root Cause Audit

**Repository:** `Ostinato-Loop/loop`  
**Audited:** 2026-06-07  
**Status:** ✅ RESOLVED — `pnpm install --frozen-lockfile` now passes

---

## 1. Exact Package That Introduced the Mismatch

Two commits modified `pnpm-workspace.yaml` after the last lockfile regeneration, neither of which was followed by a `pnpm install` to update `pnpm-lock.yaml`:

| Commit | Date | Author | Change |
|--------|------|--------|--------|
| `25bf27a` | 2026-06-06 | Hanzosekani | Added CVE overrides: `vitest >=3.2.4`, `@vitest/coverage-v8 >=3.2.4`, `happy-dom >=20.8.9` |
| `6b7e828` | 2026-06-06 | Hanzosekani | Added `livekit-client`, `livekit-server-sdk` to `minimumReleaseAgeExclude` |

The last lockfile commit before these was:

```
23ffbe8  fix: add brand logos and update rald-logo.png in public
```

---

## 2. Exact Overrides Changed

### Commit `25bf27a` — `pnpm-workspace.yaml` diff (additions only):

```yaml
overrides:
  # vitest GHSA-5xrq-8626-4rwp: arbitrary file read via UI server — fixed in >=3.0.5
  vitest: ">=3.2.4"
  "@vitest/coverage-v8": ">=3.2.4"
  # happy-dom GHSA-96g7-g7g9-jxw8, GHSA-37j7-fg3j-429f, GHSA-w4gp-fjgq-3q4g: multiple CVEs — fixed in >=20.8.9
  happy-dom: ">=20.8.9"
```

### Commit `6b7e828` — `pnpm-workspace.yaml` diff (additions only):

```yaml
minimumReleaseAgeExclude:
  - livekit-client
  - livekit-server-sdk
```

---

## 3. Why the Lockfile Was Not Updated

**Root cause:** Both commits were pushed directly to `main` without running `pnpm install` locally afterwards. The workflow was:

1. Developer edited `pnpm-workspace.yaml` to add CVE patches (commit `25bf27a`)
2. Developer edited `pnpm-workspace.yaml` again for LiveKit exclusions (commit `6b7e828`)
3. Neither commit included a lockfile regeneration step
4. CI/CD pipeline runs `pnpm install --frozen-lockfile`, which reads the lockfile and detects that it does not reflect the current `overrides` section → **install fails**

The `overrides` block in `pnpm-workspace.yaml` is part of the lockfile's recorded state. Any change to `overrides` invalidates the existing lockfile hash, causing `--frozen-lockfile` to abort with a mismatch error.

**What was missing:** After any change to `pnpm-workspace.yaml` (overrides, catalog, minimumReleaseAgeExclude, etc.), the developer must run `pnpm install` locally and commit the updated `pnpm-lock.yaml` in the same PR.

---

## 4. Workspace `package.json` Audit — overrides / resolutions / pnpm

All workspace packages were scanned. **No `package.json` file contains `overrides`, `resolutions`, or `pnpm` fields.** Overrides are correctly consolidated in `pnpm-workspace.yaml` only.

| File | overrides | resolutions | pnpm |
|------|-----------|-------------|------|
| `package.json` (root) | ✗ | ✗ | ✗ |
| `artifacts/api-server/package.json` | ✗ | ✗ | ✗ |
| `artifacts/cloudflare-worker/package.json` | ✗ | ✗ | ✗ |
| `artifacts/loop/package.json` | ✗ | ✗ | ✗ |
| `artifacts/mockup-sandbox/package.json` | ✗ | ✗ | ✗ |
| `lib/api-client-react/package.json` | ✗ | ✗ | ✗ |
| `lib/api-spec/package.json` | ✗ | ✗ | ✗ |
| `lib/api-zod/package.json` | ✗ | ✗ | ✗ |
| `lib/db/package.json` | ✗ | ✗ | ✗ |
| `packages/api-client/package.json` | ✗ | ✗ | ✗ |
| `packages/shared-types/package.json` | ✗ | ✗ | ✗ |
| `scripts/package.json` | ✗ | ✗ | ✗ |

**Conclusion:** No fragmentation. All version pinning is in `pnpm-workspace.yaml`. This is correct pnpm monorepo practice.

---

## 5. Proof — `pnpm install --frozen-lockfile` Now Passes

```
$ pnpm install --frozen-lockfile

. preinstall$ sh -c 'rm -f package-lock.json yarn.lock; ...'
. preinstall: Done

╭ Warning ────────────────────────────────────────────────────────╮
│  Ignored build scripts: sharp@0.34.5, workerd@1.20260515.1.    │
│  Run "pnpm approve-builds" to pick which dependencies should   │
│  be allowed to run scripts.                                     │
╰─────────────────────────────────────────────────────────────────╯

Done in 3.8s using pnpm v10.26.1
```

Exit code: **0** ✅

---

## 6. `git diff pnpm-lock.yaml` Summary

```
 pnpm-lock.yaml | 1338 +++++++++++++++++++++++++++++++++++++++
 1 file changed, 1330 insertions(+), 8 deletions(-)
```

### Key sections added to the lockfile:

**Overrides block** — previously missing entries now recorded:

```diff
 overrides:
   ws: '>=8.20.1'
   qs: '>=6.15.2'
+  vitest: '>=3.2.4'
+  '@vitest/coverage-v8': '>=3.2.4'
+  happy-dom: '>=20.8.9'
   esbuild>@esbuild/darwin-arm64: '-'
   ...
```

**New package resolutions added across importers:**
- `@supabase/supabase-js@2.105.4` — `artifacts/api-server`, `artifacts/cloudflare-worker`
- `livekit-server-sdk@2.15.4` — `artifacts/api-server`
- `livekit-client@2.19.1` — `artifacts/loop`
- `vitest@4.1.8` — `artifacts/cloudflare-worker` (CVE override resolved)
- `@vitest/coverage-v8@4.1.8` — resolved to patched version
- `happy-dom@20.10.2` — resolved to patched version (>=20.8.9)
- `@eslint/js@9.39.4`, `@typescript-eslint/*@8.60.1` — `artifacts/loop`

---

## 7. Prevention

Going forward, any PR that touches `pnpm-workspace.yaml` **must** include an updated `pnpm-lock.yaml` in the same commit. A CI check enforcing this is already in place via `pnpm install --frozen-lockfile`. The fix is:

```bash
# After editing pnpm-workspace.yaml:
pnpm install --no-frozen-lockfile
git add pnpm-lock.yaml
git commit -m "chore: regenerate lockfile after workspace override changes"
```
