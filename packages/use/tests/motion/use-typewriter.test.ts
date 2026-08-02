/**
 * Unit tests for `useTypewriter` (`@aihu/use/motion` wave 1 — performativeUI
 * port doc, Track B Slice 3): auto-type, skip, loop (type/hold/erase),
 * reduced-motion bypass, scope cleanup, and the SSR-static path. jsdom
 * environment (root vitest config).
 */
import { effectScope } from '@aihu/signals'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useTypewriter } from '../../src/motion/useTypewriter/index.ts'
import { fireMatchMediaChange, installMatchMediaPolyfill } from '../_match-media.ts'
import { withSSR } from '../_ssr.ts'

installMatchMediaPolyfill()

describe('@aihu/use/motion/useTypewriter', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('auto-starts by default and types one character per `speed` ms', () => {
    const { text, isTyping } = useTypewriter('hi', { speed: 10 })
    expect(isTyping()).toBe(true)
    vi.advanceTimersByTime(10)
    expect(text()).toBe('h')
    vi.advanceTimersByTime(10)
    expect(text()).toBe('hi')
    expect(isTyping()).toBe(false)
  })

  it('isDone() flips true only once the full string is typed', () => {
    const { isDone } = useTypewriter('ab', { speed: 10 })
    expect(isDone()).toBe(false)
    vi.advanceTimersByTime(10)
    expect(isDone()).toBe(false)
    vi.advanceTimersByTime(10)
    expect(isDone()).toBe(true)
  })

  it('skip() jumps straight to the full string and stops', () => {
    const { text, isTyping, isDone, skip } = useTypewriter('hello', { speed: 100 })
    vi.advanceTimersByTime(50)
    skip()
    expect(text()).toBe('hello')
    expect(isTyping()).toBe(false)
    expect(isDone()).toBe(true)
    vi.advanceTimersByTime(1000)
    expect(text()).toBe('hello')
  })

  it('stop() freezes text() where it stands, without marking done', () => {
    const { text, isDone, stop } = useTypewriter('hello', { speed: 10 })
    vi.advanceTimersByTime(20)
    stop()
    const frozen = text()
    vi.advanceTimersByTime(200)
    expect(text()).toBe(frozen)
    expect(isDone()).toBe(false)
  })

  it('start() restarts from empty with a new source', () => {
    const { text, start } = useTypewriter('ab', { speed: 10 })
    vi.advanceTimersByTime(20)
    expect(text()).toBe('ab')
    start('xyz')
    expect(text()).toBe('')
    vi.advanceTimersByTime(30)
    expect(text()).toBe('xyz')
  })

  it('loop: true types, holds, erases, and retypes', () => {
    const { text } = useTypewriter('ab', {
      speed: 10,
      eraseSpeed: 5,
      holdDelay: 20,
      loop: true,
    })
    vi.advanceTimersByTime(20) // fully typed: "ab"
    expect(text()).toBe('ab')
    vi.advanceTimersByTime(20) // holdDelay elapses -> erasing starts
    vi.advanceTimersByTime(5) // one erase step
    expect(text()).toBe('a')
    vi.advanceTimersByTime(5)
    expect(text()).toBe('')
    vi.advanceTimersByTime(10) // retyping
    expect(text()).toBe('a')
  })

  it('immediate: false does not start until start() is called', () => {
    const { text, isTyping } = useTypewriter('hi', { speed: 10, immediate: false })
    expect(isTyping()).toBe(false)
    vi.advanceTimersByTime(100)
    expect(text()).toBe('')
  })

  it('honors reduced motion: start() lands on the full string immediately', () => {
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)')
    fireMatchMediaChange(mql, true)
    const { text, isTyping, isDone } = useTypewriter('hello', { speed: 100 })
    expect(text()).toBe('hello')
    expect(isTyping()).toBe(false)
    expect(isDone()).toBe(true)
    vi.advanceTimersByTime(1000)
    expect(text()).toBe('hello')
  })

  it('disposing the owning scope stops the pending step', () => {
    const scope = effectScope()
    let typewriter!: ReturnType<typeof useTypewriter>
    scope.run(() => {
      typewriter = useTypewriter('hello', { speed: 10 })
    })
    vi.advanceTimersByTime(10)
    expect(typewriter.text()).toBe('h')
    scope.stop()
    vi.advanceTimersByTime(100)
    expect(typewriter.text()).toBe('h')
    // start() after disposal must not re-arm the timer.
    typewriter.start('new')
    vi.advanceTimersByTime(100)
    expect(typewriter.text()).toBe('h')
  })
})

describe('@aihu/use/motion/useTypewriter — SSR-static path', () => {
  it('with isClient false, text() is the finished source and mutators are no-ops', () =>
    withSSR(
      () => import('../../src/motion/useTypewriter/index.ts'),
      (mod) => {
        let result: ReturnType<typeof mod.useTypewriter> | undefined
        expect(() => {
          result = mod.useTypewriter('hello')
        }).not.toThrow()
        expect(result?.text()).toBe('hello')
        expect(result?.isDone()).toBe(true)
        expect(() => {
          result?.start('other')
          result?.stop()
          result?.skip()
        }).not.toThrow()
      },
    ))
})
