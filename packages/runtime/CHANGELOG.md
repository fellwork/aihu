# @aihu/runtime

## 5.1.0

### Minor Changes

- [#710](https://github.com/fellwork/aihu/pull/710) [`19af14c`](https://github.com/fellwork/aihu/commit/19af14c0989fcae8eed344c119ba91894e13c776) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Dedupe the two focus-trap implementations onto one (FEL-397 / [#537](https://github.com/fellwork/aihu/issues/537)), and fix
  the escape guard that could never fire.

  `@aihu/runtime`'s `<focusTrap>` helper carried its own trap — private focusable
  selector, its own shadow-aware DOM walk, its own Tab/Shift+Tab edge handling —
  in parallel with `@aihu/primitives`' `createFocusTrap`. It is now a thin
  reactive adapter: it locates the emitted host and maps the compiler's reactive
  `active` flag onto `activate()` / `deactivate()`. `createFocusTrap(active,
returnFocus, initialFocus, childFn)` keeps its exact signature, so no compiler
  change is needed.

  This also fixes the asymmetric escape guard rather than papering over it. The
  old code bound `keydown` to the trap host and tested
  `!e.composedPath().includes(host)` — which can never be true, because a
  `composedPath()` IS the event's propagation path and a listener only runs when
  its own node is on that path. The guard was unreachable in both directions, so
  merely adding the missing forward-Tab copy would have been a no-op. The shared
  implementation binds `keydown` on `document` in the CAPTURE phase, where it
  observes keydowns originating anywhere — so `composedContains(container,
current)` is a genuinely reachable "focus escaped the trap" state, symmetric
  across Tab and Shift+Tab.

  New in `@aihu/primitives`:

  - `createFocusTrap(container, options?)` accepts `initialFocus` (a selector
    resolved across the COMPOSED subtree, so it reaches into open shadow roots)
    and `returnFocus` (opt out of restoring the previously-focused element).
    `FocusTrapOptions` is exported; the existing no-options call is unchanged.
  - A dedicated `@aihu/primitives/focus-trap` subpath entry (1.31 kB gz), so
    consumers get the trap without pulling in the whole dialog primitive.
  - A trap whose container is detached without `deactivate()` no longer hijacks
    Tab page-wide (nor reads `activeElement` off a detached root).

### Patch Changes

- Updated dependencies [[`19af14c`](https://github.com/fellwork/aihu/commit/19af14c0989fcae8eed344c119ba91894e13c776)]:
  - @aihu/primitives@0.2.0

## 5.0.0

### Minor Changes

- [#549](https://github.com/fellwork/aihu/pull/549) [`ad6921a`](https://github.com/fellwork/aihu/commit/ad6921a018ef4a479f6540278e549aa9a8cab387) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Add the lifecycle-ownership DX contract
  (docs/plans/2026-07-24-lifecycle-ownership-dx.md), scoped to `@aihu/signals`

  - `@aihu/runtime` only:

  * **`@aihu/signals/lifecycle`** — a new tree-shakable subpath (own
    `.size-limit.json` row, separate rolldown entry, 0 B added to the guarded
    `@aihu/signals` index row): a DOM-free ownership CONTRACT — a
    `LifecycleHost` interface (`connected: () => boolean`,
    `onCommit(fn): void`), a `WeakMap<EffectScope, LifecycleHost>`, an
    `@internal` `_attachLifecycleHost(scope, host)`, and `getLifecycleHost()`
    resolving via the public `getCurrentScope()`.
  * **`@aihu/runtime`** owns the rAF-coalesced commit queue and the
    per-connection `connected` signal, and attaches the `LifecycleHost` in
    `_build()` right after `_componentScopes.set`. `SetupContext` gains a
    `connected: () => boolean` field. A new bare `onCommit` export runs a
    registered callback once, after the next layout/paint opportunity,
    coalesced across every component into one `requestAnimationFrame` per
    frame; it is `_cur`-gated (setup-only), a tighter window than
    `LifecycleHost.onCommit` (valid during setup OR inside an `onMount` body).
    `connected` is created once inside `_build()`, so it is identical on the
    normal-connect path and the hydration path (`define-element.ts`'s
    hydration branch calls `_build()` directly and bypasses
    `define-component`'s `connectedCallback`); it latches to `false` inside
    `_stopComponentScope()` — the real shared teardown choke point — rather
    than being duplicated across `disconnectedCallback`.
  * The `@aihu/runtime` `.size-limit.json` row moves from 4500 B to 4750 B —
    `onCommit` + the per-instance `connected` signal are load-bearing per the
    design (§6.4). Measured with `@aihu/signals/lifecycle` correctly
    `ignore`d (see below): 4319 B → 4717 B, +398 B for this arc (higher than
    the design's own ~130 B estimate, but real — the review-fix follow-ups
    below account for the delta over the arc's initial 4630 B measurement:
    the fail-loud `SCR-R0014` check, `_dropCommitsFor`, and their regression
    tests all add bytes to the guarded row).

  **Review-fix follow-ups (same unreleased arc, not a separate release):**

  - `onCommit` (the bare `@aihu/runtime` export) now fails loud with
    `RuntimeError('SCR-R0014', ...)` instead of silently dropping the
    callback when `_cur` is set but the current scope has diverged from the
    component root scope — reachable from inside a synchronous `effect()`
    body during setup (signals P0-1 clears the current scope for every
    effect run) or a nested `effectScope().run()` during setup. Matches the
    design's stated contract (§7.2) and `onMount`'s fail-loud sibling
    behavior. New regression test in `packages/runtime/tests/commit.test.ts`.
  - `SetupContext.connected` is REQUIRED again, matching the approved design
    (§4.1) — the prior `connected?:` widening was justified by a
    misdiagnosis of the compiler's host-less SSR stubs (their `ctx` param is
    unannotated, so `SetupContext` was never the checked type there; verified
    with a full-workspace `bun run typecheck`, zero regressions).
  - The rAF-coalesced commit queue now drops a component's queued `onCommit`
    entries at disposal (`_dropCommitsFor`, `commit.ts`), not just at flush
    time — previously a disconnect in a suspended/hidden background tab
    (where `requestAnimationFrame` may never fire) left the queue retaining
    the dead scope and its closure's captures indefinitely. New regression
    tests assert immediate release.
  - `@aihu/signals/lifecycle` is now excluded (`ignore`) from the
    `@aihu/runtime` `.size-limit.json` measurement — it was being
    double-counted (inlined into the measured bundle despite being a real,
    separately-published external import in the actual `rolldown.config.ts`
    build), which is what actually accounted for most of the budget overshoot
    this row's limit bump was covering for.
  - `packages/signals/scripts/mangle-dist.mjs` now mangles every emitted
    `dist/*.js` file (not just `index.js`) with the same replacement table —
    `dist/` is no longer a single self-contained file, and mangling only one
    file would silently desync property names the moment a mangled field's
    declaration and its access land in different emitted files.
  - **No shared chunk on the reactivity hot path.** `rolldown.config.ts`
    builds `index` and `lifecycle` as two INDEPENDENT single-entry builds
    rather than one multi-entry build. A multi-entry build hoisted `scope.ts`
    into a shared `scope-<hash>.js` chunk, putting `getCurrentScope` /
    `setCurrentScope`, the scope cleanup register/unregister pair, and the
    live `_currentScope` binding across a module boundary that the minifier
    cannot inline through — an interleaved A/B against `main` (n=12 fresh
    processes per arm) measured a range-DISJOINT slowdown on `dynamic-deps`,
    with a byte-identical control arm at ~0 %. `dist/lifecycle.js` instead
    takes `getCurrentScope` as an EXTERNAL import of the sibling entry
    (`import{getCurrentScope}from"./index.js"`), which keeps exactly ONE
    `_currentScope` instance — duplicating `scope.ts` into both bundles would
    give the package two, and a scope entered through `@aihu/signals` would
    be invisible to `getLifecycleHost()`. `dist/index.js` is now
    `cmp`-byte-identical to `main`'s, and the same A/B puts `dynamic-deps` at
    −0.3 % and `creation-1to1000` at +0.4 % (both ranges overlapping `main`).
    The `@aihu/signals/lifecycle` size row measures 170 B (limit 300 B); the
    guarded `@aihu/signals` row returns to 2232 B.
  - `packages/signals/tests/lifecycle.test.ts` adds a source-level guard
    asserting `src/index.ts` never imports `src/lifecycle.ts` and that no
    other non-lifecycle source file references the `LifecycleHost`
    attach/read symbols — the design (§6.4) calls this a hard acceptance
    criterion, and the guarded size row alone is not a sufficient backstop at
    today's headroom (a cross-import would still pass the row).

  **Doc-discrepancy note (tracked as FEL-401):** the design doc claims
  `_stopComponentScope()` was already shared by both real
  `disconnectedCallback` forms in `define-component.ts` — that was false;
  neither called it (it was only reachable from the two
  `connectedCallback` throw-recovery paths and the hydration disconnect
  bridge). Both `disconnectedCallback` bodies now route through
  `_stopComponentScope()` too, which is what actually makes the `connected`
  flip work on every real teardown path, not a doc correction.

  **Deliberately deferred, NOT shipped here:** `useConnected()` and
  `tryOnCommit()` on `@aihu/use` — that package is being restructured by a
  concurrent workstream. `@aihu/use` still has no dependency on
  `@aihu/runtime` or on this new subpath. Also not shipped: `useMounted()`
  (the design shows it degenerates to a constant `true` — there is no
  observable moment where `mounted === false` in aihu), the compiler surface
  for `onCommit` (§2.4, `.aihu` template lowering), and the §3 DOM-move /
  `moveBefore()` remedy — all out of scope for this track.

### Patch Changes

- [#553](https://github.com/fellwork/aihu/pull/553) [`3790c91`](https://github.com/fellwork/aihu/commit/3790c91331fa7ecb15649213a66c83078e63dafe) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Make `$form` (D5) and `$aria` (B4) components actually run, and stop the
  playground preview from dropping compiled presets on the floor.

  `$form`/`$aria` were emit-tested but never executed, and four independent bugs
  had accumulated behind that:

  1. **`formAssociated` was assigned after registration, to `undefined`.** The
     compiler bound `defineElement(...)`'s result to `const _aihuFormEl_<tag>` and
     then wrote `.formAssociated = true` on it. `defineElement` returns `void`, so
     that write threw `Cannot set properties of undefined` at module evaluation —
     and even against a real class it would have been ignored, because
     `customElements.define()` reads `formAssociated` off the constructor at
     define time and never looks again. `defineElement` now takes a
     `formAssociated` option and stamps it on the wrapped class _before_
     `customElements.define`; the compiler passes
     `{ formAssociated: true }` instead of emitting the post-define assignment.

  2. **The wiring wrote through `this`.** Both collections emitted
     `this._internals = this.attachInternals()` into the setup body — but setup is
     an arrow (`setup: (ctx) => …`), so `this` there is the module's `this`
     (`undefined` under ESM), never the element. Every `$aria`/`$form` component
     threw on construction. The wiring now binds `ctx.element`.

  3. **`$form` entry expressions skipped the signal-read rewrite.** Inside
     `@state`, `value` names the getter, so `$form: { value: () => value }` was
     handing `setFormValue` a _function_ (`The provided value is not of type
'(File or USVString or FormData)?'`) and `validity` was calling `.trim()` on
     one. Entry expressions now go through the same rewrite the template and
     `derived`/`action` bodies get, and a thunk entry is called rather than passed
     through.

  4. **`setValidity(flags)` throws once any flag is true.** `$form` has no
     `message` key, so the one-argument call could only work while the field was
     valid. A fallback message is now derived from the failing flag names.

  On the docs playground side, `stripTs` — which erases the compiler's TS output
  so it can run in a plain `<script>` — had two holes that made the whole script
  a `SyntaxError` (no error surfaced; the preview just came up empty):

  - Parameter type annotations on the `function` declarations `action()` lowers
    to (`function onInput(e: Event)`) were never stripped.
  - The ` as unknown as <Type>` rule was greedy across `}`, so
    `setTimeout(…, 300) as unknown as number });` lost the arrow body's closing
    brace. It is now bounded to a single type reference, and covers ` as any` /
    ` as ShadowRoot` / `as unknown as` in one rule.

  Also adds `@aihu/context` to the root tsconfig `paths` map. The playground's
  preview-runtime IIFE resolves `@aihu/*` through those paths (no package `dist`
  exists at docs-build time); `@aihu/context` was missing, so rolldown treated it
  as external and the bundle referenced an undefined `_aihu_context` global —
  `window.__aihu` was never assigned and every preset died on
  `Cannot read properties of undefined (reading 'branch')`.

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

- [#565](https://github.com/fellwork/aihu/pull/565) [`51451a4`](https://github.com/fellwork/aihu/commit/51451a47fee517c922d203951baf6442fe806115) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Fix hierarchical context (`provide`/`inject`) silently not working in published
  builds. `@aihu/runtime`'s shipped bundle inlined a private copy of
  `@aihu/context`'s internals (`_enterContext`/`_exitContext` plus the module-level
  context state they close over), so a component's `provide()` during setup wrote to
  runtime's private copy while `inject()` in descendants read the real
  `@aihu/context` module — values provided by an ancestor component were silently
  dropped for anyone consuming the built package. (Workspace tests resolve source
  files directly, which is why this never surfaced in CI.) `@aihu/context` is a
  declared peerDependency and is now kept as a real external import, restoring one
  shared context state. Side benefit: the `@aihu/runtime` bundle sheds ~30 B gz,
  returning the size-gate row to its original 4750 B contract.

- [#545](https://github.com/fellwork/aihu/pull/545) [`2ea4a8f`](https://github.com/fellwork/aihu/commit/2ea4a8f4197b5d2f4bf07b122f2e9653508ecf42) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Fix `<focusTrap>` (the compiler-level a11y primitive backing `createFocusTrap`
  in `packages/runtime/src/a11y.ts`) so it actually wires up when it renders
  inside a shadow root.

  Two `document`-global assumptions silently broke it there:

  - The trap located its own container via plain `document.querySelector`,
    which never descends into shadow roots — so a `<focusTrap>` rendered inside
    any component with `shadowMode: 'shadow'` was never found, and trapping
    simply never activated.
  - Even once the container is found, the Tab-cycling handler compared the
    current focus against plain `document.activeElement`, which stops at the
    outermost shadow host rather than drilling in to the actually-focused leaf
    — so the "is focus at the first/last focusable" check always failed for
    focus living inside that shadow root, and Tab silently escaped the trap.

  Both are fixed in place with small local shadow-crossing helpers
  (`_deepQuerySelector` / `_deepActiveElement`) rather than by taking on a new
  `@aihu/runtime` -> `@aihu/primitives` dependency: `@aihu/primitives` has no
  existing dependency edge to/from `@aihu/runtime` (neither package currently
  depends on the other), and the a11y primitives here are budgeted at ~800 B
  total — `@aihu/primitives/composed-tree.ts`'s more general tabbable-detection
  machinery needed for its own `createFocusTrap` would blow that budget on its
  own, on top of `@aihu/runtime`'s whole-package 4500 B size-limit gate it is
  already close to (4.29 kB / 4500 B after this fix). The two implementations
  remain intentionally distinct:
  `@aihu/primitives`' `createFocusTrap(container)` takes an already-resolved
  container and exposes an imperative `activate()/deactivate()`; `@aihu/runtime`'s
  `createFocusTrap(active, returnFocus, initialFocus, childFn)` is the
  compiler-facing surface for the `<focusTrap>` SFC tag, which must render a
  placeholder synchronously and resolve its own host asynchronously post-mount
  (there is no synchronous DOM ref available from `@aihu/arbor`'s `branch()`).

  Adds a regression test: a focus trap rendered inside an open shadow root now
  correctly cycles Tab between its focusables.

  **Follow-up fix (review pass):** making focus-lookup shadow-aware exposed a
  second, narrower gap in the same handler: the boundary check for Shift+Tab
  used `host.contains(t)`, and `Node.contains()` also never crosses shadow
  boundaries. So once `t` (the deep active element) could legitimately resolve
  to a leaf living inside a _nested_ open shadow root — a shadow-mode leaf
  component sitting inside the trap, exactly the composition these helpers'
  own doc comments describe — `host.contains(t)` read that as "focus escaped
  the host" on every keystroke and Shift+Tab yanked focus straight to `last`.
  Replaced with `e.composedPath().includes(host)`, which reflects the true
  composed ancestry (the keydown reached this `host`-level listener at all only
  by bubbling, composed, up through those shadow boundaries). Added a
  regression test that focuses a button inside a nested shadow leaf and
  asserts Shift+Tab is left alone rather than forced to `last`.

  This does not yet make `focusables()` itself shadow-aware — it still
  enumerates via light-DOM-only `host.querySelectorAll`, so `first`/`last`
  cannot resolve to a focusable that lives inside a nested shadow root, and
  forward Tab can still walk past such a leaf uncaught. Filed as a follow-up
  (full shadow-aware focusable enumeration) rather than folded in here: it
  needs `@aihu/primitives/composed-tree.ts`-grade tabbable-walking machinery,
  which does not fit this package's ~800 B a11y-primitive budget or its
  whole-package 4500 B size-limit gate (4.30 kB / 4500 B after this change).

- Updated dependencies [[`2f24fa3`](https://github.com/fellwork/aihu/commit/2f24fa3fdc592c85e39f500a48a7e4d3ff67c86d), [`a993aa1`](https://github.com/fellwork/aihu/commit/a993aa19d402c221faa463dfb5d94c86cc87b670), [`edc15f2`](https://github.com/fellwork/aihu/commit/edc15f2a2de541fa8f7ffd6266ad984446206257), [`ad6921a`](https://github.com/fellwork/aihu/commit/ad6921a018ef4a479f6540278e549aa9a8cab387)]:
  - @aihu/arbor@4.0.0
  - @aihu/signals@0.5.0

## 4.0.0

### Minor Changes

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

- [#514](https://github.com/fellwork/aihu/pull/514) [`061eefb`](https://github.com/fellwork/aihu/commit/061eefb3e94fdbbe9e6f5d5301db3bcdd3fa3b22) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Compile-time SSR string-template emit target (wave-3 keystone).

  - `--target server` artifacts now additionally export `__ssrString(props,
{ hydratable })` — a compiled string renderer of straight-line
    concatenation with interpolated dynamic holes and static-subtree constant
    folding (Svelte/Solid-SSR style), byte-identical to the tree-walk renderer
    including the full hydration wire grammar (`data-aihu-path`,
    `<!--aihu:s:PATH-->` structural markers, `<!--|-->` text-leaf boundaries).
    Templates using constructs outside the lowerable set (suspense/shield/
    guard/warp/focusTrap/router-macro elements, duplicate attr keys) simply
    ship without the export and keep the walker.
  - New `@aihu/runtime/ssr` subpath entry with the SSR string helpers
    (`__aihu_stext`, `__aihu_sattr`, …) mirroring the walker's escaping —
    server-only bytes on their own entry, so the client bundle size gate is
    untouched.
  - `@aihu/server` renderToString/renderToStream take the string fast path when
    the component carries a compiled renderer (`AIHU_SSR_STRING=0` opts out);
    new `attachSsrString` carries the renderer across props-binding wrappers
    (used by the router's governed path).
  - SSR walker fix: reactive attribute tuples/thunks now serialize their
    CURRENT VALUE (previously the getter's function source was printed into the
    attribute) and function-valued attrs (event handlers) never serialize.
  - Compiler fixes surfaced by the differential gate: `show`/`class:`/`ref`/
    `html` effect IIFEs guard their `onMount` registration (host-less SSR and
    loop-item factories previously crashed with SCR-R0010 'no owner'), and an
    `each`+`empty` chain now emits the `createIfBoundary` helper it references.

### Patch Changes

- Updated dependencies [[`18e5f6d`](https://github.com/fellwork/aihu/commit/18e5f6dda93772877690e88e8c217dcdcf4bddc2), [`ea8d2eb`](https://github.com/fellwork/aihu/commit/ea8d2ebb91c28132f399a708e2bd88877072d1db)]:
  - @aihu/signals@0.4.0
  - @aihu/arbor@3.0.0

## 3.0.0

### Major Changes

- [#479](https://github.com/fellwork/aihu/pull/479) [`9dd7654`](https://github.com/fellwork/aihu/commit/9dd7654678da1149705e21324f6b30e9baafcd4b) Thanks [@srmcguirt](https://github.com/srmcguirt)! - DA4 ([#437](https://github.com/fellwork/aihu/issues/437)): the binary shadow API (`'light' | 'shadow'`) and light-DOM-by-default pages — one breaking change.

  **The API.** `ShadowMode` collapsed to a BINARY `'light' | 'shadow'`; the
  `'open'`, `'closed'`, and `'none'` tokens are retired everywhere (the
  `$shadow` macro, the plugin-global `shadowMode` config /
  `css: { shadowMode }`, the runtime `defineElement` options, and the CLI
  `--shadow` flag). `'shadow'` attaches an OPEN root internally — open is the
  only browser mode aihu's composition/hydration can use; `'closed'` was
  self-contradictory (a closed root nulls `this.shadowRoot`, so light-DOM
  detection misclassified it and content rendered into the host anyway).
  `'light'` attaches no root, so `this.shadowRoot === null` is an unambiguous
  detection. Migration: `'open'` → `'shadow'`, `'none'` → `'light'`,
  `'closed'` → `'shadow'`.

  **The defaults.** Page-level components — those with an `@route` block — and
  layout SFCs (files under the configured layouts dir, default `src/layouts/`)
  now default to `'light'`, so server-rendered page content is reachable by
  crawlers and agents that do not execute JavaScript. Leaf components (no
  `@route`) default to `'shadow'` (behaviorally the old `'open'` default).

  Precedence, in order: a per-file `$shadow` pin > an explicit plugin-global
  `shadowMode` config > the page/layout default `'light'` > the leaf default
  `'shadow'`. An unpinned page carries a new `// @aihu:shadow-default light`
  marker (distinct from the `$shadow` pin marker) so the implicit default ranks
  below an explicit plugin-global config.

  Breaking implications:

  - Retired tokens fail loudly: `$shadow` with an old token is a C471 compile
    error; `css.shadowMode` with one throws at config validation; `--shadow`
    with one warns and falls back to the default.
  - A `$shadow`-less `@route` page's `@style` block now joins the global
    cascade instead of being trapped in a shadow root — scope bare element
    selectors under a page root class (see the migration guide §8).
  - W472 (the phase-1 advisory that announced this flip) is retired.
  - The static-island fast path is skipped for light-DOM components — the shim
    cannot honor `shadowMode: 'light'`; such components keep the full runtime
    path.
  - css-engine scaffolds now always emit an explicit `css: { shadowMode }`
    block carrying the wizard's `--shadow` choice (default `'shadow'`), since
    the page default would otherwise override it.

## 2.0.0

### Minor Changes

- [#411](https://github.com/fellwork/aihu/pull/411) [`8c80d98`](https://github.com/fellwork/aihu/commit/8c80d9844503c248ecf5fb2c0b3ec5ab06128d5e) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Hierarchical provide/inject on the client.

  `inject()` now resolves through the component tree: an ancestor's `provide()` is
  visible to its descendants, scoped to the subtree (siblings don't see it, a
  nearer provider overrides a farther one), and it crosses shadow boundaries. The
  value is whatever you provided — provide a signal and descendants read it
  reactively, for free.

  The mechanism is the Solid/Vue-grade one: each component instance holds a
  `provides` object whose prototype chain IS the ancestor context tree. A component
  that provides nothing shares its parent's object by reference (zero allocation);
  the first `provide()` does one `Object.create`. `inject()` is a single
  prototype-chain lookup — no per-lookup tree walk. The parent is resolved once at
  connect via a single shadow-host hop, which is correct under lazy/async component
  registration too (it runs after upgrade).

  Backward-compatible: the flat SSR context path (`setSsrContextMap` /
  `runWithContext`) is unchanged, and the client hierarchical path only engages
  during a component's setup. `createContext` / `provide` / `inject` keep their
  signatures.

### Patch Changes

- [#412](https://github.com/fellwork/aihu/pull/412) [`e8b082f`](https://github.com/fellwork/aihu/commit/e8b082f708e67de5ca54cf2d1e774a38b650c61c) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Bless composables as a supported, tested contract.

  A plain function called from an `@state` block runs inside the component's setup,
  so it can use the full reactive surface — signals, lifecycle hooks bound to the
  calling component, and hierarchical `inject`/`provide`. This is aihu's Vue-style
  composable pattern; the mechanism already existed, and a contract test now locks
  it (signals + `onMount`/`onCleanup` + inject-with-default all work inside a
  composable). A new "Composition & Injection" guide documents the `use*`
  convention and the layered-injection pattern.

- [#406](https://github.com/fellwork/aihu/pull/406) [`84d6544`](https://github.com/fellwork/aihu/commit/84d654444bbfe2877896bca5ae74cbe5ce3ea364) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Prop set before a custom element upgrades is no longer lost.

  A `.aihu` component compiles to a custom element, and its prop accessors live on
  the class prototype. If a prop is assigned to an element BEFORE its tag is
  `define()`d — the lazy/async-import case, where a page renders a tag and binds it
  before the component's chunk lands — there is no accessor yet, so the write lands
  as an OWN property. When the element later upgrades, that own property SHADOWS the
  prototype accessor forever: the setter never runs, the signal never sees the
  value, and the prop silently reverts to its default.

  The element constructor now performs the standard upgrade rescue — for each
  declared prop, capture any shadowing own property, delete it, and re-assign
  through the accessor, which buffers it for the pre-connect seed. This makes
  route-scoped / lazily-imported components safe to render before their definition
  loads.

- Updated dependencies [[`b279f74`](https://github.com/fellwork/aihu/commit/b279f74b34cd4e901be1cfa5d70c212cf604dfc1), [`8c80d98`](https://github.com/fellwork/aihu/commit/8c80d9844503c248ecf5fb2c0b3ec5ab06128d5e), [`514336d`](https://github.com/fellwork/aihu/commit/514336da5892c29e9e02d7a6391bb06c62d688c3)]:
  - @aihu/context@0.2.0
  - @aihu/signals@0.3.0
  - @aihu/arbor@2.0.0

## 1.1.0

### Minor Changes

- [#348](https://github.com/fellwork/aihu/pull/348) [`dbc0903`](https://github.com/fellwork/aihu/commit/dbc09031f22ee93d9e5c9a46fea2ca2409463e90) Thanks [@srmcguirt](https://github.com/srmcguirt)! - `ComponentOptions.base` (§9.4 recipe class-extension): the options-form
  `defineComponent({ base, props, setup })` now extends the given custom-element
  base class instead of `HTMLElement`. The base's `connectedCallback` runs
  before the template mounts (so context-providing primitives register before
  their child pieces upgrade), `observedAttributes` are unioned with the base's
  (a subclass static would otherwise shadow them), and
  `disconnectedCallback` / `attributeChangedCallback` are forwarded. Without
  `base`, behavior is unchanged.

## 1.0.0

### Minor Changes

- [#328](https://github.com/fellwork/aihu/pull/328) [`7ec7155`](https://github.com/fellwork/aihu/commit/7ec71553722eaa4e3f6814e79ec747db68b72451) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Fix plain `$resource`: emit the `createResource` import + add the runtime primitive.

  The compiler lowered a plain (non-magna) `$resource` entry to `const x = createResource(() => …)` but never emitted the import — the `needs_create_resource` flag was set yet never pushed to the `@aihu/runtime` import list — so any `$resource` produced a bare `ReferenceError: createResource is not defined`. And `@aihu/runtime` had no `createResource` to import (it was meant to live there parallel to `createStream`; only a magna-internal copy in `@aihu-plugin/data` existed).

  - **`@aihu/runtime`**: add `createResource(factory)` next to `createStream` — a reactive async resource with `loading` / `data` / `error` getters + `refetch()`, with a sequence guard so a superseded run never clobbers fresher data. Exported from the barrel.
  - **`@aihu/compiler`**: push `createResource` into the `@aihu/runtime` import when a plain `$resource` is used (`emit.rs`), mirroring `createStream`.

  The compiler emits the runtime import, so these publish in lockstep. Magna-backed `$resource` (`createMagnaResource` from `@aihu/magna`) is unaffected.

- [#325](https://github.com/fellwork/aihu/pull/325) [`24dee56`](https://github.com/fellwork/aihu/commit/24dee56964e5afdac11c858cca0da2b3ec2483c9) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Add the per-element agent-dispatch registry (`_registerAgentDispatcher` / `_takeAgentDispatcher`, from `agent-dispatch.ts`). The compiler injects a `_registerAgentDispatcher(ctx.element, …)` call into each `@agent` component's setup body and imports it from `@aihu/runtime`; the browser capability-bridge client (`@aihu/agent-server`) reads the per-instance dispatcher via `_takeAgentDispatcher`.

  This MUST publish in lockstep with the matching `@aihu/compiler` release. Without this bump, the released compiler emits `import { …, _registerAgentDispatcher } from '@aihu/runtime'` against the previously published runtime (0.1.8), which does not export the symbol — so any compiled `@agent` component would fail to resolve it.

- [#327](https://github.com/fellwork/aihu/pull/327) [`1132357`](https://github.com/fellwork/aihu/commit/113235708bac1e8f9263d35feb865af8f8127f86) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Fix server/universal `@agent` builds: lower `@state` macros and enable headless dispatch.

  Previously the server/universal path (`emit_options_form`) did **not** run `process_state_body`, so `$prop`/`$action`/`$computed` were emitted as raw JS labeled statements and the module-scope `__agentBinding` referenced undeclared symbols — any real compiled `@agent` component was undrivable server-side (only the browser capability-bridge path worked).

  `@agent` SFC emission is now unified on the function form (which already lowers macros and handles props/magna/`$auth`/form/aria), and `emit_options_form` is removed. For the server, the compiler injects an in-setup `_registerAgentServerBinding(ctx.element, …)` (new in `@aihu/runtime`, mirroring the client's `_registerAgentDispatcher`) that registers a full per-instance `LiveBinding` — with the live setup-scope reads/writes/actions plus `scope`/`rateLimit` — into arbor's `componentInstanceRegistry`. So `@aihu/agent-service`'s gate (`getRegistry`) can drive a real compiled component **headless** (no browser bridge).

  The compiler emits `import { …, _registerAgentServerBinding } from '@aihu/runtime'`, so these publish in lockstep. The client/bridge path (`_registerAgentDispatcher`, opaque-ID dispatcher, client-elided raw `__agentBinding`) and the `batch`-returns-value / `$prop` `.set(v)` fixes are preserved. Proven by `packages/agent-server/tests/headless-compiled-dispatch.test.ts`, which compiles a real SFC `--target server` and drives it.

### Patch Changes

- Updated dependencies [[`b85f400`](https://github.com/fellwork/aihu/commit/b85f4008c489a0dba9e36cbdfc48b635eeea375f)]:
  - @aihu/signals@0.2.0
  - @aihu/arbor@1.0.0

## 0.1.8

### Patch Changes

- [#262](https://github.com/fellwork/aihu/pull/262) [`2aecb07`](https://github.com/fellwork/aihu/commit/2aecb071623d989e7dc331c5e487eb6bdf756c2e) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Fix `<$slot>` projection under `shadowMode: 'none'`. The compiler lowers `<$slot>` to a real `<slot>` DOM element, which the browser only projects against light-DOM children when there is an actual Shadow Root. With `shadowMode: 'none'` there is no shadow root, so the `<slot>` element was inert — and worse, the parent's `_materialize` had already appended the page's children to the host BEFORE the layout's `connectedCallback` ran, so the layout template was appended AFTER them. End result: `<layout-default><h1>...</h1></layout-default>` rendered as `[h1, nav]` instead of `[nav, h1]`.

  `defineComponent.connectedCallback` now adds a light-DOM-only branch (guarded by `this.shadowRoot === null`): carve `this.childNodes` into a buffer, clear the host, run `_build()`/`_mount()`, then locate the first default `<slot>` in the host subtree and `replaceWith(...bufferedChildren)`. If the layout exposes no slot, the children are reappended to the host as a graceful fallback (preserves prior behavior for plain custom elements that simply contained children). Both function-form and options/props-form `connectedCallback` are patched. Shadow-DOM path (`this.shadowRoot !== null`) is untouched — the browser continues to handle projection natively.

  **Deferred to follow-up (not in this fix):** named slots (`<slot name="foo">` routing children by `slot="foo"` attribute) and default fallback content (`<slot>fallback</slot>` keeping the fallback subtree when no children are projected). A `TODO(architect)` comment marks the gap in `define-component.ts`.

## 0.1.7

### Patch Changes

- [#252](https://github.com/fellwork/aihu/pull/252) [`84352bc`](https://github.com/fellwork/aihu/commit/84352bcb901b7213d67727648545b41652b2092a) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Hoist `@aihu/signals` to a `peerDependency` with a caret range (via `workspace:^`) on both `@aihu/arbor` and `@aihu/runtime`. Previously arbor declared `@aihu/signals` as a regular `dependencies` entry and runtime declared it as a `peerDependency` with `workspace:*`. `bun pm pack` rewrites `workspace:*` to an exact pin (`"0.1.0"`) at pack time — so the published manifests carried an exact-version requirement. When a consumer installed `@aihu/signals@0.1.1` at the top level, the package manager satisfied arbor's `0.1.0` pin by installing a second nested copy at `node_modules/@aihu/arbor/node_modules/@aihu/signals`.

  `@aihu/signals` keeps its `currentObserver` tracker in a module-scoped `let`. Two copies of the module → two trackers. arbor's effect set copy-A's tracker; user-code signal getters read copy-B's tracker (always `null`); `linkAdd` was skipped; no subscription was created; signal writes propagated to nothing. The user-visible symptom was `$if` (and any compiler-emitted `when([() => sig()], ...)`) rendering once and never re-evaluating.

  `workspace:^` rewrites to `^x.y.z` at pack time, so the published manifests now carry a range — consumers' hoisted copy satisfies it, the duplicate nested install goes away, and the single module instance keeps a single `currentObserver`.

  Adds a CI lint gate (`bun run lint:dep-pins`) that walks every published `@aihu/*` and `@aihu-plugin/*` package manifest and fails the build if any inter-package dependency is declared as an exact pin (bare semver) rather than a range. Prevents regression of this policy across the workspace.

- Updated dependencies [[`84352bc`](https://github.com/fellwork/aihu/commit/84352bcb901b7213d67727648545b41652b2092a)]:
  - @aihu/arbor@0.1.5

## 0.1.6

### Patch Changes

- [#220](https://github.com/fellwork/aihu/pull/220) [`a4b62f2`](https://github.com/fellwork/aihu/commit/a4b62f2229f43cdb30d117a5d33cb1702153446b) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Fix reactive `$prop` bindings being silently dropped when applied to a custom
  element before it connects to the DOM. Arbor's `_materialize` applies reactive
  prop bindings via `el.prop = v` the instant the element is created — before it
  is appended/connected. At that point the per-instance prop-signal map
  (`PROPS_SYM`) is still `null` (it is built in `_build()` from
  `connectedCallback`), so the prototype prop setter's `this[PROPS_SYM]?.[name]?.set(v)`
  no-opped and the write was lost. `_build()` then seeded the signal from
  `getAttribute` (never set, since the property path was taken) and the prop
  reverted to its declared default. For static content whose source signal never
  re-fires after mount, the bound value never arrived.

  The prop setter now buffers pre-connect writes per prop (raw value, any type —
  no stringification), and `_build()` drains the buffer, letting a buffered value
  take precedence over the attribute/default fallback when seeding the signal.
  Objects, functions, and arrays survive intact. Attribute-declared props,
  post-mount signal updates, and the default fallback are all preserved.

  The buffering map adds ~47 B gz to `@aihu/runtime`, which sat at +47 B headroom
  against its 3400 B gate (i.e. the fix lands at exactly the limit). The
  `@aihu/runtime` size-limit row is bumped 3400 B → 3450 B to restore a small
  headroom margin (now +50 B per `bun run size`) rather than ship at the
  zero-margin boundary — consistent with the README policy of bumping a row's
  limit for a justified footprint increase.

## 0.1.5

### Patch Changes

- [#196](https://github.com/fellwork/aihu/pull/196) [`faca280`](https://github.com/fellwork/aihu/commit/faca2804cf62c05ffc90ef867faa2058b5e267ad) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Surface component `setup()`/render throws instead of silently leaving an empty
  shadow root. `connectedCallback` now `console.error`s with the offending
  component tag (`[aihu] setup failed for <tag>:`) and re-throws, so a failing
  setup produces an attributable error rather than a blank component with no
  console signal. The `SCR-R0002`/`SCR-R0003` invariant throws still propagate;
  the hydration path is unchanged. Fixes upstream Bug 6.

## 0.1.4

### Patch Changes

- Updated dependencies [[`70fdad2`](https://github.com/fellwork/aihu/commit/70fdad254bedab492e3b46b131564605d4665537)]:
  - @aihu/arbor@0.1.4

## 0.1.3

### Patch Changes

- Updated dependencies []:
  - @aihu/arbor@0.1.3
