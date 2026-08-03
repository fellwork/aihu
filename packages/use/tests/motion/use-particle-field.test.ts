/**
 * Unit tests for `useParticleField` (`@aihu/use/motion` wave 2 —
 * performativeUI port doc, Track B Slice 8): seeding, the integration step
 * (drift, gravity, edge wrap, the backgrounded-tab delta clamp), drawing,
 * the reduced-motion static-frame convention, and the SSR-static path.
 * jsdom environment — `ResizeObserver`, `IntersectionObserver` and
 * `getContext('2d')` are faked (see `./_canvas.ts`); `random` is injected
 * with a seeded LCG so a field is byte-identical across runs.
 */
import { effectScope } from '@aihu/signals'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useParticleField } from '../../src/motion/useParticleField/index.ts'
import { fireMatchMediaChange, installMatchMediaPolyfill } from '../_match-media.ts'
import { withSSR } from '../_ssr.ts'
import {
  type CanvasHarness,
  createHost,
  installCanvasEnv,
  seededRandom,
  uninstallCanvasEnv,
} from './_canvas.ts'

installMatchMediaPolyfill()

/** Step the rAF loop `n` times. The loop's FIRST frame carries `delta === 0`
 * (useRafFn has no previous timestamp yet), so any test asserting movement
 * needs at least two. */
function frames(n: number): void {
  for (let i = 0; i < n; i++) vi.advanceTimersToNextFrame()
}

