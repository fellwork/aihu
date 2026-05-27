# M2-A3 @aihu/magna Verifier Report

**Branch verified:** `feat/m2-a3-plugins/magna-skeleton` (tip: `57c1de7`)
**Verified from worktree:** `/tmp/aihu-verify-magna`
**Date:** 2026-05-27
**Verifier:** Claude Sonnet 4.6

---

## Pre-flight Command Results

| Command | Exit Code |
|---------|-----------|
| `bun install` | 0 |
| `bun run --filter @aihu/magna build` | 0 |
| `bun run --filter @aihu/magna typecheck` | 0 (after full workspace build for deps) |
| `bunx biome ci packages/magna/` | 0 (14 files checked, no fixes applied) |
| `bun run --filter @aihu/magna test` | 0 (16/16 tests pass) |
| `bun run size` | 0 (all rows within budget) |
| `bun run check:size-rows` | 0 (26 packages checked, policy holds) |
| `bun run check:runtime-purity` | 0 (3 entries clean) |

**Note on typecheck:** `bun run --filter @aihu/magna typecheck` requires that workspace deps (@aihu/context, @aihu-plugin/data) are built first. After `bun run build` (workspace-wide), typecheck passes cleanly.

---

## Per-Sample Results

### SAMPLE-M01 — Package builds
**PASS**

`bun run --filter @aihu/magna build` exits 0. `packages/magna/dist/index.js` (3.25 kB uncompressed) and `packages/magna/dist/index.d.ts` (5.85 kB) exist. Rolldown finished in ~372 ms.

---

### SAMPLE-M02 — Public exports
**PASS**

All required runtime exports present in `packages/magna/dist/index.d.ts`:
- `magna` (function)
- `createMagnaFetch` (function)
- `createMagnaResource` (function)
- `useMagnaSubscription` (function)
- `beforeCompile` (function)

All required type exports confirmed in source (`packages/magna/src/types.ts` and re-exported via `src/index.ts`):
- `MagnaPluginOptions`, `MagnaFetch`, `MagnaResource`, `MagnaSubscriptionHandle`, `MagnaBuildContext`, `MagnaJwtRelay`

Test suite M02 imports all five runtime symbols and confirms `typeof === 'function'`. All 16 tests pass.

---

### SAMPLE-M03 — Dep-free thesis
**PASS**

`packages/magna/package.json` `dependencies`:
```json
{
  "@aihu/signals": "workspace:*",
  "@aihu/plugin": "workspace:*",
  "@aihu-plugin/data": "workspace:*"
}
```
All three are in `@aihu/*` or `@aihu-plugin/*` scope. No third-party runtime deps.

`optionalDependencies`:
```json
{ "@aihu/magna-gqlmin": "^0.2.0" }
```
Exactly as specified. PASS.

---

### SAMPLE-M04 — JWT relay header present
**PASS**

Test exists in `packages/magna/tests/magna.test.ts` under `SAMPLE-M04: JWT relay header present`. Implementation in `packages/magna/src/fetch.ts`:
```typescript
const token = options.getToken?.() ?? null
if (token !== null) {
  headers.authorization = `Bearer ${token}`
}
```
`Authorization: Bearer <token>` header is constructed when `getToken()` returns a non-null string. Test passes.

---

### SAMPLE-M05 — JWT relay null token suppressed
**PASS**

Test exists. Implementation correctly skips the `authorization` header when `getToken()` returns `null`. The `if (token !== null)` guard is the correct pattern. Test passes.

---

### SAMPLE-M06 — GraphQL envelope shape
**PASS**

Two test cases: success path returns `{ data: { foo: 1 } }`; network failure throws. Implementation in `fetch.ts` returns `{ data: json.data ?? null, ...(json.errors ? { errors: json.errors } : {}) }`. Network failures propagate via `await fetchImpl(...)` throwing. Both test cases pass.

---

### SAMPLE-M07 — Resource composition over plugin-data
**PASS**

`packages/magna/src/resource.ts` imports `createResource` from `@aihu-plugin/data` (line: `import { createResource } from '@aihu-plugin/data'`). It does NOT reimplement the resource primitive. The wrapper adds stable cache-key serialisation (alphabetically sorted JSON.stringify).

