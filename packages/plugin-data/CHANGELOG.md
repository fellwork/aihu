# @aihu-plugin/data

## 2.0.5

### Patch Changes

- Updated dependencies [[`ad6921a`](https://github.com/fellwork/aihu/commit/ad6921a018ef4a479f6540278e549aa9a8cab387)]:
  - @aihu/signals@0.5.0

## 2.0.4

### Patch Changes

- Updated dependencies [[`18e5f6d`](https://github.com/fellwork/aihu/commit/18e5f6dda93772877690e88e8c217dcdcf4bddc2), [`ea8d2eb`](https://github.com/fellwork/aihu/commit/ea8d2ebb91c28132f399a708e2bd88877072d1db)]:
  - @aihu/signals@0.4.0

## 2.0.3

### Patch Changes

- [#489](https://github.com/fellwork/aihu/pull/489) [`80531dc`](https://github.com/fellwork/aihu/commit/80531dcc4dfc43bc9cd399bbb8ab4520efb8f15a) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Template grammar v2 — the prefix-less template (founder-ratified 40-spec).

  One rule: naked keywords + naked HTML attributes + naked framework vocabulary;
  `{expr}` braces mean expression, quoted strings mean static; `$` retreats to
  `@state` macros only.

  **New grammar:** `if={…}`/`elseif={…}`/`else` attribute chains (adjacency-checked),
  the item-first `each={item, i of items}` `of`-binder with destructuring, `key={…}`,
  `empty` siblings, colon directives `on:<event>` (with `.prevent`/`.stop`/`.self`/`.once`
  modifiers), `bind:<prop>`, `class:<name>`, the `attr:<name>` literal escape hatch,
  naked `show`/`html`/`ref`/`once`/`memo`/`raw`, the NEW `<group>` fragment carrier,
  naked framework elements (`<slot>` is now THE projection form), and the enhanced
  `<a>` (SPA navigation, `prefetch`, `replace`, `aria-current`, auto-opt-out +
  explicit `reload`) replacing `<$link>`.

  **Retired (compile errors with fix hints):** `{#if}` C601, `{#each}` C602,
  `{@html}` C603, `{{ident}}` C604, `<$if>`/`<$else>` C605, `$if=`/`$each=`/`$let=`
  C606, every other `$`-attribute C607, `<$link>` C608, other `<$…>` elements C609,
  adjacency violations C610, unknown non-hyphenated elements C611. New lints:
  W601 (keyless stateful `each`), W602 (non-empty string on a boolean attribute).

  **Intended emission diffs:** internal `<a href>` links now lower to
  `createLinkBoundary` (the retired `<$link>` lowering) with a runtime
  origin/scheme auto-opt-out; everything else lowers through the same arbor
  structural calls as v1 (`when`/`each`/fragment branches).

  `aihu migrate --v2` now lands on this grammar (new final codemod pass:
  `compiler/js/codemods/template-grammar-v2`).

## 2.0.2

### Patch Changes

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

- Updated dependencies [[`b279f74`](https://github.com/fellwork/aihu/commit/b279f74b34cd4e901be1cfa5d70c212cf604dfc1), [`8c80d98`](https://github.com/fellwork/aihu/commit/8c80d9844503c248ecf5fb2c0b3ec5ab06128d5e), [`514336d`](https://github.com/fellwork/aihu/commit/514336da5892c29e9e02d7a6391bb06c62d688c3)]:
  - @aihu/context@0.2.0
  - @aihu/signals@0.3.0

## 2.0.1

### Patch Changes

- Updated dependencies [[`b85f400`](https://github.com/fellwork/aihu/commit/b85f4008c489a0dba9e36cbdfc48b635eeea375f)]:
  - @aihu/signals@0.2.0

## 2.0.0

### Major Changes

- [#171](https://github.com/fellwork/aihu/pull/171) [`7577bd1`](https://github.com/fellwork/aihu/commit/7577bd10f391b9f3996048371706c9be34b08e2e) Thanks [@srmcguirt](https://github.com/srmcguirt)! - v1.0.9 — Naming Scheme A: rename `@aihu/data` → `@aihu-plugin/data` and
  `@aihu/agent-readiness` → `@aihu-plugin/agent-readiness`.

  The two plugin-contract packages move from the framework-core `@aihu/*`
  scope into the new `@aihu-plugin/*` scope so that plugin-contract and
  framework-core surfaces can evolve at independent cadences. Decision
  record `6c7aa75b-...` (Amendment 04) ratified the scope on 2026-05-09 and
  v1.0.9 §400-416 of the v1 framework plan covers the cutover mechanics.

  **Per-package effect**

  - `@aihu-plugin/data` (new) — first publish at `1.0.0`. Same public API as
    `@aihu/data@0.1.0`; only the npm name changed.
  - `@aihu-plugin/agent-readiness` (new) — first publish at `1.0.0`. Same
    public API as `@aihu/agent-readiness@0.1.1`; only the npm name changed.
  - `@aihu/data@1.0.0` — published as a **moved stub**. The legacy name now
    installs a tiny package that re-exports `@aihu-plugin/data`. Carries
    `"deprecated"` metadata so npm surfaces the move on `npm install`.
  - `@aihu/agent-readiness@1.0.0` — same moved-stub treatment.
  - `@aihu/cli` — extends `aihu migrate` with a v1.0.9 pass that rewrites
    package.json `dependencies` blocks, static imports, dynamic imports, and
    JSDoc / Markdown URL references. Idempotent on already-renamed input.

  **Migration**

  Existing installs keep working via the deprecated stubs. To upgrade:

  ```sh
  bun add @aihu-plugin/data @aihu-plugin/agent-readiness
  bun remove @aihu/data @aihu/agent-readiness
  bunx aihu migrate
  ```

  `@aihu/agent-service` is explicitly **out of scope** for this rename and
  stays under the framework-core `@aihu/*` scope.
