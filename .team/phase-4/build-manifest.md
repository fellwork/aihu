# Phase 4 build manifest — `@aihu/runtime`

**Builder:** Phase 4 Builder (this session, 2026-04-30)
**Branch:** `phase-4/runtime-implementation`
**Spec:** `.team/phase-4/spec-runtime.md` (Final, 2026-04-26)

---

## Task summary

| Task | Description | SHA | Status |
|---|---|---|---|
| 20 | Scaffold `@aihu/runtime` package | `3aa20d8` | DONE |
| 21a | Implement `defineElement` + 10 unit tests | `39b962f` | DONE |
| 21b | Add `defineComponent` + 4 unit tests | `636857a` | DONE |
| 22 | Integration tests (runtime + arbor + signals) | `58ad0c4` | DONE |
| Build manifest + biome fixes | Lint + manifest | (this commit) | DONE |

Per Learning #19 (Pattern B + per-task atomic commits) and Learning #20
(SHA-backfill instead of amend). No `--amend` or rebase used.

---

## Files changed

### Task 20 (`3aa20d8`)

| File | Action |
|---|---|
| `packages/runtime/package.json` | create — peerDeps on arbor + signals |
| `packages/runtime/tsconfig.json` | create — extends base, explicit DOM lib |
| `packages/runtime/moon.yml` | create — `layer: library` (Moon 2.x) |
| `packages/runtime/rolldown.config.ts` | create — `external: [@aihu/arbor, @aihu/signals]`, `minify: true` |
| `packages/runtime/src/index.ts` | create — empty stub |
| `packages/runtime/src/types.ts` | create — `ShadowMode`, `DefineOptions`, `RuntimeError` (internal) |
| `packages/runtime/src/define-element.ts` | create — stub throwing `'not implemented'` |
| `bun.lock` | refresh — register new workspace pkg |

### Task 21a (`39b962f`)

| File | Action |
|---|---|
| `packages/runtime/src/define-element.ts` | implement — `wrapClass`, `defineElement`, `SHADOW_ROOT_SYM` |
| `packages/runtime/src/index.ts` | export `defineElement` + types |
| `packages/runtime/tests/define-element.test.ts` | create — 10 unit tests |
| `.size-limit.json` | add `@aihu/runtime` row at 1024 B |

### Task 21b (`636857a`)

| File | Action |
|---|---|
| `packages/runtime/src/define-component.ts` | create — `defineComponent`, `_setMount` |
| `packages/runtime/src/types.ts` | add `SetupContext`, `Setup`, `MountFn`; type-only import of `Branch`/`Leaf`/`MountScope` from `@aihu/arbor` |
| `packages/runtime/src/index.ts` | re-export `defineComponent`, `Setup`, `SetupContext` |
| `packages/runtime/tests/define-component.test.ts` | create — 4 unit tests |

### Task 22 (`58ad0c4`)

| File | Action |
|---|---|
| `tests/integration/define-element-integration.test.ts` | create — 2 cross-package tests |
| `tests/vitest.config.ts` | add `@aihu/runtime` alias (was already present at root vitest.config.ts) |

### Build-manifest commit (this)

| File | Action |
|---|---|
| `.team/phase-4/build-manifest.md` | create |
| `packages/runtime/tests/define-element.test.ts` | biome whitespace reformat |
| `tests/integration/define-element-integration.test.ts` | biome import-order + `?.` over `!.` |
| `packages/runtime/package.json` | biome whitespace reformat |

---

## Test counts

| Suite | Tests | Notes |
|---|---|---|
| `packages/runtime/tests/define-element.test.ts` | 10 | Task 21a — JSDOM unit |
| `packages/runtime/tests/define-component.test.ts` | 4 | Task 21b — JSDOM unit |
| `tests/integration/define-element-integration.test.ts` | 2 | Task 22 — cross-package |
| **Phase 4 runtime tests** | **16** | |
| Full unit suite (signals + arbor + bench + runtime) | 124 | green |
| Full integration suite | 3 | (incl. 1 pre-existing) |

---

## Final size numbers

`bun run size` (post-build, all packages minified + gzipped):

| Package | Size | Limit | Headroom |
|---|---|---|---|
| `@aihu/signals` | 1.55 kB | 1.6 kB | 49 B |
| `@aihu/arbor` | 1.28 kB | 2.05 kB | 766 B |
| **`@aihu/runtime`** | **438 B** | **1.02 kB** | **586 B** |

Runtime is well under both the 600 B target and 1024 B budget.

Per Learning #22 (real bundle, not hypothesis): each task that touched
runtime source ran `bunx moon run runtime:build` followed by
`bun run size` to record empirical bytes. Telemetry-treeshake-style
surprises did not occur — runtime has no telemetry hooks (zero source
imports from arbor or signals; nothing to inline).

---

## Spec compliance — public API

End-of-Phase-4 exports from `@aihu/runtime`:

