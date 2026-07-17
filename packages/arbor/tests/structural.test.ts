import { signal } from '@aihu/signals'
import { describe, expect, it, vi } from 'vitest'
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
    // `when([() => loading()], ...)` for `<p $if={loading()}>...`. The
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
