# Effect scope + composables: a first-class ownership foundation

**Date:** 2026-07-22
**Status:** DRAFT (review-hardened — three fable reviews folded in, see §Review log)
**Scope:** `@aihu/signals`, `@aihu/runtime`, `@aihu/compiler` (SSR emit + optional surface), `@aihu/arbor` (boundary only), `@aihu/primitives` (behavior composables), new `@aihu/use` package, docs, size gates
**Depends on / extends:** [`2026-07-16-composition-and-injection.md`](./2026-07-16-composition-and-injection.md) §4

## Problem

aihu can already express component-scoped composables (`@state` lowers into
`setup()`; `$controller` proves the shape — `cookbook/aihu-controller.aihu`), but
there is no curated library and the reactive core lacks two primitives a
VueUse-class library needs:

1. **No capturable owner / effect scope.** Cleanup ownership is the module-global
   `_cur` lifecycle record (`packages/runtime/src/define-component.ts:26-32,
   500-504`), valid only synchronously during `setup()`. No `effectScope()` /
   `getCurrentScope()` / `onScopeDispose()` / `runWithScope()`.
2. **`effect()` has no per-run cleanup.** `runEffect` just calls `fn()`
   (`packages/signals/src/effect.ts:68-88`) — composables that rebind on a
   reactive dependency (`useEventListener` with a reactive target,
   `useIntervalFn` with a reactive delay) cannot self-clean per run.

**Decisions (ratified):** build the scope into the **core** (`@aihu/signals` +
`@aihu/runtime`) as a first-class feature; package the library as **per-composable
subpath entries** (the `@aihu/primitives` model); split the composables across
**two libraries** — `@aihu/use` (pure utility/sensor/state) and `@aihu/primitives`
(headless ARIA/interaction behaviors); ship `@aihu/use` as a curated ~25.

## Ownership model — three trees, deliberately not unified

The reactive core owns **disposal**, and *only* disposal. aihu has three distinct
ownership trees; Solid unifies them on one `Owner`, aihu keeps them separate on
purpose (verified in code):

1. **Disposal ownership (fine-grain, intra-component)** → the core `EffectScope`.
   Owns effects, computeds, child scopes, and `onScopeDispose` callbacks created
   while it is current. **Not signals** — a signal host holds no subscriptions and
   just GC's (`signal.ts:508-516`); ownership is about *observers*, not *sources*.
2. **Element ownership (coarse-grain, inter-component)** → the DOM tree. Each
   custom element stops its own root scope on `disconnectedCallback`; DOM removal
   cascades. Runtime is only the seam that opens/closes each element's scope.
3. **Context / DI ownership** → the DOM-resolved `provides` chain (the 07-16
   plan). **Not carried on the core owner** — because `_cur` is nulled *before*
   children mount (`define-component.ts:239` vs `:272`; `:514` vs `:549`), a
   setup-time owner tree cannot capture parent→child under aihu's async/lazy
   custom-element upgrade. DI must resolve from the DOM at connect; this is why
   the core owner is disposal-only *by construction*.

**Invariant:** the core owner never carries context or error propagation. Do not
"unify the trees."

## Plan

Pieces 1–2 are the core feature; 3 is SSR (cross-cutting, must land with 2); 4–5
are the two libraries; 6–7 docs + release.

### 1. `@aihu/signals`: effect scope + per-run cleanup

**New API (additive):**

```ts
// scope.ts (new module)
export interface EffectScope {
  run<T>(fn: () => T): T | undefined     // undefined if already stopped
  stop(): void
  readonly active: boolean
}
export function effectScope(detached?: boolean): EffectScope
export function getCurrentScope(): EffectScope | undefined
export function runWithScope<T>(scope: EffectScope, fn: () => T): T   // async re-entry
export function onScopeDispose(fn: () => void): void
```

- Module-global `_currentScope`, mirroring `currentObserver` in `signal.ts`.
  `run(fn)` sets it around `fn`, restores in `finally`. Non-detached scopes
  register with the parent so a parent `stop()` cascades.
