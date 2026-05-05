# State — Track B (Context + Data)

**Track:** `track-b`
**Last updated:** 2026-04-30 (Round 4)
**HEAD at session close:** `acd56fe`
**Active branch:** `main` (Plan 2.2 merged)
**Mode:** 3 (Plans 2.1 and 2.2 COMPLETE; next step: integration testing or Plan 2.3)

---

## Current phase

**Phase 3 — Plan 2.2 COMPLETE; integration path or Plan 2.3 to be defined**

Sequence (completed): OQ-V3 adjudication ✓ → Scout ✓ → Director Round 2 ✓ → Architect spec ✓ → Builder 2.1 ✓ → Architect spec 2.2 ✓ → Builder 2.2 ✓ → Verifier 2.2 ✓

---

## Plans in scope

| Plan | Package | Status |
|------|---------|--------|
| 2.1  | `@aihu/context` | COMPLETE (main `8223dbb`) |
| 2.2  | `@aihu/data`    | COMPLETE (main `8e74a95`) |

---

## Round summary

| Round | Plan | Role   | Status  |
|-------|------|--------|---------|
| 1     | —    | Director | COMPLETE |
| 1     | —    | Scout    | COMPLETE (`scout-report-track-b.md`) |
| 2     | 2.1  | Director | COMPLETE (`director-notes/track-b-round-002.md`) |
| 2     | 2.1  | Architect | COMPLETE (`spec-2.1-context.md`) |
| 2     | 2.1  | Builder  | COMPLETE (main `8223dbb`) — fixup `3e93838` on `feat/v1-context-data` |
| 2     | 2.1  | Verifier | COMPLETE (`verification-report-2.1.md`) |
| 3     | 2.2  | Architect | COMPLETE (`spec-2.2-data.md`, `7244747`) |
| 3     | 2.2  | Builder  | COMPLETE (main `8e74a95`) — 24 tests, 687 B gz, all 9 AC PASS first try |
| 3     | 2.2  | Verifier | COMPLETE (`verification-report-2.2.md`) — PASS |

---

## OQ resolution status

| OQ    | Question | Ratified decision | Status |
|-------|----------|-------------------|--------|
| OQ-V3 | Context propagation mechanism | Render-scoped context map via `SsrOptions.contextMap`; browser uses module-level `_activeContextMap` slot; `setSsrContextMap` for SSR. Ratified by Track D Architect. | **CLOSED** |
| OQ-V4 | `createResource` cache — module-level singleton vs. context-provided | Context-provided store. Cache key is reactive `Signal<string \| null \| undefined>` as first arg to `createResource`. Ratified by Track D Architect. | **CLOSED** |
| OQ-V6 | SSR dehydration — opt-in vs. automatic | Opt-in per resource (`{ dehydrate: true }` in `ResourceOptions`). JSON shape: `{ "resources": { "<key>": DataState } }`. Ratified by Track D Architect. | **CLOSED** |

---

## Spec gaps status

### For 2.1 (@aihu/context) — ALL RESOLVED (see director-notes/track-b-round-002.md §3)
- `ContextToken<T>`: opaque object with `_id: symbol` + `_default: T | undefined` ✓
- `provide()` call site: synchronous during component setup ✓
- `inject()`: synchronous, returns `T | undefined`; returns default if given ✓
- Error behavior: returns `undefined` (no throw by default) ✓
- Multiple providers: shadow / innermost wins ✓

### For 2.2 (@aihu/data) — ALL RESOLVED (see director-notes/track-b-round-002.md §4)
- `createResource` return type: `DataSource<T>` with `.state`, `.refetch()`, `.invalidate()` ✓
- `DataState<T>`: five-state discriminated union (idle | loading | ready | error | streaming) ✓
- Cache key: reactive `Signal<string | null | undefined>` as first arg ✓
- Fetcher signature: `(key: string) => Promise<T>` ✓
- Dehydration JSON: `{ "resources": { "<key>": DataState } }` ✓

---

## New package infra checklist (both packages)

For each of `packages/context/` and `packages/data/`, a Builder must create:

- [ ] `package.json` (follows `@aihu/signals` / `@aihu/arbor` pattern)
- [ ] `tsconfig.json` (extends `../../tsconfig.base.json`)
- [ ] `rolldown.config.ts` (ESM + `dts()` + `minify: true`)
- [ ] `moon.yml` (`language: typescript`, `layer: library`)
- [ ] `src/index.ts` (public barrel)
- [ ] `tests/` (directory)
- [ ] Add alias to root `vitest.config.ts`
- [ ] Add size-limit entry (consult `bun run size` config location — Scout to confirm)

---

## Do-not-break list

The following are read-only from Track B's perspective:

| Package / File | Reason |
|---|---|
| `packages/signals/src/` | Core reactive primitive; Track B depends on it |
| `packages/arbor/src/` | Mount lifecycle; Track B must propagate through it, not change it |
| `packages/server/src/ssr.ts` | SSR dehydration integration point; Track B reads `SsrOptions.serializer` — no changes needed |
| `packages/server/src/data.ts` | Existing `defineLoader` — Track B's `createResource` must be naming-compatible but does not modify this file |
| `packages/runtime/src/` | Component lifecycle; no changes needed |
| `packages/agent-readiness/src/` | Unrelated; untouched |
| `packages/compiler/` | Rust track; unrelated |
| `.team/compiler/` | Compiler track state; untouched |
| `vitest.config.ts` | Two new alias entries added (only); no other changes |
| Root `package.json` | Size-limit entry added for each new package; no other changes |
| `bun.lock` | Updated automatically by `bun install` after new packages added |

---

## Key artifacts

| Artifact | Path | Status |
|----------|------|--------|
| Director note round 1 | `.team/v1/director-notes/track-b-round-001.md` | COMPLETE |
| Director note round 2 | `.team/v1/director-notes/track-b-round-002.md` | COMPLETE |
| v1 architecture spec | `.team/v1/spec-v1-architecture.md` | COMPLETE (authored) |
| v1 architecture spec (ratified) | `.team/v1/spec-v1-architecture-ratified.md` | COMPLETE (Track D ratified) |
| v1 roadmap | `.team/v1/plan-v1-roadmap.md` | COMPLETE (authored) |
| Scout report | `.team/v1/scout-report-track-b.md` | COMPLETE |
| Architect spec 2.1 | `.team/v1/spec-2.1-context.md` | COMPLETE |
| Architect spec 2.2 | `.team/v1/spec-2.2-data.md` | COMPLETE (`7244747`; naming-collision fix `f7a25c4`) |
| Build manifest 2.1 | `.team/v1/build-manifest-2.1.md` | COMPLETE |
| Verification report 2.1 | `.team/v1/verification-report-2.1.md` | COMPLETE |
| Build manifest 2.2 | `.team/v1/build-manifest-2.2.md` | COMPLETE |
| Verification report 2.2 | `.team/v1/verification-report-2.2.md` | COMPLETE — PASS (all 9 AC) |
| State file | `.team/v1/state-track-b.md` | THIS FILE |

---

## Next actions

1. **Integration test — `@aihu/data` + `@aihu/context` SSR path** — OPTIONAL but recommended before v1 ship. Verify that `createResource` dehydration and `ResourceStore` serialize correctly through `renderToString`/`renderToStream` with a live context map. No spec exists for this yet; Director to scope if needed.
2. **Plan 2.3** — not yet defined. If scope expands (e.g., derived resources, cache invalidation policies, server-side streaming of resource state), Director will open a Round 4 note.
3. **Monitor arbor bundle size** — `@aihu/data` does not bundle signals, but if Track B ever adds a signals dependency, the same bundling-spillover pattern that hit arbor in Session 003 applies. Keep it external.

### Do-not-break list update
`packages/server/src/ssr.ts` now receives **additive** changes (two new optional fields in `SsrOptions`) as part of Plan 2.1 scope. It is no longer strictly read-only for Track B.

`packages/data/src/` is now a new read-only package from other tracks' perspective. Do not modify it outside Track B builder passes.
