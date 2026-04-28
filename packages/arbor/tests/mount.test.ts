import { signal } from '@scribe/signals'
import { describe, expect, it } from 'vitest'
import { ArborNotImplementedError } from '../src/errors.ts'
import { branch, leaf } from '../src/index.ts'
import { _setMountObserver, type MountTelemetry, mount } from '../src/mount.ts'

/**
 * Tests for `mount()` + `MountScope` per spec §1.4 + §1.5 + §2.2 + §2.3 +
 * §2.7 + §2.8 + §4 (Task 16) and disposal semantics per §1.5 + §4 (Task 17).
 *
 * This file also folds in the previously-deferred mount-coupled tests from
 * Tasks 13/14/15 per Builder Option A — leaf/branch/attrs integration
 * coverage now lands here alongside `mount()`.
 */

describe('mount() — Task 16 spec tests', () => {
  it('returns a MountScope object with a dispose function (spec §4 Task 16 #1)', () => {
    const host = document.createElement('div')
    const scope = mount(branch('div'), host)
    expect(typeof scope.dispose).toBe('function')
    expect(host.children.length).toBe(1)
    expect(host.children[0]?.tagName).toBe('DIV')
    scope.dispose()
  })

  it('reactive tree mounted → signal write updates DOM (spec §4 Task 16 #2)', () => {
    const host = document.createElement('div')
    const sig = signal('hello')
    const setText = sig[1]
    const scope = mount(branch('p', undefined, [leaf(sig)]), host)
    const p = host.querySelector('p') as HTMLElement
    expect(p.textContent).toBe('hello')
    setText('world')
    expect(p.textContent).toBe('world')
    scope.dispose()
  })

  it('reactive text leaf updates without extra propagation (exactly-once per write)', () => {
    const host = document.createElement('div')
    const sig = signal('a')
    const setText = sig[1]
    let updates = 0
    const scope = mount(branch('p', undefined, [leaf(sig)]), host)
    const p = host.querySelector('p') as HTMLElement
    expect(p.textContent).toBe('a') // initial
    updates = 0
    setText('b')
    updates++
    expect(p.textContent).toBe('b')
    setText('c')
    updates++
    expect(p.textContent).toBe('c')
    expect(updates).toBe(2)
    scope.dispose()
  })

  it('fragment-root branch (null tag) → children direct in host, no wrapper (spec §4 Task 16 #3)', () => {
    const host = document.createElement('div')
    const scope = mount(branch(null, undefined, [leaf('a'), leaf('b')]), host)
    // No wrapper element — text nodes append directly.
    expect(host.children.length).toBe(0)
    expect(host.childNodes.length).toBe(2)
    expect(host.textContent).toBe('ab')
    scope.dispose()
  })

  it('scope.agent._brand === "AgentContext" and is frozen (spec §4 Task 16 #4)', () => {
    const host = document.createElement('div')
    const scope = mount(branch('div'), host)
    expect(scope.agent._brand).toBe('AgentContext')
    expect(Object.isFrozen(scope.agent)).toBe(true)
    scope.dispose()
  })

  it('scope.serialize() throws ArborNotImplementedError (spec §4 Task 16 #5)', () => {
    const host = document.createElement('div')
    const scope = mount(branch('div'), host)
    expect(() => scope.serialize()).toThrow(ArborNotImplementedError)
    scope.dispose()
  })
})

describe('mount() — folded leaf integration tests', () => {
  it('static text leaf → host.textContent === "hello"', () => {
    const host = document.createElement('div')
    const scope = mount(leaf('hello'), host)
    expect(host.textContent).toBe('hello')
    scope.dispose()
  })

  it('reactive text leaf → initial text from signal', () => {
    const host = document.createElement('div')
    const sig = signal('initial')
    const scope = mount(leaf(sig), host)
    expect(host.textContent).toBe('initial')
    scope.dispose()
  })

  it('signal write → textNode.nodeValue updates', () => {
    const host = document.createElement('div')
    const sig = signal('one')
    const setText = sig[1]
    const scope = mount(leaf(sig), host)
    const textNode = host.childNodes[0] as Text
    expect(textNode.nodeValue).toBe('one')
    setText('two')
    expect(textNode.nodeValue).toBe('two')
    scope.dispose()
  })

  it('leaf.element("img", {src}) → mounted with attribute', () => {
    const host = document.createElement('div')
    const scope = mount(leaf.element('img', { src: '/img.png' }), host)
    const img = host.querySelector('img') as HTMLImageElement
    expect(img.getAttribute('src')).toBe('/img.png')
    scope.dispose()
  })
})

describe('mount() — folded branch integration tests', () => {
  it('branch with tag → element in host', () => {
    const host = document.createElement('div')
    const scope = mount(branch('section'), host)
    expect(host.querySelector('section')).not.toBeNull()
    scope.dispose()
  })

  it('branch with children → children inside parent element', () => {
    const host = document.createElement('div')
    const scope = mount(branch('ul', undefined, [leaf('a'), leaf('b')]), host)
    const ul = host.querySelector('ul') as HTMLElement
    expect(ul.childNodes.length).toBe(2)
    expect(ul.textContent).toBe('ab')
    scope.dispose()
  })

  it('null-tag branch → no wrapper element, children direct in host', () => {
    const host = document.createElement('div')
    const scope = mount(branch(null, undefined, [branch('span'), branch('em')]), host)
    expect(host.children.length).toBe(2)
    expect(host.children[0]?.tagName).toBe('SPAN')
    expect(host.children[1]?.tagName).toBe('EM')
    scope.dispose()
  })
})

describe('mount() — folded attrs integration tests', () => {
  it('signal write to reactive attr → getAttribute updates', () => {
    const host = document.createElement('div')
    const sig = signal('a')
    const setCls = sig[1]
    const scope = mount(branch('p', { class: sig as never }), host)
    const p = host.querySelector('p') as HTMLElement
    expect(p.getAttribute('class')).toBe('a')
    setCls('b')
    expect(p.getAttribute('class')).toBe('b')
    scope.dispose()
  })
})

describe('mount() — telemetry hooks (spec §2.8)', () => {
  it('observer is called with mount-start, effect-create, effect-fire, mount-end', () => {
    const host = document.createElement('div')
    const events: MountTelemetry[] = []
    _setMountObserver((event) => events.push(event))
    try {
      const sig = signal('hi')
      const scope = mount(branch('p', undefined, [leaf(sig)]), host)
      const kinds = events.map((e) => e.kind)
      expect(kinds).toContain('mount-start')
      expect(kinds).toContain('effect-create')
      expect(kinds).toContain('effect-fire')
      expect(kinds).toContain('mount-end')
      // mount-start fires before mount-end.
      expect(kinds.indexOf('mount-start')).toBeLessThan(kinds.indexOf('mount-end'))
      scope.dispose()
    } finally {
      _setMountObserver(() => {})
    }
  })
})

describe('mount() — path keys (spec §2.7)', () => {
  it('reactive attr path key matches <rootId>.0.attr:<key>', () => {
    const host = document.createElement('div')
    const events: MountTelemetry[] = []
    _setMountObserver((event) => events.push(event))
    try {
      const sig = signal('foo')
      const scope = mount(branch('p', { class: sig as never }), host)
      const create = events.find((e) => e.kind === 'effect-create')
      expect(create).toBeDefined()
      // Path: <rootId>.0.attr:class
      expect(create?.path).toMatch(/^\d+\.0\.attr:class$/)
      scope.dispose()
    } finally {
      _setMountObserver(() => {})
    }
  })
})
