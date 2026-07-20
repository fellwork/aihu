/**
 * Tests for `hydrate()` and `MountScope.serialize()` — Plan 3.2.
 *
 * Covers:
 *  - T1: serialize() returns flat Record<string, unknown> with path-keyed values
 *  - T2: hydrate() happy path — attaches to existing DOM without re-creating elements
 *  - T3: mismatch fallback — if expected DOM node not found, mount() is called for subtree
 *  - T4: serialize → JSON.stringify → JSON.parse → hydrate round-trip (signal values restored)
 *  - T5: hydrate dispose() tears down effects; subsequent signal writes do not update DOM
 *  - T6: serialize() returns updated value after signal write
 */

import { signal } from '@aihu/signals'
import { describe, expect, it } from 'vitest'
import { _ROOT_PATH, hydrate } from '../src/hydrate.ts'
import { branch, leaf } from '../src/index.ts'
import { mount } from '../src/mount.ts'

// ---------------------------------------------------------------------------
// T1: MountScope.serialize() — flat Record with path-keyed signal values
// ---------------------------------------------------------------------------

describe('MountScope.serialize() — Plan 3.2', () => {
  it('T1a: serialize() returns empty record for non-reactive tree', () => {
    const host = document.createElement('div')
    const scope = mount(branch('div', undefined, [leaf('static text')]), host)
    expect(scope.serialize()).toEqual({})
    scope.dispose()
  })

  it('T1b: serialize() returns path-keyed current signal values for reactive text leaf', () => {
    const host = document.createElement('div')
    const sig = signal('hello')
    const scope = mount(branch('p', undefined, [leaf(sig)]), host)
    const snap = scope.serialize()
    // There should be one entry for the text binding
    const keys = Object.keys(snap)
    expect(keys.length).toBe(1)
    // Key ends with '.text'
    expect(keys[0]).toMatch(/\.text$/)
    expect(snap[keys[0]!]).toBe('hello')
    scope.dispose()
  })

  it('T1c: serialize() returns path-keyed current values for reactive attr', () => {
    const host = document.createElement('div')
    const sig = signal('red')
    const scope = mount(branch('span', { 'data-color': sig as never }), host)
    const snap = scope.serialize()
    const keys = Object.keys(snap)
    expect(keys.length).toBe(1)
    expect(keys[0]).toMatch(/\.attr:data-color$/)
    expect(snap[keys[0]!]).toBe('red')
    scope.dispose()
  })

  it('T1d: serialize() reflects updated value after signal write', () => {
    const host = document.createElement('div')
    const sig = signal('initial')
    const setText = sig[1]
    const scope = mount(branch('p', undefined, [leaf(sig)]), host)
    setText('updated')
    const snap = scope.serialize()
    const keys = Object.keys(snap)
    expect(snap[keys[0]!]).toBe('updated')
    scope.dispose()
  })

  it('T1e: serialize() handles multiple reactive bindings', () => {
    const host = document.createElement('div')
    const sig1 = signal('a')
    const sig2 = signal('b')
    const scope = mount(
      branch('div', undefined, [
        branch('p', undefined, [leaf(sig1)]),
        branch('span', { class: sig2 as never }),
      ]),
      host,
    )
    const snap = scope.serialize()
    const keys = Object.keys(snap)
    expect(keys.length).toBe(2)
    // One text binding, one attr binding
    const textKey = keys.find((k) => k.endsWith('.text'))
    const attrKey = keys.find((k) => k.endsWith('.attr:class'))
    expect(textKey).toBeDefined()
    expect(attrKey).toBeDefined()
    expect(snap[textKey!]).toBe('a')
    expect(snap[attrKey!]).toBe('b')
    scope.dispose()
  })
})

// ---------------------------------------------------------------------------
// T2: hydrate() happy path — attaches to existing DOM without re-creating
// ---------------------------------------------------------------------------

