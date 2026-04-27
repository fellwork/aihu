import { describe, expect, it } from 'vitest'
import { branch, leaf } from '../src/index.ts'

/**
 * Tests for `branch()` per spec §1.2 + §4 (Task 14).
 *
 * Spec lists 4 tests; tests #2–#4 require `mount()` (Task 16) which is
 * not yet implemented in this batch. Per Builder direction (Option A),
 * mount-coupled tests are deferred to Task 16's batch where they land
 * naturally alongside `mount()`. The shape/storage coverage that does
 * NOT require mount lands here.
 */

describe('branch() — element branches', () => {
  it('branch("div") has kind === "branch" (spec §4 Task 14 #1)', () => {
    const node = branch('div')
    expect(node.kind).toBe('branch')
  })

  it('preserves the tag name', () => {
    const node = branch('section')
    expect(node.tag).toBe('section')
  })

  it('shape-locks attrs to null when omitted (§2.9)', () => {
    const node = branch('div')
    expect(node.attrs).toBeNull()
  })

  it('shape-locks children to the frozen empty array when omitted (§2.9)', () => {
    const node = branch('div')
    // EMPTY_CHILDREN is module-level and reused — same reference across calls.
    const a = branch('div').children
    const b = branch('span').children
    expect(node.children).toBe(a)
    expect(a).toBe(b)
    expect(node.children.length).toBe(0)
    expect(Object.isFrozen(node.children)).toBe(true)
  })

  it('explicit undefined attrs/children are normalized to null/EMPTY_CHILDREN', () => {
    const node = branch('div', undefined, undefined)
    expect(node.attrs).toBeNull()
    expect(node.children.length).toBe(0)
  })

  it('preserves attrs object identity when provided', () => {
    const attrs = { class: 'foo' }
    const node = branch('div', attrs)
    expect(node.attrs).toBe(attrs)
  })

  it('preserves children array contents when provided', () => {
    const child = leaf('hi')
    const node = branch('div', { class: 'foo' }, [child])
    expect(node.children.length).toBe(1)
    expect(node.children[0]).toBe(child)
  })
})

describe('branch() — fragment (null tag)', () => {
  it('branch(null) has tag === null (fragment shape)', () => {
    const node = branch(null)
    expect(node.kind).toBe('branch')
    expect(node.tag).toBeNull()
  })

  it('null-tag fragment with children stores them on the node', () => {
    const a = leaf('a')
    const b = leaf('b')
    const node = branch(null, undefined, [a, b])
    expect(node.tag).toBeNull()
    expect(node.children.length).toBe(2)
    expect(node.children[0]).toBe(a)
    expect(node.children[1]).toBe(b)
  })
})
