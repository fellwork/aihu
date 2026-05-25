/**
 * presence-gate behavior tests (jsdom). The gate has no keyboard contract of
 * its own (structural), so this file covers the mount/unmount + exit-animation
 * hold + data-state + reactive presence-context semantics the spec requires.
 */
import { effect } from '@aihu/signals'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { injectContext } from '../dom-context.ts'
import { type AihuPresenceGate, definePresenceGate, presenceContext } from './index.ts'

definePresenceGate()

describe('<aihu-presence-gate>', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })
  afterEach(() => {
    document.body.innerHTML = ''
  })

  function mountGate(present: boolean): AihuPresenceGate {
    const gate = document.createElement('aihu-presence-gate') as AihuPresenceGate
    if (present) gate.setAttribute('present', '')
    gate.innerHTML = '<p id="child">hi</p>'
    document.body.appendChild(gate)
    return gate
  }

  it('reflects data-state open/closed', () => {
    const gate = mountGate(true)
    expect(gate.getAttribute('data-state')).toBe('open')
    gate.removeAttribute('present')
    expect(gate.getAttribute('data-state')).toBe('closed')
  })

  it('keeps children mounted until a transitionend, then removes them', () => {
    const gate = mountGate(true)
    expect(gate.querySelector('#child')).not.toBeNull()

    // Close — children must stay mounted during the exit animation.
    gate.removeAttribute('present')
    expect(gate.querySelector('#child')).not.toBeNull()

    // Animation ends → children unmount.
    gate.dispatchEvent(new Event('transitionend'))
    expect(gate.querySelector('#child')).toBeNull()
  })

  it('also unmounts on animationend', () => {
    const gate = mountGate(true)
    gate.removeAttribute('present')
    expect(gate.querySelector('#child')).not.toBeNull()
    gate.dispatchEvent(new Event('animationend'))
    expect(gate.querySelector('#child')).toBeNull()
  })

  it('re-opening before exit completes cancels the unmount and restores children', () => {
    const gate = mountGate(true)
    gate.removeAttribute('present')
    gate.setAttribute('present', '') // re-open mid-exit
    gate.dispatchEvent(new Event('transitionend'))
    expect(gate.querySelector('#child')).not.toBeNull()
    expect(gate.getAttribute('data-state')).toBe('open')
  })

  it('an injecting descendant reads the presence signal reactively', () => {
    const gate = mountGate(true)
    const child = gate.querySelector('#child') as HTMLElement
    const presentSignal = injectContext(child, presenceContext)

    const seen: boolean[] = []
    const dispose = effect(() => {
      seen.push(presentSignal())
    })
    expect(seen).toEqual([true])

    gate.removeAttribute('present')
    expect(seen).toEqual([true, false])
    dispose()
  })

  it('mounted computed stays true through the exit, false after', () => {
    const gate = mountGate(true)
    expect(gate.mounted()).toBe(true)
    gate.removeAttribute('present')
    expect(gate.mounted()).toBe(true) // closing — still mounted
    gate.dispatchEvent(new Event('transitionend'))
    expect(gate.mounted()).toBe(false)
  })
})