describe('hydrate() — happy path', () => {
  it('T2a: hydrate attaches reactive text without changing innerHTML', () => {
    // Set up a pre-rendered host (simulating SSR output).
    // The <p> is the root branch, so it gets the root path `_ROOT_PATH`.
    const host = document.createElement('div')
    const p = document.createElement('p')
    p.setAttribute('data-aihu-path', _ROOT_PATH)
    p.appendChild(document.createTextNode('hello'))
    host.appendChild(p)
    const innerBefore = host.innerHTML

    const sig = signal('hello')
    const setText = sig[1]

    // hydrate — should attach signal to the existing text node
    const scope = hydrate(() => branch('p', undefined, [leaf(sig)]), host, {})

    // innerHTML must be unchanged (no new elements created)
    expect(host.innerHTML).toBe(innerBefore)

    // Reactive update should work
    setText('world')
    expect(p.textContent).toBe('world')

    scope.dispose()
  })

  it('T2b: hydrate wires reactive attr to existing element', () => {
    const host = document.createElement('div')
    const span = document.createElement('span')
    // The <span> is the root branch, so it gets the root path `_ROOT_PATH`.
    span.setAttribute('data-aihu-path', _ROOT_PATH)
    span.setAttribute('data-color', 'red')
    host.appendChild(span)
    const innerBefore = host.innerHTML

    const sig = signal('red')
    const setColor = sig[1]

    const scope = hydrate(() => branch('span', { 'data-color': sig as never }), host, {})

    expect(host.innerHTML).toBe(innerBefore)

    // Signal update applies to the existing element
    setColor('blue')
    expect(span.getAttribute('data-color')).toBe('blue')

    scope.dispose()
  })

  it('T2c: hydrate returns a MountScope with dispose and serialize', () => {
    const host = document.createElement('div')
    const p = document.createElement('p')
    p.setAttribute('data-aihu-path', _ROOT_PATH)
    p.appendChild(document.createTextNode('test'))
    host.appendChild(p)

    const sig = signal('test')
    const scope = hydrate(() => branch('p', undefined, [leaf(sig)]), host, {})

    expect(typeof scope.dispose).toBe('function')
    expect(typeof scope.serialize).toBe('function')
    expect(scope.agent._brand).toBe('AgentContext')
    scope.dispose()
  })
})

// ---------------------------------------------------------------------------
// T3: mismatch fallback — falls back to mount() when DOM node not found
// ---------------------------------------------------------------------------

describe('hydrate() — mismatch fallback', () => {
  it('T3a: branch with no matching DOM element is created by fallback mount', () => {
    // host is empty — no pre-rendered DOM
    const host = document.createElement('div')

    const sig = signal('hello')
    const scope = hydrate(() => branch('p', undefined, [leaf(sig)]), host, {})

    // Fallback mount created the element
    const p = host.querySelector('p')
    expect(p).not.toBeNull()
    expect(p?.textContent).toBe('hello')

    scope.dispose()
  })

  it('T3b: after mismatch fallback, signal still updates the created element', () => {
    const host = document.createElement('div')
    const sig = signal('initial')
    const setText = sig[1]

    const scope = hydrate(() => branch('p', undefined, [leaf(sig)]), host, {})

    const p = host.querySelector('p')
    expect(p?.textContent).toBe('initial')

    setText('updated')
    expect(p?.textContent).toBe('updated')

    scope.dispose()
  })
})

// ---------------------------------------------------------------------------
// T4: serialize → JSON.stringify → JSON.parse → hydrate round-trip
// ---------------------------------------------------------------------------

describe('serialize → hydrate round-trip', () => {
  it('T4a: state round-trips through JSON and hydration attaches correctly', () => {
    // Step 1: "SSR" — mount a component and serialize state
    const ssrHost = document.createElement('div')
    const sig = signal('world')
    const setText = sig[1]
    const ssrScope = mount(branch('p', undefined, [leaf(sig)]), ssrHost)

    // Simulate a state update between SSR and hydration
    setText('hydrated-value')
    const snapshot = ssrScope.serialize()
    ssrScope.dispose()

    // snapshot should have the updated value
    const keys = Object.keys(snapshot)
    expect(keys.length).toBe(1)
    expect(snapshot[keys[0]!]).toBe('hydrated-value')

    // Step 2: JSON round-trip (simulating serialization to <script> tag)
    const jsonSnapshot = JSON.parse(JSON.stringify(snapshot)) as Record<string, unknown>
    expect(jsonSnapshot[keys[0]!]).toBe('hydrated-value')

    // Step 3: Client-side hydration — create new signals from snapshot values
    const textKey = keys[0]!
    const restoredValue = jsonSnapshot[textKey] as string
    const clientSig = signal(restoredValue)
    const setClientText = clientSig[1]

    // Pre-rendered DOM (simulates what SSR would have rendered).
    // The <p> is the root branch so it gets path `_ROOT_PATH`.
    const clientHost = document.createElement('div')
    const p = document.createElement('p')
    p.setAttribute('data-aihu-path', _ROOT_PATH)
    p.appendChild(document.createTextNode(restoredValue))
    clientHost.appendChild(p)

    const clientScope = hydrate(
      () => branch('p', undefined, [leaf(clientSig)]),
      clientHost,
      jsonSnapshot,
    )

    // Signal value matches the serialized state
    expect(p.textContent).toBe('hydrated-value')

    // Reactive updates work after hydration
    setClientText('post-hydration')
    expect(p.textContent).toBe('post-hydration')

    clientScope.dispose()
  })
})

// ---------------------------------------------------------------------------
// T5: dispose tears down effects
// ---------------------------------------------------------------------------

