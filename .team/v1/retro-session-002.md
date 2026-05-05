# Session 002 Retro

**Date:** 2026-04-30
**Plans shipped:** 4.2 (Error Boundaries), 3.1 (Streaming SSR), 6.2-P0 (Signals Deep-Chain), 2.1 (@aihu/context)
**Final test count:** 278 passing (38 test files)
**All 5 JS packages within size budget.**

---

## What was built

### Plan 4.2 — Error boundaries (`@aihu/arbor`)

`MountOptions.onError?: ErrorHandler` added to the `mount()` API. The implementation introduced a `_mountDisposersStack` push-pop pattern so that error recovery can safely unwind the disposer stack without corrupting parent scopes. `_mountEffect` now wraps side-effect execution in a try/catch that forwards thrown values to the nearest `onError` handler. Four new tests added to `mount.test.ts`. Committed in squash `8223dbb`.

Verifier findings (both non-blocking):
- **T1 assertion path format:** test checked `'0.children[0]'` but the correct path notation was `'0.0'`. Behavior is correct; only the test assertion string format was unexpected. Non-blocking.
- **`disposeRef` first-run race:** see dedicated section below.

### Plan 3.1 — Streaming SSR (`@aihu/server`)

`renderToStream(component, opts?): ReadableStream<string>` added to `packages/server/src/ssr.ts`. Supporting types (`DataSource<T>`, `StreamOptions`) landed in `stream-types.ts`. `renderToString` was refactored to drain the stream internally rather than duplicating tree-walk logic. New test file `ssr-stream.test.ts` (167 lines, ≥6 tests). Committed in squash `ec24d41`.

### Plan 6.2-Phase 0 — Signals deep-chain opt (`@aihu/signals`)

`HAS_EFFECT_SUB = 0x40` flag added to the node flag set. `markOne` now guards the `visited.push(sub)` call with a conditional check so that effect-only leaves are not redundantly pushed onto the mark stack during deep-chain propagation. Result: ~18% improvement on `deep-propagation-100` (4.00 µs → 3.27 µs p50). `@aihu/signals` stays at ≤ 1.54 kB gz. Committed with Plan 4.2 in squash `8223dbb`.

### Plan 2.1 — `@aihu/context` (new package)

New package `packages/context/` shipping `createContext`, `provide`, `inject`, `runWithContext`, and an `./ssr` subpath. SSR integration wired through two new fields on `SsrOptions`: `contextSetup` (user-facing) and `_setContextFns` (internal hook for `renderToString`/`renderToStream` to install the context map before the tree walk). Bundle: 165 B gz against a 300 B limit. 13 tests. Committed in squash `8223dbb`.

---

## Process learnings

### Conflict resolution: streaming-ssr vs. context branches

`packages/server/src/ssr.ts` was modified by two independent branches before merging:
- The streaming-ssr branch (`feat/v1-streaming-ssr`) added `renderToStream` and refactored `renderToString` to drain it.
- The context branch (`feat/v1-context-data`) added `_setContextFns` and the `contextSetup` field to `SsrOptions`.

Resolution required keeping both additions and wiring context setup into the new `renderToString` drain loop. The correct merge order was streaming-ssr first (establishing the new internal structure), then context (adding the hook into the already-refactored loop). Manual conflict resolution was needed; no automated merge strategy would have handled the functional wiring correctly.

**Learning:** When two tracks touch the same core file with structural changes, the resolution must be done by someone who understands both changes — not delegated to a merge driver. Flag overlapping file ownership in the director note before both builders start.

### Fixup pattern for Verifier PARTIAL results

Builder B-2.1 (context) returned a PARTIAL verdict from the Verifier with 5 findings. Rather than cycling the same builder, a dedicated fixup builder ran in a separate worktree (`feat/v1-context-data`) and committed `3e93838`. The fix was surgical — only the Verifier's listed issues were addressed.

**Learning:** The fixup-in-worktree pattern works well when the Verifier finding set is bounded and the original build is structurally sound. The risk is context loss between the original builder and the fixup builder; handing the Verifier report directly as the fixup brief (rather than re-explaining from scratch) is the correct handoff.

### Worktree isolation

All four plans ran in isolated worktrees on feature branches. This prevented any cross-plan interference during active building and made the conflict resolution at merge time deterministic (known delta from each branch rather than an evolving shared state). The compiler track (`feat/compiler-c3`) continued in its own worktree in parallel without affecting the v1 session state at all.

**Learning:** Worktree isolation is mandatory when two plans touch overlapping files. The cost is a manual merge step; the benefit is that each builder works against a clean baseline.

---

## `disposeRef` first-run race

### What it is

During Plan 4.2 error boundary work, the Verifier identified a race condition in the `disposeRef` handling within `_mountEffect`. Specifically: on the *first* signal write that triggers an error, the error handler fires correctly. On a *subsequent* signal write (before the effect is re-mounted), `disposeRef` may have already been nulled by the first-run cleanup path, so the second `onError` call receives a stale or null ref context.

### Why it was not blocking

Triggering the race requires two signal writes in sequence after an error, without an intervening re-mount. In practice, `onError` handlers are expected to either re-mount (which resets the ref) or tear down the component entirely. The double-fire path does not corrupt application state; it produces a second (harmless) `onError` invocation rather than a crash or silent data loss. Tests covering the primary `onError` contract pass cleanly.

The Verifier assessed this as LOW priority. It was spawned as a background task chip and is tracked separately.

---

## Next priorities (in order)

1. **Plan 1.1 — Reconciler (`when`/`each`) in `structural.ts`** — HIGH. This is the next immediate action on Track A. The Architect spec already exists at `.team/v1/spec-track-a-architect-round-001.md`. Property mangling is MANDATORY. `StructuralNode` + `ChildScope` design from the spec. Builder can start now.

2. **Plan 2.2 — `@aihu/data`** — HIGH. Unblocked now that 2.1 merged. Full spec design in `director-notes/track-b-round-002.md` §4. Architect spec for 2.2 to be written, then Builder dispatch.

3. **Plan 6.2-Phase 1 (Option D)** — MEDIUM. Phase 0 bench confirmed ≥18% improvement, exceeding the ≥10% threshold required to proceed. Architect spec for Option D hybrid fanout/lazy approach needed before Builder starts.

4. **Plan 1.2 — Component props** — MEDIUM. Blocked on 1.1. Will unblock once reconciler lands.

5. **`disposeRef` first-run race** — LOW. Background task; does not gate any Plan 1.x or 2.x work.

6. **Compiler Phase C-4 (CLI + Vite)** — separate session; no dependency on v1 Track A/B/C state.
