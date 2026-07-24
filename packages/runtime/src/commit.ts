/**
 * The rAF-coalesced commit queue backing `onCommit` — post-layout,
 * pre-paint, once per connection.
 * docs/plans/2026-07-24-lifecycle-ownership-dx.md §2.
 *
 * `@aihu/runtime` owns this queue (not `@aihu/signals`): it needs a DOM
 * frame-timing primitive (`requestAnimationFrame`), which has no place in a
 * DOM-free reactivity core. One coalesced rAF callback drains every pending
 * commit registered across every component on the page in a single frame —
 * one forced reflow for the whole page, not one per component.
 */
import { type EffectScope, onScopeDispose, runWithScope } from '@aihu/signals'

interface CommitEntry {
  fn: () => void | (() => void)
  /** Gate evaluated when the frame fires — the component's `connected`
   * getter. An entry whose connection already ended (disconnected before
   * the frame) is skipped entirely: never run, never re-queued. */
  live: () => boolean
  scope: EffectScope
}

let queue: CommitEntry[] = []
let frame = 0

/** jsdom implements `requestAnimationFrame`; a `setTimeout` fallback keeps
 * non-browser test runners (and any other host without rAF) working. This
 * is a safety net, not the production path — real browsers always take the
 * rAF branch. */
function _raf(cb: () => void): number {
  const r = (globalThis as { requestAnimationFrame?: (cb: FrameRequestCallback) => number })
    .requestAnimationFrame
  return r ? r(() => cb()) : (setTimeout(cb, 0) as unknown as number)
}

function scheduleFrame(): void {
  if (frame) return
  frame = _raf(_flushCommits)
}

/**
 * @internal — register `fn` to run at the next commit. `live` gates the
 * entry at flush time; `scope` is the owner `fn`'s effects and returned
 * teardown are registered into. Coalesced: every call before the next
 * frame fires shares ONE `requestAnimationFrame` callback.
 */
export function _scheduleCommit(
  fn: () => void | (() => void),
  live: () => boolean,
  scope: EffectScope,
): void {
  queue.push({ fn, live, scope })
  scheduleFrame()
}

/**
 * @internal — drop every queued entry owned by `scope`. Called by
 * `_stopComponentScope` (define-component.ts) at disposal time — BEFORE
 * this fix, an entry's `live()` gate was only evaluated at flush time, so a
 * component that disconnected while `requestAnimationFrame` was throttled
 * or fully suspended (a hidden/background tab) accumulated unbounded queue
 * entries, each strongly retaining a dead `EffectScope` and whatever the
 * commit closure captured (typically DOM nodes and third-party widget
 * handles) until the tab was foregrounded. Filtering here releases those
 * references immediately instead of waiting for a frame that may never
 * come. Cheap: a linear scan + array rebuild, no lookup structure needed —
 * pending-commit queues are expected to stay small (bounded by pending
 * frames, not by total component count).
 */
export function _dropCommitsFor(scope: EffectScope): void {
  if (queue.length === 0) return
  queue = queue.filter((e) => e.scope !== scope)
}

/** @internal — test-only: current queue length, so a test can assert a
 * disposed scope's entry was released immediately rather than lingering
 * until the next flush. */
export function _commitQueueSize(): number {
  return queue.length
}

/**
 * @internal — flush the pending commit queue. This is the rAF callback in
 * production; it is exported so tests can flush deterministically instead
 * of awaiting a real animation frame. Resets `frame` and swaps the queue
 * out BEFORE running any entry, so a commit body that itself schedules a
 * new `onCommit` queues into the NEXT frame rather than growing the one
 * being drained right now.
 *
 * Throws are contained per-entry (a throwing commit must not strand the
 * rest of the frame) and logged, mirroring `connectedCallback`'s
 * catch-log-rethrow containment posture elsewhere in this package — except
 * a commit callback's throw is NOT re-thrown, since there is no single
 * caller frame to propagate it to (this runs inside a `requestAnimationFrame`
 * callback that may be flushing dozens of unrelated components' commits).
 */
export function _flushCommits(): void {
  frame = 0
  const q = queue
  queue = []
  for (const e of q) {
    if (!e.live()) continue
    try {
      runWithScope(e.scope, () => {
        const teardown = e.fn()
        if (teardown) onScopeDispose(teardown as () => void)
      })
    } catch (err) {
      console.error('[aihu] onCommit callback threw:', err)
    }
  }
}