- **Ownership wiring (guarded):** `effect()` / `computed()` register their dispose
  *handle* (never a node back-pointer) with `_currentScope` **when one is
  active**. No scope active ⇒ byte-for-byte unchanged (manual dispose, GC).
- **Per-run cleanup:** widen `EffectFn` to `(onCleanup: (fn:()=>void)=>void) =>
  void`. Run pending cleanups before re-track and again on dispose.

**P0-1 — scope save/clear in `runEffect` (the load-bearing fix).** This core is
**synchronous push**: an unbatched write drains the effect queue *inline at the
write site* (`signal.ts` write path), so a signal write during a scoped `setup()`
synchronously re-runs **other components'** effects. Any effect created inside
that re-run (arbor's `when`/`each` remount funnels through `_mountEffect` →
`effect()`, `mount.ts:227`, the only `effect()` site in arbor; or a userland
composable whose effect body lazily creates an effect) would be **mis-adopted by
the current scope** and killed on the wrong unmount. `runEffect` **must save/clear
`_currentScope`** exactly as it saves `currentObserver` (`effect.ts:70,85`),
guarded `if (_currentScope !== null)` to keep the no-scope path one compare.
Neither arbor fix below closes this; only the `runEffect` clear does.

**Hot-path implementation (minimal perturbation):**
- **Exactly one new field**, `cleanups: Array<() => void> | null = null`, declared
  in the `Effect` constructor so the hidden class is stable from birth (the
  shape contract is `effect.ts:42-46`). Never initialize to `[]` (per-effect alloc).
- **Registrar = a single module-level function** appending to
  `(currentObserver as Effect).cleanups` — `currentObserver` is already the
  running node (`:70`). Zero new closures; no per-run callback allocation. Pass
  this shared fn to `fn(onCleanup)`.
- **Drain paths (must fire cleanups exactly once):** the dispose closure must
  drain `cleanups` *before* `node.fn = null` and pool push (`:134-136`); the
  pool-reuse branch must reset `node.cleanups = null` (`:93-106`); the
  first-run-throw path (`:143-148`) and the self-dispose-mid-run path (`:79`)
  must both drain.
- Per-run drain is one `cleanups !== null` check before `beginTrack` (`:76`).
- `disposed` stays closure-local (`:111-113`) — safe because the scope stores the
  dispose *handle*, never the node.

