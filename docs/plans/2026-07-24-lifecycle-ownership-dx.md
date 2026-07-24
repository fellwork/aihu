# aihu-native Lifecycle / Ownership DX

**Date:** 2026-07-24
**Status:** PROPOSED — awaiting founder approval, not ratified
**Scope:** A new `@aihu/signals/lifecycle` ownership-contract subpath, the `onCommit` /
`connected()` primitives it backs in `@aihu/runtime` and `@aihu/use`, and the DOM-move
state-destruction findings in the reconnect audit (§3). Repo:
`/Users/smcguirt/conductor/workspaces/aihu/gwangju`.
**Depends on / extends:**
[`2026-07-24-use-categorical-parity.md`](./2026-07-24-use-categorical-parity.md) (the
`@aihu/use` package boundaries `tryOnCommit`/`useConnected` are placed against) and
[`2026-07-24-deep-reactivity.md`](./2026-07-24-deep-reactivity.md) (sibling proposal — no
shared code, but both are new-surface-area design docs against the same signals/runtime
core and both resolve open blockers from the same backlog).

## Open decisions for the founder

Approving this document commits to:

1. **Adding a `@aihu/signals/lifecycle` ownership-contract subpath** (~250 B gz, its own
   `size-limit` row, separate rolldown entry — 0 B added to the guarded
   `@aihu/signals/dist/index.js` row) as the answer to "`@aihu/use` cannot depend on
   `@aihu/runtime`" (§6). This is a new public subpath on `@aihu/signals`, not a private
   internal.
2. **NOT shipping `useMounted()`.** It would be a constant `true` wearing an API costume —
   see §5.1. `useConnected()` ships instead.
3. **The DOM-move state-destruction problem needs its own remedy decision**, separate from
   this doc's hook design: reordering a keyed `each()` list currently destroys and rebuilds
   every child component (§3.2). The recommended remedy (`moveBefore()` +  an empty
   `connectedMoveCallback` opt-in on every aihu-defined custom element) is a **behavior
   change to the reconciler** with its own browser-support caveat (no Safari yet) and is
   flagged in §9 Q3 as a candidate for its own standalone, separately-shipped slice rather
   than riding with this arc — approving this doc does not by itself decide that sequencing
   question.

This design resolves the open blockers tracked as **FEL-392** (the
`@aihu/use`-cannot-depend-on-`@aihu/runtime` layering exception) and **FEL-393**
(`tryOnMounted`, removed rather than fixed).

**Framing (founder, adopted):** aihu does not have Vue/React-style lifecycles. It has
**ownership** (effect scopes) and **creation/disposal** (custom-element callbacks).
The job is not to port `onMounted`/`onBeforeUnmount`; it is to name the cycles aihu
genuinely has and expose exactly what a user can *do* with them.

---

## 0. Executive summary

| # | Question | Answer |
|---|---|---|
| 1 | Honest model | Six real points: **construct → connect(setup) → mount → commit → attribute-change → disconnect(scope stop → DOM dispose)**. `onCommit` is the only one missing. Five Vue/React hooks have no analog and must not be ported. |
| 2 | Post-layout timing | **Does not exist today.** `onMount` runs synchronously inside `connectedCallback`. Add `onCommit(fn)` — one coalesced rAF queue in `@aihu/runtime`, cancelled if the element disconnects first. |
| 3 | Re-connect | The 24 composables are *not* the bug. aihu's disconnect is **destructive** and reconnect is a **full rebuild** — so a move silently annihilates all component state. `arbor`'s keyed `each()` reorder uses `insertBefore`, so **every list reorder destroys and rebuilds child components**. Plus: `onAdopt` is unreachable dead code; scopeless composable calls leak once per connect cycle; hydrated components revert to their SSR snapshot on reconnect. |
| 4 | `connected` signal | Per-instance, per-connection, **latched false** at disconnect and never re-armed. It is a liveness token for the setup that captured it — which is exactly what an async continuation needs, and strictly better than `element.isConnected`. |
| 5 | `useMounted` / `tryOnMounted` | `useMounted()` would be a constant `true` — **do not ship it**. Ship `useConnected()` instead. `tryOnMounted` has **zero in-repo callers**: **remove it**, do not fix it. |
| 6 | Layering | **Option C.** A new ~250 B tree-shakable subpath `@aihu/signals/lifecycle`: a DOM-free ownership contract (WeakMap keyed by `EffectScope`). `@aihu/runtime` attaches; `@aihu/use` reads. The guarded 2350 B `signals/dist/index.js` row is untouched. |
| 7 | DX | Five canonical recipes, all expressible with `onMount` + `onCommit` + `onCleanup` + `connected()` + `effect()`. No new mental model. |

---

## 1. The honest model

### 1.1 What actually exists

Verified against `packages/runtime/src/define-component.ts`, `define-element.ts`,
`packages/arbor/src/mount.ts`, `packages/signals/src/scope.ts`.

| # | Point | When it fires | Where in code | What it is genuinely good for |
|---|---|---|---|---|
| 0 | **constructor** | element creation or upgrade | `define-component.ts:478-500` | Upgrade-rescue only (recapture own props that shadow the prototype accessor). The CE spec forbids touching children/attributes here. **Correctly not exposed.** |
| 1 | **connect → `_build()` → `setup()`** | element enters a document | `define-component.ts:284-336`, `505-588` | *The component body.* Create state, derive, wire `effect()`s, register hooks, `provide`/`inject`. This is where "now" lives — and why `onMounted` degenerates. |
| 2 | **scope creation** | inside `_build()`, `effectScope(true)` wrapping *only* `setup()` | `define-component.ts:270`, `571` | **The ownership root.** Everything registered while it is current dies together, LIFO. Detached on purpose: element↔element ownership is the DOM tree, not the scope tree. |
| 3 | **arbor `mount()`** | synchronously after `setup()` returns | `define-component.ts:315`, `621`; `arbor/src/mount.ts:335` | DOM materialized into the host; binding effects created — deliberately **unowned** by the component scope (`runWithoutScope`, P0-2b), owned by `MountScope`. **`$ref`s are not yet live here** — see point 4. |
| 4 | **`onMount` drain** | synchronously after mount, inside `runWithScope(componentScope)` | `define-component.ts:52-57`, `322`, `627` | "The template exists and refs are live." `$ref` lowers to its own `onMount(...)` call wrapped around the element node (`compiler/src/lib.rs` C562), so a ref only becomes non-`undefined` when *that* generated `onMount` body actually runs — i.e. here, not at point 3. Ordering hazard: a user `onMount` registered textually *before* the ref's declaration point in the template sees the ref as still `undefined`; register ref-dependent `onMount` logic after the ref, or use `onCommit` (§2), which always drains after every `onMount` entry has run. Returned teardowns join the one LIFO list. **Still inside `connectedCallback` — no layout has happened.** |
| 5 | *(missing)* **commit** | — | — | Measure / focus / hand off to a third-party lib. **§2.** |
| 6 | **`attributeChangedCallback`** | any time — connected **or not** | `define-component.ts:641-675` | Attribute → prop-signal conversion (this part is right and reactive). The userland `onAttributeChange` hook is a rarely-correct escape hatch. |
| 7 | **`adoptedCallback`** | cross-document move | `define-component.ts:356-359`, `681-684` | **Nothing — it is unreachable.** See §3.3. |
| 8 | **disconnect** | element leaves a document — *including every `insertBefore` reorder* | `define-component.ts:337-354`, `686-707` | `scope.stop()` (user teardown, LIFO) → `MountScope.dispose()` (binding disposal, then DOM removal). Synchronous, deterministic, one channel. |
| 9 | **scope disposal** (`onCleanup` / `onScopeDispose`) | disconnect, manual `scope.stop()`, parent cascade, HMR replace | `signals/src/scope.ts:132-164` | **The single teardown channel.** Not a lifecycle hook — an *ownership* primitive that happens to be driven by a lifecycle callback. |
| 10 | **`_hmrReplace`** | dev only | `define-component.ts:784-836` | Proof that "connect" and "setup" are separable: a full stop+rebuild with no DOM move. Any lifecycle design must survive it. |

