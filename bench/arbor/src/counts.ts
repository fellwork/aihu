/**
 * R8 — counted-metric gate rows for `bench/arbor`.
 * Ruling: docs/plans/2026-07-26-arbor-perf-truth.md §3.2, §4.3 (ratified #607).
 *
 * Counts, not timings, for anything that gates. DOM writes/op, setAttribute
 * calls/op, and moves-per-reconciliation are exact integers with zero
 * variance — machine-independent, load-independent, statistic-independent.
 * And they fail in the right direction: a dead binding sends a count to
 * ZERO, which screams, where it sends a timing DOWN, which flatters (the
 * fabricated 28.63 ns baseline row looked like a win for two months).
 *
 * Every row below is an EQUALITY against a pinned constant:
 *
 *   1. keyed-swap-moves     — a 2-row swap in a 1000-row keyed list performs
 *                             exactly 4 DOM moves (2 scopes × anchor+row).
 *                             Mirrors packages/arbor/tests/structural.test.ts
 *                             ("moves exactly 2 scopes (4 DOM nodes)") —
 *                             pre-fix this was 1994.
 *   2. keyed-noop-moves     — a no-op re-render performs exactly 0 moves.
 *   3. update-1 writes/op   — one targeted update is exactly 1 DOM mutation
 *                             (one characterData write on a cached Text
 *                             node), O(1) in sibling count.
 *   4. attr-thrash writes/op — 10,000 signal writes land as exactly 10,000
 *                             attribute mutations.
 *
 * There is deliberately NO [bench-bump] bypass here: a count change is an
 * algorithmic change. The only way past this gate is to change the pinned
 * constant in this file (and its twin in structural.test.ts) in a reviewed
 * diff.
 *
 * Usage: `bun bench/arbor/src/counts.ts` (exit 0 = all equalities hold)
 */

// Side-effect import: installs window/document on globalThis before any
// competitor module loads.
import './jsdom-host.ts'

import { branch, each, leaf, mount } from '@aihu/arbor'
import { signal } from '@aihu/signals'

import { aihu } from './competitors/aihu.ts'
import { attrThrash } from './workloads/attr-thrash-100x100.ts'
import { updateOneOfTenK } from './workloads/update-1-of-10k-leaves.ts'

interface CountRow {
  name: string
  expected: number
  actual: number
  unit: string
}

const rows: CountRow[] = []

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Count `insertBefore` calls performed by `fn`. jsdom has no native
 * `moveBefore`, so arbor's `_moveNode` falls back to one `insertBefore` per
 * reposition — the call count IS the DOM-node move count (same mechanism as
 * the structural.test.ts spy). */
function countInsertBefore(fn: () => void): number {
  const ElementCtor = (globalThis as unknown as { Element: typeof Element }).Element
  const proto = ElementCtor.prototype
  const hadOwn = Object.hasOwn(proto, 'insertBefore')
  const orig = proto.insertBefore
  let calls = 0
  proto.insertBefore = function insertBeforeCounted<T extends Node>(
    this: Node,
    node: T,
    child: Node | null,
  ): T {
    calls++
    return orig.call(this, node, child) as T
  }
  try {
    fn()
  } finally {
    if (hadOwn) proto.insertBefore = orig
    else delete (proto as { insertBefore?: typeof orig }).insertBefore
  }
  return calls
}

/** Run one op under a MutationObserver on the document; return its records. */
function observeOneOp(run: () => void): MutationRecord[] {
  const g = globalThis as unknown as {
    document: Document
    window: { MutationObserver: typeof MutationObserver }
  }
  const observer = new g.window.MutationObserver(() => {
    /* drained synchronously */
  })
  observer.observe(g.document, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
  })
  let records: MutationRecord[]
  try {
    run()
    records = observer.takeRecords()
  } finally {
    observer.disconnect()
  }
  return records
}

// ---------------------------------------------------------------------------
// Rows 1+2 — keyed reorder move counts (FEL-408; the "4 vs 1994" claim)
// ---------------------------------------------------------------------------