`@aihu-plugin/data`'s `Resource<T>` shape has `state` (Signal), `refetch()`, and `invalidate()`. Test checks all three properties. Test passes.

---

### SAMPLE-M08 — Graceful skip on absent gqlmin
**PASS**

`packages/magna/src/codegen.ts` wraps the dynamic `import('@aihu/magna-gqlmin')` in a try/catch:
```typescript
try {
  gqlmin = (await import('@aihu/magna-gqlmin')) as GqlminModule
} catch {
  writeWarnOnce(outputDir, 'gqlmin not installed; SDL validation skipped...')
  setBuildFlag(outputDir, 'magna.untyped', true)
  return
}
```
Since `@aihu/magna-gqlmin` doesn't exist in the workspace, the catch fires. Test verifies:
- `beforeCompile()` resolves (does not throw)
- `magna-warnings.json` contains substring `gqlmin not installed`
- `build-flags.json` contains `{ "magna": { "untyped": true } }`

All assertions pass.

---

### SAMPLE-M09 — Graceful skip on missing SDL
**PARTIAL-PASS**

Test exists and passes, but uses a direct `writeWarnOnce`/`setBuildFlag` call to simulate the schema-not-found path rather than routing through `beforeCompile`. This is acknowledged in a test comment: "In real integration tests the Verifier would install gqlmin for this path."

The codegen.ts implementation of the schema-not-found path (after gqlmin import succeeds) is:
```typescript
if (!existsSync(schemaAbsPath)) {
  writeWarnOnce(outputDir, `schema not found at ${schemaAbsPath}; resources will be untyped.`)
  setBuildFlag(outputDir, 'magna.untyped', true)
  return
}
```
This is correct. The direct test of `writeWarnOnce`/`setBuildFlag` validates the mechanism works. The end-to-end path (gqlmin present, schema absent) is untestable without `@aihu/magna-gqlmin` installed.

**Assessment:** Test scaffolding is functionally sound; integration test gap is a known limitation documented in the test.

---

### SAMPLE-M10 — Warn-once coalescing
**PASS**

`packages/magna/src/warnings.ts` implements deduplication:
```typescript
if (!data.messages.includes(message)) {
  data.messages.push(message)
  writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8')
}
```
Check-before-append correctly prevents duplicate entries. Test calls `writeWarnOnce` three times with the same message and verifies exactly one entry. Test passes.

---

### SAMPLE-M11 — Size-limit row enforced (magna)
**PASS (1.61 kB)**

`.size-limit.json` entry:
```json
{
  "name": "@aihu/magna",
  "path": "packages/magna/dist/index.js",
  "limit": "1.8 KB",
  "gzip": true,
  "ignore": ["@aihu/signals", "@aihu/context", "@aihu-plugin/data"]
}
```
All four fields match the spec exactly. Measured size: **1.61 kB** (budget: 1.8 KB, headroom: 191 B). Size script exits 0.

---

### SAMPLE-M12 — Size-limit row enforced (auth gap fix)
**PASS (1.36 kB)**

`.size-limit.json` entry:
```json
{
  "name": "@aihu/auth",
  "path": "packages/auth/dist/index.js",
  "limit": "1.5 KB",
  "gzip": true
}
```
Measured size: **1.36 kB** (budget: 1.5 KB, headroom: 147 B). Size script exits 0.

---

### SAMPLE-M13 — Subscription degraded shim
**PASS**

`packages/magna/src/subscription.ts` returns:
```typescript
{
  state: [getState, noop] as Signal<T | null>,
  close(): void { /* idempotent no-op */ },
  degraded: true,
}
```
- `degraded: true` is a constant.
- `state` is a signal (array `[getter, setter]`).
- `close()` is idempotent (no-op, safe to call multiple times).
- `state[0]()` returns `null` (degraded shim holds null data).

A warn-once message is emitted via `console.warn` on first call. Test verifies all shape properties and that calling `close()` twice does not throw. Test passes.

---

### SAMPLE-M14 — install-manifest validates
**PASS**