The load-bearing observation: **points 1–4 are one synchronous block inside one
`connectedCallback` invocation, and point 8 is one synchronous block inside one
`disconnectedCallback` invocation.** Everything Vue/React splits into a phase graph,
aihu collapses into two straight lines. That is the model. Do not corrugate it.

### 1.2 `onMount` is not a lie — `onMounted` is

Worth stating explicitly, because it decides a naming question:

- Vue's `onMounted` promises "the component is in the document." In aihu that is
  already true when `setup()` starts, so porting it is a lie.
- aihu's `onMount` promises "the *template* has been mounted into the host and `$ref`s
  are populated." That is a real, distinct, observable transition (`_mount()` really
  did run between `setup()` returning and this callback). It is honest.

**Recommendation: keep `onMount`. Do not rename it to `onConnect`.** It is load-bearing
(`$ref` lowers to `onMount` — `compiler/src/lib.rs:861-868`; `controller().hostConnected`
lowers to `onMount` — `codegen/state_emit.rs:1072`), it is in the cookbook, and it is
*accurate*. Fix the docs, not the identifier. What's missing is the layout-dependent
half, which is a genuinely different hook, not a renaming of this one.

### 1.3 Hooks with no aihu analog — and why porting them encodes a false model

| Vue / React | Verdict | Why |
|---|---|---|
| `onBeforeMount` / `useLayoutEffect`-before-paint-setup | **No analog. Never build.** The setup body *is* before-mount. A hook for it is a no-op wrapper that teaches users there is a phase boundary where there isn't one. |
| `onMounted` (as distinct from setup) | **Degenerate.** Splits into two real things: "template exists" (= `onMount`, exists) and "layout is done" (= `onCommit`, §2). Shipping a single `onMounted` forces users to guess which one they got. |
| `onBeforeUpdate` / `onUpdated` / `componentDidUpdate` | **Impossible. Never build.** aihu has **no component-wide render pass.** Updates are per-binding effects created by arbor. There is no moment "the component re-rendered," so a component-wide update hook has no referent. Any implementation would have to fabricate one (e.g. a microtask after any signal write) — the single most damaging false model we could ship, because it would imply a batching/render-pass semantics that `batch()`'s synchronous-explicit-flush contract explicitly rejects. |
| `onBeforeUnmount` vs `onUnmounted` | **One channel, not two.** The pair exists in Vue because the render tree unmounts in stages. aihu's order is fixed and already correct: scope disposers (LIFO) → binding disposal → DOM removal. "After DOM removal" is not observable in any useful way (the nodes are detached and the scope is dead). `onCleanup` covers 100% of it. |
| `onErrorCaptured` | **Different tree. Deliberately not unified.** `scope.ts:5-11` records the ratified decision that aihu's three ownership trees (disposal / context / errors) are *not* unified. Errors are per-binding (`arbor` `onError`, `_mountEffect`) plus the tag-attributed catch-log-rethrow in `connectedCallback`. Attaching error capture to the *disposal* owner would collapse two trees into one on the sly. |
| `onActivated` / `onDeactivated` (keep-alive) | **No keep-alive exists.** And §3 argues aihu should not grow one; it should stop destroying state in the first place. |
| `useImperativeHandle` / `forwardRef` | **The platform already has it.** The component *is* a class with a real public surface: props are accessors (`define-component.ts:713-730`), methods are methods, events are `CustomEvent`. Nothing to invent. |
| `ref` callbacks / `useRef` | `$ref` + `onMount`. Exists. |

---

## 2. Post-commit / post-layout timing

### 2.1 Does aihu have it today? No.

`onMount` bodies run at `define-component.ts:322` / `:627` — **synchronously, inside
`connectedCallback`, inside the custom-element reaction queue.** Consequences, all real:

1. **Measurement forces a synchronous layout mid-insertion.** `getBoundingClientRect()`
   there is not wrong-by-spec, but it forces style+layout for the whole document at a
   moment the browser is still inserting nodes. N components → N forced reflows during
   one insertion pass. Classic layout thrash, and it scales with component count.
2. **During initial HTML parse the measurement is simply wrong.** A custom element's
   `connectedCallback` fires when its *start tag* is parsed: its own light-DOM children
   are not parsed yet, later `<link rel=stylesheet>` may not have applied, and web fonts
   have not swapped. Measured width is frequently `0` or a pre-font value.
3. **`focus()` is racy.** Focusing inside `connectedCallback` succeeds, then the parser
   or a parent's subsequent insertion moves focus, or the element is still
   `display:none` under a stylesheet that has not applied — in which case `focus()`
   silently no-ops with no error.
4. **Third-party widgets cache 0×0.** Chart/map/editor libraries measure their container
   on init and memoize. Initialized in `onMount`, they lock in a zero size and require a
   manual `resize()` the user has to discover.

These are exactly the four use cases behind `onMounted`. **They are the real ones, and
aihu currently has no hook that satisfies them.**

### 2.2 Design: `onCommit`

```ts
/**
 * Run `fn` after the browser's next layout opportunity, before paint.
 *
 * - Registered via the `_cur` owner pointer — the SAME convention `onMount`
 *   uses. `_cur` is non-null only for the duration of `setup()` itself
 *   (`define-component.ts:272/:573`, cleared in `finally` at `:281/:586`), so
 *   this bare export is **setup-only**, exactly like the compiler-emitted
 *   `onCommit(...)` calls that are its only caller (§2.4 — the compiler never
 *   emits it anywhere else).
 * - Fires ONCE per connection, in registration order, coalesced with every
 *   other pending commit into ONE rAF callback per frame.
 * - SKIPPED entirely if the element disconnects before the frame fires.
 * - Runs inside `runWithScope(componentScope)`: effects it creates are
 *   scope-owned, and a returned teardown joins the unified LIFO list —
 *   identical to onMount's contract.
 * - Never runs under SSR (no rAF, and `__ssr` never connects an element).
 *
 * @throws SCR-R0014 when called outside setup (`_cur` is null).
 */
export function onCommit(fn: () => void | (() => void)): void
```