**Semantics to spec (not leave to accident):**
- `run()` on a stopped scope: returns `undefined`; effects/`onScopeDispose`
  created inside run **unowned** (Vue's behavior). Async composables
  (`createSharedComposable`, post-`await` registration) hit this immediately.
- `stop()` re-entrancy/idempotency: active-flag guard; a cleanup calling `stop()`
  on its own scope, and a child already stopped when the parent cascade reaches
  it, are both no-ops.
- **Error propagation out of `stop()`:** decide first-throw-aborts vs
  continue-and-rethrow. This interacts with the reactions-queue rethrow
  (`effect.ts:242-249`) and with P0-3 below (a throwing cleanup must not abandon
  remaining teardown). Default recommendation: collect, run all, rethrow first.
- **Scope-list growth:** with no node back-pointer, a manually-disposed effect
  leaves a dead closure in the scope's list for the component's lifetime — and the
  rebinding-composable use case *churns* effects in long-lived components. Decide:
  Vue-style index back-pointer + swap-remove, or documented accept + periodic
  compaction. (Recommend back-pointer on the **handle wrapper**, not the node, to
  preserve pool shape.)
- `pause`/`resume` (Vue 3.5): deferred, but say so — `useRafFn`/`useIntervalFn`
  want it and will hand-roll inconsistently otherwise.

**Size:** `@aihu/signals` row is `1970 B` (`.size-limit.json:8-13`), tight.
Measure with `bun run size`. Fits a modest raise ⇒ core `index`; else a
`@aihu/signals/scope` subpath entry with its own row (`css-engine runtime/cn`
precedent). Measured number decides; README table update is part of the PR.

**Tests:** cascade dispose; nested/detached; `onScopeDispose` order; per-run
cleanup before re-run + on stop; **no-scope path identical**; pool reuse across
stop; **P0-1: an effect created inside a foreign effect re-run during a scoped
setup is NOT scope-owned**; `run()`-after-`stop()`; re-entrant `stop()`; throwing
cleanup still runs the rest. Gate on `bench/` (cellx, dynamic-deps), not just units.

### 2. `@aihu/runtime`: bind the component root to a scope

Open a per-instance `effectScope()` around the **`setup()` body only**, store it
on the instance, `stop()` it on `disconnectedCallback`.

**P0-2 — the arbor boundary needs (a) AND (b), plus P0-1.** These are not
alternatives:
- **(a) Scope must exclude `_mount`.** `_mount` runs *after* `_build()` returns
  (`define-component.ts:264-272, 542-549`). The scope must wrap only the setup
  call — if it wraps `connectedCallback`/`_mount`, a synchronously-upgrading child
  element opens its component scope **nested inside the parent's**, recreating the
  unified owner tree the ownership model rejects (double-stop, tree-1-collapses-
  into-tree-2).
- **(b) Unowned `_mountEffect`.** Arbor's binding effects must be created via an
  explicit scope-skipping `effect` variant, so a re-entrant `_mountEffect` fired
  synchronously during someone's scoped setup is never scope-adopted.
- **(P0-1)** covers non-arbor re-entrant effects.

Note: **double-dispose is already safe** (idempotent handles: `effect.ts:111-113`,
`computed.ts:166`, `mount.ts:303-306`). The real invariants are **ownership (who)**
and **order (when)** — test those, not "runs exactly once."

**P0-3 — disconnect ordering (the biggest behavior change; spec it).** Today
`_LC.c` is a single **FIFO** list — onCleanup callbacks (setup order) then
onMount-returned teardowns (`define-component.ts:34-39, 41-43`) — run *before*
`MountScope.dispose()` (`:282-287`). Aliasing `onCleanup`→`onScopeDispose` while
keeping onMount teardowns in `_LC.c` **splits one list into two run at different
times** — so the "behavior-preserving" claim is false. **RATIFIED: unified
single-list LIFO.** Required:
- **Order:** everything the component owns — composable-created effects/computeds,
  `onCleanup` callbacks, AND onMount-returned teardowns — lives in the **one**
  component-scope disposer list and is drained **LIFO** (reverse-registration,
  Solid acquisition-symmetry) by `scope.stop()`. Disconnect collapses to
  `scope.stop()` → `MountScope.dispose()` (bindings, **DOM removal last**,
  `mount.ts:29-31`) → base `disconnectedCallback` (`:614`). All user teardown runs
  before DOM removal (the load-bearing invariant).
- onMount bodies run inside `runWithScope(es, …)` so onMount-created effects are
  scope-owned and onMount-returned teardowns register into the same list **by
  handle** (`onScopeDispose`) — no separate `_LC.c` stage.
- **Documented reversal from today** (must be tested): today onCleanup callbacks
  run FIFO (setup order) *then* onMount teardowns; the unified LIFO drains onMount
  teardowns first (registered last) then setup-time cleanups in reverse. Chosen
  for simplicity + construction-symmetry; no perf impact (unmount-time only, not
  the reactive hot path).
- **Throw containment:** today a throwing `onCleanup` skips `MountScope.dispose()`
  entirely (`:284-285`) — leaking every binding + the DOM. `scope.stop()`
  amplifies this (owns far more). Wrap per-teardown; never let one throw abandon
  the rest.

**Two disposal owners the "~100% into core" framing missed** — disposal ownership
moves into core *except* these seams, which runtime must explicitly bridge:
- **Base-primitive teardown:** `_baseProto.disconnectedCallback` (`:614`) is a
  fourth disposal root (e.g. AihuButton's disposer array) — unchanged, runs last.
- **HMR:** `_hmrReplace` (`:692-698`) disposes only the MountScope — it **must
  also stop the old component scope**, or every scope-owned effect leaks on hot
  replace. (It also calls `newSetup` with `_cur` unset, so the replacement's
  `onCleanup` throws SCR-R0011 — pre-existing debt the scope work exposes.)

**Setup-throw:** `connectedCallback` catch-logs-rethrows and `this[S]` is never set
(`:277-280`); the just-opened scope (with any effects created before the throw) is
never stopped. Mirror the first-run-throw self-dispose (`effect.ts:143-148`):
`scope.stop()` in the catch before rethrow.

**Re-entrancy under moves:** DOM-tree ownership means `disconnectedCallback` fires
on reparenting/moves → full `stop()` then full re-setup. The composables guide
(piece 6) must state composables are re-entrant under stop/re-setup.

**Tests:** composable effect auto-disposes on unmount; rebinding composable re-runs
cleanup on dep change; **disconnect order** (all four owners, DOM removed last);
throwing cleanup doesn't leak bindings; HMR stops the old scope; setup-throw stops
the scope.

### 3. SSR ownership — **DEFERRED (2026-07-22), split into library + platform**

**Status update after Pieces 1–2 landed.** On investigation the platform-level
`__ssr` scope wrap is *not safe to author now*: the `__ssr()` →
`renderToString(__ssr(props))` flow this section targets is being **actively
rewritten by the in-flight ssr-string work** (`ssr_string_emit.rs` is *untracked*
in this worktree; the server package doesn't yet depend on `@aihu/signals`; the
existing `renderToString` walks a pre-built tree and doesn't call setup). That
work is also the cause of the ~34 broken `packages/server` tests — no clean
baseline to verify against. Editing it now would collide with the rewrite.

**Re-sequenced resolution:**
- **Library SSR-safety → folded into Piece 5** (`@aihu/use`), self-contained: the
  **`isClient` no-op invariant** (a composable creates no effect/timer when
  `isClient === false`, lint-enforced) makes the composables SSR-safe *without
  touching platform SSR code*. Plus the `tryOnMounted` shim and the
  `isClient`/`defaultNavigator` guards below live in `@aihu/use`.
- **Platform `__ssr`-scope wrap → deferred follow-up**, defense-in-depth against a
  misbehaving composable (or existing server-side `$effect`), to land *with/after*
  the ssr-string work once the SSR emit architecture stabilizes and the server
  package's setup-call site is stable + signals-reachable.

The original analysis (still valid, for the eventual platform wrap):

**SSR never goes through `defineComponent`.** The compiler emits
`__ssr = () => __aihu_setup__({ host: null, element: null, … })`
(`packages/compiler/src/codegen/emit.rs:1057, 1127`) — the **full setup body,
composable calls included, runs server-side with zero DOM**
(`packages/server/src/ssr.ts:4`); `renderToString` reads tuples via `value[0]()`
(`ssr.ts:146-153`). Piece 2's scope lives inside `defineComponent` and is
**bypassed** — so any effect/timer a composable creates during SSR setup leaks per
request. Fix (pick one, state it):
- **(preferred, cheaper) `isClient` no-op invariant:** no composable creates an
  effect or timer when `isClient === false`; **lint-enforced** in `@aihu/use`, not
  a convention.
- **or** wrap `__ssr` / `renderToString` setup in an `effectScope()` and `stop()`
  after serialization.

Adjacent SSR requirements:
- **`tryOnMounted`:** `_onMount` throws `SCR-R0010` when `_cur` is null
  (`define-component.ts:701-703`); `__ssr` calls setup directly so `_cur` is null.
  The router boundary already wraps onMount in try/catch (`emit.rs:584`). Add a
  `tryOnMounted` shim; any composable touching `onMount` uses it.
- **Shims:** `defaultWindow`/`defaultDocument` don't cover timers or navigator.
  `setInterval`/`setTimeout` exist in Node/Workers (won't be window-guarded);
  `requestAnimationFrame` does **not** (so `useRafFn` throws) — add an explicit
  `isClient` gate and a `defaultNavigator` (for `useClipboard`).
- **Hydration:** `useNow`/`useTimestamp` produce a server/client mismatch — document.
- **Retarget the SSR test at the `__ssr` path**, not the client path.

### 4. `@aihu/primitives`: behavior composables

Add behavior composables here (the plan previously named primitives only as a
template). **Dividing rule** (pin it, or `onClickOutside` vs `useDismiss` gets
litigated per-PR): *a composable belongs in `@aihu/primitives` iff it mutates the
target's attributes/focus/tabindex or participates in an APG interaction contract
(dismiss layer, focus trap, roving tabindex, presence hold); it belongs in
`@aihu/use` iff it only observes and returns signals.* → `onClickOutside`→primitives,
`useFocusTrap`/`useRovingFocus`/`usePresence`→primitives; `useMediaQuery`,
`useElementVisibility`→use.

- **Convention: `create*` manual-handle factories, NOT scope-bound `use*`.**
  Precedent already in-package: `createFocusTrap` (`dialog/focus-trap.ts:29-76`),
  `createCollection` (`collection/index.ts:36-53`, "usable standalone"). A
  scope-bound `use*` would import the runtime lifecycle model into a package that
  deliberately has no runtime dep. Promote `focus-trap.ts` out of `dialog/` to its
  own entry. **No third package.**
- **No `@aihu/primitives` → `@aihu/use` dependency in v1.** Primitives are
  hand-written custom elements, not `defineComponent` components, and never import
  runtime (verified). Inside a primitive's `connectedCallback` **there is no active
  scope**, so a `use` composable relying on `tryOnScopeDispose` silently no-ops and
  leaks. Adding the edge also drags `@aihu/runtime` transitively in and forces
  `@aihu/use` into all 17 primitives size-row `ignore` arrays. Keep self-contained
  (the `dom-context.ts:12` "does NOT import `@aihu/context`" precedent). This is
  *why* `useEventListener` must **return a manual stop fn** (piece 5).
- **Optional follow-up:** primitives may adopt an internal `effectScope` to shed
  the `_disposers: Array<() => void>` idiom (`roving-focus/index.ts:63-71`,
  `dialog/index.ts:95-118`, `tooltip/index.ts:88-98`; best win — `AihuTooltipRoot`
  timers+disposers → one `scope.stop()`). If done, create the scope **per
  connection, not per instance** (`connectedCallback` re-fires; `EffectScope` is
  stop-once), and refactor via the `DialogPiece` base, not 17 rewrites.
- **`useColorScheme` overlap:** `config-provider` already owns reactive
  `colorScheme` reflected to `data-color-scheme` (`config-provider/index.ts:8-13,
  25`). Cross-link; a primitive resolves `configContext` first, falls back to media
  query (mirrors the `dir` fallback at `roving-focus/index.ts:117-125`).
- **Housekeeping (independent of this plan):** stale `dist/` artifacts
  (`alert-dialog.js`, orphaned hashed chunks) pollute `files:["dist"]` publishes —
  add `rm -rf dist` prebuild; the declared-but-unused `@aihu/arbor` dep
  (`package.json:87`) can go.
- **Size:** new behavior entries follow the per-subpath model; put shared
  dismiss/focus substrate in its own named entry (as `dom-context` is) so it gets
  its own row. Note substrate is double-counted across importing rows (correct;
  keeps budgets honest per import path).

### 5. `@aihu/use`: utility/sensor/state composables

Copy the `@aihu/primitives` packaging shape (multi-entry rolldown, per-subpath
`exports`, `sideEffects:false`).

- **Dependency direction: `@aihu/signals` is the sole hard dep.** Only `useMounted`
  needs `onMount`; make it the one entry importing `@aihu/runtime` (rows already
  `ignore` it) or move it into runtime. Everything else is signals+scope — element
  sensors don't need `onMount` (client setup runs in `connectedCallback`; `$ref`
  arrives as a getter flipping null→el, `emit.rs:419`, and per-run cleanup rebinds).
  Matches primitives' no-runtime-dep layering.
- **Return convention: an object of named getters, called explicitly in templates
  as `{x()}`.** Ground truth: `state()` names read bare only because they're in the
  compiler `SignalMap` (`template_emit.rs:131-144`); a destructured composable
  return is `StateNames`-only (`codegen/signals.rs:184-190`), so bare `{x}` emits
  an **eager non-reactive `leaf(x)`** (`template_emit.rs:219`) — the working form is
  `{x()}` (`:212-217`). Object-of-getters matches `computed`'s callable read and
  the `config-provider` `Read<T>` precedent. **Raw tuples** buy nothing in templates
  and lose names — allow only for single-value `useToggle`. **Accessor-handles**
  (`{user.loading}`, the `createResource` style) **freeze** for imported composables
  (the dotted fast path needs the base in `SignalMap`, `template_emit.rs:163-186`) —
  reject. Show the parens in every doc/cookbook example (the #1 DX risk: `state()`
  reads bare, composable getters don't). **Defer** any compiler bare-read blessing —
  a name-prefix heuristic is the FEL-172 silent-miscompile class.
- **`toValue`:** `type MaybeGetter<T> = T | (() => T)`; `toValue = v => typeof v ===
  'function' ? v() : v`. **Forbid tuple detection** — a `[get,set]` tuple is
  structurally an array of functions and undiscriminable from a legit array arg.
  `unrefElement`: `Element | (() => Element | null)`.
- **`useEventListener` returns a manual stop fn** (in addition to `onScopeDispose`)
  — required for primitives consumption and scopeless callers.
- **Curated set (~25):** sensors — `useEventListener`, `useMouse`, `useScroll`,
  `useWindowSize`, `useElementSize`, `useElementVisibility`, `useMediaQuery`,
  `usePreferredDark`; state — `useLocalStorage`, `useSessionStorage`, `useToggle`,
  `useCounter`, `useDebounceFn`, **`useDebounced` (value — the
  `cookbook/search-debounce.aihu` pattern `useDebounceFn` doesn't express)**,
  `useThrottleFn`, `usePrevious`; browser — `useClipboard`, `useDocumentVisibility`;
  time — `useIntervalFn`, `useTimeoutFn`, `useRafFn`, `useNow`/`useTimestamp`; meta —
  `useMounted`, `useSupported`. **Dropped/respec'd:** `useTitle` (loses to
  `head-apply.ts:95-106` on route nav — drop or spec the interaction), the writing
  `useDark` (scheme-writing is `config-provider`'s job — keep only `usePreferredDark`).
  **Excluded (cross-link, don't duplicate):** async/data → `createResource`/
  `createStream`; `onClickOutside` → primitives. `useElementSize` intentionally
  supersedes the hand-rolled `$controller` ResizeObserver — show that migration.
- **Packaging:** per-composable entries + rows are policy-fine (`check-size-rows.ts`
  needs ≥1 sub-row, `:149-156`). +25 rows ~doubles `.size-limit.json` and `bun run
  size` time — acceptable for the sensors (real ResizeObserver/IntersectionObserver
  bytes), but collapse the sub-150 B micro-utils (`useToggle`, `useCounter`,
  `usePrevious`, `useMounted`, `useSupported`) into **one grouped row**. Each row
  `ignore: ["@aihu/signals"]` (+`"@aihu/runtime"` only for `useMounted`). Decide
  whether the `shared` utils entry is public or internal (don't inherit
  `dom-context`'s public `./context` by copy-paste).

### 6. Docs + cookbook

Composition guide completing 07-16 §4: the `useX` convention, effect scope,
`onScopeDispose`, SSR-safe composables (`isClient`/`tryOnMounted`), **the
getter-call template rule `{x()}` with parens shown everywhere**, re-entrancy under
stop/re-setup, and the `createResource`-handle vs `@aihu/use`-getter divergence.
Per-composable reference pages; 2–3 `cookbook/*.aihu` examples (migrate
`search-debounce` and `aihu-controller`).

### 7. Release wiring

Changesets: `@aihu/signals` **minor** (new API), `@aihu/runtime` **minor** (scope
binding), `@aihu/compiler` **patch/minor** (SSR scope wrap if chosen),
`@aihu/primitives` **minor** (behavior entries), `@aihu/use` **new**. `bun run
check:ci` green.

## Sequencing

1. **Signals scope + per-run cleanup + P0-1** — the core; bench + size gated. ✅ DONE (`b4ce70ae`).
2. **Runtime scope binding** — P0-2 (a+b), P0-3 ordering, HMR + setup-throw + base-proto seams. ✅ DONE (`3d2302f1`).
3. **SSR ownership** — ⏸ DEFERRED (see §3): library SSR-safety moves into Piece 5's `isClient` invariant; platform `__ssr` wrap follows the ssr-string work.
4. **`@aihu/use` scaffold + `useEventListener` + `useMouse`** references — SSR-safe via `isClient`/`tryOnMounted`.
5. **Fan out the ~25**, and **primitives behavior entries** (parallel; independent packages).
6. **Docs + release.**

## Risks

- **Synchronous-push scope misattribution (P0-1)** — the subtlest correctness bug;
  the `runEffect` scope-clear + its dedicated test are non-negotiable.
- **Arbor boundary** needs a+b+P0-1 together; test ownership + order, not
  once-only (disposal is already idempotent).
- **Disconnect ordering + throw containment (P0-3)** — observable behavior change;
  spec the order and per-teardown try/catch.
- **SSR bypass (P0)** — the leak ships silently if the test targets the client path.
- **Signals hot path** — one new nullable field, one module-level registrar, drain
  on all four dispose paths; bench-gated.
- **Scope-list growth** under rebinding churn — back-pointer-on-handle or documented
  compaction.
- **HMR** must stop the old scope; **setup-throw** must stop the opened scope.
- **API-convention drift** — getters (`{x()}`) vs `state()` bare reads vs
  `createResource` handles; document loudly, lint the library.

## Review log

Three fable reviews (2026-07-22) folded in: core/runtime/arbor (P0-1 scope
save/clear, P0-2 a∧b, P0-3 ordering + throw containment, base-proto + HMR +
setup-throw seams, hot-path field/registrar/drain shape, scope-list growth,
run-after-stop / re-entrancy / pause-resume semantics); `@aihu/primitives`
(behavior share unwritten, `create*` not `use*`, no primitives→use edge,
per-connection scope, config-provider overlap, dist/arbor housekeeping);
`@aihu/use` (SSR `__ssr` bypass + `tryOnMounted` + shims, getter-call template
convention, signals-sole-dep, `toValue` no-tuple, `useDebounced` omission,
`useTitle`/`useDark` respec, micro-util row grouping).

## Future work (post-deployment — do NOT start until this plan ships + deploys)

- **Compiler auto-import of composables** (the zero-import DX). Today a `.aihu`
  author writes `import { useMouse } from '@aihu/use/useMouse'` in `@state`. The
  ergonomic end-state is the compiler recognizing a bare `useMouse()` call in
  `@state` and injecting the **per-subpath** import itself — exactly how it
  already injects `state()`/`effect()`/`onMount()`, and how VueUse's unplugin
  auto-import works. Key constraint: inject the granular `@aihu/use/<name>`
  specifier (NOT a barrel), so per-composable tree-shaking is preserved — this is
  the whole reason NOT to route composables through an `@aihu/app` runtime
  re-export facade (which would trade shaking for convenience; the `@aihu/use`
  barrel already covers the manual-import case). Distinct from — and safer than —
  the bare-`{x}` template read heuristic (deferred as FEL-172 miscompile risk):
  auto-import adds an import statement, it does not change reactive-read lowering.
  Scope: `@aihu/compiler` (a resolved-name → known-composable registry + import
  injection), opt-in config, collision handling with user-declared names.
  **Explicitly gated to after this plan ships and deploys** (founder call,
  2026-07-22).

- **Platform `__ssr` scope wrap consolidation** — the per-render effectScope now
  lives in `ssr.ts`/`native.ts` (Piece 3, committed). Revisit once the in-flight
  ssr-string emit path lands, to ensure that path (`renderToString(__ssr(props))`)
  shares the same per-render ownership rather than re-introducing the bypass.