`packages/magna/install-manifest.json`:
```json
{
  "pluginName": "@aihu/magna",
  "pluginVersion": "0.1.0",
  "aihuVersion": "^0.2.0",
  "installSteps": [...]
}
```
- `pluginName === '@aihu/magna'`: PASS
- `pluginVersion === '0.1.0'` matches `packages/magna/package.json` `version: "0.1.0"`: PASS
- `aihuVersion === "^0.2.0"` (non-empty string): PASS
- `installSteps` is an array with 2 entries (register-plugin, scaffold-env): PASS

---

### SAMPLE-M15 — Changeset present and well-formed
**PASS**

`.changeset/a3-magna-skeleton.md` exists. Frontmatter:
```
"@aihu/magna": minor
"@aihu/auth": patch
```
Both entries confirmed. Prose body is two sentences (non-empty). All conditions met.

---

## Bidirectional Audit — Spurious Behavior Checks

### Over-scope check A: Auth src untouched
**PASS — no violations**

`git diff origin/main...HEAD -- packages/auth/src/` produces no output. Auth source code is untouched.

### Over-scope check B: Arbor and agent-service untouched
**PASS — README-only changes**

`git diff origin/main...HEAD -- packages/arbor/ packages/agent-service/` shows only README.md changes (bundle size metadata line added to each). No src/ changes. The spec permits non-src changes in these packages since only "frozen" src is protected.

No changes to `packages/arbor/src/` or `packages/agent-service/src/`. PASS.

### Over-scope check C: Magna does not depend on auth
**PASS — no violation**

`packages/magna/package.json` `dependencies` contains no `@aihu/auth` entry.

### Over-scope check D: Magna src does not import from auth
**PASS — no violation**

`grep -r "@aihu/auth" packages/magna/src/` returns one result in `packages/magna/src/types.ts`: a string literal inside a JSDoc/type comment (`'@aihu/auth ScopeSignal layer reads cookie → getToken returns live value'`). This is a documentation string describing the integration pattern, not an import statement. No actual `import` from `@aihu/auth` exists in any magna source file.

### Over-scope check E: No seo/scraping size-limit rows
**PASS — no violation**

`.size-limit.json` contains no entry with `name: '@aihu/seo'` or `name: '@aihu/scraping'`.

### Over-scope check F: node:fs in browser bundle
**FLAG — ADVISORY**

`grep -c 'node:fs' packages/magna/dist/index.js` → **1** (one occurrence).

The dist contains a static `import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"` at the top of the bundle. The rolldown config correctly marks `node:fs` as external (`external: ['node:fs', 'node:path']`), so it appears as an external import declaration rather than inlined code.

The size script emits warnings:
```
[UNRESOLVED_IMPORT] Warning: Could not resolve 'node:fs'
 - Module not found, treating it as an external dependency
```

Analysis:
- `beforeCompile` (build-time only) and `warnings.ts` use `node:fs`. These are exported from `src/index.ts`, which means the `node:fs` import cannot be tree-shaken from the single-bundle output.
- `check:runtime-purity` does NOT enumerate `packages/magna/dist/index.js` in its checked entries — magna is not in the browser-edge tier for that guard.
- A browser consumer that imports `@aihu/magna` directly (e.g., `import { createMagnaFetch } from '@aihu/magna'`) would encounter a static `node:fs` import, which would fail at runtime in a browser unless their bundler externalizes or stubs it.

**Mitigation path:** Split the build into two entry points — `dist/runtime.js` (browser-safe: fetch, resource, subscription) and `dist/codegen.js` (node-only: beforeCompile). This would allow browser consumers to import from `@aihu/magna/runtime` without hitting `node:fs`. This is a Builder-time decision for a follow-up iteration.

**Current status:** The `check:runtime-purity` script passes and no CI gate fails. The issue is a latent consumer-facing concern, not a build-time blocker. Flagged for Team Lead awareness.

---

## Do-Not-Break Check Results

### Auth tests
**PASS**

`bunx vitest run packages/auth/tests/` → 33 tests pass. (Auth package has no `test` script; tests run directly via vitest.)

### plugin-data untouched
**PASS**

