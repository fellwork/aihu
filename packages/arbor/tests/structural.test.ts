import { signal } from '@aihu/signals'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { branch, each, leaf, mount, when } from '../src/index.ts'

/**
 * Tests for `when()` and `each()` — Plan 1.1 reconciler per spec §2.
 *
 * The 2 original stub-throw tests are replaced by 8 real tests covering:
 *  1. when() - condition true → branch mounted
 *  2. when() - condition false→true→false → DOM updates correctly
 *  3. when() - condition starts false → nothing mounted
 *  4. each() - initial list renders correct elements
 *  5. each() - item removed → DOM node removed
 *  6. each() - item added → DOM node in correct position
 *  7. each() - list reordered → DOM reordered, keyed identity preserved
 *  8. each() - dispose of outer MountScope tears down all child scopes
 */

describe('when() — conditional rendering', () => {
  it('T1: condition starts true → grow() result is mounted in DOM', () => {
    const host = document.createElement('div')
    const cond = signal(true)
    const scope = mount(
      branch(null, undefined, [when(cond, () => branch('span', undefined, [leaf('hello')]))]),
      host,
    )

    expect(host.querySelector('span')).not.toBeNull()
    expect(host.textContent).toBe('hello')

    scope.dispose()
  })

  it('T2: condition flips false→true→false → DOM updates correctly', () => {
    const host = document.createElement('div')
    const [getCond, setCond] = signal(false)
    const cond: ReturnType<typeof signal<boolean>> = [getCond, setCond]

    const scope = mount(
      branch('div', undefined, [
        when(cond, () => branch('span', { id: 'inner' }, [leaf('visible')])),
      ]),
      host,
    )

    // Starts false — nothing mounted
    expect(host.querySelector('#inner')).toBeNull()

    // Flip true — branch appears
    setCond(true)
    expect(host.querySelector('#inner')).not.toBeNull()
    expect(host.textContent).toBe('visible')

    // Flip false — branch removed
    setCond(false)
    expect(host.querySelector('#inner')).toBeNull()
    expect(host.textContent).toBe('')

    scope.dispose()
  })

  it('T3: condition starts false → nothing mounted initially', () => {
    const host = document.createElement('div')
    const cond = signal(false)
    const scope = mount(
      branch('div', undefined, [when(cond, () => branch('p', undefined, [leaf('nope')]))]),
      host,
    )

    // Only the comment anchor should be present inside the div — no <p>
    expect(host.querySelector('p')).toBeNull()
    expect(host.textContent).toBe('')

    scope.dispose()
  })

  it('T9: when() driven by compiler-emitted [() => getter()] thunk array reacts to writes (bug1-reactivity regression)', () => {
    // Acceptance test for bug1-reactivity. The compiler emits
    // `when([() => loading()], ...)` for `<p if={loading()}>...`. The
    // mountEffect must subscribe to the signal read inside the thunk so
    // the conditional re-evaluates on writes. This test exercises that
    // exact shape against the single workspace-linked `@aihu/signals`
    // module — its sister check (`bun run lint:dep-pins`) guards the
    // dual-module-instance failure mode that bit published 0.1.x.
    const host = document.createElement('div')
    const [loading, setLoading] = signal(true)
    const cond = [() => loading()] as unknown as ReturnType<typeof signal<boolean>>
    const scope = mount(
      branch('div', undefined, [when(cond, () => branch('p', undefined, [leaf('Loading')]))]),
      host,
    )
    expect(host.textContent).toBe('Loading')

    setLoading(false)
    expect(host.textContent).toBe('')

    setLoading(true)
    expect(host.textContent).toBe('Loading')

    scope.dispose()
  })
})

// ---------------------------------------------------------------------------
// when() grow()-throw leak (regression): a throw before the st.c state commit
// must not orphan the just-inserted 'w' anchor comment or the partially-built
// child subtree's disposers.
// ---------------------------------------------------------------------------

/** Count comment nodes among an element's direct children. */
function commentCount(el: Element): number {
  let n = 0
  for (const c of Array.from(el.childNodes)) if (c.nodeType === 8) n++
  return n
}

