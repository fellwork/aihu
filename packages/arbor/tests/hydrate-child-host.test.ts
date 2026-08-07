// @vitest-environment jsdom
/**
 * A server-rendered CHILD HOST carries `data-aihu-path` AND `data-aihu-ssr` on
 * the SAME element — its position in the parent's key space, plus the marker
 * for its own inner tree. `__aihu_schild` is the first thing in the codebase to
 * emit that combination; `wrapTag`'s nested hosts never got a path marker.
 *
 * `closest()` matches the element it is called on, so the host used to be its
 * OWN boundary: pruned from the parent's path map, missed on lookup, and
 * re-materialized as a duplicate appended at the end of the host. The child
 * rendered twice, the second copy in the wrong position — invisible to the
 * differential suite, which compares server bytes and never hydrates them.
 */

import { describe, expect, it } from 'vitest'
import { hydrate } from '../src/hydrate.ts'
import { branch, leaf } from '../src/index.ts'

const SSR = (adopt: boolean) =>
  `<main data-aihu-path="0"><h1 data-aihu-path="0.0">Title</h1>` +
  `<x-kid data-aihu-path="0.1" data-a="k1"${adopt ? ' data-aihu-ssr=""' : ''}>` +
  `<nav data-aihu-path="0">kid</nav></x-kid></main>`

/** The parent's tree: the child host is a leaf here — its content is its own. */
const tree = () => branch('main', {}, [branch('h1', {}, [leaf('Title')]), branch('x-kid', {}, [])])

describe('a marked child host stays in the parent path map', () => {
  it('adopts the existing host instead of appending a duplicate', () => {
    document.body.innerHTML = SSR(true)
    hydrate(tree, document.body.firstElementChild as Element, {})
    expect(document.querySelectorAll('x-kid')).toHaveLength(1)
  })

  it("does not discard the child's own server content", () => {
    document.body.innerHTML = SSR(true)
    hydrate(tree, document.body.firstElementChild as Element, {})
    expect(document.querySelector('x-kid')?.textContent).toBe('kid')
  })

  it('still prunes the nodes INSIDE the marked host', () => {
    // The child's `<nav data-aihu-path="0">` restarts at ROOT_PATH in the
    // CHILD's key space. If it leaked into the parent's map it would collide
    // with the parent's own root — which is the reason the pruning exists.
    document.body.innerHTML = SSR(true)
    const main = document.body.firstElementChild as Element
    hydrate(tree, main, {})
    expect(main.getAttribute('data-aihu-path')).toBe('0')
    expect(document.querySelectorAll('nav')).toHaveLength(1)
  })

  it('behaves the same for an unmarked host (control)', () => {
    document.body.innerHTML = SSR(false)
    hydrate(tree, document.body.firstElementChild as Element, {})
    expect(document.querySelectorAll('x-kid')).toHaveLength(1)
  })
})