**Two registration windows, deliberately different, and this is the one place
in the design they must be stated side by side.** The raw `onCommit` above is
`_cur`-gated and therefore only ever legal *during `setup()`* — which is fine,
because the compiler is its only caller and the compiler only ever emits it at
setup time (§2.4). But `@aihu/use`'s `tryOnCommit` (§5.3, §6.3) does **not**
go through `_cur` — it resolves the current `LifecycleHost` via
`getCurrentScope()` + a `WeakMap` (§6.3), and the component scope is current
not only during `setup()` but also inside the `onMount` drain
(`runWithScope(componentScope, () => _runMounts(lc))`,
`define-component.ts:322/:627`). So `tryOnCommit` is legal from **setup or
onMount** — which is exactly what you want: "measure after the third-party
widget I just created in `onMount` finishes its own layout" is a legitimate
`onCommit` use site, and it must not throw. `LifecycleHost.onCommit` (§6.3) is
therefore specified as valid whenever the component scope is current, full
stop — it is not re-gated on `_cur`, and the bare runtime export's tighter
`_cur` window is a property of *that one entry point*, not of the underlying
mechanism. If you only ever reach `onCommit` through `.aihu` templates or
through `tryOnCommit`, this distinction is invisible; it matters only to
someone calling the raw `@aihu/runtime` export directly from hand-written TS.

**Why rAF and not a microtask.** A microtask buys nothing `onMount` doesn't already
have: no layout has occurred, and — decisively — a microtask queued during parsing runs
at the end of the *current parser task*, which is not correlated with the element's
closing tag, so light-DOM children still may not be parsed. rAF is the first moment the
platform guarantees style and layout are current if you ask for them, and it is the
natural coalescing point: one queue, one frame callback, one forced reflow for the whole
page instead of one per component.

**Why not `ResizeObserver`-first-callback.** That is a size-specific trick (and
`useElementSize` already owns it). It fires for elements that never change size but not
for `display:none` ones, and it says nothing about focus or third-party init.

**Why not "after binding flush."** There is no asynchronous binding flush to be after.
`mount()` is synchronous by contract (`arbor/src/mount.ts:14-17`) and `batch()` is an
explicit synchronous flush. "After the flush" is already "the next statement."

### 2.3 Implementation sketch (lives in `@aihu/runtime`)

```ts
// packages/runtime/src/commit.ts   (~90 B gz against runtime's 4500 B row)
interface CommitEntry { fn: () => void | (() => void); live: () => boolean; scope: EffectScope }

let queue: CommitEntry[] = []
let frame = 0

function schedule(): void {
  if (frame) return
  frame = (globalThis.requestAnimationFrame ?? ((cb) => setTimeout(cb, 0) as unknown as number))(flush)
}

/** @internal — also the deterministic test hook. */
export function _flushCommits(): void {
  frame = 0
  const q = queue
  queue = []
  for (const e of q) {
    if (!e.live()) continue                       // disconnected before the frame
    runWithScope(e.scope, () => {
      const teardown = e.fn()
      if (teardown) onScopeDispose(teardown as () => void)
    })
  }
}
```

Ordering is registration order, which is parent-before-child (parents connect first),
matching `onMount`. Throws are contained per-entry (a throwing commit must not strand the
rest of the frame) and logged with the tag, mirroring the `connectedCallback` catch.

The `setTimeout` fallback keeps happy-dom / non-browser test runners working; jsdom has
rAF, so the fallback is only a safety net. `_flushCommits` is exported `@internal` so
tests are deterministic instead of `await new Promise(requestAnimationFrame)`.

### 2.4 Compiler surface

Two edits, both mechanical:

- `packages/compiler/src/parser/state_wrappers.rs:51-63` — add `"onCommit"` to
  `STATEMENT_INTRINSICS`, and to the `"onMount" | "onDispose" | ...` match at
  `:889-896` with key `"commit"`.
- `packages/compiler/src/codegen/state_emit.rs:1013-1032` — add
  `"commit" => onCommit({am}() => { ... })`.

`$ref` continues to lower to `onMount` (unchanged): refs must be live *before* commit,
and they are.

### 2.5 Where does it live given `@aihu/use` cannot depend on `@aihu/runtime`?

`onCommit` itself lives in `@aihu/runtime` (it needs the `_cur` owner pointer and owns
the rAF driver). `@aihu/use` reaches it through the lifecycle-host contract of §6, as
`tryOnCommit()` — the exact mirror of the existing `tryOnScopeDispose()`.

### 2.6 The hydration path — previously unspecified

`define-element.ts`'s hydration branch (`:46-72`) is a **third entry point**, distinct
from both `connectedCallback` forms in `define-component.ts`. When
`enableHydration && _hydrateFn !== null` and a server snapshot exists for this
component name, `Wrapped.connectedCallback` calls `ctor._build?.()` directly through
`_hydrateFn` and **returns early** — `define-component`'s own `connectedCallback` (the
one that runs `_mount()` and drains `onMount` via `runWithScope(...,  () =>
_runMounts(lc))`) **never executes** on this path. This has two consequences the
design must specify, not leave implicit:

**`connected` — works for free, if wired at the right layer.** `_build()` runs
identically on both the normal-connect and hydration paths (the hydration branch's
whole premise is calling the same `_build()`). §4.1 places the `connected` signal's
creation *inside* `_build()`, before `es.run(setup)` — so a hydrated component gets a
real, live `connected()` signal with no special-casing, **provided** the flip-to-false
half is wired symmetrically. It is not, as originally specified: §4.1's pseudocode put
`_connections.get(this)?.(false)` directly in `disconnectedCallback`, but the
hydration bridge's `disconnectedCallback` (`define-element.ts`) never calls
`define-component`'s `disconnectedCallback` — it calls `_stopComponentScope(this)`
directly. **Fix: move the flip into `_stopComponentScope()` itself** (the one helper
already shared by both the real `disconnectedCallback` and the hydration bridge),
not into `disconnectedCallback`'s body. That one relocation makes `connected()` correct
on every teardown path with no duplicated logic.

