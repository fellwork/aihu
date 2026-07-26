/**
 * FEL-415 — independent DOM-mutation count for a keyed swap.
 *
 * Written BLIND, deliberately: no `bench/arbor` helpers, no shared harness, and
 * without reading the reposition implementation under test. It drives only the
 * public `each`/`branch`/`leaf`/`mount` surface and counts what the DOM actually
 * receives, by patching the mutation methods themselves.
 *
 * Why a second measurement path rather than another review: today produced a
 * benchmark that measured a literal no-op for two months, a parity test that
 * could not fail, a CI guard that passed on the wrong package set, and a README
 * publishing a fabricated number as data. Every one survived someone reading the
 * diff. What none of them had was an independent instrument.
 *
 * The workload mirrors js-framework-benchmark's `swap-rows`: build 1000 keyed
 * rows, then exchange indices 1 and 998 via `slice()` — a SHALLOW copy, so every
 * row object keeps its identity and a correct reconciler has nothing to re-grow.
 *
 * Lower bound for that swap is 2 moved elements. Anything near 2N means the
 * reposition pass is walking left-to-right and displacing the whole span.
 */

import { branch, each, leaf, mount } from '@aihu/arbor'
import { signal } from '@aihu/signals'
import { afterEach, describe, expect, it } from 'vitest'

interface Row {
  id: number
  label: string
}

/** Counts every DOM mutation the reconciler performs, by patching the methods. */
function instrumentDom() {
  const counts = {
    insertBefore: 0,
    appendChild: 0,
    removeChild: 0,
    replaceChild: 0,
    createElement: 0,
    createTextNode: 0,
    moveBefore: 0,
  }

  const proto = Node.prototype as unknown as Record<string, unknown>
  const doc = Document.prototype as unknown as Record<string, unknown>
  const saved: Array<[Record<string, unknown>, string, unknown]> = []

  const patch = (target: Record<string, unknown>, name: keyof typeof counts) => {
    const original = target[name]
    if (typeof original !== 'function') return
    saved.push([target, name, original])
    target[name] = function patched(this: unknown, ...args: unknown[]) {
      counts[name]++
      return (original as (...a: unknown[]) => unknown).apply(this, args)
    }
  }

  patch(proto, 'insertBefore')
  patch(proto, 'appendChild')
  patch(proto, 'removeChild')
  patch(proto, 'replaceChild')
  // Chrome's state-preserving move. Absent in jsdom; patched when present so the
  // count is not silently zero on a runtime that does use it.
  patch(proto, 'moveBefore')
  patch(doc, 'createElement')
  patch(doc, 'createTextNode')

  return {
    counts,
    reset: () => {
      for (const k of Object.keys(counts) as Array<keyof typeof counts>) counts[k] = 0
    },
    restore: () => {
      for (const [target, name, original] of saved) target[name] = original
    },
  }
}

let active: ReturnType<typeof instrumentDom> | null = null
afterEach(() => {
  active?.restore()
  active = null
})

describe('keyed swap: DOM mutations actually performed', () => {
  it('swapping 2 of 1000 rows moves only those rows', () => {
    const ROWS = 1000
    const A = 1
    const B = 998

    const initial: Row[] = Array.from({ length: ROWS }, (_, i) => ({
      id: i + 1,
      label: `row-${i + 1}`,
    }))
    // `each` reads `list[0]()`, so it takes the signal TUPLE, not the getter.
    const rows = signal<Row[]>(initial)
    const setRows = rows[1]

    const host = document.createElement('div')
    document.body.appendChild(host)

    const tree = branch('table', undefined, [
      each(
        rows,
        (r) => r.id,
        (r) =>
          branch('tr', { 'data-id': String(r.id) }, [
            branch('td', undefined, [leaf(() => r.label)]),
          ]),
      ),
    ])

    mount(tree, host)

    const rendered = host.querySelectorAll('tr')
    expect(rendered.length).toBe(ROWS)
    const idsBefore = [...rendered].map((el) => el.getAttribute('data-id'))

    // Instrument only the swap, never the initial build.
    active = instrumentDom()
    active.reset()

    // jsfb's swap: shallow copy, exchange two entries. All 1000 identities survive.
    const next = initial.slice()
    const tmp = next[A]
    next[A] = next[B]
    next[B] = tmp
    setRows(next)

    const { counts } = active
    const moved = counts.insertBefore + counts.appendChild + counts.moveBefore
    const created = counts.createElement + counts.createTextNode

    const idsAfter = [...host.querySelectorAll('tr')].map((el) => el.getAttribute('data-id'))

    // Report before asserting — on failure the numbers matter more than the throw.
    console.log(
      `[FEL-415] swap ${A}<->${B} of ${ROWS}: moved=${moved} created=${created} removed=${counts.removeChild} ` +
        `(insertBefore=${counts.insertBefore} appendChild=${counts.appendChild} moveBefore=${counts.moveBefore})`,
    )

    // 1. Correctness first. A cheap-but-wrong swap is not a win.
    const expected = idsBefore.slice()
    const t = expected[A]
    expected[A] = expected[B]
    expected[B] = t
    expect(idsAfter).toEqual(expected)

    // 2. Identity: shallow copy means nothing should be constructed.
    expect(created).toBe(0)

    // 3. The actual claim. Two rows change position; a minimal reconciler moves
    //    2 elements (each row may carry an anchor, so allow up to 2 nodes each).
    expect(moved).toBeLessThanOrEqual(4)
  })
})
