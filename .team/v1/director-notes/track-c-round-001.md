# Director Note — Round 1
**Date:** 2026-04-30
**Track:** C — SSR + Signals
**Plans:** 3.1 (Streaming SSR), 6.2 (Signals Deep-Chain Optimization)
**Branch:** `feat/v1-ssr-signals` (proposed; see §1)
**Round:** 1 (session start)

---

## 1. Branch Strategy

**Use a single branch: `feat/v1-ssr-signals`.**

Plans 3.1 and 6.2 touch entirely different packages (`packages/server/src/ssr.ts` vs `packages/signals/src/`). There are no shared files, no shared types, and no cross-package imports between them. The only risk of a shared branch is merge discipline — both plans must commit atomically per task, and neither may touch the other's package. That is a normal nomos discipline.

Rationale for not splitting into two branches:

- Splitting doubles the PR/merge/review surface for a Director who is tracking both plans.
- Both plans are scoped to implementation files only (no spec authoring backlog, no tooling changes). The shared branch cost is near zero.
- State files are per-plan (see §2 above in `state-track-c.md`), so progress tracking is independent regardless of branch.

**Branch naming:** `feat/v1-ssr-signals` — already the specified name. No rename needed.

**Exception trigger:** If Plan 6.2 investigation concludes that the signals fix requires changes to public exports in `packages/signals/src/index.ts` (currently not anticipated — all deep-chain work is `@internal`), split to `feat/v1-signals-deepchain` at that point to protect the SSR Builder from a concurrent API surface change.

---

## 2. Dependency Assessment — Does 3.1 Require Track B (Plan 2.2)?

**No hard dependency. Plan 3.1 can proceed now with a `DataSource<T>` stub.**

Assessment based on reading `packages/server/src/ssr.ts`:

The existing `renderToString` is fully synchronous with respect to component data. It calls `component()` (a factory), receives an arbor `Branch | Leaf` node tree, and walks it recursively. There is no async data plumbing in the current implementation. The `SsrOptions.serializer` is a synchronous `() => Record<string, unknown>` injected at call time.

Plan 2.2 (Track B) would introduce `createResource` — an async data primitive. For `renderToStream` to suspend on async resources, it needs to know _when_ a resource is pending and _what data it provides when resolved_. The spec references a `DataSource<T>` interface for this.

**The key insight:** `renderToStream` can be fully built and tested against a `DataSource<T>` interface defined locally in `packages/server/src/`. Track B does not need to exist for Track C to implement streaming. The contract is:

```typescript
// Stub — can be defined in ssr.ts or a new types.ts within packages/server/
export interface DataSource<T> {
  readonly status: 'pending' | 'ready' | 'error'
  readonly value?: T
  readonly error?: unknown
  // Called when status transitions to 'ready'
  onReady(cb: () => void): () => void
}
```

The `renderToStream` implementation can be written to:
1. Walk the component tree synchronously (identical to `renderToString`).
2. When it encounters a component boundary that exposes a `DataSource`, enqueue a flush boundary.
3. Drain the readable stream, yielding already-resolved HTML immediately and suspending at pending boundaries.

Track B's `createResource` will later implement `DataSource<T>`. The interface definition belongs in `@aihu/server` or a shared types package; Track B imports it, not the other way around.

**Verdict:** Track C's Builder for 3.1 should define `DataSource<T>` as part of the spec deliverable. The Architect brief below specifies this explicitly.

---

## 3. Plan 3.1 — Streaming SSR Readiness

### Spec gaps