**`onCommit` — fires post-hydration, and that is the useful behavior, but it is a
genuine asymmetry with `onMount` that must be documented.** The compiler emits
`onCommit(...)` calls inside the setup body (§2.4), and `setup()` runs under `_cur` on
*both* `_build()` call sites — so a hydrated component's `onCommit` registrations are
queued into the shared rAF queue exactly as a client-rendered component's are. Each
queued entry's `live()` check (§2.3) is specified against `connected()` — **not**
against whether `_runMounts`/`onMount` ran — so, once the `connected`-wiring fix above
is in place, a hydrated component's `onCommit` callbacks correctly fire on the next
shared frame after hydration. This is deliberately the more useful semantic (the
measure/focus/third-party-init use cases in §2.1 apply just as much to a hydrated
component as a client-rendered one) — but it means **`onCommit` fires under hydration
while `onMount` does not**, a real and non-obvious asymmetry: `_runMounts(lc)` is only
ever invoked from `define-component`'s own `connectedCallback`, which the hydration
branch's early return skips entirely (a pre-existing gap, noted in-code at the
hydration disconnect bridge, and out of scope to fix here). Two corollaries worth
stating for anyone building on this: (1) since `$ref` lowers to `onMount` (§1.2), refs
are **not** (re-)populated by the `$ref`/`onMount` mechanism on the hydration path —
the hydrate function must already establish them by walking the reconciled tree, which
this design does not change or verify; (2) an `onCommit` body that assumes "my
`onMount` ran first" (e.g. to read a ref) is unsafe under hydration for that reason,
even though it is safe under normal connect.

---

## 3. The re-connect problem

### 3.1 The finding: the composables are not the bug

Trace a move (`parent.appendChild(el)` where `el` is already elsewhere in the document):

1. `disconnectedCallback` → `componentScope.stop()` → every `tryOnScopeDispose` cleanup
   runs (listeners removed, observers disconnected, timers cleared) → `MountScope.dispose()`
   → binding effects disposed → **DOM roots removed** → `LC_SYM`/`PROPS_SYM`/`S` nulled.
2. `connectedCallback` → `_build()` → **brand-new** `effectScope`, **brand-new** prop
   signals, **brand-new** `_LC`, `setup()` runs again from the top → `_mount()` builds a
   **brand-new** DOM tree → `onMount` bodies run again.

So the 24 composables *do* re-arm — they are simply recreated. Each of them is
individually correct here: `useEventListener` (idempotent `stop`, per-run `onCleanup`
rebinding), `useIntervalFn`/`useRafFn` (`disposed` guard so a retained `resume()` cannot
re-arm a dead scope), `useElementSize`/`useElementVisibility`/`useScroll` (observer
disconnect in the effect's `onCleanup`), `useMediaQuery` (`removeEventListener` +
`removeListener` fallback). I found **no single-connect assumption** in any of them.

> **Count, pinned against `origin/main`, not a point-in-time worktree:**
> `packages/use/src` holds 24 composable directories today — `useClipboard`,
> `useColorScheme`, `useCounter`, `useDebounced`, `useDocumentVisibility`,
> `useElementSize`, `useElementVisibility`, `useEventListener`,
> `useEventListenerMap`, `useIntervalFn`, `useLocalStorage`, `useMediaQuery`,
> `useMouse`, `useNow`, `usePreferredDark`, `usePrevious`, `useRafFn`, `useScroll`,
> `useSupported`, `useThrottle`, `useTimeoutFn`, `useToggle`, `useWindowSize`, and
> `watch` (plus `shared/`, not itself a composable). This number moves: it was 22
> in the worktree snapshot this audit originally traced, and is back to 24 because
> PR #532 landed `watch()` and `useEventListenerMap` after that. Re-audited here:
> both new composables follow the same idempotent-`stop`/`onCleanup`-rebind pattern
> as the rest, so the "no single-connect assumption" finding holds for all 24, not
> just the 22 originally traced.

**The bug is one level up: aihu's disconnect is destructive, so a move silently
annihilates all component state.** After a reorder: text inputs lose their value, open
disclosures close, scroll positions reset, entry animations replay, `useLocalStorage`
re-reads (benign) but `$resource` **re-fetches**, `announce()` re-announces, and any
`onMount` side effect runs a second time.

### 3.2 Where this actually bites, today: keyed `each()`

`packages/arbor/src/structural.ts:181-188` — the keyed reorder pass:

```js
if (s.anchor !== ref) par.insertBefore(s.anchor, ref)
else ref = s.anchor.nextSibling
for (const n of nl) n === ref ? (ref = n.nextSibling) : par.insertBefore(n, ref)
```

`insertBefore` on a node that is already in `par` is a **remove-then-insert** per the DOM
spec, which enqueues `disconnectedCallback` + `connectedCallback` for every custom element
in the moved subtree.

**Therefore: reordering a keyed list destroys and rebuilds every child component in it.**
That is the precise opposite of what keying is for. Sort a table by a column and every
`<my-row>`'s local state is gone.

**Remedy (recommended, small — but the mechanism below was previously stated
backwards and had to be corrected):** use the platform's atomic move, *and* opt
every aihu-defined custom element into state preservation.

**How `moveBefore()` actually behaves (WHATWG DOM, verified against spec text
and shipped Chromium/Firefox behavior — not from memory).** `moveBefore()` is a
DOM primitive that relocates a node while preserving platform state (focus,
`<iframe>` contents, video playback, CSS animations, and — for custom elements
— JS state), **but only if the custom element opts in.** The opt-in is
`connectedMoveCallback`: if a custom element class defines it, `moveBefore()`
fires `connectedMoveCallback()` *instead of* `disconnectedCallback` +
`connectedCallback`. **If the class does NOT define `connectedMoveCallback` —
even an empty one — `moveBefore()` falls back to firing
`disconnectedCallback` followed by `connectedCallback`**, exactly as
`insertBefore` does today, specifically for backward compatibility with
custom elements written before this API existed. The presence of the method,
not its body, is what triggers the fast path — the spec explicitly blesses an
empty `connectedMoveCallback(){}` as a valid "yes, I handle moves" signal.

**Grepping `packages/` for `connectedMoveCallback` finds zero hits.** Neither
`defineComponent`'s two returned classes (`define-component.ts:253`, `:455`)
nor `define-element.ts`'s `Wrapped` class define it. So the code sketch as
originally written — swap `insertBefore` for `moveBefore` in
`structural.ts` and stop there — **would not fix the flagship bug**: every
aihu custom element would still take the disconnected+connected fallback path,
`disconnectedCallback` would still run `scope.stop()` +
`MountScope.dispose()`, and child component state would still be destroyed on
every keyed reorder. The remedy has two parts, not one:

```js
// packages/runtime/src/define-component.ts — BOTH class forms, and
// define-element.ts's Wrapped class. An empty body is spec-sufficient: its
// mere presence tells the platform "do not fall back to disconnect+connect."
// We deliberately do NOT run setup again, do NOT re-run onMount, and do NOT
// touch the effect scope — that is the entire point of opting in.
connectedMoveCallback(): void {
  // intentionally empty — see comment above
}
```

