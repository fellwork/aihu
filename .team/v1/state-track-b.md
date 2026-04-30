# State — Track B (Context + Data)

**Track:** `track-b`
**Last updated:** 2026-04-30
**HEAD at session start:** `79e86a6` on `feat/agent-readiness-phase0`
**Active branch:** `feat/v1-context-data` (not yet created — awaiting OQ-V3 adjudication)
**Mode:** 0 (Awaiting Architect / adjudication)

---

## Current phase

**Phase 0 — Blocked on OQ-V3 adjudication**

Sequence: OQ-V3 adjudication → **Architect spec** → Scout → Builder 2.1 → Builder 2.2

---

## Plans in scope

| Plan | Package | Status |
|------|---------|--------|
| 2.1  | `@scribe/context` | NOT STARTED — blocked on OQ-V3 |
| 2.2  | `@scribe/data`    | NOT STARTED — blocked on Plan 2.1 + OQ-V4 clarification |

---

## Round summary

| Round | Plan | Role   | Status  |
|-------|------|--------|---------|
| 1     | —    | Director | COMPLETE (this file) |

---

## OQ resolution status

| OQ    | Question | Spec recommendation | Director assessment | Status |
|-------|----------|--------------------|--------------------|--------|
| OQ-V3 | Context propagation mechanism — DOM traversal vs. registry | DOM attribute traversal | INSUFFICIENT — DOM traversal breaks SSR. Three options exist; Team Lead must adjudicate whether SSR+context is in v1 scope before Architect can write spec. | **OPEN — BLOCKING** |
| OQ-V4 | `createResource` cache — module-level singleton vs. context-provided | Context-provided | SUFFICIENT to build against. Minor clarification needed: cache key type should be explicit `key: string` on `ResourceOptions<T>` to enable dehydration. Architect must specify in 2.2 spec. | **OPEN — NON-BLOCKING for 2.1** |
| OQ-V6 | SSR dehydration — opt-in `{ ssr: true }` vs. automatic | Opt-in | SUFFICIENT. The `SsrOptions.serializer` hook in `ssr.ts` already handles injection; 2.2 just needs a `dehydrate()` method on the store. Architect must specify the JSON shape inside `__scribe_state__`. | **OPEN — NON-BLOCKING for 2.1** |

---

## Spec gaps requiring Architect resolution before Builder starts

### For 2.1 (@scribe/context) — all blocked on OQ-V3
- `ContextToken<T>` type definition (string key vs. symbol vs. opaque object — depends on propagation mechanism)
- `provide()` call site and lifecycle (inside setup fn? Before mount? As Node wrapper?)
- `inject()` availability and return type (synchronous? Returns `T | undefined`? Requires default at `createContext` time?)
- Error behavior for `inject()` with no matching provider
- Multiple nested providers for the same token — shadow (innermost wins) or merge

### For 2.2 (@scribe/data) — blocked on 2.1 completion + OQ-V4 clarification
- `createResource` return type (Signal? Object with refetch? Reactive accessor?)
- `DataState<T>` state machine transitions (pending → resolved → error; refreshing state?)
- Cache key type (`key: string` on `ResourceOptions<T>`)
- Fetcher function signature (`() => Promise<T>` or `(key: string) => Promise<T>`)
- Dehydration JSON shape inside `__scribe_state__` script tag

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
| v1 architecture spec | `.team/v1/spec-v1-architecture.md` | NOT STARTED |
| v1 roadmap (plans 2.1, 2.2) | `.team/v1/plan-v1-roadmap.md` | NOT STARTED |
| Scout report | `.team/v1/scout-report-track-b.md` | NOT STARTED |
| Build manifest 2.1 | `.team/v1/build-manifest-2.1.md` | NOT STARTED |
| Build manifest 2.2 | `.team/v1/build-manifest-2.2.md` | NOT STARTED |
| State file | `.team/v1/state-track-b.md` | THIS FILE |

---

## Next actions

1. **Team Lead** — adjudicate OQ-V3: Is SSR + context injection required in v1? (Decision unblocks everything downstream)
2. **Scout** — run brief from director note §5; confirm `defineLoader` shape in `packages/server/src/data.ts`, confirm `mount()` options, confirm size-limit config location. Can dispatch immediately.
3. **Architect** — after OQ-V3 adjudication: write `spec-v1-architecture.md` §7 (`@scribe/context`) and §6 (`@scribe/data`) encoding all spec gaps listed above
4. **Builder** — after Architect spec: scaffold `packages/context/` and implement plan 2.1 on `feat/v1-context-data`
5. **Builder** — after 2.1 merged and OQ-V4/V6 clarified: scaffold `packages/data/` and implement plan 2.2
