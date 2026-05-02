import { describe, expect, it } from 'vitest'
import { slot } from '../src/index.ts'

/**
 * Tests for `slot()` per Plan 1.4 acceptance criteria.
 *
 * `slot()` is a thin wrapper over `leaf.element('slot', ...)` that creates
 * a `<slot>` DOM element for Shadow DOM content projection. Shadow DOM handles
 * the actual projection natively — these tests verify the Leaf node shape
 * (kind, leafKind, tag, attrs) and that `slot` is exported from the barrel.
 */

describe('slot() — default slot', () => {
  it('returns a Leaf node with kind === "leaf"', () => {
    const node = slot()
    expect(node.kind).toBe('leaf')
  })

  it('default slot has leafKind === "element"', () => {
    const node = slot()
    expect(node.leafKind).toBe('element')
  })

  it('default slot has tag === "slot"', () => {
    const node = slot()
    expect(node.tag).toBe('slot')
  })

  it('default slot has attrs === null (no name attribute)', () => {
    const node = slot()
    expect(node.attrs).toBeNull()
  })

  it('default slot has value === null per shape-lock §2.9', () => {
    const node = slot()
    expect(node.value).toBeNull()
  })
})

describe('slot(name) — named slot', () => {
  it('named slot has kind === "leaf"', () => {
    const node = slot('header')
    expect(node.kind).toBe('leaf')
  })

  it('named slot has tag === "slot"', () => {
    const node = slot('header')
    expect(node.tag).toBe('slot')
  })

  it('named slot stores the name in attrs.name', () => {
    const node = slot('header')
    expect(node.attrs).not.toBeNull()
    expect((node.attrs as Record<string, unknown>)['name']).toBe('header')
  })

  it('named slot with "footer" stores correct name', () => {
    const node = slot('footer')
    expect((node.attrs as Record<string, unknown>)['name']).toBe('footer')
  })

  it('named slot has value === null per shape-lock §2.9', () => {
    const node = slot('header')
    expect(node.value).toBeNull()
  })
})
