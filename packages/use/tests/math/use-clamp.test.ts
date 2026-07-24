/**
 * Unit tests for `useClamp` (`@aihu/use/math` family, wave0 seed): clamping
 * behaviour at/inside/outside the range, reactivity to a changing input
 * getter, and — since the composable is dep-free/`isClient`-free by design
 * — no `_ssr.ts` harness is needed here (see the module doc for why: there
 * is no SSR branch to exercise). jsdom environment (root vitest config).
 */
import { signal } from '@aihu/signals'
import { describe, expect, it } from 'vitest'
import { useClamp } from '../../src/math/useClamp/index.ts'

describe('@aihu/use/math/useClamp', () => {
  it('passes a value already inside the range through unchanged', () => {
    const { value } = useClamp(5, 0, 10)
    expect(value()).toBe(5)
  })

  it('clamps a value below min up to min', () => {
    const { value } = useClamp(-5, 0, 10)
    expect(value()).toBe(0)
  })

  it('clamps a value above max down to max', () => {
    const { value } = useClamp(15, 0, 10)
    expect(value()).toBe(10)
  })

  it('accepts plain-number and getter arguments interchangeably', () => {
    const [min] = signal(2)
    const { value } = useClamp(1, min, 10)
    expect(value()).toBe(2)
  })

  it('recomputes reactively when a getter input changes', () => {
    const [source, setSource] = signal(5)
    const { value } = useClamp(source, 0, 10)
    expect(value()).toBe(5)

    setSource(20)
    expect(value()).toBe(10)

    setSource(-3)
    expect(value()).toBe(0)
  })
})
