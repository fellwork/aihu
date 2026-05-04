import { signal } from '@scribe/signals'
import { describe, expect, it } from 'vitest'
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