| Spec §1 | Symbol | Kind | Implemented at |
|---|---|---|---|
| §1.2 | `defineElement` | value | `src/define-element.ts:75` |
| §1.2 | `DefineOptions` | type | `src/types.ts:33` |
| §1.2 | `ShadowMode` | type | `src/types.ts:31` |
| §1.5 | `defineComponent` | value | `src/define-component.ts:79` |
| §1.5 | `Setup` | type | `src/types.ts:54` |
| §1.5 | `SetupContext` | type | `src/types.ts:48` |

`RuntimeError` correctly excluded from `index.ts` per spec §1.3 /
Decision 2B.

---

## Deviations from spec

### Deviation A — `defineComponent` ships in v0 (ratified)

Per builder brief: user ratified spec §1.5's "ship in v0"
recommendation. Implemented in `src/define-component.ts` (extracted
from `define-element.ts` per Learning #13's 150-line module rule).

### Deviation B — `defineComponent` requires explicit `_setMount(mount)` wiring

Spec §1.5 sketches `defineComponent(setup)` with no wiring step. Spec
§2.4 forbids source-level value imports from `@aihu/arbor`. The
brief explicitly authorized either (a) dynamic `import('@aihu/arbor')`
inside `connectedCallback` or (b) `mount` injected as a helper.

I chose **(b) module-level setter `_setMount(mount)`** because:
- Keeps `connectedCallback` synchronous (no async-lifecycle hazard
  where `el.remove()` could race the dynamic-import promise).
- Strict §2.4 compliance — zero source-level value imports from
  `@aihu/arbor`. The dist contains no static `import` statement
  resolving to arbor.
- 1 KB budget: 438 B gz with both `defineElement` and `defineComponent`,
  586 B headroom.

Cost: one line of friction at app boot:

```ts
import { mount } from '@aihu/arbor'
import { _setMount } from '@aihu/runtime'
_setMount(mount)
```

`_setMount` is `@internal` and not in `index.ts`. Consumers import it
from the source module directly (documented in the file header). v0+1
may flip this to a static import once the structural rule is reviewed
under more headroom; the public `defineComponent` shape would not
change.

A new error code `SCR-R0002` fires if `_setMount` has not been called
before the first `defineComponent` element connects. The `RuntimeError`
class remains internal per §1.3.

### Deviation C — `tsconfig.json` `rootDir` is `.` (matches arbor's tsconfig)

Spec §3.3 specifies `rootDir: "src"`. I used `rootDir: "."` to match
the shipped Phase 3 `packages/arbor/tsconfig.json` so `tests/**/*.ts`
resolves correctly under `noEmit: true` typecheck. Both `src/**/*.ts`
and `tests/**/*.ts` are in `include`. With `rootDir: "src"` typecheck
refused to consider files outside `src/`, breaking test compilation.
This is the same shape Phase 3 settled on. No public surface change.

### Deviation D — `_setMount` exported alongside `defineComponent`

Although §1 says 3 public exports, the realized count is 5 values+types
in `index.ts` (defineElement, defineComponent, DefineOptions, ShadowMode,
Setup, SetupContext). `_setMount` is internal, not in `index.ts` —
consumers reach it via `'@aihu/runtime/src/define-component.ts'`
directly. This is the documented Phase 3 internal-export pattern
(arbor's `_setMountObserver` follows the same model).

### State assertions confirmed (Learning #6 freshness check)

- `.prototools` already at `node = "22.12.0"` — spec §3.7 stale; no
  action.
- `.github/workflows/plan-a.yml` triggers commented out for v0 (post-
  Phase-3 director note). Spec §3.6's branch-glob fix is moot until
  v1 re-enables CI. No action.
- Root `vitest.config.ts` already has `@aihu/runtime` alias — no
  action.
- Integration `tests/vitest.config.ts` did NOT have it — added in Task
  22's commit.
- Phase 3 shipped arbor with `mount(node, host: Element | ShadowRoot)`
  — Spec §7 Q1 confirmed: integration test 1 passes with
  `el.shadowRoot` as host.

---

## Hard stops not triggered

- JSDOM `attachShadow` works as expected (test 3, 4, 9 pass — open
  mode shadow roots are real `ShadowRoot` instances).
- `defineComponent` shipped without breaching §2.4 (setter-injection
  pattern — no static value import of arbor).
- Runtime size never exceeded 800 B (caution) or 1024 B (budget). No
  builder-blocker filed.
- All §7 Q1–Q10 assumptions held against shipped arbor surface (Q1
  via integration test 1; Q4 via `MountScope.dispose()` call sites in
  `define-component.ts` line 95; Q5 via synchronous `disconnectedCallback`
  paths).

---

## Final gate sweep (clean state)

Per Learning #5 amendment (clean-state run for any gate whose inputs
include build outputs):

```
rm -rf packages/runtime/dist
bun run typecheck   # exit 0 — runtime:typecheck rebuilds upstream dists via ^:build
bun run build       # exit 0 — 4 packages, all cached after first run
bun run test        # exit 0 — 124 unit tests
bun run test:integration   # exit 0 — 3 integration tests
bun run size        # exit 0 — all 3 packages green
bunx biome ci .     # exit 0 — 0 errors, 7 pre-existing/style warnings
```

All gates green at `(this commit)`.
