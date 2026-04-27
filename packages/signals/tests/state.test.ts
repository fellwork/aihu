import { describe, expect, it } from 'vitest'
import { effect } from '../src/effect.ts'
import { $state } from '../src/state.ts'

describe('$state', () => {
  it('reads initial value via .value', () => {
    const count = $state(0)
    expect(count.value).toBe(0)
    const greeting = $state('hi')
    expect(greeting.value).toBe('hi')
  })

  it('updates the cell when .value is assigned', () => {
    const count = $state(0)
    count.value = 5
    expect(count.value).toBe(5)
    count.value = 99
    expect(count.value).toBe(99)
  })

  it('tracks .value reads inside effects', () => {
    const count = $state(0)
    let observed = -1
    let runs = 0
    effect(() => {
      observed = count.value
      runs++
    })
    expect(observed).toBe(0)
    expect(runs).toBe(1)
    count.value = 7
    expect(observed).toBe(7)
    expect(runs).toBe(2)
    count.value = 12
    expect(observed).toBe(12)
    expect(runs).toBe(3)
  })

  it('Object.is short-circuits identical assignments', () => {
    const count = $state(5)
    let runs = 0
    effect(() => {
      count.value
      runs++
    })
    expect(runs).toBe(1)
    count.value = 5 // identical → short-circuit
    expect(runs).toBe(1)
    count.value = 6
    expect(runs).toBe(2)
    count.value = 6 // identical → short-circuit
    expect(runs).toBe(2)
  })
})
