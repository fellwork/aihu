/**
 * P0-2b (effect-scope plan §2) — arbor bindings are NEVER scope-adopted.
 *
 * mount()/hydrate() wrap their synchronous effect-wiring in
 * `runWithoutScope`, so a mount re-entered while some component/effect scope
 * is current (the synchronous child-upgrade case: no `runEffect` frame, so
 * the P0-1 save/clear does not apply) keeps every binding effect owned by
 * the MountScope's disposer list exclusively.
 */

import { effectScope, signal } from '@aihu/signals'
import { describe, expect, it } from 'vitest'
import { hydrate } from '../src/hydrate.ts'
import { branch, leaf } from '../src/index.ts'
import { mount } from '../src/mount.ts'

type SignalLeaf = Parameters<typeof leaf>[0]

describe('unowned bindings — P0-2b', () => {
  it('mount() inside an active effect scope: binding effects are NOT owned by that scope', () => {
    const host = document.createElement('div')
    const [n, setN] = signal(0)
    const scope = effectScope()
    let ms: ReturnType<typeof mount> | null = null
    scope.run(() => {
      ms = mount(branch('span', undefined, [leaf([n, setN] as unknown as SignalLeaf)]), host)
    })
    const span = host.querySelector('span')
    expect(span?.textContent).toBe('0')

    // Stopping the ambient scope must not touch the binding.
    scope.stop()
    setN(1)
    expect(span?.textContent).toBe('1')

    // The MountScope is the sole owner.
    ;(ms as ReturnType<typeof mount> | null)?.dispose()
    setN(2)
    expect(span?.textContent).toBe('1')
  })

  it('hydrate() inside an active effect scope: wired binding effects are NOT owned by that scope', () => {
    const host = document.createElement('div')
    const [n, setN] = signal(0)
    const node = branch('span', undefined, [leaf([n, setN] as unknown as SignalLeaf)])
    const scope = effectScope()
    let hs: ReturnType<typeof hydrate> | null = null
    scope.run(() => {
      // Empty host → mismatch fallback materializes, wiring the binding.
      hs = hydrate(() => node, host, {})
    })
    const span = host.querySelector('span')
    expect(span?.textContent).toBe('0')

    scope.stop()
    setN(1)
    expect(span?.textContent).toBe('1')
    ;(hs as ReturnType<typeof hydrate> | null)?.dispose()
    setN(2)
    expect(span?.textContent).toBe('1')
  })
})
