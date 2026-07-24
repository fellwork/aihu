---
"@aihu/signals": minor
"@aihu/runtime": minor
---

Add the lifecycle-ownership DX contract
(docs/plans/2026-07-24-lifecycle-ownership-dx.md), scoped to `@aihu/signals`
+ `@aihu/runtime` only:

- **`@aihu/signals/lifecycle`** — a new tree-shakable subpath (own
  `.size-limit.json` row, separate rolldown entry, 0 B added to the guarded
  `@aihu/signals` index row): a DOM-free ownership CONTRACT — a
  `LifecycleHost` interface (`connected: () => boolean`,
  `onCommit(fn): void`), a `WeakMap<EffectScope, LifecycleHost>`, an
  `@internal` `_attachLifecycleHost(scope, host)`, and `getLifecycleHost()`
  resolving via the public `getCurrentScope()`.
- **`@aihu/runtime`** owns the rAF-coalesced commit queue and the
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
- The `@aihu/runtime` `.size-limit.json` row moves from 4500 B to 4750 B —
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
  the multi-entry split (`index` + `lifecycle`) can produce a shared
  `scope-<hash>.js` chunk, and mangling only one file would silently desync
  property names the moment a mangled field's declaration and its access
  land in different emitted files.
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