describe('hydrate().dispose()', () => {
  it('T5: after dispose, signal writes do not update the DOM', () => {
    const host = document.createElement('div')
    const p = document.createElement('p')
    p.setAttribute('data-aihu-path', _ROOT_PATH)
    p.appendChild(document.createTextNode('before'))
    host.appendChild(p)

    const sig = signal('before')
    const setText = sig[1]
    const scope = hydrate(() => branch('p', undefined, [leaf(sig)]), host, {})

    // Pre-dispose: reactive
    setText('during')
    expect(p.textContent).toBe('during')

    scope.dispose()

    // Post-dispose: effect is torn down
    setText('after-dispose')
    expect(p.textContent).toBe('during') // unchanged
  })

  it('T5b: dispose is idempotent', () => {
    const host = document.createElement('div')
    const p = document.createElement('p')
    p.setAttribute('data-aihu-path', _ROOT_PATH)
    p.appendChild(document.createTextNode('x'))
    host.appendChild(p)

    const sig = signal('x')
    const scope = hydrate(() => branch('p', undefined, [leaf(sig)]), host, {})

    scope.dispose()
    expect(() => scope.dispose()).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// Multi-text hydration (regression): adjacent reactive text leaves must each
// bind to their OWN text node, not all to the first.
// ---------------------------------------------------------------------------

describe('hydrate() — adjacent reactive text leaves', () => {
  it('M1: two adjacent signal leaves bind to distinct text nodes; second signal updates second node', () => {
    // Pre-rendered host with TWO separate text nodes under one <p>
    // (as produced by SSR marker-comment emission, or any non-coalesced DOM).
    const host = document.createElement('div')
    const p = document.createElement('p')
    p.setAttribute('data-aihu-path', _ROOT_PATH)
    const t1 = document.createTextNode('1')
    const t2 = document.createTextNode('2')
    p.appendChild(t1)
    p.appendChild(t2)
    host.appendChild(p)

    const sigA = signal('1')
    const sigB = signal('2')
    const setB = sigB[1]

    const scope = hydrate(() => branch('p', undefined, [leaf(sigA), leaf(sigB)]), host, {})

    // Each leaf owns its node after the initial effect run.
    expect(t1.nodeValue).toBe('1')
    expect(t2.nodeValue).toBe('2')

    // Regression: before the fix, BOTH leaves bound to t1 (the walker always
    // took the first text child), so updating the second signal rewrote the
    // first node and t2 was dead.
    setB('two')
    expect(t2.nodeValue).toBe('two')
    expect(t1.nodeValue).toBe('1')
    expect(p.textContent).toBe('1two')

    scope.dispose()
  })

  it('M2: marker comments between text nodes are skipped by the walker', () => {
    // Simulates the proposed SSR emission `1<!--|--> <!--|-->2` for the
    // template `{a()} {b()}` — comments prevent parser coalescing.
    const host = document.createElement('div')
    const p = document.createElement('p')
    p.setAttribute('data-aihu-path', _ROOT_PATH)
    const t1 = document.createTextNode('1')
    const tStatic = document.createTextNode(' ')
    const t2 = document.createTextNode('2')
    p.appendChild(t1)
    p.appendChild(document.createComment('|'))
    p.appendChild(tStatic)
    p.appendChild(document.createComment('|'))
    p.appendChild(t2)
    host.appendChild(p)
    const innerBefore = host.innerHTML

    const sigA = signal('1')
    const sigB = signal('2')
    const setA = sigA[1]
    const setB = sigB[1]

    const scope = hydrate(
      () => branch('p', undefined, [leaf(sigA), leaf(' '), leaf(sigB)]),
      host,
      {},
    )

    // Happy path: no DOM created or destroyed.
    expect(host.innerHTML).toBe(innerBefore)

    setB('B')
    expect(t2.nodeValue).toBe('B')
    expect(tStatic.nodeValue).toBe(' ')
    expect(t1.nodeValue).toBe('1')

    setA('A')
    expect(t1.nodeValue).toBe('A')
    expect(p.textContent).toBe('A B')

    scope.dispose()
  })

  it('M3: reactive text leaves separated by an element each bind in order', () => {
    // Template shape: <p>{a()}<br>{b()}</p> — the <br> naturally separates
    // the text nodes; the walker cursor must not rebind b to the first node.
    const host = document.createElement('div')
    const p = document.createElement('p')
    p.setAttribute('data-aihu-path', _ROOT_PATH)
    const t1 = document.createTextNode('1')
    const t2 = document.createTextNode('2')
    p.appendChild(t1)
    p.appendChild(document.createElement('br'))
    p.appendChild(t2)
    host.appendChild(p)

    const sigA = signal('1')
    const sigB = signal('2')
    const setB = sigB[1]

    const scope = hydrate(
      () => branch('p', undefined, [leaf(sigA), leaf.element('br'), leaf(sigB)]),
      host,
      {},
    )

    setB('two')
    expect(t2.nodeValue).toBe('two')
    expect(t1.nodeValue).toBe('1')

    scope.dispose()
  })
})
