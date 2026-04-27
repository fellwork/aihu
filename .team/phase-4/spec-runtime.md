# Spec — `@scribe/runtime` (Phase 4)

**Author:** Architect B
**Date:** 2026-04-26
**Branch:** spec/phases-3-4-5
**Status:** Final — Builder may consume.

This spec is binding. Where it deviates from the plan, the plan is overridden under Decision 2B authority. Where it deviates from the v0 spec, that is called out explicitly in §6.

References:
- Spec: `docs/superpowers/specs/2026-04-23-scribe-v0-vertical-slice-design.md` (`spec` below)
- Plan: `docs/superpowers/plans/2026-04-24-scribe-v0-plan-a-ts-runtime.md` (`plan` below)
- Signals API: `packages/signals/dist/index.d.ts` (shipped, locked)
- Arbor surface anchor: v0 spec §6 (Architect A's in-flight `spec-arbor.md` is NOT read — concurrent constraint)
- Format reference: `.team/phase-2/spec-signals.md`

**Plan staleness (Learning #6, mandatory flag):** Tasks 20–22 covering Phase 4 are NOT present in the plan document. The plan file ends at line 1647 with "Phases 3–6 follow in the next document edits" — these sections were never authored. This spec is the sole authoritative source for Phase 4 scope. The plan must be updated with task stubs for tasks 20–22 in the same commit that delivers this spec. See §6 Deviation 1.

---

## 1. Public API surface

End-of-Phase-4 exports from `@scribe/runtime` (re-exported through `packages/runtime/src/index.ts`):

| Kind | Symbol |
|---|---|
| value | `defineElement` |
| type | `DefineOptions`, `ShadowMode` |

**3 total exports.** `RuntimeError` is intentionally not re-exported (see §1.3). Internal helpers are `/** @internal */`.

### 1.1 Interpretation of v0 spec §7.2 — compiler call shape

v0 spec §7.2 states the compiler emits, at module level:

```js
defineElement('hello-scribe', HelloScribe)
```

where `HelloScribe` is a `class HelloScribe extends HTMLElement` the compiler already fully defined, with `connectedCallback`, `disconnectedCallback`, `static observedAttributes`, `attributeChangedCallback`, and a `_build()` method producing the arbor tree.

`defineElement` is therefore a **registration shim**, not a class factory. It receives an already-authored class. Its responsibilities:

1. Inject shadow-root attachment into the class constructor (so `this.shadowRoot` is available when the compiler-emitted `connectedCallback` calls `mount(tree, this.shadowRoot)`).
2. Propagate `static observedAttributes` through the prototype chain.
3. Guard against double-registration.
4. Call `customElements.define(name, WrappedClass)`.

This interpretation reconciles v0 spec §7.2 ("compiler emits the class with lifecycle callbacks") with v0 spec §7.6 ("runtime owns shadow-root handling"). The compiler never calls `attachShadow` — that is runtime's domain.

### 1.2 `defineElement`

```ts
export type ShadowMode = 'open' | 'closed' | 'none'

export interface DefineOptions {
  /**
   * Shadow DOM mode for the custom element.
   * - 'open'   → attachShadow({ mode: 'open' }). this.shadowRoot accessible
   *              externally. Default.
   * - 'closed' → attachShadow({ mode: 'closed' }). this.shadowRoot returns
   *              null externally. Runtime stores root on SHADOW_ROOT_SYM.
   *              v0 LIMITATION: compiler-emitted code reads this.shadowRoot,
   *              which returns null for closed roots. Fully functional in v1
   *              when compiler gains SHADOW_ROOT_SYM awareness.
   * - 'none'   → No shadow root. mount() is called with this (the element
   *              itself) as host. No style scoping.
   */
  shadowMode?: ShadowMode
}

export function defineElement(
  name: string,
  Ctor: typeof HTMLElement,
  options?: DefineOptions,
): void
```

**Semantics.** In order:

1. If `customElements.get(name) !== undefined` → throw `new RuntimeError('SCR-R0001', ...)` synchronously.
2. Build `WrappedCtor` via `wrapClass(Ctor, mode)` (see §2.2).
3. Call `customElements.define(name, WrappedCtor)`.
4. Return `void`.

`defineElement` does not call `mount()`. The compiler-emitted `connectedCallback` calls `mount()`. Runtime has zero import-time dependency on `@scribe/arbor`.

**Example (handwritten, pre-compiler):**
```ts
import { branch, leaf, mount } from '@scribe/arbor'
import { signal } from '@scribe/signals'
import { defineElement } from '@scribe/runtime'

class XCounter extends HTMLElement {
  #scope: ReturnType<typeof mount> | null = null
  connectedCallback() {
    const [count, setCount] = signal(0)
    const tree = branch('div', {}, [leaf(count)])
    this.#scope = mount(tree, this.shadowRoot!)
  }
  disconnectedCallback() {
    this.#scope?.dispose()
  }
}
defineElement('x-counter', XCounter)
```

### 1.3 `RuntimeError`

```ts
// @internal — not re-exported from index.ts
export class RuntimeError extends Error {
  override name = 'RuntimeError'
  readonly code: string
  constructor(code: string, message: string) {
    super(message)
    this.code = code
  }
}
```

v0 error codes:

| Code | Trigger |
|---|---|
| `SCR-R0001` | `defineElement` called with a name already registered in `customElements` |

**Decision 2B: `RuntimeError` is NOT re-exported from `index.ts`.** Rationale: the only throw site is a startup invariant violation (developer error), not a production-time catchable condition. Exporting the class would set a public API contract for error codes before they stabilize. Saves ~50 B gz. Revisit when devtools require `instanceof` discrimination.

### 1.4 v0 anti-goals (explicit scope boundary)

Refused by this package in v0:

- Slot support (v0 spec §4)
- Cross-component imports (v0 spec §4)
- SSR / hydration (v0 spec §4, sub-project #6)
- Scoped CSS injection beyond shadow root attachment
- AgentContext wiring (MountScope.agent is a stub in v0; runtime does not configure it)
- Functional `'closed'` shadow mode (see §6 Deviation 3)
- Transitions, animations, declarative shadow DOM

### 1.5 Forward-compatibility — `defineComponent(setup)` (Phase 3 spec session decision)

> **Phase 4 session note (added 2026-04-26 by Team Lead, post-Phase-3 spec session).** The Phase 3 spec-arbor session locked a **two-layer authoring model** (Learning #12): `defineElement(name, Ctor)` is for compiler-emitted code; `defineComponent(setup)` is the functional helper for hand-authored components. **`defineComponent(setup)` lives in `@scribe/runtime`** and is added in Phase 4 alongside `defineElement`.

**Phase 4 v0 decision required:** ship `defineComponent(setup)` in v0, or defer to v0+1?

**Recommendation: ship in v0.** Without `defineComponent`, hand-authoring a custom element requires `class extends HTMLElement` boilerplate inside test files and example apps — friction during the very phase when developer-experience feedback matters most. Builder cost: ~30 B gz, ~50 lines of source, 4 unit tests. Marginal addition to runtime's already-thin surface.

**Sketch (intent, not mandate — Phase 4 Architect's call):**

```ts
import type { Branch, Leaf } from '@scribe/arbor'

export interface SetupContext {
  readonly host: ShadowRoot | Element
  readonly element: HTMLElement
}

export type Setup = (ctx: SetupContext) => Branch | Leaf

export function defineComponent(setup: Setup): typeof HTMLElement
```

`defineComponent` returns a class consumable by `defineElement`. Internally, the returned class's `connectedCallback` calls `setup(ctx)` to get the tree, then `mount(tree, ctx.host)`. `disconnectedCallback` calls `scope.dispose()`. Hand-authored example:

```ts
const Counter = defineComponent(({ host }) => {
  const [count, setCount] = signal(0)
  return branch('div', {}, [
    leaf(count),
    branch('button', { onClick: () => setCount(n => n + 1) }, [leaf('+1')])
  ])
})
defineElement('x-counter', Counter)
```

Open question for Phase 4 Architect: should effects created during `setup()` auto-register with the resulting `MountScope`? Phase 3 spec §7 Q4 flags this. Defer to Phase 4 Architect's call.

**v0 commitment.** This section is documentation. The Phase 4 Architect (or follow-on Builder) decides whether `defineComponent` ships in v0 or deferred. Spec authors after this point should treat `defineComponent` as a near-certainty in v0.

---

## 2. Internal architecture

### 2.1 Module layout

```
packages/runtime/src/
  index.ts          — public export allowlist: defineElement, DefineOptions, ShadowMode
  define-element.ts — defineElement(), wrapClass(), SHADOW_ROOT_SYM
  types.ts          — ShadowMode, DefineOptions, RuntimeError (internal)
```

Exactly three source files. No `errors.ts` separate from `types.ts` — `RuntimeError` lives alongside its sibling types.

### 2.2 `wrapClass` — shadow-root injection

```ts
/** @internal */
const SHADOW_ROOT_SYM = Symbol('scribe.shadowRoot')

/** @internal */
function wrapClass(Ctor: typeof HTMLElement, mode: ShadowMode): typeof HTMLElement {
  class Wrapped extends Ctor {
    [SHADOW_ROOT_SYM]: ShadowRoot | null = null
    constructor() {
      super()
      if (mode !== 'none') {
        const attachMode = mode === 'closed' ? 'closed' : 'open'
        const root = this.attachShadow({ mode: attachMode })
        if (mode === 'closed') {
          this[SHADOW_ROOT_SYM] = root
        }
      }
    }
  }
  return Wrapped
}
```

`static observedAttributes` propagates through `class extends` prototype inheritance without an explicit copy — this is JavaScript class semantics. The Builder must verify this in JSDOM (test 4 in §4).

### 2.3 Double-registration guard

```ts
if (customElements.get(name) !== undefined) {
  throw new RuntimeError('SCR-R0001', `Custom element '${name}' is already defined`)
}
```

Runs before `wrapClass`. In HMR scenarios (Vite hot-module replacement), the Vite plugin is responsible for deregistering or replacing components before `defineElement` re-fires — runtime does not implement HMR logic. In v0 HMR is best-effort per v0 spec §7.3.

### 2.4 Dependency graph

```
@scribe/runtime source
  ↳ no imports from @scribe/arbor
  ↳ no imports from @scribe/signals
  ↳ browser DOM API only (HTMLElement, ShadowRoot, customElements)

@scribe/arbor  — peerDependency (type resolution for consumers, not bundled)
@scribe/signals — peerDependency (same reason)
```

Zero source-level cross-package imports. This is why the 1 KB budget is achievable. The peer dep declarations exist for `tsc --noEmit` on consuming code, not for bundling.

### 2.5 JSDOM compatibility

Vitest runs under JSDOM 24+ (root config `environment: 'jsdom'`). `customElements.define`, `customElements.get`, `Element.attachShadow`, and `HTMLElement` subclassing are all present in JSDOM 24. If `attachShadow` is a no-op stub in the installed version, the Builder files a builder-blocker note — do not silence with `vi.mock`.

### 2.6 `untrack` — not used in runtime

Per Team Lead Call 1, `untrack` exists in `@scribe/signals` as of Phase 3 prep. `wrapClass` and `defineElement` have no reactive reads — `attachShadow` is a plain DOM call in a constructor. No `untrack` import in runtime source.

---

## 3. Tooling

### 3.1 Moon project

`packages/runtime/moon.yml`:
```yaml
# yaml-language-server: $schema=https://moonrepo.dev/schemas/project.json
language: typescript
layer: library
```

Uses `layer: library` (not the Phase-1-era `type: library`). Inherits `build` and `typecheck` from `.moon/tasks.yml`.

### 3.2 `packages/runtime/package.json`

```json
{
  "name": "@scribe/runtime",
  "version": "0.0.0",
  "type": "module",
  "main": "./dist/index.js",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "files": ["dist"],
  "sideEffects": false,
  "peerDependencies": {
    "@scribe/arbor": "workspace:*",
    "@scribe/signals": "workspace:*"
  }
}
```

No `scripts` block — build/typecheck route through moon. No direct `dependencies`.

### 3.3 `packages/runtime/tsconfig.json`

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "noEmit": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"]
  },
  "include": ["src/**/*.ts", "tests/**/*.ts"]
}
```

`lib` is explicit here — runtime is the first package that directly uses DOM types in its own source (`HTMLElement`, `ShadowRoot`, `customElements`). The base config already includes `DOM` but an explicit per-package override documents the intent.

### 3.4 `packages/runtime/rolldown.config.ts`

```ts
import { defineConfig } from 'rolldown'
import { dts } from 'rolldown-plugin-dts'

export default defineConfig({
  input: 'src/index.ts',
  output: { dir: 'dist', format: 'esm', sourcemap: true },
  plugins: [dts()],
  external: ['@scribe/arbor', '@scribe/signals'],
})
```

`external` is required here — unlike signals and arbor (which have no cross-package imports), runtime's peer deps must not be accidentally bundled. Without `external`, rolldown would attempt to resolve `@scribe/arbor` at build time and fail (no source-level import exists in runtime, so this is precautionary).

### 3.5 `.size-limit.json` — add `@scribe/runtime` row (Task 21)

```json
{
  "name": "@scribe/runtime",
  "path": "packages/runtime/dist/index.js",
  "limit": "1024 B",
  "gzip": true
}
```

Budget: **1024 bytes gzipped** (v0 spec §6.6). Projection: ~250–400 B gz given that the implementation is one guard check, one `wrapClass` call, one `customElements.define` call, and a symbol. If implementation exceeds 600 B gz, profile before committing. `Combined runtime family` row deferred to Task 25 (Phase 6).

### 3.6 CI trigger fix — phase branches (mandatory, Task 20)

Phase 2 retro Finding 4 and Learning #5 both document that CI only triggers on `main`. Fix in Task 20 — first push on the phase branch — so every subsequent commit gets a signal.

Change to `.github/workflows/plan-a.yml`:

```yaml
on:
  push:
    branches:
      - main
      - 'spec/**'
      - 'plan-a-phase-*'
  pull_request:
    branches: [main]
```

`spec/**` covers the current branch. `plan-a-phase-*` covers future implementation branches.

### 3.7 `.prototools` Node version

Phase 2 builder-blockers flagged `node = "20.18.0"` as below Rolldown's 20.19+ requirement (not blocking then, still unresolved). Bump to `node = "20.19.0"` in Task 20. Not a blocker for writing this spec.

---

## 4. Test plan

TDD per task. Builder writes tests first, watches fail, implements minimum, commits.

### Task 20 — scaffold

Verification only. After scaffold:
- `moon run runtime:typecheck` exits 0 with stub `index.ts` (exports nothing yet — fine, `noEmit: true`).
- `bun run lint` exits 0.
- `bun run size` exits 0 (`@scribe/runtime` row not added yet; size-limit only errors when a row's path file is missing after the row exists).

### Task 21 — unit tests

File: `packages/runtime/tests/define-element.test.ts`. All run under JSDOM.

| # | Test | Assertion |
|---|---|---|
| 1 | `defineElement` registers name | `customElements.get('x-t1')` is non-null after call |
| 2 | `connectedCallback` fires on DOM attach | Spy on `connectedCallback`; `document.body.appendChild(el)` → spy called once |
| 3 | Shadow root attached in 'open' mode (default) | `el.shadowRoot` is `ShadowRoot` instance after attach |
| 4 | `static observedAttributes` preserved on wrapped class | `customElements.get('x-t4').observedAttributes` deep-equals source array |
| 5 | `attributeChangedCallback` fires on observed attribute set | `el.setAttribute('color', 'red')` → spy called with `('color', null, 'red')` |
| 6 | `disconnectedCallback` fires on DOM removal | `el.remove()` → spy called once |
| 7 | Double-registration throws with code `SCR-R0001` | Second `defineElement` call same name → thrown error has `.code === 'SCR-R0001'` |
| 8 | `shadowMode: 'none'` skips shadow root | `el.shadowRoot` is `null` after attach; no throw |
| 9 | Two separately-defined elements are independent | Each has its own shadow root; one's mutations don't affect the other |
| 10 (smoke) | `shadowMode: 'closed'` does not throw at registration time | `defineElement('x-closed', Ctor, {shadowMode:'closed'})` exits without error |

Tests 2–6 require `document.createElement('x-tN')` then `document.body.appendChild(el)`. Builder must clean up registered names between tests with a unique suffix per test or a global registry reset (JSDOM does not support `customElements.undefine` in v0 — use unique names per test to avoid SCR-R0001 false-positive).

### Task 22 — integration tests

File: `tests/integration/define-element-integration.test.ts`.

| # | Test | Assertion |
|---|---|---|
| 1 | Full mount: handwritten class using arbor `branch`/`leaf`/`mount` registered via `defineElement` — signal write updates DOM | After `signal.set(newVal)`, `element.shadowRoot.textContent` reflects new value |
| 2 | Dispose on disconnect: scope effects are disposed after `el.remove()` | Signal write after removal does NOT update DOM text; effect was torn down |

These are the first tests to exercise `@scribe/runtime` + `@scribe/arbor` + `@scribe/signals` together. They require `@scribe/arbor` to be shipped (Phase 3 complete). **Task 22 is blocked on Phase 3.** If phases run in sequence, Task 22 follows Phase 3's completion. If phases partially overlap, the unit tests (Task 21) can ship without arbor; Task 22 waits.

---

## 5. File-level change list

### Task 20 — scaffold

| File | Action | Purpose |
|---|---|---|
| **`packages/runtime/package.json`** | create | Manifest; peerDeps on arbor + signals |
| **`packages/runtime/tsconfig.json`** | create | Extends base; explicit DOM lib |
| **`packages/runtime/moon.yml`** | create | `layer: library` |
| **`packages/runtime/rolldown.config.ts`** | create | ESM + dts; external peer deps |
| **`packages/runtime/src/index.ts`** | create | Empty stub |
| **`packages/runtime/src/types.ts`** | create | `ShadowMode`, `DefineOptions`, `RuntimeError` |
| **`packages/runtime/src/define-element.ts`** | create | Stub — throws `new Error('not implemented')` |
| `.github/workflows/plan-a.yml` | modify | Add phase-branch glob to `on.push.branches` |
| `.prototools` | modify | Bump `node` to 20.19.0 |

Commit: `feat(runtime): scaffold @scribe/runtime package`

### Task 21 — implement `defineElement`

| File | Action | Purpose |
|---|---|---|
| **`packages/runtime/tests/define-element.test.ts`** | create | 10 unit/smoke tests |
| `packages/runtime/src/define-element.ts` | modify | Full implementation |
| `packages/runtime/src/types.ts` | modify | Finalize `RuntimeError` |
| `packages/runtime/src/index.ts` | modify | Re-export `defineElement`, `DefineOptions`, `ShadowMode` |
| `.size-limit.json` | modify | Add `@scribe/runtime` row at 1024 B |

Commit: `feat(runtime): implement defineElement with shadow-root wrapping`

### Task 22 — integration test

| File | Action | Purpose |
|---|---|---|
| **`tests/integration/define-element-integration.test.ts`** | create | 2 cross-package tests |

Commit: `test(runtime): define-element integration with arbor+signals`

### Final `packages/runtime/src/index.ts`

```ts
export { defineElement } from './define-element.ts'
export type { DefineOptions, ShadowMode } from './types.ts'
```

Two lines. Three exports (1 value, 2 types). `RuntimeError` excluded per §1.3.

---

## 6. Deviations from the plan

| # | Deviation | Source | Rationale |
|---|---|---|---|
| 1 | **Tasks 20–22 are absent from the plan** | Learning #6 | Plan ends at Phase 2 status checkpoint; tasks 20–22 were never authored. This spec is the authoritative Phase 4 scope. Plan must be updated with task stubs in same commit. |
| 2 | `defineElement(name, Ctor, options?)` — two positional args, not a single `spec` object | Decision 2B | v0 spec §7.2 explicitly shows the two-arg call shape the compiler emits. A single spec object would not match. |
| 3 | `'closed'` shadow mode is partially functional in v0 (registration succeeds; mount receives null root) | Decision 2B | Compiler emits `this.shadowRoot` which is null for closed roots. Making closed mode fully functional requires a compiler change. v0 spec §4 explicitly excludes features requiring cross-layer coordination not yet designed. Document as known limitation; ship registration-only. |
| 4 | `RuntimeError` not exported from `index.ts` | Decision 2B | Only throw site is a startup invariant; no production catch needed. Saves ~50 B gz. |
| 5 | CI trigger fix (phase-branch glob) in Task 20 | Phase 2 retro Finding 4 + Learning #5 | Fix CI before first push so every subsequent commit gets a signal. |
| 6 | Zero source-level imports from `@scribe/arbor` or `@scribe/signals` in runtime | Decision 2B | `defineElement` does not call `mount()`. This structural choice is what makes the 1 KB budget achievable. Peer deps declared for type resolution only. |
| 7 | `rolldown.config.ts` adds `external: ['@scribe/arbor', '@scribe/signals']` | Decision 2B | Prevents accidental bundling of peer deps. No precedent in signals config (signals has no cross-package deps); explicit here. |
| 8 | `.prototools` Node bump flagged in Task 20 | Phase 2 retro | Node 20.18.0 < Rolldown minimum 20.19+. Unresolved since Phase 2. Close the gap in Phase 4 scaffold. |
| 9 | Task 22 (integration) is blocked on Phase 3 (`@scribe/arbor`) | Decision 2B | Tasks 20–21 are self-contained; Task 22 requires arbor to be shipped. Builder must not start Task 22 until arbor is available. |

---

## 7. Open questions for the Team Lead

Assumptions about `@scribe/arbor`'s public surface that Architect A's `spec-arbor.md` may invalidate. Team Lead must reconcile after both specs land.

**Q1 — `mount()` host parameter accepts `ShadowRoot`.**
v0 spec §6.3 shows `mount(node: Branch | Leaf, host: Element): MountScope`. `ShadowRoot` extends `DocumentFragment`, not `Element`. The compiler-emitted `connectedCallback` passes `this.shadowRoot` (type `ShadowRoot | null`). If arbor's `mount()` is typed as `host: Element`, then `ShadowRoot` is not assignable and every shadow-DOM component fails at the TypeScript level. **This is the highest-priority reconciliation.** Assumption: Architect A widens the type to `Element | ShadowRoot | DocumentFragment` or uses `Node`.

**Q2 — `mount()` host accepts `HTMLElement` for `shadowMode: 'none'`.**
When no shadow root is used, runtime passes `this` (the custom element, type `HTMLElement`) to `mount()`. `HTMLElement extends Element`. If `host: Element` is the type, this works. Confirm.

**Q3 — `mount()` consumes a fresh tree per call; re-mounting is undefined behavior.**
Assumption: arbor's `mount()` does not support re-mounting the same `Branch` instance. The compiler emits a fresh `_build()` call in each `connectedCallback`. If Architect A explicitly supports re-mount, the compiler's pattern (and HMR strategy) changes.

**Q4 — `MountScope` shape is exactly `{ dispose(): void; agent: AgentContext; serialize(): Snapshot }`.**
Per v0 spec §6.3. No `onDispose(fn)` hook in v0. All cleanup is manual via `dispose()`. If Architect A adds `onDispose`, runtime's example code and test 2 in §4 Task 22 need updating.

**Q5 — `MountScope.dispose()` is synchronous and void.**
Assumption: `dispose(): void`, not `dispose(): Promise<void>`. The compiler-emitted `disconnectedCallback` calls `this.#scope?.dispose()` synchronously.

**Q6 — Arbor does NOT throw during `defineElement()` call time.**
`defineElement` does not call `mount()`. No arbor code runs at `defineElement()` call time. `ArborError` can only be thrown from `connectedCallback` (where `mount()` runs). Runtime does not catch it. Assumption holds regardless of Architect A's error shape.

**Q7 — `ArborError` has at minimum `{ name: 'ArborError'; message: string }`.**
Runtime documentation and README may reference `ArborError` for developer guidance. No `code` field assumed; if Architect A adds `code: string` (parallel to `RuntimeError.code`), runtime's README should be updated post-reconciliation but no code changes are required.

**Q8 — Arbor exports `Branch` and `Leaf` as named types from its `index.ts`.**
Integration tests import `branch`, `leaf` from `@scribe/arbor`. The value imports are enough for JSDOM tests; type imports of `Branch`/`Leaf` are used in handwritten test component signatures. If Architect A does not export the types, test code uses `ReturnType<typeof branch>` instead — no blocker, but inelegant.

**Q9 — `mount()` does not read `this.shadowRoot` internally.**
Runtime passes `this.shadowRoot` as the `host` argument. `mount()` receives whatever runtime passes. Assumption: `mount()` treats `host` as an opaque target for DOM operations, not as a sentinel to read `shadowRoot` from again. If `mount()` reads `host.shadowRoot`, closed-mode breaks doubly.

**Q10 — Arbor's `when()` and `each()` are stubs that throw `NotImplementedError`.**
Per v0 spec §7.5. Runtime does not call `when` or `each`. Integration tests in §4 do not use structural primitives. Assumption holds regardless — but confirming that the stubs throw (rather than silently no-op) is required for the integration test environment to not produce false-green assertions if a component accidentally calls them.

---

<!-- Final pre-publish checklist
- [x] Re-read v0 spec §6 (arbor model, MountScope interface, §6.3 mount signature)
- [x] Re-read v0 spec §7.2 (compiler call shape: defineElement('tag', ClassName) confirmed)
- [x] Re-read v0 spec §7.6 (runtime scope: shadow-root handling, lifecycle wiring, thin layer)
- [x] Re-read v0 spec §8 (data flow: connectedCallback → _build() → mount(tree, shadowRoot))
- [x] Re-read v0 spec §10.2 (mount errors throw synchronously; runtime does not catch)
- [x] Re-read plan tasks 20-22: NOT PRESENT. Plan ends at Phase 2. Flagged as Deviation 1.
- [x] Walked prose vs deviations table (Learning #2): §1.1 vs Dev 2 (two-arg shape); §1.3 vs Dev 4 (RuntimeError not exported); §3.6 vs Dev 5 (CI fix first). No prose/deviation contradictions found.
- [x] Plan staleness flagged in §6 Deviation 1 and §3.7. Plan update required in same commit.
- [x] §7 Open Questions lists 10 arbor-surface assumptions (Q1–Q10). Exhaustive per concurrency constraint.
- [x] CI trigger fix specified in §3.6 with exact yaml diff. Addresses Phase 2 retro Finding 4 + Learning #5.
- [x] Size budget row for @scribe/runtime specified in §3.5 at 1024 B gzip.
-->