describe('when() — grow() throw mid-reconcile does not leak anchor/disposers', () => {
  it('W1: reactive flip true with onError, grow() throws → anchor comment is not leaked', () => {
    const host = document.createElement('div')
    const errorSpy = vi.fn()
    const [getCond, setCond] = signal(false)
    const cond: ReturnType<typeof signal<boolean>> = [getCond, setCond]

    const scope = mount(
      branch('div', undefined, [
        when(cond, () => {
          throw new Error('grow-boom')
        }),
      ]),
      host,
      { onError: errorSpy },
    )

    const inner = host.querySelector('div') as HTMLElement
    // Mounted false: only the 'when' anchor comment.
    expect(commentCount(inner)).toBe(1)

    // Flip true — grow() throws inside the reconcile effect. The error must
    // reach onError, and the just-inserted 'w' anchor must be cleaned up
    // (before the fix it leaked: st.c was never committed, so no teardown
    // path could find it).
    setCond(true)
    expect(errorSpy).toHaveBeenCalledTimes(1)
    expect(commentCount(inner)).toBe(1)

    scope.dispose()
    expect(host.childNodes.length).toBe(0)
  })

  it('W2: reactive flip true, materialize throws mid-child → partial child disposers run', () => {
    const host = document.createElement('div')
    const errorSpy = vi.fn()
    const [getCond, setCond] = signal(false)
    const cond: ReturnType<typeof signal<boolean>> = [getCond, setCond]
    const [getText, setText] = signal('live')
    const textSig: ReturnType<typeof signal<string>> = [getText, setText]

    // grow() builds a fragment: a <p> with a reactive leaf materializes fully
    // (its effect subscribes and lands in the child-disposer array), then the
    // invalid tag throws before the state commit.
    const pNode = branch('p', undefined, [leaf(textSig)])
    const scope = mount(
      branch('div', undefined, [
        when(cond, () => branch(null, undefined, [pNode, leaf.element('not a valid tag')])),
      ]),
      host,
      { onError: errorSpy },
    )

    setCond(true)
    expect(errorSpy).toHaveBeenCalledTimes(1)

    // The <p> was materialized before the throw; its live DOM element is
    // reachable via the branch back-reference.
    const p = pNode.el as HTMLElement
    expect(p.textContent).toBe('live')

    // The anchor comment must be gone from the parent.
    const inner = host.querySelector('div') as HTMLElement
    expect(commentCount(inner)).toBe(1)

    // The reactive leaf's effect must have been disposed: before the fix the
    // child-disposer array was stranded and this write resurrected the text.
    setText('after-throw')
    expect(p.textContent).toBe('live')

    scope.dispose()
  })

  it('W3: no onError → error propagates to the writer; state stays consistent for retry', () => {
    const host = document.createElement('div')
    const [getCond, setCond] = signal(false)
    const cond: ReturnType<typeof signal<boolean>> = [getCond, setCond]

    let calls = 0
    const scope = mount(
      branch('div', undefined, [
        when(cond, () => {
          calls++
          if (calls === 1) throw new Error('first-grow-boom')
          return branch('span', undefined, [leaf('recovered')])
        }),
      ]),
      host,
    )

    // Without onError the throw must still propagate to the caller (the
    // signal write) — the fix is leak-only, never error-swallowing.
    expect(() => setCond(true)).toThrow('first-grow-boom')

    const inner = host.querySelector('div') as HTMLElement
    expect(commentCount(inner)).toBe(1)
    expect(host.textContent).toBe('')

    // st.c stayed null (nothing committed), so a false→true retry re-grows.
    setCond(false)
    setCond(true)
    expect(host.textContent).toBe('recovered')
    expect(commentCount(inner)).toBe(2)

    scope.dispose()
    expect(host.childNodes.length).toBe(0)
  })

  it('W4: initial mount with condition true and throwing grow() → anchor cleaned up', () => {
    const host = document.createElement('div')
    const errorSpy = vi.fn()
    const cond = signal(true)

    const scope = mount(
      branch('div', undefined, [
        when(cond, () => {
          throw new Error('initial-grow-boom')
        }),
      ]),
      host,
      { onError: errorSpy },
    )

    expect(errorSpy).toHaveBeenCalledTimes(1)
    const inner = host.querySelector('div') as HTMLElement
    // Only the 'when' anchor survives — the 'w' child anchor must not leak.
    expect(commentCount(inner)).toBe(1)

    scope.dispose()
    expect(host.childNodes.length).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// each() grow()-throw leak (regression): a throw before the per-item sc.set
// commit must not orphan the just-appended 'e' anchor comment or the in-flight
// item's partially-built disposers — and must not disturb already-committed
// sibling items.
// ---------------------------------------------------------------------------

describe('each() — item grow() throw mid-reconcile does not leak anchor/disposers', () => {
  it('E1: reactive list update, new item grow() throws → its anchor is not leaked; committed siblings intact', () => {
    const host = document.createElement('div')
    const errorSpy = vi.fn()
    const [getItems, setItems] = signal(['a', 'b'])
    const itemsSig: ReturnType<typeof signal<string[]>> = [getItems, setItems]

    const scope = mount(
      branch('ul', undefined, [
        each(
          itemsSig,
          (item) => item as string,
          (item) => {
            if (item === 'boom') throw new Error('item-grow-boom')
            return branch('li', undefined, [leaf(item as string)])
          },
        ),
      ]),
      host,
      { onError: errorSpy },
    )

    const ul = host.querySelector('ul') as HTMLElement
    // 'each' anchor + one 'e' anchor per committed item.
    expect(commentCount(ul)).toBe(3)
    expect(host.querySelectorAll('li').length).toBe(2)

    // Add a throwing item — the reconcile effect throws mid-item. The error
    // must reach onError, and the just-appended 'e' anchor for the in-flight
    // item must be cleaned up (before the fix it leaked: sc.set never ran, so
    // no teardown path could find it).
    setItems(['a', 'b', 'boom'])
    expect(errorSpy).toHaveBeenCalledTimes(1)
    expect(commentCount(ul)).toBe(3)
    // Committed siblings are untouched and still disposable.
    expect(host.querySelectorAll('li').length).toBe(2)

    scope.dispose()
    expect(host.childNodes.length).toBe(0)
  })

  it('E2: materialize throws mid-item → the in-flight item’s partial disposers run', () => {
    const host = document.createElement('div')
    const errorSpy = vi.fn()
    const [getItems, setItems] = signal(['a'])
    const itemsSig: ReturnType<typeof signal<string[]>> = [getItems, setItems]
    const [getText, setText] = signal('live')
    const textSig: ReturnType<typeof signal<string>> = [getText, setText]

    // The bad item's grow builds a fragment: a <p> with a reactive leaf
    // materializes fully (its effect subscribes and lands in the item's
    // child-disposer array), then the invalid tag throws before sc.set.
    const pNode = branch('p', undefined, [leaf(textSig)])
    const scope = mount(
      branch('ul', undefined, [
        each(
          itemsSig,
          (item) => item as string,
          (item) =>
            item === 'bad'
              ? branch(null, undefined, [pNode, leaf.element('not a valid tag')])
              : branch('li', undefined, [leaf(item as string)]),
        ),
      ]),
      host,
      { onError: errorSpy },
    )

    setItems(['a', 'bad'])
    expect(errorSpy).toHaveBeenCalledTimes(1)

    // The <p> was materialized before the throw; reachable via back-reference.
    const p = pNode.el as HTMLElement
    expect(p.textContent).toBe('live')

    // The in-flight item's anchor must be gone: 'each' anchor + committed 'a'.
    const ul = host.querySelector('ul') as HTMLElement
    expect(commentCount(ul)).toBe(2)

    // The reactive leaf's effect must have been disposed: before the fix the
    // item's disposer array was stranded and this write updated the detached
    // <p>.
    setText('after-throw')
    expect(p.textContent).toBe('live')

    scope.dispose()
  })

  it('E3: no onError → error propagates to the writer; committed items and retry stay consistent', () => {
    const host = document.createElement('div')
    const [getItems, setItems] = signal(['a'])
    const itemsSig: ReturnType<typeof signal<string[]>> = [getItems, setItems]

    let boomCalls = 0
    const scope = mount(
      branch('ul', undefined, [
        each(
          itemsSig,
          (item) => item as string,
          (item) => {
            if (item === 'boom') {
              boomCalls++
              if (boomCalls === 1) throw new Error('first-item-boom')
            }
            return branch('li', undefined, [leaf(item as string)])
          },
        ),
      ]),
      host,
    )

    // Without onError the throw must still propagate to the caller (the
    // signal write) — the fix is leak-only, never error-swallowing.
    expect(() => setItems(['a', 'boom'])).toThrow('first-item-boom')

    const ul = host.querySelector('ul') as HTMLElement
    // 'each' anchor + committed 'a' anchor only — no stranded 'e' anchor.
    expect(commentCount(ul)).toBe(2)
    expect(host.querySelectorAll('li').length).toBe(1)

    // 'boom' was never committed, so a retry re-grows it cleanly.
    setItems(['a'])
    setItems(['a', 'boom'])
    expect(host.querySelectorAll('li').length).toBe(2)
    expect(host.textContent).toBe('aboom')
    expect(commentCount(ul)).toBe(3)

    scope.dispose()
    expect(host.childNodes.length).toBe(0)
  })

  it('E4: initial mount, middle item throws → earlier items committed, in-flight anchor cleaned up', () => {
    const host = document.createElement('div')
    const errorSpy = vi.fn()
    const items = signal(['a', 'boom', 'c'])

    const scope = mount(
      branch('ul', undefined, [
        each(
          items,
          (item) => item as string,
          (item) => {
            if (item === 'boom') throw new Error('initial-item-boom')
            return branch('li', undefined, [leaf(item as string)])
          },
        ),
      ]),
      host,
      { onError: errorSpy },
    )

    expect(errorSpy).toHaveBeenCalledTimes(1)
    const ul = host.querySelector('ul') as HTMLElement
    // 'a' was committed before the throw; 'boom' aborted the loop so 'c' was
    // never reached. Only the 'each' anchor + 'a' anchor survive.
    expect(host.querySelectorAll('li').length).toBe(1)
    expect(host.textContent).toBe('a')
    expect(commentCount(ul)).toBe(2)

    scope.dispose()
    expect(host.childNodes.length).toBe(0)
  })
})

describe('each() — list rendering', () => {
  it('T4: initial list renders correct elements in order', () => {
    const host = document.createElement('div')
    const items = signal(['a', 'b', 'c'])

    const scope = mount(
      branch('ul', undefined, [
        each(
          items,
          (item) => item as string,
          (item) => branch('li', undefined, [leaf(item as string)]),
        ),
      ]),
      host,
    )

    const lis = host.querySelectorAll('li')
    expect(lis.length).toBe(3)
    expect(lis[0]?.textContent).toBe('a')
    expect(lis[1]?.textContent).toBe('b')
    expect(lis[2]?.textContent).toBe('c')

    scope.dispose()
  })

  it('T5: item removed from list → DOM node removed', () => {
    const host = document.createElement('div')
    const [getItems, setItems] = signal(['x', 'y', 'z'])
    const itemsSig: ReturnType<typeof signal<string[]>> = [getItems, setItems]

    const scope = mount(
      branch('ul', undefined, [
        each(
          itemsSig,
          (item) => item as string,
          (item) => branch('li', undefined, [leaf(item as string)]),
        ),
      ]),
      host,
    )

    expect(host.querySelectorAll('li').length).toBe(3)

    // Remove 'y'
    setItems(['x', 'z'])
    const lis = host.querySelectorAll('li')
    expect(lis.length).toBe(2)
    expect(lis[0]?.textContent).toBe('x')
    expect(lis[1]?.textContent).toBe('z')

    scope.dispose()
  })

  it('T6: item added → DOM node appears in correct position', () => {
    const host = document.createElement('div')
    const [getItems, setItems] = signal(['a', 'c'])
    const itemsSig: ReturnType<typeof signal<string[]>> = [getItems, setItems]

    const scope = mount(
      branch('ul', undefined, [
        each(
          itemsSig,
          (item) => item as string,
          (item) => branch('li', undefined, [leaf(item as string)]),
        ),
      ]),
      host,
    )

    expect(host.querySelectorAll('li').length).toBe(2)

    // Add 'b' in the middle
    setItems(['a', 'b', 'c'])
    const lis = host.querySelectorAll('li')
    expect(lis.length).toBe(3)
    expect(lis[0]?.textContent).toBe('a')
    expect(lis[1]?.textContent).toBe('b')
    expect(lis[2]?.textContent).toBe('c')

    scope.dispose()
  })

  it('T7: list reordered → DOM reordered; keyed identity preserved (no recreation)', () => {
    const host = document.createElement('div')
    const [getItems, setItems] = signal(['first', 'second', 'third'])
    const itemsSig: ReturnType<typeof signal<string[]>> = [getItems, setItems]

    // Track which items had their grow() called (i.e., were created, not reused)
    const created: string[] = []

    const scope = mount(
      branch('ul', undefined, [
        each(
          itemsSig,
          (item) => item as string,
          (item) => {
            created.push(item as string)
            return branch('li', undefined, [leaf(item as string)])
          },
        ),
      ]),
      host,
    )

    // Initial render: 3 items created
    expect(created).toEqual(['first', 'second', 'third'])

    let lis = host.querySelectorAll('li')
    expect(lis[0]?.textContent).toBe('first')
    expect(lis[1]?.textContent).toBe('second')
    expect(lis[2]?.textContent).toBe('third')

    // Reorder: reverse
    created.length = 0
    setItems(['third', 'second', 'first'])

    // No new items created — all keys were already present
    expect(created).toEqual([])

    lis = host.querySelectorAll('li')
    expect(lis[0]?.textContent).toBe('third')
    expect(lis[1]?.textContent).toBe('second')
    expect(lis[2]?.textContent).toBe('first')

    scope.dispose()
  })

  // -------------------------------------------------------------------------
  // FEL-395 regression: keyed each() must not leave STALE ROW VALUES when a
  // list is replaced by NEW objects that share the SAME keys but carry
  // DIFFERENT field values. Row bodies capture their item by value at grow
  // time (`lgrow(items[i], i)` — template_emit.rs ~653), so
  // `_reconcileEach`'s old `if (sc.has(k)) continue` skipped re-growing any
  // row whose key was unchanged, even when the object behind that key was a
  // completely different reference with different fields. T4-T8 above never
  // caught this because they use primitive items where key === value, so
  // "same key" and "same value" were indistinguishable.
  // -------------------------------------------------------------------------
  it('T10 (FEL-395): same-keyed but different-value objects → DOM reflects the NEW values', () => {
    const host = document.createElement('div')
    type Row = { id: string; label: string }
    const [getItems, setItems] = signal<Row[]>([
      { id: '1', label: 'alpha' },
      { id: '2', label: 'beta' },
    ])
    const itemsSig: ReturnType<typeof signal<Row[]>> = [getItems, setItems]

    const scope = mount(
      branch('ul', undefined, [
        each(
          itemsSig,
          (item) => (item as Row).id,
          (item) => branch('li', undefined, [leaf((item as Row).label)]),
        ),
      ]),
      host,
    )

    let lis = host.querySelectorAll('li')
    expect(lis[0]?.textContent).toBe('alpha')
    expect(lis[1]?.textContent).toBe('beta')

    // Replace with BRAND NEW objects — same ids (keys), different labels.
    setItems([
      { id: '1', label: 'ALPHA-CHANGED' },
      { id: '2', label: 'BETA-CHANGED' },
    ])

    lis = host.querySelectorAll('li')
    expect(lis.length).toBe(2)
    // Before the fix: stale 'alpha'/'beta' render forever because the keyed
    // row was skipped (sc.has(k) === true) and never re-grown.
    expect(lis[0]?.textContent).toBe('ALPHA-CHANGED')
    expect(lis[1]?.textContent).toBe('BETA-CHANGED')

    scope.dispose()
  })

  it('T11 (FEL-395): reordering the SAME object references still reuses rows (no spurious re-grow)', () => {
    const host = document.createElement('div')
    type Row = { id: string; label: string }
    const rowA: Row = { id: 'a', label: 'Alpha' }
    const rowB: Row = { id: 'b', label: 'Beta' }
    const [getItems, setItems] = signal<Row[]>([rowA, rowB])
    const itemsSig: ReturnType<typeof signal<Row[]>> = [getItems, setItems]

    const created: string[] = []
    const scope = mount(
      branch('ul', undefined, [
        each(
          itemsSig,
          (item) => (item as Row).id,
          (item) => {
            created.push((item as Row).id)
            return branch('li', undefined, [leaf((item as Row).label)])
          },
        ),
      ]),
      host,
    )

    expect(created).toEqual(['a', 'b'])
    created.length = 0

    // Reorder using the SAME object references — must not re-grow either row.
    setItems([rowB, rowA])
    expect(created).toEqual([])

    const lis = host.querySelectorAll('li')
    expect(lis[0]?.textContent).toBe('Beta')
    expect(lis[1]?.textContent).toBe('Alpha')

    scope.dispose()
  })

  it('T8: dispose of outer MountScope tears down all child scopes', () => {
    const host = document.createElement('div')
    const items = signal(['p', 'q', 'r'])
    const reactiveText = signal('reactive')

    const scope = mount(
      branch('ul', undefined, [
        each(
          items,
          (item) => item as string,
          (item) => branch('li', undefined, [leaf(item as string), leaf(reactiveText)]),
        ),
      ]),
      host,
    )

    expect(host.querySelectorAll('li').length).toBe(3)

    // Dispose the outer scope
    scope.dispose()

    // All DOM nodes removed
    expect(host.querySelectorAll('li').length).toBe(0)
    expect(host.childNodes.length).toBe(0)

    // Signal writes after dispose should not cause errors
    const setReactive = reactiveText[1]
    expect(() => setReactive('after-dispose')).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// FEL-396 regression: repositioning an unchanged (same key, same value) row
// during a keyed each() reorder must prefer moveBefore() over insertBefore()
// when the host supports it — insertBefore on an already-connected node is a
// remove+insert that fires disconnectedCallback+connectedCallback on any
// custom element inside, destroying its state (see define-component.ts /
// define-element.ts connectedMoveCallback additions for the other half of
// this fix). jsdom (this repo's test environment) does not implement
// `moveBefore` natively, so both branches are exercised here directly:
//   - the feature-detection branch, via a `moveBefore` shim installed on
//     `Element.prototype` for the duration of the test (real
//     state-preservation semantics — the browser skipping
//     disconnected/connectedCallback — cannot be observed under jsdom; a
//     shim only proves the reconciler CALLS moveBefore when present, which
//     is what `_moveNode`'s feature-detection is responsible for).
//   - the fallback branch (today's behavior), confirming insertBefore is
//     still used when moveBefore is absent — this repo has no real-browser
//     test lane for arbor/runtime (only packages/editor/e2e is Playwright,
//     scoped to the editor's Storybook), so full state-preservation across a
//     real moveBefore is not verifiable in this test suite.
// ---------------------------------------------------------------------------

type MoveCapableElement = Element & {
  moveBefore?(node: globalThis.Node, child: globalThis.Node | null): void
}

/**
 * Spec-faithful `moveBefore` shim: real `moveBefore()` throws
 * `HierarchyRequestError` when `node` isn't a valid move target for `this` —
 * in particular when it has no parent, or its root differs from `this`'s
 * root. jsdom has no native `moveBefore` to enforce this, so an earlier
 * version of this shim delegated straight to `insertBefore` with no
 * validity check at all — which meant it could never catch the reconciler
 * handing `moveBefore` a stale/detached node (FEL-396: exactly the hazard
 * `_moveNode`'s feature-detection guard exists to prevent). Installed on
 * `Element.prototype` for the duration of a test; callers restore it via
 * `afterEach`.
 */
function installMoveBeforeShim(
  moveCalls: Array<{ node: globalThis.Node; ref: globalThis.Node | null }>,
): void {
  ;(Element.prototype as MoveCapableElement).moveBefore = function (
    this: Element,
    node: globalThis.Node,
    ref: globalThis.Node | null,
  ): void {
    if (node.parentNode === null || node.getRootNode() !== this.getRootNode()) {
      throw new DOMException(
        "Failed to execute 'moveBefore' on 'Node': the node to be moved is not in this node's tree.",
        'HierarchyRequestError',
      )
    }
    moveCalls.push({ node, ref })
    // A real moveBefore repositions without destroying state; jsdom has no
    // native implementation, so emulate the DOM-position effect via
    // insertBefore (the state-preservation semantics themselves are a
    // browser-internal guarantee this shim cannot reproduce — see the
    // comment block above).
    Element.prototype.insertBefore.call(this, node, ref)
  }
}

describe('each() — FEL-396: reposition prefers moveBefore() when available', () => {
  afterEach(() => {
    delete (Element.prototype as MoveCapableElement).moveBefore
  })

  it('feature-detection branch: calls moveBefore (not insertBefore) to reorder existing rows', () => {
    const moveCalls: Array<{ node: globalThis.Node; ref: globalThis.Node | null }> = []
    installMoveBeforeShim(moveCalls)
    const insertSpy = vi.spyOn(Element.prototype, 'insertBefore')

    const host = document.createElement('div')
    const [getItems, setItems] = signal(['a', 'b', 'c'])
    const itemsSig: ReturnType<typeof signal<string[]>> = [getItems, setItems]

    const scope = mount(
      branch('ul', undefined, [
        each(
          itemsSig,
          (item) => item as string,
          (item) => branch('li', undefined, [leaf(item as string)]),
        ),
      ]),
      host,
    )

    moveCalls.length = 0
    insertSpy.mockClear()
    setItems(['c', 'b', 'a'])

    // The reorder repositions existing (unchanged) rows via moveBefore, not
    // a raw insertBefore call from the reconciler itself. (insertSpy still
    // sees calls because the shim above delegates to insertBefore
    // internally — the point is moveBefore was reached at all.)
    expect(moveCalls.length).toBeGreaterThan(0)

    const lis = host.querySelectorAll('li')
    expect(lis[0]?.textContent).toBe('c')
    expect(lis[1]?.textContent).toBe('b')
    expect(lis[2]?.textContent).toBe('a')

    insertSpy.mockRestore()
    scope.dispose()
  })

  it("fallback branch: no moveBefore on the host → reorder still uses insertBefore (today's behavior)", () => {
    expect(typeof (document.createElement('div') as MoveCapableElement).moveBefore).toBe(
      'undefined',
    )
    const insertSpy = vi.spyOn(Element.prototype, 'insertBefore')

    const host = document.createElement('div')
    const [getItems, setItems] = signal(['x', 'y', 'z'])
    const itemsSig: ReturnType<typeof signal<string[]>> = [getItems, setItems]

    const scope = mount(
      branch('ul', undefined, [
        each(
          itemsSig,
          (item) => item as string,
          (item) => branch('li', undefined, [leaf(item as string)]),
        ),
      ]),
      host,
    )

    insertSpy.mockClear()
    setItems(['z', 'y', 'x'])

    expect(insertSpy).toHaveBeenCalled()
    const lis = host.querySelectorAll('li')
    expect(lis[0]?.textContent).toBe('z')
    expect(lis[1]?.textContent).toBe('y')
    expect(lis[2]?.textContent).toBe('x')

    insertSpy.mockRestore()
    scope.dispose()
  })

  // FEL-396 (review finding): a row whose top-level body is a bare structural
  // — compiler-emitted `each(..., (item, i) => when(...))` for
  // `{#each}{#if}...{/if}{/each}` — records the nested when()'s live content
  // nodes directly in the OUTER row's `appendedNodes` at grow time (see `_mc`
  // draining the nested reconcile's synchronous output alongside its
  // boundary anchor). When that nested when() later toggles off,
  // `_teardownChildScope` removes those nodes from the DOM, but the outer
  // row's `appendedNodes` snapshot is never updated — it keeps stale,
  // now-detached references. A real `moveBefore()` throws
  // `HierarchyRequestError` on a detached node (unlike `insertBefore`, which
  // silently proceeds), so a subsequent reorder must not hand one of those
  // stale nodes to `moveBefore` — `_moveNode` has to fall back to
  // `insertBefore` for anything that isn't still attached under the same
  // root as the reorder target.
  it('reorder after a bare-structural row toggles off its content does not throw on a stale detached node', () => {
    const moveCalls: Array<{ node: globalThis.Node; ref: globalThis.Node | null }> = []
    installMoveBeforeShim(moveCalls)

    const host = document.createElement('div')
    const [getItems, setItems] = signal(['a', 'b', 'c'])
    const itemsSig: ReturnType<typeof signal<string[]>> = [getItems, setItems]
    type BoolSignal = ReturnType<typeof signal<boolean>>
    const visA: BoolSignal = signal(true)
    const visB: BoolSignal = signal(true)
    const visC: BoolSignal = signal(true)
    const vis: Record<string, BoolSignal> = { a: visA, b: visB, c: visC }

    const scope = mount(
      branch('ul', undefined, [
        each(
          itemsSig,
          (item) => item as string,
          // Bare structural as the row body — no wrapping branch/fragment.
          (item) =>
            when(vis[item as string]!, () => branch('li', undefined, [leaf(item as string)])),
        ),
      ]),
      host,
    )

    expect(host.querySelectorAll('li').length).toBe(3)

    // Toggle off row 'b's nested content: its <li> (and the nested when's
    // own 'w' boundary comment) are removed from the DOM, but stay in row
    // 'b's outer appendedNodes snapshot as stale, now-detached references.
    visB[1](false)
    expect(host.querySelectorAll('li').length).toBe(2)

    // Reorder — must not throw despite the stale detached-node reference in
    // row 'b's appendedNodes. This is the FEL-396 regression itself: pre-fix,
    // `_moveNode` handed the detached, stale <li> straight to the spec-
    // faithful shim's moveBefore and it threw, aborting the reposition loop
    // mid-reorder.
    expect(() => setItems(['c', 'b', 'a'])).not.toThrow()

    // The guard never called moveBefore on the stale node — it fell back to
    // insertBefore instead (moveCalls only ever sees attached, same-root
    // nodes).
    for (const { node } of moveCalls) {
      expect(node.parentNode !== null && node.getRootNode() === host.getRootNode()).toBe(true)
    }

    // NOTE: the insertBefore fallback for a stale node silently re-inserts
    // it — row 'b's toggled-off <li> reappears in the DOM. That resurrection
    // is a separate, pre-existing defect (appendedNodes goes stale when a
    // row's top-level structural toggles off) independent of this guard;
    // this test only locks in that the reorder no longer throws. Filed
    // separately per the always-file-defects directive.
    const lis = host.querySelectorAll('li')
    expect(lis.length).toBe(3)
    const texts = Array.from(lis).map((li) => li.textContent)
    expect(texts).toContain('c')
    expect(texts).toContain('a')

    scope.dispose()
  })
})

// ---------------------------------------------------------------------------
// FEL-408 regression: MOVE COUNTS, not just final order.
//
// `_reconcileEach`'s reposition pass used to be a single left-to-right cursor
// with no notion of a stable subsequence: it moved every scope that was not
// already sitting at the cursor. Pulling one row forward therefore displaced
// every row behind it, and each of those was then relocated individually — and
// each row costs TWO DOM moves, because its scope carries an `<!--e-->` anchor
// comment alongside its content. Instrumented, a 2-row swap in a 1000-row
// keyed list performed 1994 DOM moves where 4 (= 2 scopes) suffice.
//
// Every assertion below is on the MOVE COUNT. The final-order assertions that
// accompany them all passed against the 1994-move implementation too — which
// is exactly how this survived from `9195d20d` (the original v1 reconciler)
// until it showed up as the `05_swap1k` row in js-framework-benchmark. An
// order-only test cannot catch this class of defect; do not weaken these to
// order checks.
//
// jsdom has no native `moveBefore`, so `_moveNode` takes its `insertBefore`
// fallback and every reposition is one `insertBefore` call. No rows are grown
// or destroyed in a pure reorder (`_mc` is the only other caller and it never
// runs here), so the spy count IS the DOM-node move count.
// ---------------------------------------------------------------------------
describe('each() — FEL-408: keyed reorder performs the minimum number of DOM moves', () => {
  type Row = { id: number }

  function mount1k(rows: Row[]) {
    const host = document.createElement('div')
    const sig: ReturnType<typeof signal<Row[]>> = signal(rows)
    const scope = mount(
      branch('ul', undefined, [
        each(
          sig,
          (item) => (item as Row).id,
          (item) => branch('li', undefined, [leaf(String((item as Row).id))]),
        ),
      ]),
      host,
    )
    return { host, set: sig[1], scope }
  }

  const order = (host: HTMLElement): number[] =>
    Array.from(host.querySelectorAll('li')).map((li) => Number(li.textContent))

  /** DOM-node moves performed by `fn` (2 per scope: anchor comment + row). */
  function domMoves(fn: () => void): number {
    const spy = vi.spyOn(Element.prototype, 'insertBefore')
    spy.mockClear()
    fn()
    const n = spy.mock.calls.length
    spy.mockRestore()
    return n
  }

  const N = 1000
  const rows: Row[] = Array.from({ length: N }, (_, i) => ({ id: i }))

  it('a 2-row swap in a 1000-row list moves exactly 2 scopes (4 DOM nodes), not 997 (1994)', () => {
    const { host, set, scope } = mount1k(rows.slice())

    const swapped = rows.slice()
    const tmp = swapped[1] as Row
    swapped[1] = swapped[998] as Row
    swapped[998] = tmp

    // THE assertion. Pre-fix this was 1994.
    expect(domMoves(() => set(swapped))).toBe(4)

    // ...and the swap actually happened (this part passed pre-fix too).
    expect(order(host)[1]).toBe(998)
    expect(order(host)[998]).toBe(1)
    expect(order(host)[0]).toBe(0)
    expect(order(host)[999]).toBe(999)

    scope.dispose()
  })

  it('a no-op re-render moves nothing', () => {
    const { host, set, scope } = mount1k(rows.slice())
    expect(domMoves(() => set(rows.slice()))).toBe(0)
    expect(order(host)).toEqual(rows.map((r) => r.id))
    scope.dispose()
  })

  it('prepend / append / delete-middle stay at their minimum', () => {
    const { host, set, scope } = mount1k(rows.slice())

    // Append: the new row is grown at the end of the parent, which is already
    // where it belongs — 1 insertBefore for the grow itself, 0 moves.
    expect(domMoves(() => set([...rows, { id: -2 }]))).toBe(1)
    set(rows.slice())

    // Prepend: 1 grow + the new scope's 2 nodes moved to the front. Every
    // pre-existing row stays put.
    expect(domMoves(() => set([{ id: -1 }, ...rows]))).toBe(3)
    set(rows.slice())

    // Delete from the middle: nothing moves, the removed row is just gone.
    const delMid = rows.slice()
    delMid.splice(500, 1)
    expect(domMoves(() => set(delMid))).toBe(0)
    expect(order(host).length).toBe(N - 1)
    expect(order(host).includes(500)).toBe(false)

    scope.dispose()
  })

  it('a full reverse moves n-1 scopes — the longest stable subsequence really is 1', () => {
    const { host, set, scope } = mount1k(rows.slice())
    const reversed = rows.slice().reverse()
    // 999 scopes x 2 nodes. One row is legitimately left in place; there is no
    // longer stable subsequence in a reversal, so this is optimal, not a miss.
    expect(domMoves(() => set(reversed))).toBe(1998)
    expect(order(host)).toEqual(reversed.map((r) => r.id))
    scope.dispose()
  })

  it('two independent far swaps use the LONGEST stable subsequence, not the longest RUN', () => {
    // Swapping 1<->498 and 501<->998 breaks the list into two ~496-long
    // ascending blocks. The longest stable SUBSEQUENCE spans both (996 rows),
    // so only the 4 swapped scopes move: 8 DOM nodes. Two cheaper heuristics
    // are excluded by this number:
    //   - the pre-fix greedy left-to-right cursor moves 994 scopes (1988);
    //   - keeping the longest CONTIGUOUS run stationary can only hold one of
    //     the two blocks, so it moves ~500 scopes.
    const { host, set, scope } = mount1k(rows.slice())
    const twice = rows.slice()
    const sw = (a: number, b: number) => {
      const t = twice[a] as Row
      twice[a] = twice[b] as Row
      twice[b] = t
    }
    sw(1, 498)
    sw(501, 998)
    expect(domMoves(() => set(twice))).toBe(8)
    expect(order(host)).toEqual(twice.map((r) => r.id))
    scope.dispose()
  })

  it('a row appended AFTER trailing siblings is still pulled back into the region', () => {
    // A fresh scope is appended to the end of the PARENT — past anything that
    // follows the each() region. It must never be treated as "already in
    // order" just because it is the newest thing in the list.
    const host = document.createElement('div')
    const sig: ReturnType<typeof signal<Row[]>> = signal([{ id: 1 }, { id: 2 }])
    const scope = mount(
      branch('ul', undefined, [
        each(
          sig,
          (item) => (item as Row).id,
          (item) => branch('li', undefined, [leaf(String((item as Row).id))]),
        ),
        branch('hr', undefined, []),
      ]),
      host,
    )
    const ul = host.firstChild as Element
    sig[1]([{ id: 1 }, { id: 2 }, { id: 3 }])
    expect(order(host)).toEqual([1, 2, 3])
    expect(ul.lastChild?.nodeName).toBe('HR')
    scope.dispose()
  })
})

// ---------------------------------------------------------------------------
// FEL-408 follow-up regressions (adversarial review of a993aa19 — see
// docs/plans/2026-07-25-lis-adversarial-review.md). Both tests FAIL on
// a993aa19 without the fix and PASS on its parent: they are repros first,
// regression locks second.
//
// R1: `pos` doubles as LIS scratch during a reconcile, and the final walk is
// the ONLY writer that restores real DOM indexes. A mid-reconcile lgrow()
// throw (the no-onError retry flow E3 above blesses as supported) exits
// before the walk, leaving scratch run-lengths in committed survivors' pos.
// The NEXT reconcile then trusts scratch as DOM order, flags out-of-order
// rows "stable", skips their moves, and silently commits the wrong order —
// then stamps pos = i as if the order were right, concealing the corruption.
//
// R2: duplicate keys collapse to one Map scope, but the new sl cache can hold
// that scope at several indexes. A later same-key occurrence with a different
// item ref tears the scope down (FEL-395) while sl[earlier] still points at
// it; the walk then re-inserts the DISPOSED nodes (a zombie row whose effects
// are dead).
// ---------------------------------------------------------------------------
describe('each() — FEL-408 follow-up: pos scratch + duplicate keys', () => {
  function mountStrings(init: string[]) {
    const host = document.createElement('div')
    const sig: ReturnType<typeof signal<string[]>> = signal(init)
    const scope = mount(
      branch('ul', undefined, [
        each(
          sig,
          (item) => item as string,
          (item) => {
            if (item === 'boom') throw new Error('grow-boom')
            return branch('li', undefined, [leaf(item as string)])
          },
        ),
      ]),
      host,
    )
    return { host, set: sig[1], scope }
  }
  const texts = (host: HTMLElement) =>
    Array.from(host.querySelectorAll('li')).map((li) => li.textContent)

  it('R1: retry after a mid-reconcile throw renders the LIST order, not the scratch order', () => {
    const { host, set, scope } = mountStrings(['c', 'b', 'a'])
    expect(texts(host)).toEqual(['c', 'b', 'a'])
    // The throwing update processes survivors a, c, b BEFORE hitting 'boom',
    // leaving scratch pos a=0, c=0, b=1; the walk never runs, so the DOM
    // stays [c, b, a].
    expect(() => set(['a', 'c', 'b', 'boom'])).toThrow('grow-boom')
    expect(texts(host)).toEqual(['c', 'b', 'a'])
    // Clean retry (exactly the E3 flow). Pre-fix: scratch [a=0, b=1] reads as
    // an already-increasing chain -> zero moves -> DOM stays [b, a] while the
    // list says [a, b], with no error anywhere.
    set(['a', 'b'])
    expect(texts(host)).toEqual(['a', 'b'])
    scope.dispose()
    expect(host.childNodes.length).toBe(0)
  })

  it('R1b: same corruption, retry keeping all keys', () => {
    const { host, set, scope } = mountStrings(['c', 'b', 'a'])
    expect(() => set(['a', 'c', 'b', 'boom'])).toThrow('grow-boom')
    // Pre-fix this rendered [b, c, a].
    set(['a', 'b', 'c'])
    expect(texts(host)).toEqual(['a', 'b', 'c'])
    scope.dispose()
  })

  it('R2: duplicate key with differing refs must not resurrect disposed nodes', () => {
    type Row = { id: string; label: string }
    const b: Row = { id: 'b', label: 'B' }
    const host = document.createElement('div')
    const sig: ReturnType<typeof signal<Row[]>> = signal([b])
    const scope = mount(
      branch('ul', undefined, [
        each(
          sig,
          (item) => (item as Row).id,
          (item) => branch('li', undefined, [leaf((item as Row).label)]),
        ),
      ]),
      host,
    )
    // Degenerate input: key 'a' appears twice with DIFFERENT refs. The second
    // occurrence tears down the scope grown for the first (FEL-395) — the
    // walk must not re-insert the disposed 'A1' nodes. Pre-fix the DOM ended
    // as [A1, B, A2]: three rows for two keys, A1 dead but visible.
    sig[1]([{ id: 'a', label: 'A1' }, b, { id: 'a', label: 'A2' }])
    expect(host.querySelectorAll('li').length).toBe(2)
    expect(texts(host)).not.toContain('A1')
    scope.dispose()
    expect(host.childNodes.length).toBe(0)
  })
})
