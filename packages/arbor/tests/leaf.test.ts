import { signal } from '@aihu/signals'
import { describe, expect, it } from 'vitest'
import { leaf } from '../src/index.ts'

/**
 * Tests for `leaf()` and `leaf.element()` per spec §1.3 + §4 (Task 13).
 *
 * Spec lists 5 tests; tests #2–#5 require `mount()` (Task 16) which is not
 * yet implemented in this batch. Per Builder direction (Option A), the
 * mount-coupled tests are deferred to Task 16's batch where they land
 * naturally alongside `mount()`. The shape/discriminant/value-storage
 * coverage that does NOT require mount lands here.
 */

describe('leaf() — text leaves', () => {
  it('produces a node with kind === "leaf" (spec §4 Task 13 #1)', () => {
    const node = leaf('hello')
    expect(node.kind).toBe('leaf')
  })

  it('text leaf has leafKind === "text"', () => {
    const node = leaf('hello')
    expect(node.leafKind).toBe('text')
  })

  it('static-string leaf preserves the string in `value`', () => {
    const node = leaf('hello')
    expect(node.value).toBe('hello')
  })

  it('shape-locks tag and attrs to null on text leaves (spec §2.9)', () => {
    const node = leaf('hello')
    expect(node.tag).toBeNull()
    expect(node.attrs).toBeNull()
  })

  it('Signal<string> value is preserved as the tuple itself (Array.isArray discriminant)', () => {
    const sig = signal('initial')
    const node = leaf(sig)
    // Signal is a tuple [Read, Write] — leaf stores it as-is.
    expect(Array.isArray(node.value)).toBe(true)
    expect(node.value).toBe(sig)
  })
})

describe('leaf.element() — terminal element leaves', () => {
  it('produces a node with kind === "leaf"', () => {
    const node = leaf.element('img', { src: '/img.png' })
    expect(node.kind).toBe('leaf')
  })

  it('element leaf has leafKind === "element"', () => {
    const node = leaf.element('img', { src: '/img.png' })
    expect(node.leafKind).toBe('element')
  })

  it('preserves tag and attrs; value is null per shape-lock §2.9', () => {
    const attrs = { src: '/img.png' }
    const node = leaf.element('img', attrs)
    expect(node.tag).toBe('img')
    expect(node.attrs).toBe(attrs)
    expect(node.value).toBeNull()
  })

  it('omitted attrs → stored as null (spec §2.9)', () => {
    const node = leaf.element('br')
    expect(node.tag).toBe('br')
    expect(node.attrs).toBeNull()
    expect(node.value).toBeNull()
  })
})