```js
// packages/arbor/src/structural.ts — the keyed reorder pass.
// state-preserving atomic move: with connectedMoveCallback defined (above),
// this skips disconnectedCallback/connectedCallback entirely — no scope stop,
// no rebuild. Falls back to insertBefore where moveBefore is unsupported, or
// when either node is disconnected (moveBefore throws HierarchyRequestError
// there — a same-document, both-already-connected move is a precondition).
const mv = (par, node, ref) => {
  if (par.moveBefore && node.isConnected && par.isConnected) {
    try { par.moveBefore(node, ref); return } catch { /* fall through */ }
  }
  par.insertBefore(node, ref)
}
```

**A real cost, stated plainly: context does not re-resolve after a move.**
`_enterOwnerContext` runs once, at the original `_build()`/`connectedCallback`
(`define-component.ts:271`, `:573`), and captures the `PROVIDES_SYM` chain
from the ancestor the element was connected under *at that time*. Because
`connectedMoveCallback` runs neither `_build()` nor `connectedCallback`, a
component moved to a new parent — even a new parent that `provide()`s
different values — keeps the DI chain it originally resolved. State survives;
context does not re-resolve. This is the correct trade for a reorder within
the same list (the common case: sorting a table by a column, where every row
shares the same providers), and it must be documented as a deliberate
consequence, not discovered later as a bug.

**Browser support today (mid-2026): real, but not universal.** `moveBefore()`
shipped in Chrome/Edge 133 (Feb 2025) and Firefox 144 (Oct 2025); Safari has
not shipped it. The `par.moveBefore &&` feature-detection above is load-
bearing, not decorative — on Safari (and any older evergreen browser) every
call falls through to `insertBefore`, so **the fix is a progressive
enhancement**: state-preserving reorders on Chromium/Firefox today, the
existing destroy-and-rebuild behavior everywhere else, with no regression
either way. It is a viable remedy for the DOM-move-destroys-state problem —
not a hypothetical one — but only where the browser and the opt-in are both
present; ship both parts (the `connectedMoveCallback` opt-in *and* the
`structural.ts` change) together, and add a test that specifically asserts
child component state survives a keyed reorder in a `moveBefore`-capable
environment (the test matrix needs a real Chromium/Firefox run, not a jsdom
stub — jsdom does not implement `moveBefore` as of this writing).

Same fix applies to any future portal/drag-drop helper. Consider exporting the
`mv` helper from `@aihu/runtime` as `moveTo(parent, node, before)` (~30 B) so
app code doing manual reparenting gets the same guarantee — budget permitting
(§6.4 revised).

### 3.3 `onAdopt` is unreachable dead code

A cross-document move is, per DOM spec, three reactions in order: **disconnected →
adopted → connected**. `disconnectedCallback` sets `this[LC_SYM] = null`
(`define-component.ts:350`, `:698`). `adoptedCallback` then does:

```js
adoptedCallback(): void { const lc = this[LC_SYM]; if (lc) _runAdopts(lc) }   // :356-359, :681-684
```

`lc` is always `null` at that moment. And an element that was never connected also has
`LC_SYM === null`. **There is no path on which a userland `onAdopt` callback can ever
run.** The API exists in the compiler (`state_wrappers.rs:55`, `state_emit.rs:1021`), the
runtime (`_onAdopt`, error code SCR-R0012), and the public exports — and it is inert.

**Recommendation: remove `onAdopt` from the public surface.** Not because adoption
doesn't happen, but because adoption is *already fully covered by the connect cycle*:
the element is disconnected, adopted, and reconnected, and reconnect re-runs `setup()`
in the new document. There is nothing left for an adoption hook to do. Keeping it is
the definition of encoding a false model — a hook that names a phase the user cannot
observe and does not need.

### 3.4 Other reconnect defects found

- **Hydrated components revert to their SSR snapshot on reconnect.**
  `define-element.ts:44-72` re-reads `globalThis.__aihu_state__[name]` on *every*
  `connectedCallback` and never clears it. Move a hydrated component and it re-hydrates
  from the stale server snapshot — user edits vanish. (Secondary smell: the snapshot is
  keyed by component **name**, not instance, so N instances share one snapshot.)
- **Scopeless composable calls leak once per connect cycle.** `tryOnScopeDispose`
  returns `false` when no scope is current (`use/src/shared/index.ts:82-88`). The current
  scope is cleared inside *every* `effect()` body (P0-1, `scope.ts:177-183`) and for the
  whole of arbor `mount()` (P0-2b, `mount.ts:367`). So
  `effect(() => { useEventListener(window, 'resize', h) })` registers a listener that
  **nothing** ever disposes — and because reconnect re-runs `setup()`, each move adds
  another. Unbounded growth under repeated reorders. Mitigation: a `__DEV__` warning
  when a `@aihu/use` composable finds no scope *while a lifecycle host is attached to
  the enclosing element* (§6 makes this detectable), plus an explicit doc rule:
  **composables belong in setup or `onMount`/`onCommit`, never inside an `effect()` body.**
- **`ATTR_SYM` is not nulled on disconnect** while `PROPS_SYM` is
  (`define-component.ts:697-699` vs `:654`). A post-disconnect attribute change writes
  into dead legacy attr signals. Harmless today (no subscribers survive `scope.stop()`),
  but it is an asymmetry that will read as a live signal to the next maintainer.
- **Userland `onAttributeChange` silently drops while disconnected** (`lc` is `null`).
  Correct behaviour, but it must be documented — and it is another reason to demote
  `onAttributeChange` to an escape hatch in favour of `$prop` signals + `effect()`.
- **A throwing `connectedCallback` leaves `LC_SYM` set** (the catch at `:323-335` /
  `:628-638` nulls nothing), so a later `attributeChangedCallback` dispatches userland
  handlers into a half-dead component.
- **The hydration disconnect bridge never nulls `LC_SYM` either** — the same defect,
  on a second path. `define-element.ts`'s hydration-branch `disconnectedCallback`
  (§2.6) calls `_stopComponentScope(this)` directly and never touches `this[LC_SYM]`,
  so a hydrated-then-disconnected component also leaves `LC_SYM` set and is exposed to
  the identical stale-`attributeChangedCallback` hazard. One fix should cover both:
  null `LC_SYM` inside `_stopComponentScope()` itself (the helper both paths already
  call) rather than duplicating the null-out at each of the three call sites.

### 3.5 What I would *not* do about it

