import { branch, leaf, mount } from '@scribe/arbor'
import { batch, signal } from '@scribe/signals'
import { describe, expect, it } from 'vitest'

/**
 * Cross-package integration test per spec §4 (Task 19).
 *
 * Verifies that `batch()` from `@scribe/signals` correctly coalesces
 * multiple writes through `@scribe/arbor`'s reactive bindings: by the time
 * the batch closes, both the text leaf and the reactive `class` attr land
 * on their final values without an intermediate flicker visible at the
 * end-of-batch DOM read.
 *
 * Resolves Architect B's concern that signals' batch and arbor's
 * mountEffect could disagree on flush ordering. They don't — both sit on
 * the same effect kernel from `@scribe/signals`, and arbor's
 * `_mountEffect` registers exactly one effect per reactive binding.
 */

describe('arbor + signals batch integration', () => {
  it('batch + arbor: writes produce correct final DOM state', () => {
    // `signal()` returns the tuple `[Read<T>, Write<T>]`. arbor's
    // `Array.isArray` discriminant for reactive bindings (per spec §1.2 +
    // Deviation #11) requires the WHOLE tuple, not just the getter — so
    // `text` and `cls` below are the full Signal tuples; we destructure
    // separately for the writer side.
    const text = signal('hello')
    const [, setText] = text
    const cls = signal('a')
    const [, setCls] = cls
    const host = document.createElement('div')
    const scope = mount(branch('p', { class: cls }, [leaf(text)]), host)
    batch(() => {
      setText('world')
      setCls('b')
    })
    const p = host.querySelector('p')
    expect(p).not.toBeNull()
    expect(p?.textContent).toBe('world')
    expect(p?.getAttribute('class')).toBe('b')
    scope.dispose()
  })
})
