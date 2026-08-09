# @aihu/arbor

## 4.1.1

### Patch Changes

- [#778](https://github.com/fellwork/aihu/pull/778) [`9df850b`](https://github.com/fellwork/aihu/commit/9df850b3d0f93d1fa752cbbeb3038a831cf15edf) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Fix defects found reviewing SSR child rendering.

  - A server-rendered child host was duplicated on hydrate. It is the first
    element to carry both `data-aihu-path` and `data-aihu-ssr`, and `closest()`
    matches the element itself, so each host became its own path-map boundary and
    was re-materialized instead of adopted.
  - Each render path held half the server-render environment: the compiled fast
    path had no effect scope (so `onCleanup`, `$stream` and most composables
    threw), the walker had no lifecycle window (so `onMount` threw). Both now open
    both.
  - The walker resolved children at runtime-built paths (inside `{#each}`) that
    the compiled emitter declines, a byte divergence with a registry present.
  - A shadow child's declarative template shipped only its authored `@style`
    block; css-engine utility CSS and design tokens are now folded into
    `__aihu_css__` too.
  - Child renders are memoized and budgeted by output bytes, so a fan-out graph
    cannot exhaust build memory.

## 4.1.0

### Minor Changes

- [#762](https://github.com/fellwork/aihu/pull/762) [`ac9c045`](https://github.com/fellwork/aihu/commit/ac9c04599b2fbf57c9f39a39e1c9db7fe1388028) Thanks [@srmcguirt](https://github.com/srmcguirt)! - `hydrate()` now adopts server-rendered structural segments (`each`/`if` content) IN PLACE instead of replacing them.

  Previously the walker located a structural segment by its `<!--aihu:s:PATH-->` … `<!--aihu:/s:PATH-->` delimiters, removed the server's DOM, and materialized fresh nodes into its position (adopt-by-replace). Now `_adoptStructural` claims the segment's existing DOM into live reconciler child scopes and wires the same reconcile effect a fresh materialize would, with the state pre-seeded so the effect's first run confirms the adopted DOM:

  - **Keyed lists** match rows BY KEY: each client item's row is located through the `data-aihu-path` the server stamped from the same key (`PATH.list.<key>`), so matching is position-independent. Client-only keys are created by the first reconcile run in position; server-only rows are swept out; adopted rows carry truthful `anchor`/`disposers`/`appendedNodes`/`item`/`pos` bookkeeping, so post-hydration appends, removes, and reorders operate on the adopted DOM correctly.
  - **Conditionals** adopt when the client condition agrees with the server's rendered branch; on disagreement (client-divergent state such as a media query or localStorage) the server content is discarded and the reconciler rebuilds from client truth at the anchor. `elseif`/`else` arms are sibling `when()`s and resolve independently.
  - **Fallback** is always the whole segment: shapes that cannot be claimed safely (unkeyed lists, spine-level element leaves, mid-claim divergence, markerless output) fall back to the previous adopt-by-replace behavior — content still appears exactly once, in order, merely un-adopted.

  On apps/docs' `/guides/getting-started`, the 73 prerendered elements inside structural segments (sidebar sections, nav links, per-link `if` arms) now survive hydration instead of being rebuilt.

  The structural marker pair and `data-aihu-path` scheme are unchanged; no server emission changes are required. `@aihu/arbor`'s size-limit row rises 3350 B → 4000 B to fund the adopter: measured 3963 B gzipped against a 3349 B baseline (+614 B), and the old budget had 1 B of headroom before this change, so the increase could not be absorbed.

- [#762](https://github.com/fellwork/aihu/pull/762) [`ac9c045`](https://github.com/fellwork/aihu/commit/ac9c04599b2fbf57c9f39a39e1c9db7fe1388028) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Move `hydrate` to its own subpath export, `@aihu/arbor/hydrate`.

  The size row measures `dist/index.js`'s whole entry graph, so every consumer
  paid for the hydration walker whether or not it could run — including
  `@aihu/app`'s `spa` mode, whose own comment says it "skips `_setHydrate` — no
  SSR HTML to hydrate". Splitting drops the main entry from 4005 B to 2671 B gz.

  **Migration:** `import { hydrate } from '@aihu/arbor'` becomes
  `import { hydrate } from '@aihu/arbor/hydrate'`. Everything else on the main
  entry is unchanged, which is why this is minor rather than major — but the
  named export did move.

  Two things the split broke and this fixes:

  - `scripts/mangle-dist.mjs` only rewrote `dist/index.js`. A second entry makes
    rolldown hoist shared code into a `mount-<hash>.js` chunk, so property
    mangling silently stopped applying (`appendedNodes`, `disposers` came back
    unmangled) while index.js — now a 344 B re-export shim — matched nothing.
    It globs `dist/*.js` now, so adding an entry can never quietly disable it.

  - `@aihu/app` did not externalise the new subpath. Rolldown's `external`
    matches exact specifiers, so listing `@aihu/arbor` alone let the entire
    walker inline into client.js (4.8 kB → 13.2 kB). Same failure shape as
    `@aihu/context/ssr` and `@aihu/signals/lifecycle`.

  `@aihu/app`'s client also drops below its budget again (30 B over → 29 B
  headroom) through four changes that are each a readability win on their own:
  `Array.from` removed from a static NodeList walk; three near-identical
  meta/link/script upsert blocks folded into one helper; three copies of the
  route-param loop folded into `stampParams`; and `tagName.toLowerCase()`
  replaced with `localName`. The author-facing "layout has no `<outlet>`"
  warning is now `__DEV__`-gated the way arbor gates telemetry — the recovery
  path is not gated, so production still renders.

  The `@aihu/app` size row was also counting `@aihu/store` (a declared peer, like
  every other ignored entry) and `virtual:aihu-components` (a router virtual,
  like the two already listed). Both omissions were oversights.

### Patch Changes

- [#762](https://github.com/fellwork/aihu/pull/762) [`ac9c045`](https://github.com/fellwork/aihu/commit/ac9c04599b2fbf57c9f39a39e1c9db7fe1388028) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Adopt the server-rendered DOM on first render instead of rebuilding it.

  Prerendering used to buy first paint and crawlability but zero client work: the
  client discarded the entire server-rendered subtree and rebuilt it. Measured on
  apps/docs by tagging every prerendered node before hydration and counting
  survivors — **0 of 393**. It is now **320 of 393**, with no duplication (total
  node count identical to a pure client render) and Lighthouse unchanged at
  perf 100 / LCP 1480ms.

  **BREAKING (`@aihu/runtime`):** `DefineOptions.hydrate` is removed. It gated a
  hydration branch in `define-element.ts` that nothing in production ever set —
  the compiler never emitted it — and that branch bypassed `defineComponent`'s
  connect path entirely, so `onMount` never ran under hydration. Rather than
  enable a lifecycle-skipping bypass, the fork is deleted: `defineComponent`'s
  `connectedCallback` is now the single connect path and chooses its renderer
  (`_adoptSsrTemplate` vs `_mount`). Everything downstream — `onMount`, slot
  projection, scope registration, teardown — is byte-identical, so the lifecycle
  cannot drift again.

  The adoptable boundary is server-declared, not client-guessed:
  `renderToString({ wrapTag, hydratable })` stamps `data-aihu-ssr` on the host it
  wraps, meaning "these children are this host's own rendered template". That
  resolves an ambiguity `data-aihu-path` could not — slotted content from a
  parent's server render carries paths too, but its receiving host is never
  marked.

  Three latent bugs surfaced only once adoption ran, and are fixed here: arbor's
  `hydrate()` pathMap collided across nested wrapped renders (the page overwrote
  the layout's root key); `hydrate()` never assigned `branch.el`, silently
  no-op'ing `class:`/`html={}` effects on adopted trees; and the compiler wrapped
  enhanced `<a>` multi-children in a fragment the server never renders,
  duplicating every prerendered link's children.

  Remaining ceiling: structural `each`/`if` segments still use arbor's
  adopt-by-replace, which is why 73 nodes do not survive.

## 4.0.0

### Patch Changes

- [#581](https://github.com/fellwork/aihu/pull/581) [`2f24fa3`](https://github.com/fellwork/aihu/commit/2f24fa3fdc592c85e39f500a48a7e4d3ff67c86d) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Fix two order-integrity regressions in the FEL-408 minimal-move keyed
  reconciler (found by adversarial review of a993aa19; see
  docs/plans/2026-07-25-lis-adversarial-review.md):

  - A mid-reconcile `lgrow()` throw (the supported no-`onError` retry flow) left
    LIS scratch run-lengths in `ChildScope.pos`; the next clean reconcile
    trusted them as DOM positions and silently committed wrong row order. The
    catch path now resets processed rows' `pos` to -1 so the retry repositions
    them cursor-style.
  - With a duplicate key whose refs differ, the reposition walk re-inserted a
    torn-down scope's disposed nodes (a zombie row with dead effects). The walk
    now skips any scope whose anchor is no longer attached.

  Both repros are locked as regression tests that fail on the pre-fix reconciler.

- [#579](https://github.com/fellwork/aihu/pull/579) [`a993aa1`](https://github.com/fellwork/aihu/commit/a993aa19d402c221faa463dfb5d94c86cc87b670) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Keyed `each()` now performs the **minimum** number of DOM moves on a reorder.
  A 2-row swap in a 1000-row list went from **1994 DOM moves to 4**.

  `_reconcileEach`'s reposition pass was a single left-to-right cursor with no
  notion of a stable subsequence: it moved every scope that was not already
  sitting at the cursor. Moving row 998 into slot 1 therefore displaced row 1,
  which displaced rows 2–997, and each of those was relocated individually — at
  two nodes apiece, because a row scope carries an `<!--e-->` anchor comment
  alongside its content. O(n) DOM moves for an O(1) reorder.

  The pass now runs patience sorting over the surviving scopes' current DOM
  order to find the longest increasing subsequence — the rows already in the
  right relative order — and moves only the rest. Instrumented counts on a
  1000-row keyed list (DOM nodes moved; 2 per row scope):

  | operation                  | before | after |
  | -------------------------- | -----: | ----: |
  | swap rows 1 ↔ 998          |   1994 | **4** |
  | swap 1↔498 **and** 501↔998 |   1988 | **8** |
  | full reverse               |   1998 |  1998 |
  | prepend one row            |      3 |     3 |
  | append one row             |      1 |     1 |
  | delete from the middle     |      0 |     0 |
  | no-op re-render            |      0 |     0 |

  Reverse is unchanged because a reversal genuinely has no stable subsequence
  longer than one row — 999 moves is already optimal there.

  Behaviour is otherwise identical. FEL-395's reference-identity teardown (a
  row whose `item` reference changed is torn down and re-grown) and FEL-396's
  `moveBefore()` preference are untouched; this change is only about _which_
  surviving scopes get repositioned. A brand-new row is grown at the end of the
  parent — past anything that follows the `each()` region — so it is explicitly
  held out of the stable subsequence and always placed by the walk.

  Introduced by `9195d20d`, the original v1 reconciler; pre-existing rather than
  a regression. See `docs/plans/2026-07-25-swap1k-investigation.md` for the
  measurement that isolated it: a framework-free control doing 997 moves instead
  of 2 reproduced the regression with no framework code involved.

  Internal cleanup rolled in: `ChildScope.key` was written on every row and read
  nowhere, and `when()`'s child scope carried an `item: null` the conditional
  path never compares. Both are `@internal` and are gone.

- [#546](https://github.com/fellwork/aihu/pull/546) [`edc15f2`](https://github.com/fellwork/aihu/commit/edc15f2a2de541fa8f7ffd6266ad984446206257) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Fix two related keyed-list / node-identity defects (FEL-395, FEL-396):

  - **FEL-395** — `each()`'s reconciler skipped re-growing a row whenever its
    key was unchanged, even when the underlying item was a brand-new object
    with different field values. Since row bodies capture their item by value
    at grow time, replacing a list with new objects sharing the same keys left
    stale field values rendered in the DOM forever. `_reconcileEach` now
    reference-compares the incoming item against the value each `ChildScope`
    was last grown from, and re-grows on a mismatch.

  - **FEL-396** — moving a component within a keyed `each()` (e.g. a reorder)
    destroyed all of its state: inputs lost their values, disclosures closed,
    scroll position reset, entry animations replayed, `$resource` re-fetched,
    and `onMount` side effects re-ran. The reconciler now repositions existing
    rows via the WHATWG `moveBefore()` API where the host supports it (Chrome/
    Edge 133+, Firefox 144+ — not yet in Safari, and not in jsdom, so the
    runtime feature-detects per call and falls back to `insertBefore`, today's
    behavior, everywhere else). `moveBefore` only preserves state for a custom
    element whose class defines `connectedMoveCallback` — an empty body is
    sufficient opt-in — so both of `@aihu/runtime`'s `defineComponent` class
    forms and `defineElement`'s wrapper class now define one.

    Caveat: `connectedMoveCallback` runs neither `_build()` nor
    `connectedCallback`, so a moved component's DI/context (`provide`/`inject`)
    chain does NOT re-resolve — it keeps whatever ancestor `provides` object it
    resolved at first connect, even if the move relocates it under a different
    provider.

    Review follow-up: unlike `insertBefore`, a real `moveBefore()` throws
    `HierarchyRequestError` when handed a node that isn't still attached under
    the same root as the move target — a hazard reachable for a compiler-
    emitted bare-structural row body (`each(..., (item, i) => when(...))`,
    what `{#each}{#if}...{/if}{/each}` lowers to): the nested `when()`'s live
    content nodes land in the outer row's `appendedNodes` snapshot at grow
    time, and that snapshot goes stale (keeps a detached reference) once the
    nested `when()` toggles off, without the outer row itself changing. The
    reposition helper now only takes the `moveBefore` branch for nodes that
    are still attached under the reorder target's root, falling back to
    `insertBefore` otherwise (today's behavior). The underlying staleness —
    `appendedNodes` never getting refreshed when a row's top-level structural
    toggles — is a separate, pre-existing defect, filed apart from this guard.

- Updated dependencies [[`ad6921a`](https://github.com/fellwork/aihu/commit/ad6921a018ef4a479f6540278e549aa9a8cab387)]:
  - @aihu/signals@0.5.0

## 3.0.0

### Patch Changes

- [#524](https://github.com/fellwork/aihu/pull/524) [`18e5f6d`](https://github.com/fellwork/aihu/commit/18e5f6dda93772877690e88e8c217dcdcf4bddc2) Thanks [@srmcguirt](https://github.com/srmcguirt)! - feat(runtime): bind the component root to an effect scope (effect-scope plan §2)

  Every component instance now opens a DETACHED root `effectScope` around its
  `setup()` call; onMount bodies run inside it; the scope stops on disconnect
  (before `MountScope.dispose()` — DOM removal last), on HMR replace, on
  setup-throw, and (via the new define-element bridge) on hydrated-component
  disconnect. Effects/computeds created by composables during setup or onMount
  are automatically disposed on unmount — no manual dispose.

  - `@aihu/signals`: new `runWithoutScope(fn)` — run `fn` with no current scope
    (the explicit opt-out mirror of `runWithScope`).
  - `@aihu/arbor`: `mount()`/`hydrate()` wrap their synchronous effect wiring
    (including error-handler fallbacks) in `runWithoutScope`, so binding effects
    are owned by the MountScope exclusively and are never adopted by a component
    scope — even for a child custom element upgrading synchronously inside a
    parent's scoped `setup()`/`onMount` (P0-2b).

  BEHAVIOR CHANGES:

  - (a) `onCleanup` inside an `effect()` body now throws SCR-R0011 — the current
    scope is cleared for every effect run (P0-1), and the old behavior was itself
    a bug (it only worked on the effect's first run and risked cross-component
    mis-registration). Use the effect's per-run `onCleanup` argument instead.
    `onCleanup` also throws under a STOPPED current scope (async re-entry after
    the owner stopped) instead of silently dropping the callback — and is newly
    LEGAL inside `onMount` bodies and plain `effectScope.run()` frames.
  - (b) Unified-LIFO teardown order (ratified P0-3): everything the component
    owns — composable effect/computed handles, `onCleanup` callbacks, and
    onMount-returned teardowns — lives in ONE component-scope list drained LIFO
    by `scope.stop()`. This REVERSES the previous order (onCleanup FIFO in setup
    order, then onMount teardowns): onMount teardowns now run first (registered
    last), then setup-time cleanups in reverse registration order. All teardown
    still runs before DOM removal.

- Updated dependencies [[`18e5f6d`](https://github.com/fellwork/aihu/commit/18e5f6dda93772877690e88e8c217dcdcf4bddc2), [`ea8d2eb`](https://github.com/fellwork/aihu/commit/ea8d2ebb91c28132f399a708e2bd88877072d1db)]:
  - @aihu/signals@0.4.0

## 2.0.0

### Minor Changes

- [#413](https://github.com/fellwork/aihu/pull/413) [`514336d`](https://github.com/fellwork/aihu/commit/514336da5892c29e9e02d7a6391bb06c62d688c3) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Reactivity correctness pass on @aihu/signals + hot-path refinement of @aihu/arbor.

  Signals — four correctness fixes, each with regression tests:

  - **Diamond graphs with equality suppression no longer miss updates.** The
    equality short-circuit (`shallowClear`) was last-settled-dep-wins: an
    unchanged computed dep could erase the mark contributed by a sibling dep
    that DID change (a written signal or a changed computed), silently skipping
    the effect run or leaving a sibling computed serving a stale cache. A new
    internal `CONFIRMED` flag records "an actual value change reached this sub";
    confirmed marks are immune to equality suppression.
  - **Dynamic dependency pruning.** Effects and computeds now drop dep edges
    they did not re-read on their latest run (`cond() ? a() : b()` unsubscribes
    from `a` after switching to `b`). Previously stale deps notified forever —
    extra effect runs and recomputes on every write to an abandoned branch.
  - **An effect whose first run throws is disposed before the throw
    propagates.** Previously the partially-linked effect stayed subscribed with
    no dispose handle, re-throwing from every later signal write.
  - **A computed whose recompute throws stays STALE.** The next read retries
    `fn()` instead of silently serving the previous cached value.

  Removed (nothing in the repo consumed them): the `$state`/`State` value-shape
  wrapper (use `signal()`; `@aihu/runtime`'s `$state` SFC macro is unrelated and
  unaffected) and arbor's never-thrown `ArborError` export.

  Perf: `drainBatch` no longer allocates a retired array per flush wave
  (index-chunked drain), drain loops are iterator-free, and arbor resolves the
  property-vs-attribute split once at bind time instead of re-running
  `namespaceURI` + `key in el` checks on every reactive attr update.

  **Lattice removed from the core.** `latticeSignal` / `boolLatticeSignal` /
  `maxLatticeSignal` (and the `LatticeSignal` type) are gone from `@aihu/signals`.
  Its only consumer was `@aihu-plugin/data`'s `createResource`, where both uses were
  plain signals in disguise — the bool coalescer is recreated per fetch (so its
  monotone merge was never exercised) and the max signal is a +1 counter. Both are
  migrated to plain `signal()`; equal-write suppression gives the same
  invalidate() coalescing for free. Frees the core of an unused abstraction.

### Patch Changes

- Updated dependencies [[`514336d`](https://github.com/fellwork/aihu/commit/514336da5892c29e9e02d7a6391bb06c62d688c3)]:
  - @aihu/signals@0.3.0

## 1.0.0

### Patch Changes

- Updated dependencies [[`b85f400`](https://github.com/fellwork/aihu/commit/b85f4008c489a0dba9e36cbdfc48b635eeea375f)]:
  - @aihu/signals@0.2.0

## 0.1.5

### Patch Changes

- [#252](https://github.com/fellwork/aihu/pull/252) [`84352bc`](https://github.com/fellwork/aihu/commit/84352bcb901b7213d67727648545b41652b2092a) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Hoist `@aihu/signals` to a `peerDependency` with a caret range (via `workspace:^`) on both `@aihu/arbor` and `@aihu/runtime`. Previously arbor declared `@aihu/signals` as a regular `dependencies` entry and runtime declared it as a `peerDependency` with `workspace:*`. `bun pm pack` rewrites `workspace:*` to an exact pin (`"0.1.0"`) at pack time — so the published manifests carried an exact-version requirement. When a consumer installed `@aihu/signals@0.1.1` at the top level, the package manager satisfied arbor's `0.1.0` pin by installing a second nested copy at `node_modules/@aihu/arbor/node_modules/@aihu/signals`.

  `@aihu/signals` keeps its `currentObserver` tracker in a module-scoped `let`. Two copies of the module → two trackers. arbor's effect set copy-A's tracker; user-code signal getters read copy-B's tracker (always `null`); `linkAdd` was skipped; no subscription was created; signal writes propagated to nothing. The user-visible symptom was `$if` (and any compiler-emitted `when([() => sig()], ...)`) rendering once and never re-evaluating.

  `workspace:^` rewrites to `^x.y.z` at pack time, so the published manifests now carry a range — consumers' hoisted copy satisfies it, the duplicate nested install goes away, and the single module instance keeps a single `currentObserver`.

  Adds a CI lint gate (`bun run lint:dep-pins`) that walks every published `@aihu/*` and `@aihu-plugin/*` package manifest and fails the build if any inter-package dependency is declared as an exact pin (bare semver) rather than a range. Prevents regression of this policy across the workspace.

## 0.1.4

### Patch Changes

- [`70fdad2`](https://github.com/fellwork/aihu/commit/70fdad254bedab492e3b46b131564605d4665537) Thanks [@srmcguirt](https://github.com/srmcguirt)! - fix: create SVG elements in SVG namespace

  `document.createElement('svg')` produces `HTMLUnknownElement` which never paints. All SVG tags now use `createElementNS` so they render correctly. `_setAttrOrProp` bypasses the property fast-path for SVG elements to avoid silently failing on read-only `SVGAnimated*` objects like `viewBox`.

## 0.1.3

### Patch Changes

- fix: set node.el in \_materialize so $class: and @html reactive effects run

  `_materialize` now writes the created DOM element back to `branch.el` immediately
  after `document.createElement`. Compiler-emitted `_onMount` callbacks read
  `_n.el` to register reactive class-toggle and `@html` effects — without this
  assignment they silently bailed, leaving all reactive bindings dead.