**Do not add a deferred/graced disconnect** ("wait a microtask before tearing down, so a
synchronous reparent is a no-op"). It is the obvious fix and it is wrong here:

1. It breaks the synchronous, deterministic teardown contract that `onCleanup` authors
   and every test rely on.
2. It opens a window in which two instances of a would-be-singleton component are alive.
3. It leaks (listeners, timers, observers, sockets) for the grace period on *genuine*
   removals, which are the common case.
4. `moveBefore` + an empty `connectedMoveCallback` opt-in (§3.2) fixes the dominant
   source of moves at the source, on browsers that support it, with platform
   semantics instead of invented ones — no grace period, no invented state.

**Do not build keep-alive / `onActivated` / `onDeactivated`.** That is a cache with a
lifecycle bolted on. The problem is that we destroy state we shouldn't; the fix is to
not destroy it.

**Do add a `__DEV__` "you moved me" warning** (fully DCE'd in prod): if
`connectedCallback` re-runs on an element whose `disconnectedCallback` fired in the same
task, warn once — *"`<my-row>` was moved with insertBefore/appendChild; its state was
destroyed and rebuilt. Use `parent.moveBefore(...)` for a state-preserving move."* This
converts the single nastiest silent failure in the framework into a one-line console
message.

---

## 4. `connected` as a signal

### 4.1 Design

One signal per **instance per connection**, created in `_build()` *before* `setup()`
runs, and **latched** at disconnect:

```ts
// define-component.ts::_build(), before es.run(setup)
const [connected, setConnected] = _signal!(true)
_connections.set(this, setConnected)          // module-level WeakMap

// disconnectedCallback — FIRST, before scope.stop()
_connections.get(this)?.(false)
_connections.delete(this)
try { _componentScopes.get(this)?.stop() } finally { ... }
```

Exposed three ways, all backed by the same signal:

```ts
interface SetupContext {
  readonly host: ShadowRoot | Element
  readonly element: HTMLElement
  /** `true` for the lifetime of THIS connection; latches `false` at disconnect
   *  and never returns to `true`. A reconnect gets a fresh setup with a fresh
   *  signal. Read as `{connected()}` in templates. */
  readonly connected: () => boolean
}
```

- **`.aihu`**: `connected` becomes an ambient in `@state` (no new intrinsic keyword —
  it is a context field, read as `connected()`).
- **`@aihu/use`**: `useConnected()` (§5), for composables that never see `SetupContext`.

### 4.2 The three design decisions, justified

**(a) Latched, never re-armed.** This is the crux. If `connected` flipped back to `true`
on reconnect, then a stale continuation from connection #1 that captured `connected`
would resume and see `true` — and happily write to signals whose consumers were destroyed,
or mutate DOM nodes that were removed. Because reconnect creates a *new* signal for the
*new* setup, the old getter is a perfect **liveness token for the setup instance that
captured it**. `connected()` answers "am *I* still the live instance?", which is the
only question an async continuation actually has.

Corollary: **no generation counter is needed.** A monotonically-increasing
`connectionCount` would only be useful to code that outlives a connection, and such code
is by construction not in the component scope. **I would not build it.**

**(b) A signal, not `element.isConnected`.** Three reasons, all disqualifying for the DOM
property: it is `true` again after a reconnect (so it cannot distinguish connections — see
(a)); it is not reactive, so `effect(() => ...)` cannot depend on it; and it requires an
element reference, which composables in `@aihu/use` do not have.

**(c) Set before `scope.stop()`.** Ordering is the whole point: `onCleanup` bodies and
in-flight `await` continuations must observe `false`. Setting it after the stop would make
it useless to precisely the code that needs it.

### 4.3 Cost

One `signal()` per instance — two closures, a WeakMap entry, ~40 B gz in
`@aihu/runtime` (4500 B row, plenty of room). **Zero bytes in `@aihu/signals`.**

---

## 5. What `useMounted` should be, and what happens to `tryOnMounted`

### 5.1 `useMounted()` — do not ship it

In Vue/React, `useMounted()` exists because `setup`/render runs *before* the DOM exists,
so there is an observable interval where `mounted === false`. In aihu, setup runs inside
`connectedCallback` and `onMount` drains synchronously in the same block. **There is no
moment at which any user code can observe `mounted === false` on the client.** A faithful
implementation is:

```ts
export function useMounted() { return { mounted: () => isClient } }   // a constant
```

Shipping that is shipping an API-shaped lie: it teaches "there is a mount transition to
wait for," which sends users looking for a phase that does not exist and makes them
write `if (mounted())` guards that are dead branches.

### 5.2 Ship `useConnected()` instead

```ts
// @aihu/use/useConnected
export interface UseConnectedReturn {
  /** `true` while THIS connection is live; latches `false` at disconnect.
   *  Read as `{connected()}` in templates (parens required).
   *  Fallbacks: `false` under SSR; a constant `true` for a client caller with
   *  no component host (a plain module — there is no element, so there is no
   *  disconnection to observe). */
  readonly connected: () => boolean
  /** `true` when a component host was found — i.e. `connected` is a real
   *  liveness token rather than the constant fallback. */
  readonly owned: boolean
}
export function useConnected(): UseConnectedReturn
```

This is the *connection-state signal, not a one-shot flag* the brief asks for, and it is
the composable-side twin of `SetupContext.connected`.

### 5.3 `tryOnMounted` — remove it, do not fix it

Current body (`use/src/shared/index.ts:102-104`):

```ts
export function tryOnMounted(fn: () => void): void { if (isClient) fn() }
```

The doc comment is candid that this is an interim stub pending a runtime dependency. Two
facts decide it:

1. **It has zero in-repo callers.** Grep across `packages/` finds it only in
   `use/src/index.ts` (barrel re-export), `use/src/shared/index.ts` (definition),
   `use/tests/shared.test.ts`, `use/tests/ssr-safety.test.ts`, and generated `dist/*.d.ts`.
   **No composable uses it.** Removal cost is a barrel line and two tests.
2. **"Fixing" it means making it mean `onMount`** — and `onMount` in aihu is "now" (§1.2),
   so the fixed version would be byte-identical to the stub. The stub is not broken; the
   *name* is. A function named `tryOnMounted` whose correct implementation is `fn()`
   exists only to import a foreign framework's phase vocabulary.

**Recommendation: delete `tryOnMounted` from `@aihu/use` (root + `/shared`).** Replace it
with the hook that names something real:

```ts
/**
 * Register `fn` to run at the next commit (post-layout, pre-paint).
 * - With a component host: routed to the runtime's `onCommit` — coalesced into
 *   the shared frame, cancelled if the element disconnects first, teardown
 *   registered into the component scope. Returns `true`.
 * - Without a host, on the client: a one-shot `requestAnimationFrame`. The
 *   caller owns cancellation. Returns `false`.
 * - Under SSR: no-op. Returns `false`.
 *
 * The exact mirror of `tryOnScopeDispose`: "owned by the surrounding component
 * if there is one; still does the honest thing if there isn't."
 */
export function tryOnCommit(fn: () => void | (() => void)): boolean
```

This is a **breaking change to `@aihu/use@0.3.0`**. Per the ratified "no external
consumers" position, the blast radius is in-repo examples and the fellwork web app; both
are ours. Do it now, in one minor, rather than carrying a misnamed no-op forever.

---

## 6. The `@aihu/runtime` layering problem — recommendation

### 6.1 The constraint

Real lifecycle hooks (`onCommit`, the `connected` signal) live in `@aihu/runtime`,
because they need the setup-time owner pointer (`_cur`) and the rAF driver.
`@aihu/use` is signals-only by design (`use/package.json` → `dependencies:
{ "@aihu/signals": "workspace:*" }`), and every composable is a separate subpath entry
with its own size-limit row.

### 6.2 The options

**(A) Relocate the lifecycle composables into `@aihu/runtime`.** Rejected. It pollutes a
custom-element runtime with utility composables, breaks the per-composable subpath +
size-limit discipline `@aihu/use` is built on, and — worst for DX — splits one mental
model across two import sources: `useConnected` from `@aihu/runtime` but `useEventListener`
from `@aihu/use`. Users will never remember which is which.

**(B) One sanctioned runtime-importing subpath in `@aihu/use`.** Smallest diff, and
tempting. Rejected for three reasons: (i) `use/src/index.ts` re-exports **everything**, so
the barrel would drag `@aihu/runtime` into every consumer — the exception survives about
two PRs before someone adds the entry to the barrel "for consistency"; (ii) it inverts the
layering (a utility library depending on the element runtime), which permanently forecloses
`@aihu/runtime` ever consuming `@aihu/use`; (iii) it destroys the property that composables
work in a plain TS module, a worker, or an SSR bundle without pulling in custom-element code.

**(C) `@aihu/runtime` exposes a tiny signals-only contract that `@aihu/use` consumes.**
**Recommended.**

### 6.3 The recommendation, concretely

Add a new **tree-shakable subpath entry** `@aihu/signals/lifecycle` — a DOM-free
*ownership contract*, not a lifecycle implementation:

```ts
// packages/signals/src/lifecycle.ts   —  ~250 B gz, its own size-limit row
import { type EffectScope, getCurrentScope } from './scope.ts'

/** What a component runtime offers to code owned by its scope. DOM-free by
 *  construction: booleans and callbacks only. The runtime supplies the driver. */
export interface LifecycleHost {
  /** Liveness of THIS connection; latches false at disconnect. */
  readonly connected: () => boolean
  /** Post-layout, pre-paint, once per connection; cancelled on early disconnect.
   *  A returned teardown is registered into the owning scope. Valid whenever
   *  this scope is current — i.e. during setup OR inside an onMount body —
   *  which is deliberately a WIDER window than the bare `@aihu/runtime`
   *  `onCommit` export's `_cur` gate (§2.2): this method is reached through
   *  `getCurrentScope()`, not `_cur`, so calling it from `onMount` (via
   *  `tryOnCommit`, §5.3) is legal and does not throw SCR-R0014. */
  onCommit(fn: () => void | (() => void)): void
}

const hosts = new WeakMap<EffectScope, LifecycleHost>()

/** @internal — called by @aihu/runtime at `_build()` time. */
export function _attachLifecycleHost(scope: EffectScope, host: LifecycleHost): void {
  hosts.set(scope, host)
}

/** The lifecycle host owning the current scope, or `undefined` when there is
 *  none (scopeless caller, non-component code, or inside an effect body where
 *  the current scope is deliberately cleared — P0-1). */
export function getLifecycleHost(): LifecycleHost | undefined {
  const s = getCurrentScope()
  return s === undefined ? undefined : hosts.get(s)
}
```

- **`@aihu/runtime`** imports `_attachLifecycleHost` and calls it in `_build()`, right
  after `_componentScopes.set(this, es)`. It owns the rAF queue and the `connected`
  signal. This is the same injection pattern already used by `_setMount`, `_setSignal`,
  `_setHydrate` — but typed, public, and one-directional instead of a side channel.
- **`@aihu/use/shared`** implements `tryOnCommit` and `useConnected` on top of
  `getLifecycleHost()`, with the isClient/rAF fallbacks. No new dependency: `@aihu/use`
  already depends on `@aihu/signals`.
- **Nobody else** needs to know. `@aihu/primitives`, `@aihu/store`, `@aihu/router` can all
  opt in for free.

### 6.4 Why this is the right layer, and why the size budget is safe

- **Conceptually it is not a lifecycle module — it is ownership metadata keyed on the
  thing that already owns.** The founder's framing is that aihu has ownership, not
  lifecycles. The `EffectScope` *is* the ownership unit. Hanging "what kind of owner is
  this?" off the scope is the model, not a workaround. It also uses only signals' public
  API (`getCurrentScope`), so it touches no internals.
- **The guarded budget is untouched.** `.size-limit.json` sets the
  `packages/signals/dist/index.js` limit at 2350 B; the current build measures ~2273 B
  gz — **~77 B headroom**, tighter than earlier estimates in this doc suggested. It does
  not change the conclusion (`lifecycle.ts` adds 0 B to this row regardless of how tight
  it is), but it means there is effectively no slack left for anything else to land in
  `signals/dist/index.js` before this arc ships. `lifecycle.ts` is a **separate rolldown
  entry** (`dist/lifecycle.js`) that `index.ts` must never import, so it gets its **own
  row** (`"@aihu/signals/lifecycle": "300 B"`) and adds **0 B** to the guarded one. This
  must be enforced: a CI assertion that `dist/index.js` contains no `hosts`/WeakMap-
  lifecycle symbols, or simply the existing size row failing if someone cross-imports.
- **The `@aihu/runtime` budget is real but not loose, and the estimates in this doc are
  byte-budget guesses, not `size-limit` measurements — re-run `size-limit` before
  committing to them.** The row limit is 4500 B; the current build measures ~4311 B gz,
  **~189 B headroom**. This design's own additions — `onCommit` (~90 B), the per-instance
  `connected` signal (~40 B), and the optional `moveTo` re-export (~30 B) — sum to ~160 B,
  leaving only ~29 B of margin, and that is *before* the §3.5 `__DEV__` "you moved me"
  warning (DCE'd in production, so it should cost ~0 B in the row that matters, but that
  claim itself wants a `size-limit` run, not an assumption). If the real numbers don't
  fit: drop `moveTo` from this arc first (§3.2 already frames it as "consider exporting,"
  not required) rather than trimming `onCommit` or `connected`, which are load-bearing.
- **Graceful degradation is uniform.** `getLifecycleHost()` returning `undefined`
  behaves exactly like `getCurrentScope()` returning `undefined` — one rule for the whole
  library: *if there is no current scope, you own it yourself.*

**Fallback position** if the founder rejects a new signals subpath: option (B), with the
single allowed import site pinned by a lint rule and the barrel explicitly excluding the
lifecycle entry. It works; it is just structurally weaker and will erode.

---

## 7. The DX story

Five canonical cases. Nothing here introduces a new mental model — it is
`onMount` (template exists) / `onCommit` (layout exists) / `onCleanup` (I am being
disposed) / `connected()` (am I still live) / `effect()` (react to change).

### 7.1 Measure after render

```html
@state {
  const box = ref()
  let width = state(0)

  onCommit(() => { width = box.getBoundingClientRect().width })
}
@template {
  <div ref={box}>…</div>
  <p>{width()}px</p>
}
```

`onMount` would give `0` under a not-yet-applied stylesheet or mid-parse. `onCommit`
gives the real number, and every component on the page shares one forced reflow.

### 7.2 Focus on open

```js
@state {
  const input = ref()
  const open = prop({ default: false })

  effect(() => { if (open()) onCommit(() => input.focus()) })   // ✗ WRONG
}
```

**Wrong** — `onCommit` is a setup-time registration, and inside an `effect()` body the
current scope is cleared (P0-1), so it would throw `no owner`. The right shape uses the
platform's own post-layout tool:

```js
@state {
  const input = ref()
  const open = prop({ default: false })

  onCommit(() => { if (open()) input.focus() })      // initial open
  effect(() => { if (open()) requestAnimationFrame(() => input.focus()) })  // subsequent
}
```

This asymmetry is real and worth documenting bluntly: **`onCommit` is for the *connection*
commit, not for every state change.** For per-change post-layout work, use rAF inside the
effect. (A future `afterEffect(fn)` could sugar it — see §8, not recommended now.)

### 7.3 Initialize / destroy a third-party widget

```js
@state {
  const el = ref()

  onCommit(() => {
    const chart = new ThirdPartyChart(el, { data: data() })   // container has a real size
    effect(() => chart.setData(data()))                       // scope-owned: dies with us
    return () => chart.destroy()                              // joins the LIFO teardown
  })
}
```

`onCommit`'s returned teardown lands in the same unified LIFO list as `onCleanup`
(`define-component.ts:52-57` semantics), so `chart.destroy()` runs before the DOM is
removed — which is what these libraries require.

### 7.4 Cancel in-flight work on disposal

Two levels, both first-class:

```js
@state {
  const ac = new AbortController()
  onDispose(() => ac.abort())                     // hard cancel

  onMount(async () => {
    const rows = await fetch('/api/rows', { signal: ac.signal }).then(r => r.json())
    if (!connected()) return                      // moved or removed mid-flight
    items = rows
  })
}
```

`connected()` is the latched liveness token from §4: after a move, the *old* setup's
`connected()` is permanently `false`, so its continuation bails while the *new* setup
proceeds. `element.isConnected` would have returned `true` here and let both run.

### 7.5 React to attribute changes

The default answer is **not** a lifecycle hook:

```js
@state {
  const size = prop({ default: 'md' })          // attribute → signal, already reactive
  effect(() => applyTheme(size()))
}
```

`onAttributeChange` is the escape hatch, for observed attributes with no prop and for
raw old/new string pairs:

```js
onAttributeChange((name, oldValue, newValue) => { … })   // only fires while connected
```

### 7.6 Reference card

| I want to… | Use |
|---|---|
| create state, derive, wire reactions | the `@state` body (setup) |
| touch the template / `$ref`s | `onMount` |
| measure, focus, hand to a third-party lib | **`onCommit`** |
| free anything I created | `onDispose` (`onCleanup`) — one channel, LIFO |
| know if I am still the live instance after an `await` | **`connected()`** |
| react to a prop/attribute change | `effect()` over the `$prop` signal |
| react to an unmapped raw attribute | `onAttributeChange` (escape hatch) |
| survive a DOM move | `parent.moveBefore(...)` **on an element whose class defines `connectedMoveCallback`** (§3.2) — without that opt-in, or on a browser without `moveBefore`, it falls back to today's destroy-and-rebuild |
| react to a document adoption | nothing: it is a disconnect + connect; setup re-runs |

---

## 8. What I would NOT build

1. **`onMounted` / `onBeforeMount` / `onUnmounted`** — degenerate or duplicate. §1.3.
2. **`onUpdated` / `onBeforeUpdate` / a component-wide render hook** — there is no render
   pass to hook. This is the most damaging possible false model. §1.3.
3. **`useMounted()`** — a constant `true` wearing an API costume. §5.1.
4. **A "fixed" `tryOnMounted`** — the fixed version is byte-identical to the stub; the
   name is the defect. Delete it. §5.3.
5. **`onAdopt`** — structurally unreachable; adoption is already a disconnect+connect.
   Remove from compiler, runtime, and exports. §3.3.
6. **A connection generation counter** — the latched per-connection signal already answers
   every question a counter would. §4.2.
7. **Deferred / graced disconnect** — nondeterministic teardown, double-instance windows,
   and leaks on genuine removals. Fix moves with `moveBefore` instead. §3.5.
8. **keep-alive / `onActivated` / `onDeactivated`** — a cache with a lifecycle bolted on.
9. **`onErrorCaptured` on the disposal owner** — would silently merge two of the three
   deliberately-separate ownership trees. §1.3.
10. **`afterEffect(fn)` / post-layout-per-change sugar** — the rAF-inside-effect pattern
    (§7.2) is three tokens longer and teaches the actual mechanism. Revisit only if it
    shows up repeatedly in real app code.
11. **Anything in `@aihu/signals/dist/index.js`** — the lifecycle contract is a separate
    entry precisely so the 2350 B row never moves. §6.4.

---

## 9. Open questions for the founder

1. **Does `@aihu/signals/lifecycle` belong in `signals`, or in a new `@aihu/lifecycle`
   micro-package?** I recommend the subpath (no new publish ritual, no new dependency
   edge, contract is genuinely scope-keyed ownership metadata). A separate package is
   defensible if "signals must contain only reactivity primitives" is a hard rule.
2. **Breaking `@aihu/use@0.3.0`** by deleting `tryOnMounted` and never shipping
   `useMounted` — confirm the "no external consumers" position covers it (I believe it
   does; blast radius is in-repo examples + fellwork web).
3. **`moveBefore` adoption in arbor's keyed `each()`** — this is a behaviour change to the
   reconciler (state now *survives* reorders) **and** requires adding an empty
   `connectedMoveCallback` to every `defineComponent`-produced class and to
   `define-element.ts`'s `Wrapped` class (§3.2) — without it, `moveBefore()` silently
   falls back to disconnect+connect and the fix does nothing. That is more surface than a
   one-line reconciler change and deserves its own tested slice, with a real
   Chromium/Firefox test run (not jsdom — it doesn't implement `moveBefore`). Should it
   ride with this arc or ship first as a standalone fix? My instinct: **ship it first and
   separately**, because it is a bug fix with a much larger user-visible payoff than the
   whole hook design — but flag the context-does-not-reresolve consequence (§3.2) to
   whoever reviews that slice, since it is easy to ship without noticing.
4. **Hydration reconnect** (`__aihu_state__` replayed on every connect, keyed by component
   name not instance) — in scope here, or a separate hydration slice? It is a real
   data-loss bug either way.
5. **`onCommit` throw policy** — contain per entry and log with the tag (my proposal), or
   let it propagate out of the rAF callback? Containment is friendlier; propagation is
   more consistent with `connectedCallback`'s fail-loud catch-log-rethrow.
6. **Should `connected` be an ambient in `@state`, or reached via `ctx.connected`?**
   Ambient is better DX and matches `ctx.host` usage in the cookbook, but it adds an
   identifier to the compiler's implicit namespace.