function keyedMoveCounts(): void {
  type Row = { id: number }
  const N = 1000
  const rowData: Row[] = Array.from({ length: N }, (_, i) => ({ id: i }))

  const doc = (globalThis as unknown as { document: Document }).document
  const host = doc.createElement('div')
  const sig = signal(rowData.slice())
  const scope = mount(
    branch('ul', undefined, [
      each(
        sig,
        (item) => (item as Row).id,
        (item) => branch('li', undefined, [leaf(String((item as Row).id))]),
      ),
    ]),
    host as unknown as Element,
  )

  const order = (): number[] =>
    Array.from(host.querySelectorAll('li')).map((li) => Number(li.textContent))

  // Row 1: swap rows 1 and 998.
  const swapped = rowData.slice()
  const tmp = swapped[1] as Row
  swapped[1] = swapped[998] as Row
  swapped[998] = tmp
  const swapMoves = countInsertBefore(() => sig[1](swapped))
  rows.push({ name: 'keyed-swap-1000 moves/swap', expected: 4, actual: swapMoves, unit: 'moves' })

  // Count-liveness: the count is only meaningful if the swap actually landed.
  const after = order()
  if (after[1] !== 998 || after[998] !== 1) {
    rows.push({ name: 'keyed-swap-1000 order landed', expected: 1, actual: 0, unit: 'bool' })
  }

  // Row 2: a no-op re-render moves nothing.
  const noopMoves = countInsertBefore(() => sig[1](swapped.slice()))
  rows.push({ name: 'keyed-noop moves/render', expected: 0, actual: noopMoves, unit: 'moves' })

  scope.dispose()
}

// ---------------------------------------------------------------------------
// Row 3 — update-1-of-10k-leaves: exactly 1 DOM mutation per op
// ---------------------------------------------------------------------------

function updateWriteCount(): void {
  const ctx = updateOneOfTenK.build(aihu)
  try {
    ctx.run() // settle one op outside the observed window
    const records = observeOneOp(ctx.run)
    const characterData = records.filter((r) => r.type === 'characterData').length
    rows.push({
      name: 'update-1-of-10k writes/op (characterData)',
      expected: 1,
      actual: characterData,
      unit: 'writes',
    })
    rows.push({
      name: 'update-1-of-10k total mutations/op',
      expected: 1,
      actual: records.length,
      unit: 'records',
    })
  } finally {
    ctx.cleanup()
  }
}

// ---------------------------------------------------------------------------
// Row 4 — attr-thrash-100x100: exactly 10,000 attribute mutations per op
// ---------------------------------------------------------------------------

function attrWriteCount(): void {
  const ctx = attrThrash.build(aihu)
  try {
    ctx.run() // settle one op outside the observed window
    const records = observeOneOp(ctx.run)
    const attrs = records.filter((r) => r.type === 'attributes').length
    rows.push({
      name: 'attr-thrash-100x100 setAttribute/op',
      expected: 10_000,
      actual: attrs,
      unit: 'writes',
    })
    rows.push({
      name: 'attr-thrash-100x100 total mutations/op',
      expected: 10_000,
      actual: records.length,
      unit: 'records',
    })
  } finally {
    ctx.cleanup()
  }
}

// ---------------------------------------------------------------------------

function main(): void {
  if (process.env.BENCH_BUMP === '1') {
    console.log(
      'NOTE: BENCH_BUMP has no effect on the counted-metric gate — counts are ' +
        'exact equalities; a count change is an algorithmic change and must be ' +
        'reviewed by editing the pinned constants.',
    )
  }

  keyedMoveCounts()
  updateWriteCount()
  attrWriteCount()

  console.log('Counted-metric gate (R8) · @aihu/arbor · machine-independent equalities')
  let failures = 0
  for (const row of rows) {
    const ok = row.actual === row.expected
    if (!ok) failures++
    console.log(
      `  ${ok ? 'OK  ' : 'FAIL'} ${row.name}: expected ${row.expected}, got ${row.actual} ${row.unit}`,
    )
  }

  if (failures > 0) {
    console.error(
      `\n${failures} counted metric(s) diverged from their pinned value. ` +
        'This is an algorithmic change (or a dead binding — a count of 0 means ' +
        'the op mutated nothing). There is no bypass: fix the code, or change ' +
        'the pinned constant here AND in packages/arbor/tests/structural.test.ts ' +
        'in a reviewed diff.',
    )
    process.exit(1)
  }
  console.log('\nAll counted metrics hold.')
}

main()