`git diff origin/main...HEAD -- packages/plugin-data/src/` produces no output. Only `packages/plugin-data/README.md` was modified (bundle size metadata line added). No src changes.

### check:runtime-purity
**PASS**

All 3 checked entries (server/dist/index.js, app/dist/client.js, app/dist/index.js) are clean. Exit 0.

---

## Builder-Time Decisions Confirmed

### Cache-key strategy
The Builder chose **alphabetically-sorted JSON.stringify** for cache key construction (`stableSerialise` in `resource.ts`). Variables `{ b: 2, a: 1 }` and `{ a: 1, b: 2 }` produce the same key, preventing spurious cache misses. This is ~15 LOC, dep-free, and deterministic. Confirmed correct in implementation.

### Degraded boolean
`useMagnaSubscription` returns `degraded: true` as a constant (`readonly` property). Consumers can branch on this flag. The `close()` is an idempotent no-op. Confirmed correct.

---

## Items to Surface to Team Lead

1. **Over-scope check F (node:fs in dist):** The single-bundle output leaks `node:fs` as a static external import. While this does not break any current CI gate, it creates a latent consumer issue for browser-only imports. Recommend a follow-up Builder iteration to split the bundle into `runtime` (browser-safe) and `codegen` (node-only) entry points, with a matching `.size-limit.json` update.

2. **M09 test coverage gap:** The schema-not-found path through `beforeCompile` is not directly exercised because `@aihu/magna-gqlmin` is not installed in the workspace. The test works around this by calling `writeWarnOnce`/`setBuildFlag` directly, which validates the mechanism but not the integration. Future iterations should add `@aihu/magna-gqlmin` as a devDependency for testing or mock the dynamic import.

3. **check:size-rows inconsistency across worktrees:** The `bun run check:size-rows` script result varies depending on which worktree it's run from due to differing workspace state. All results reported here are from the canonical `/tmp/aihu-verify-magna` worktree (the magna-skeleton branch). The policy holds (exit 0) in that context.

---

## STATUS: PASS

All 16 sample tests pass. All 15 acceptance samples pass (M09 noted as partial due to integration test gap). No over-scope violations to code. One advisory flag on node:fs in the browser-eligible dist (not a CI blocker). Do-not-break checks pass.

---

## Summary Table

| Sample | Result | Notes |
|--------|--------|-------|
| M01 | PASS | Build exits 0, dist/index.js exists |
| M02 | PASS | All 5 runtime + 6 type exports confirmed |
| M03 | PASS | Only @aihu/* and @aihu-plugin/* deps |
| M04 | PASS | Authorization: Bearer header added when token non-null |
| M05 | PASS | No authorization header when getToken returns null |
| M06 | PASS | Envelope shape correct, network errors thrown |
| M07 | PASS | Imports createResource from @aihu-plugin/data, state present |
| M08 | PASS | Does not throw, writes gqlmin warning, sets untyped=true |
| M09 | PARTIAL-PASS | Mechanism tested; integration path untestable without gqlmin |
| M10 | PASS | Warn-once coalescing confirmed in source and test |
| M11 | PASS | 1.61 kB / 1.8 KB (191 B headroom) |
| M12 | PASS | 1.36 kB / 1.5 KB (147 B headroom) |
| M13 | PASS | degraded: true, state signal, close() idempotent |
| M14 | PASS | All 4 manifest assertions hold |
| M15 | PASS | Changeset exists, @aihu/magna: minor, @aihu/auth: patch, prose present |

| Audit | Result |
|-------|--------|
| Over-scope A (auth src) | PASS — no changes |
| Over-scope B (arbor/agent-service src) | PASS — README-only |
| Over-scope C (magna deps @aihu/auth) | PASS — not present |
| Over-scope D (magna src imports auth) | PASS — only doc comment string |
| Over-scope E (seo/scraping size rows) | PASS — not present |
| Over-scope F (node:fs in browser dist) | ADVISORY — node:fs present as external import |

| Do-Not-Break | Result |
|-------------|--------|
| Auth tests | PASS (33/33) |
| plugin-data untouched (src) | PASS |
| check:runtime-purity | PASS |