1. **`DataSource<T>` interface location** — must be resolved before Builder starts. Recommendation: define it in `packages/server/src/stream-types.ts` (new file, ≤ 50 lines, per Learning #13 one-concern-per-file rule). Export it from `packages/server/src/index.ts`.

2. **Backpressure handling** — the spec must specify what happens when the consumer of the `ReadableStream` pauses. The simplest correct answer for v1: ignore backpressure (always enqueue, rely on the WHATWG `ReadableStream` internal queue). This must be an explicit decision, not an omission.

3. **Error boundary semantics** — what does `renderToStream` yield when a component factory throws? Options: (a) emit an error event on the stream (breaking), (b) emit a comment placeholder `<!--error-->` (non-breaking). The spec must pick one. Recommendation: (a) — throw surfaces as a stream error, consistent with how `renderToString` would surface it as a thrown rejection.

4. **`renderToString` as a wrapper** — the spec says `renderToString` becomes a thin wrapper over `renderToStream`. This requires that `renderToStream` resolves to a complete document string via `Response.text()` or manual drain. The Architect must specify the exact drain idiom (e.g., `async function renderToString(...) { const chunks = []; for await (const chunk of stream) chunks.push(chunk); return chunks.join('') }`).

5. **`SsrOptions` extension** — streaming likely requires a `timeout?: number` option for pending `DataSource` boundaries. Must be specified or explicitly excluded.

### Scout brief (if Scout is spawned before Architect)

> Read `packages/server/src/ssr.ts` in full. Confirm the exact return type of `renderToString` (`Promise<string>`). Confirm that `renderNode` is a synchronous recursive function with no async paths. Check whether `WHATWG ReadableStream` is available in the target runtimes listed at the top of `ssr.ts` (Workers, Deno, Bun, Node ESM) — specifically whether `ReadableStream` is globally available or must be imported. Check Node ESM: is `ReadableStream` globally available in Node 18+? Report with a reproduction command.

### Builder brief (to be refined by Architect into a full spec)

**Task 1 — Define `DataSource<T>` interface**
- New file: `packages/server/src/stream-types.ts`
- Exports: `DataSource<T>`, `StreamOptions` (extends `SsrOptions` with `timeout?: number`)
- Add exports to `packages/server/src/index.ts`
- Tests: `packages/server/tests/stream-types.test.ts` — confirm shape is assignable, confirm `onReady` returns a dispose function

**Task 2 — Implement `renderToStream`**
- `packages/server/src/ssr.ts`: add `export function renderToStream(component: ComponentDescription, opts?: StreamOptions): ReadableStream<string>`
- Walk component tree as `renderToString` does; if no `DataSource` boundaries are encountered, enqueue the full document string in one push and close.
- For pending `DataSource` boundaries: enqueue the pre-boundary HTML, register `onReady`, enqueue the resolved HTML fragment when ready, close.
- Add export to `packages/server/src/index.ts`
- Tests: minimum 6 tests — (a) sync component streams full doc, (b) async component with already-ready DataSource streams correctly, (c) async component with pending DataSource yields in order, (d) error in component factory closes stream with error, (e) `opts.head` produces full document structure in stream output, (f) `opts.hydratable` produces `data-aihu-path` attributes in stream output

**Task 3 — Refactor `renderToString` as wrapper**
- `renderToString` drains `renderToStream` internally. No behavior change for callers.
- Tests: existing `renderToString` tests must all pass unchanged (regression gate)

---

## 4. Plan 6.2 — Signals Deep-Chain Strategy

### Investigation-first verdict

**Spawn an Investigator agent directly. Do not spawn a Scout first.**

Rationale: learnings.md #26 already provides the structural diagnosis, the exact bench workload, and the candidate fix. The signals source has been read in this session and is well-understood. The `deep-propagation-100` workload is confirmed in `bench/signals/src/workloads/deep-propagation-100.ts`. The bench baseline numbers are in `bench/signals/RESULTS.md`. The implementation is in `packages/signals/src/signal.ts` (signal.ts is the critical file — it contains `markOne`, `propagateMark`, and the full wave-counter dedup logic).

There is no additional scouting needed. The Investigator has everything required to form and test a hypothesis.

### Hypothesis to test first

**Hypothesis: version counter per signal node, not per wave.**

The gap: aihu 4.00 µs p50 vs alien-signals 2.42 µs p50 on `deep-propagation-100` (1.65× slower). The deep-perf-wins spec (`spec.md §8 item 3`) explicitly notes that "generation/version counters per signal (parent §9 §2.5.2 hashed-XOR)" were deferred because they did not help cellx. But deep-chain is a different shape.

Alien-signals' version-counter approach (per-source version counter, checked at each computed node before propagating) allows short-circuiting propagation when the computed's cached version matches the source's current version — O(1) check per node instead of always walking forward. In a 100-deep chain, this cuts 100 pointer chases to 1 if the source hasn't changed since the last settle.

**But the write always changes the source value** in the `deep-propagation-100` bench (`setSrc(counter++)`). So the version-counter short-circuit only applies during the _mark phase_ if we can detect that a node's inputs haven't changed (equality-based pruning), not during propagation itself.

**Revised hypothesis to test:** The structural reason aihu is slower is not the version counter per se, but **the depth-first mark walk**. In a 100-deep linear chain, `markOne` must visit all 100 nodes before any settle happens. Alien-signals' push-pull model does lazy recomputation: it does not walk the full chain on every write; instead, it marks only the direct subscribers and defers recomputation to read time. The effect at the end of the chain pulls lazily, triggering a bottom-up recompute.

**Correct hypothesis for the Investigator:** Does switching to a **lazy pull on the hot path for linear chains** (mark the direct child only, let downstream nodes pull on `notify`) close the gap, at acceptable cost to wide-fanout and dynamic-deps performance?

### Investigator brief

**Goal:** Determine whether the `deep-propagation-100` gap (1.65× vs alien-signals) can be closed by 30%+ without regressing `cellx`, `wide-fanout-100`, or `batched-writes-100`.

**Inputs:**
- Bench baseline: see §5 of `state-track-c.md` (copied from learnings.md #26 and RESULTS.md)
- Implementation: `packages/signals/src/signal.ts` — focus on `markOne` (lines 185–248) and `propagateMark` (line 252)
- Reference implementation: `bench/signals/node_modules/alien-signals/esm/system.mjs` — read the source to understand the push-pull model
- Prior art: `.team/phase-2-5/deep-perf-wins-spec.md` §2 Phase 2 and §6.3 — the linked-list rewrite already landed. §8 items 3–6 are the deferred wins still applicable.

**Deliverable:** An investigation report (`packages/signals/.team-notes/deep-chain-investigation.md` or `.team/v1/deep-chain-investigation.md`) covering:
1. Structural comparison of aihu's mark/settle path vs alien-signals' lazy pull on a 100-deep chain
2. Two or three concrete implementation options with predicted p50 impact (per workload), size cost (B gz), and risk
3. A recommended option with rationale
4. Whether the fix is compatible with the existing `wave` counter, `markOne` iterative stack, and the `restricted-leaf fast path`

**Hard stops for Investigator:**
- Do NOT modify any source file — investigation only
- Do NOT modify bench workloads
- Do NOT write a spec — that is the Architect's job after this report lands

---

## 5. OQ-V5 and OQ-V6 Impact

### OQ-V5 — Streaming return types

OQ-V5 (from `spec-v1-architecture.md §12`) concerns the return type of `renderToStream`. The spec notes that `ReadableStream<string>` is the WHATWG-standard type and asks whether it should be wrapped in a aihu-specific type for ergonomics.

**Assessment:** OQ-V5 does **not** block Plan 3.1. The recommended resolution is `ReadableStream<string>` (bare WHATWG type) with no wrapper. Rationale: wrapping adds bytes, reduces interop with standard `Response` / fetch APIs, and complicates testing. If a richer ergonomics wrapper is desired in v2, it can wrap the plain stream. The Builder should proceed with `ReadableStream<string>` as the return type and document this as a decided OQ in the build manifest.

**Resolution: OQ-V5 is not a blocker. Adopt `ReadableStream<string>`. Document in spec.**

### OQ-V6 — SSR dehydration

OQ-V6 concerns whether `renderToStream` should emit SSR dehydration markers compatible with client-side hydration (arbor's subscription identity keys from Learning #16). This is the `opts.hydratable` → `data-aihu-path` story.

**Assessment:** OQ-V6 does **not** block Plan 3.1 in any material way. The existing `renderToString` already handles `opts.hydratable` via `data-aihu-path` attributes in `renderNode`. `renderToStream` inherits the same `renderNode` function — dehydration markers are emitted as part of the synchronous node walk, not as a streaming concern.

The only streaming-specific dehydration question is: do we emit `data-aihu-stream-boundary` markers at async boundaries? This is a v2 concern. For v1, `renderToStream` should emit the same `data-aihu-path` markers that `renderToString` emits when `opts.hydratable` is true, and do nothing extra for async boundaries.

**Resolution: OQ-V6 is not a blocker. `renderToStream` inherits existing hydratable behavior. Streaming-boundary dehydration deferred to v2. Document in spec.**

---

## 6. Go / No-Go for Track C

**GO.**

- Plan 3.1: implementation baseline is clean and well-understood. No cross-track dependencies that block work. `DataSource<T>` interface is the only new design decision, and it is well-scoped. Two open questions (OQ-V5, OQ-V6) have clear resolutions. Architect can produce a complete spec without user interrupt.

- Plan 6.2: investigation hypothesis is formed. The Investigator has all inputs needed to investigate without a Scout pass. No code changes in the investigation phase. Implementation cannot regress existing bench gates (all 6 workloads passing; gate is ≥10% regression-free per Learning #11).

**One prerequisite to confirm before spawning Builder for 3.1:** Architect must confirm `ReadableStream` global availability in Node ESM (minimum version). If Node 16 is still in the support matrix, `ReadableStream` is not globally available (added as global in Node 18). This is a one-command Scout check (`node --version` in CI + a `typeof ReadableStream` probe). If Node 16 must be supported, the Builder imports from `'stream/web'` with a conditional.

**Suggested spawn sequence:**
1. Spawn Architect (3.1) — produces `spec-3.1-streaming-ssr.md` in `.team/v1/`
2. Spawn Investigator (6.2) — produces `deep-chain-investigation.md` in `.team/v1/`
3. After both land: spawn Builder (3.1) and Architect (6.2 implementation spec) in parallel
4. Builder (6.2) after Architect (6.2) delivers spec

---

## 7. Continuity

Round 1, session start — no prior rounds.

**.team/v1 directory created this session.** The roadmap file (`plan-v1-roadmap.md`) and architecture spec (`spec-v1-architecture.md`) referenced in the Track C scope do not exist yet. Plans 3.1 and 6.2 are described in the Track C scope document (this session's prompt) and in learnings.md context. The Architect for 3.1 should treat the scope description + existing `ssr.ts` implementation as the authoritative starting point. The Architect for 6.2 must wait for the Investigator's report.

**No user interrupt required to begin Track C.**
