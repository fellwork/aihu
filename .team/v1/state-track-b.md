# State — Track B (Context + Data)

**Track:** `track-b`
**Last updated:** 2026-04-30 (Round 2)
**HEAD at session start:** `79e86a6` on `feat/agent-readiness-phase0`
**Active branch:** `feat/v1-context` (to create — Architect is now authorized)
**Mode:** 1 (Architect active — Plan 2.1)

---

## Current phase

**Phase 1 — Architect active (Plan 2.1)**

Sequence (completed): OQ-V3 adjudication ✓ → Scout ✓ → Director Round 2 ✓ → **Architect spec** → Builder 2.1 → Builder 2.2

---

## Plans in scope

| Plan | Package | Status |
|------|---------|--------|
| 2.1  | `@scribe/context` | ARCHITECT ACTIVE — spec-2.1-context.md to be written |
| 2.2  | `@scribe/data`    | SPEC DESIGN AUTHORIZED — Builder blocked on Plan 2.1 merge |

---

## Round summary

| Round | Plan | Role   | Status  |
|-------|------|--------|---------|
| 1     | —    | Director | COMPLETE |
| 1     | —    | Scout    | COMPLETE (`scout-report-track-b.md`) |
| 2     | 2.1  | Director | COMPLETE (`director-notes/track-b-round-002.md`) |

---

## OQ resolution status

| OQ    | Question | Ratified decision | Status |
|-------|----------|-------------------|--------|
| OQ-V3 | Context propagation mechanism | Render-scoped context map via `SsrOptions.contextMap`; browser uses module-level `_activeContextMap` slot; `setSsrContextMap` for SSR. Ratified by Track D Architect. | **CLOSED** |
| OQ-V4 | `createResource` cache — module-level singleton vs. context-provided | Context-provided store. Cache key is reactive `Signal<string \| null \| undefined>` as first arg to `createResource`. Ratified by Track D Architect. | **CLOSED** |
| OQ-V6 | SSR dehydration — opt-in vs. automatic | Opt-in per resource (`{ dehydrate: true }` in `ResourceOptions`). JSON shape: `{ "resources": { "<key>": DataState } }`. Ratified by Track D Architect. | **CLOSED** |

---

## Spec gaps status

### For 2.1 (@scribe/context) — ALL RESOLVED (see director-notes/track-b-round-002.md §3)
- `ContextToken<T>`: opaque object with `_id: symbol` + `_default: T | undefined` ✓
- `provide()` call site: synchronous during component setup ✓
- `inject()`: synchronous, returns `T | undefined`; returns default if given ✓
- Error behavior: returns `undefined` (no throw by default) ✓
- Multiple providers: shadow / innermost wins ✓

### For 2.2 (@scribe/data) — ALL RESOLVED (see director-notes/track-b-round-002.md §4)
- `createResource` return type: `DataSource<T>` with `.state`, `.refetch()`, `.invalidate()` ✓
- `DataState<T>`: five-state discriminated union (idle | loading | ready | error | streaming) ✓
- Cache key: reactive `Signal<string | null | undefined>` as first arg ✓
- Fetcher signature: `(key: string) => Promise<T>` ✓
- Dehydration JSON: `{ "resources": { "<key>": DataState } }` ✓

---

## New package infra checklist (both packages)

For each of `packages/context/` and `packages/data/`, a Builder must create:

- [ ] `package.json` (follows `@scribe/signals` / `@scribe/arbor` pattern)
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
| Architect spec 2.1 | `.team/v1/spec-2.1-context.md` | **PENDING (Architect active)** |
| Architect spec 2.2 | `.team/v1/spec-2.2-data.md` | PENDING (can start now; Builder blocked on 2.1) |
| Build manifest 2.1 | `.team/v1/build-manifest-2.1.md` | NOT STARTED — after spec-2.1 |
| Build manifest 2.2 | `.team/v1/build-manifest-2.2.md` | NOT STARTED — after 2.1 merge |
| State file | `.team/v1/state-track-b.md` | THIS FILE |

---

## Next actions

1. **Architect** — write `.team/v1/spec-2.1-context.md` per director-notes/track-b-round-002.md §5 (UNBLOCKED — GO)
2. **Architect (parallel)** — write `.team/v1/spec-2.2-data.md` per director-notes/track-b-round-002.md §4 (UNBLOCKED for spec-writing; Builder dispatch after 2.1 merge)
3. **Builder** — after `spec-2.1-context.md` approved: scaffold `packages/context/` on `feat/v1-context`
4. **Director (Round 3)** — review 2.1 PR when ready
5. **Builder** — after 2.1 merged: scaffold `packages/data/` on `feat/v1-data`

### Do-not-break list update
`packages/server/src/ssr.ts` now receives **additive** changes (two new optional fields in `SsrOptions`) as part of Plan 2.1 scope. It is no longer strictly read-only for Track B.