describe('@aihu/use/motion/useParticleField', () => {
  let env: CanvasHarness

  beforeEach(() => {
    vi.useFakeTimers()
    env = installCanvasEnv()
  })
  afterEach(() => {
    uninstallCanvasEnv()
    vi.useRealTimers()
    document.body.innerHTML = ''
    fireMatchMediaChange(window.matchMedia('(prefers-reduced-motion: reduce)'), false)
  })

  it('seeds nothing until the host has a size', () => {
    const host = createHost()
    const { particles } = useParticleField(host, { count: 5, random: seededRandom() })
    expect(particles()).toHaveLength(0)
  })

  it('seeds `count` particles inside the box once the host is measured', () => {
    const host = createHost()
    const { particles } = useParticleField(host, { count: 7, random: seededRandom() })
    env.show(200, 100)
    const field = particles()
    expect(field).toHaveLength(7)
    for (const p of field) {
      expect(p.x).toBeGreaterThanOrEqual(0)
      expect(p.x).toBeLessThanOrEqual(200)
      expect(p.y).toBeGreaterThanOrEqual(0)
      expect(p.y).toBeLessThanOrEqual(100)
      expect(p.radius).toBeGreaterThanOrEqual(1)
      expect(p.radius).toBeLessThanOrEqual(2.5)
    }
  })

  it('samples colors from the supplied palette only', () => {
    const host = createHost()
    const colors = ['#ff0000', '#00ff00', '#0000ff']
    const { particles } = useParticleField(host, { count: 30, colors, random: seededRandom(9) })
    env.show(200, 100)
    const used = new Set(particles().map((p) => p.color))
    expect(used.size).toBeGreaterThan(1)
    for (const color of used) expect(colors).toContain(color)
  })

  it('an empty colors array falls back rather than seeding `undefined` fills', () => {
    const host = createHost()
    const { particles } = useParticleField(host, { count: 3, colors: [], random: seededRandom() })
    env.show(200, 100)
    for (const p of particles()) expect(p.color).toBe('#ffffff')
  })

  it('is deterministic for a seeded random source', () => {
    const build = (): Array<[number, number]> => {
      const host = createHost()
      const { particles } = useParticleField(host, { count: 4, random: seededRandom(42) })
      env.show(200, 100)
      return particles().map((p) => [p.x, p.y])
    }
    const first = build()
    // Re-install so the second surface's observers land at index 0 too (the
    // harness keeps one observer list per install).
    document.body.innerHTML = ''
    uninstallCanvasEnv()
    env = installCanvasEnv()
    const second = build()
    expect(second).toEqual(first)
  })

  it('drifts particles across frames', () => {
    const host = createHost()
    const { particles } = useParticleField(host, { count: 3, random: seededRandom(3) })
    env.show(200, 100)
    const before = particles().map((p) => [p.x, p.y] as const)
    frames(4)
    const after = particles().map((p) => [p.x, p.y] as const)
    expect(after).not.toEqual(before)
  })

  it('gravity accelerates particles downward', () => {
    const host = createHost()
    const { particles } = useParticleField(host, {
      count: 1,
      speed: 0,
      gravity: 500,
      random: seededRandom(),
    })
    env.show(200, 100)
    const p = particles()[0]
    expect(p?.vy).toBe(0)
    frames(4)
    expect(p?.vy).toBeGreaterThan(0)
  })

  it('wraps particles that leave the box instead of bouncing', () => {
    const host = createHost()
    const { particles } = useParticleField(host, { count: 1, speed: 0, random: seededRandom() })
    env.show(200, 100)
    const p = particles()[0]
    if (p === undefined) throw new Error('expected a particle')
    p.x = 400
    p.y = -300
    frames(3)
    expect(p.x).toBeLessThan(200)
    expect(p.x).toBeGreaterThan(0)
    expect(p.y).toBeGreaterThan(0)
    expect(p.y).toBeLessThan(100)
  })

  it('clamps a huge frame delta so a backgrounded tab does not teleport the field', () => {
    const host = createHost()
    const { particles } = useParticleField(host, { count: 1, speed: 0, random: seededRandom() })
    env.show(200, 100)
    const p = particles()[0]
    if (p === undefined) throw new Error('expected a particle')
    p.x = 50
    p.y = 50
    p.vx = 100
    p.vy = 0
    // Two frames' worth of position change is bounded by the 0.05s clamp:
    // 100 px/s * 0.05 s = 5 px per frame, no matter how long the tab slept.
    frames(2)
    expect(p.x).toBeLessThanOrEqual(50 + 5 + 0.001)
  })

  it('draws one arc per particle and leaves globalAlpha restored', () => {
    const host = createHost()
    useParticleField(host, { count: 4, random: seededRandom() })
    env.show(200, 100)
    frames(2)
    const ctx = env.contexts[0]
    if (ctx === undefined) throw new Error('expected a context')
    expect(ctx.ops).toContain('clearRect')
    expect(ctx.arcs.length).toBeGreaterThanOrEqual(4)
    // Every fill happened at a sane alpha, and the context was reset after.
    for (const a of ctx.alphas) {
      expect(a).toBeGreaterThan(0)
      expect(a).toBeLessThanOrEqual(1)
    }
    expect(ctx.globalAlpha).toBe(1)
  })

  it('reseed() re-randomizes the field and repaints', () => {
    const host = createHost()
    const { particles, reseed, stop } = useParticleField(host, {
      count: 5,
      random: seededRandom(7),
    })
    env.show(200, 100)
    stop()
    const before = particles().map((p) => [p.x, p.y] as const)
    reseed()
    const after = particles().map((p) => [p.x, p.y] as const)
    expect(after).toHaveLength(5)
    expect(after).not.toEqual(before)
  })

  it('a resize rescales the existing field rather than re-randomizing it', () => {
    const host = createHost()
    const { particles } = useParticleField(host, { count: 3, speed: 0, random: seededRandom(5) })
    env.show(200, 100)
    const before = particles().map((p) => [p.x, p.y] as const)
    env.resize().fire(400, 200)
    const after = particles().map((p) => [p.x, p.y] as const)
    for (let i = 0; i < before.length; i++) {
      expect(after[i]?.[0]).toBeCloseTo((before[i]?.[0] ?? 0) * 2, 5)
      expect(after[i]?.[1]).toBeCloseTo((before[i]?.[1] ?? 0) * 2, 5)
    }
  })

  it('registers no pointer listener unless pointerAttraction is asked for', () => {
    const host = createHost()
    const spy = vi.spyOn(window, 'addEventListener')
    useParticleField(host, { count: 1, random: seededRandom() })
    const withoutAttraction = spy.mock.calls.filter(([type]) => type === 'pointermove').length
    expect(withoutAttraction).toBe(0)

    useParticleField(host, { count: 1, pointerAttraction: 5, random: seededRandom() })
    const withAttraction = spy.mock.calls.filter(([type]) => type === 'pointermove').length
    expect(withAttraction).toBeGreaterThan(0)
  })

  // --- the reduced-motion convention -------------------------------------

  it('honors reduced motion: seeds and paints a static field, never integrating', () => {
    fireMatchMediaChange(window.matchMedia('(prefers-reduced-motion: reduce)'), true)
    const host = createHost()
    const { particles, isRunning, prefersReduced } = useParticleField(host, {
      count: 6,
      random: seededRandom(11),
    })
    env.show(200, 100)

    expect(prefersReduced()).toBe(true)
    expect(isRunning()).toBe(false)
    // "A still starfield, not an empty box" — the field IS seeded and drawn.
    expect(particles()).toHaveLength(6)
    const ctx = env.contexts[0]
    expect(ctx?.arcs.length).toBe(6)

    const before = particles().map((p) => [p.x, p.y] as const)
    frames(10)
    expect(particles().map((p) => [p.x, p.y] as const)).toEqual(before)
    expect(ctx?.arcs.length).toBe(6)
  })

  it('reduced motion draws at base opacity — no twinkle modulation', () => {
    fireMatchMediaChange(window.matchMedia('(prefers-reduced-motion: reduce)'), true)
    const host = createHost()
    const { particles } = useParticleField(host, {
      count: 3,
      twinkle: true,
      random: seededRandom(2),
    })
    env.show(200, 100)
    const ctx = env.contexts[0]
    expect(ctx?.alphas).toEqual(particles().map((p) => p.opacity))
  })

  it('resumes real motion when the preference clears', () => {
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)')
    fireMatchMediaChange(mql, true)
    const host = createHost()
    const { particles, isRunning } = useParticleField(host, { count: 2, random: seededRandom(4) })
    env.show(200, 100)
    expect(isRunning()).toBe(false)

    fireMatchMediaChange(mql, false)
    expect(isRunning()).toBe(true)
    const before = particles().map((p) => [p.x, p.y] as const)
    frames(4)
    expect(particles().map((p) => [p.x, p.y] as const)).not.toEqual(before)
  })

  it('disposing the owning scope stops the field and removes the canvas', () => {
    const host = createHost()
    const scope = effectScope()
    let field!: ReturnType<typeof useParticleField>
    scope.run(() => {
      field = useParticleField(host, { count: 3, random: seededRandom() })
    })
    env.show(200, 100)
    frames(2)
    scope.stop()
    expect(host.querySelector('canvas')).toBeNull()
    expect(field.isRunning()).toBe(false)

    const before = field.particles().map((p) => [p.x, p.y] as const)
    field.start()
    frames(5)
    expect(field.particles().map((p) => [p.x, p.y] as const)).toEqual(before)
  })
})

describe('@aihu/use/motion/useParticleField — SSR-static path', () => {
  it('with isClient false, returns an empty inert field and creates nothing', () =>
    withSSR(
      () => import('../../src/motion/useParticleField/index.ts'),
      (mod) => {
        let result: ReturnType<typeof mod.useParticleField> | undefined
        expect(() => {
          result = mod.useParticleField(null, { count: 20 })
        }).not.toThrow()
        expect(result?.particles()).toEqual([])
        expect(result?.canvas()).toBeNull()
        expect(result?.isRunning()).toBe(false)
        expect(result?.prefersReduced()).toBe(false)
        expect(() => {
          result?.start()
          result?.reseed()
          result?.stop()
        }).not.toThrow()
      },
    ))
})
