import { describe, expect, it } from 'vitest'
import { maxLatticeSignal } from '../src/index.ts'

describe('maxLatticeSignal', () => {
  it('preserves monotonicity: read() never decreases across merge() calls', () => {
    const v = maxLatticeSignal(0)
    v.merge(5)
    v.commit()
    expect(v.read()).toBe(5)
    // smaller merge does NOT decrease read after commit
    v.merge(3)
    expect(v.commit()).toBe(false) // no signal write — pending stays at max(5,3)=5
    expect(v.read()).toBe(5)
  })

  it('advances on a strictly larger merge', () => {
    const v = maxLatticeSignal(0)
    v.merge(1)
    expect(v.commit()).toBe(true)
    expect(v.read()).toBe(1)
    v.merge(7)
    expect(v.commit()).toBe(true)
    expect(v.read()).toBe(7)
  })
})
