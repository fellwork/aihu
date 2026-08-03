/**
 * Unit tests for `useCharacterField` (`@aihu/use/motion` wave 2 —
 * performativeUI port doc, Track B Slice 8): grid derivation from the host
 * box, the three animation modes, density, resize re-flow, the
 * reduced-motion at-rest convention (including `'reveal'`'s end-state rule),
 * and the SSR-static path. jsdom environment — `ResizeObserver`,
 * `IntersectionObserver` and `getContext('2d')` are faked (see
 * `./_canvas.ts`); `random` is injected with a seeded LCG.
 */
import { effectScope } from '@aihu/signals'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useCharacterField } from '../../src/motion/useCharacterField/index.ts'
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

function frames(n: number): void {
  for (let i = 0; i < n; i++) vi.advanceTimersToNextFrame()
}

describe('@aihu/use/motion/useCharacterField', () => {
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

  it('builds no grid until the host has a size', () => {
    const host = createHost()
    const { cells, columns, rows } = useCharacterField(host, { random: seededRandom() })
    expect(cells()).toHaveLength(0)
    expect(columns()).toBe(0)
    expect(rows()).toBe(0)
  })

  it('derives the grid from the host box and cellSize', () => {
    const host = createHost()
    const { cells, columns, rows } = useCharacterField(host, {
      cellSize: 10,
      random: seededRandom(),
    })
    env.show(100, 50)
    expect(columns()).toBe(10)
    expect(rows()).toBe(5)
    expect(cells()).toHaveLength(50)
  })

  it('places cells at their centers in CSS pixels', () => {
    const host = createHost()
    const { cells } = useCharacterField(host, { cellSize: 20, random: seededRandom() })
    env.show(40, 20)
    expect(cells().map((c) => [c.x, c.y])).toEqual([
      [10, 10],
      [30, 10],
    ])
  })

  it('density below 1 thins the grid without changing its shape', () => {
    const host = createHost()
    const { cells, columns, rows } = useCharacterField(host, {
      cellSize: 10,
      density: 0.4,
      random: seededRandom(21),
    })
    env.show(100, 100)
    expect(columns()).toBe(10)
    expect(rows()).toBe(10)
    expect(cells().length).toBeGreaterThan(0)
    expect(cells().length).toBeLessThan(100)
  })

  it('draws only glyphs from the supplied character set', () => {
    const host = createHost()
    const { cells } = useCharacterField(host, {
      characters: 'ab',
      cellSize: 10,
      random: seededRandom(6),
    })
    env.show(50, 20)
    for (const cell of cells()) expect(['a', 'b']).toContain(cell.char)
  })

  it('accepts an array character set for multi-code-unit glyphs', () => {
    const host = createHost()
    const { cells } = useCharacterField(host, {
      characters: ['🌱', '🌿'],
      cellSize: 10,
      random: seededRandom(6),
    })
    env.show(30, 10)
    for (const cell of cells()) expect(['🌱', '🌿']).toContain(cell.char)
  })

  it('a resize REBUILDS the grid (its cell count is a function of the box)', () => {
    const host = createHost()
    const { cells, columns, rows } = useCharacterField(host, {
      cellSize: 10,
      random: seededRandom(),
    })
    env.show(100, 50)
    expect(cells()).toHaveLength(50)
    env.resize().fire(200, 50)
    expect(columns()).toBe(20)
    expect(rows()).toBe(5)
    expect(cells()).toHaveLength(100)
  })

  it("'drift' advances glyphs through the character set over time", () => {
    const host = createHost()
    const { cells } = useCharacterField(host, {
      mode: 'drift',
      characters: 'abcdef',
      cellSize: 10,
      speed: 500,
      random: seededRandom(8),
    })
    env.show(50, 20)
    const before = cells().map((c) => c.char)
    frames(6)
    expect(cells().map((c) => c.char)).not.toEqual(before)
  })

  it("'pulse' modulates opacity but leaves glyphs alone", () => {
    const host = createHost()
    const { cells } = useCharacterField(host, {
      mode: 'pulse',
      cellSize: 10,
      speed: 200,
      random: seededRandom(8),
    })
    env.show(50, 20)
    const glyphsBefore = cells().map((c) => c.char)
    const alphaBefore = cells().map((c) => c.opacity)
    frames(6)
    expect(cells().map((c) => c.char)).toEqual(glyphsBefore)
    expect(cells().map((c) => c.opacity)).not.toEqual(alphaBefore)
  })

  it("'reveal' wipes in reading order and then holds", () => {
    const host = createHost()
    const { cells } = useCharacterField(host, {
      mode: 'reveal',
      cellSize: 10,
      revealDuration: 200,
      random: seededRandom(8),
    })
    env.show(100, 30)
    frames(3)
    const partial = cells().map((c) => c.opacity)
    // The leading edge is ahead of the tail.
    expect(partial[0] ?? 0).toBeGreaterThan(partial[partial.length - 1] ?? 1)
    // Past the duration everything is up, and stays up.
    frames(40)
    const full = cells().map((c) => c.opacity)
    for (const a of full) expect(a).toBeCloseTo(0.85, 5)
    frames(10)
    expect(cells().map((c) => c.opacity)).toEqual(full)
  })

  it('draws one fillText per visible cell and leaves globalAlpha restored', () => {
    const host = createHost()
    useCharacterField(host, { cellSize: 10, random: seededRandom() })
    env.show(30, 10)
    frames(2)
    const ctx = env.contexts[0]
    if (ctx === undefined) throw new Error('expected a context')
    expect(ctx.ops).toContain('clearRect')
    expect(ctx.texts.length).toBeGreaterThanOrEqual(3)
    expect(ctx.textAlign).toBe('center')
    expect(ctx.textBaseline).toBe('middle')
    expect(ctx.font).toBe('10px monospace')
    expect(ctx.globalAlpha).toBe(1)
  })

  it('reseed() rebuilds the grid with fresh glyphs', () => {
    const host = createHost()
    const { cells, reseed, stop } = useCharacterField(host, {
      characters: 'abcdefghij',
      cellSize: 10,
      random: seededRandom(13),
    })
    env.show(100, 50)
    stop()
    const before = cells().map((c) => c.char)
    reseed()
    expect(cells()).toHaveLength(before.length)
    expect(cells().map((c) => c.char)).not.toEqual(before)
  })

  // --- the reduced-motion convention -------------------------------------

  it('honors reduced motion: paints the at-rest field once, never stepping', () => {
    fireMatchMediaChange(window.matchMedia('(prefers-reduced-motion: reduce)'), true)
    const host = createHost()
    const { cells, isRunning, prefersReduced } = useCharacterField(host, {
      mode: 'drift',
      characters: 'abcdef',
      cellSize: 10,
      speed: 500,
      random: seededRandom(8),
    })
    env.show(50, 20)

    expect(prefersReduced()).toBe(true)
    expect(isRunning()).toBe(false)
    expect(cells().length).toBeGreaterThan(0)
    const ctx = env.contexts[0]
    const drawn = ctx?.texts.length ?? 0
    expect(drawn).toBe(cells().length)

    const before = cells().map((c) => c.char)
    frames(10)
    expect(cells().map((c) => c.char)).toEqual(before)
    expect(ctx?.texts.length).toBe(drawn)
  })

  it("reduced motion shows 'reveal' fully revealed — the END state, never a half-wipe", () => {
    fireMatchMediaChange(window.matchMedia('(prefers-reduced-motion: reduce)'), true)
    const host = createHost()
    const { cells } = useCharacterField(host, {
      mode: 'reveal',
      cellSize: 10,
      revealDuration: 5000,
      random: seededRandom(8),
    })
    env.show(100, 30)
    for (const cell of cells()) expect(cell.opacity).toBeCloseTo(0.85, 5)
  })

  it("reduced motion shows 'pulse' at full base opacity, not mid-breath", () => {
    fireMatchMediaChange(window.matchMedia('(prefers-reduced-motion: reduce)'), true)
    const host = createHost()
    const { cells } = useCharacterField(host, {
      mode: 'pulse',
      cellSize: 10,
      opacity: 0.6,
      random: seededRandom(8),
    })
    env.show(50, 20)
    for (const cell of cells()) expect(cell.opacity).toBeCloseTo(0.6, 5)
  })

  it('resumes real motion when the preference clears', () => {
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)')
    fireMatchMediaChange(mql, true)
    const host = createHost()
    const { cells, isRunning } = useCharacterField(host, {
      mode: 'drift',
      characters: 'abcdef',
      cellSize: 10,
      speed: 500,
      random: seededRandom(8),
    })
    env.show(50, 20)
    expect(isRunning()).toBe(false)

    fireMatchMediaChange(mql, false)
    expect(isRunning()).toBe(true)
    const before = cells().map((c) => c.char)
    frames(6)
    expect(cells().map((c) => c.char)).not.toEqual(before)
  })

  it('disposing the owning scope stops the field and removes the canvas', () => {
    const host = createHost()
    const scope = effectScope()
    let field!: ReturnType<typeof useCharacterField>
    scope.run(() => {
      field = useCharacterField(host, {
        mode: 'drift',
        characters: 'abcdef',
        cellSize: 10,
        speed: 500,
        random: seededRandom(8),
      })
    })
    env.show(50, 20)
    frames(2)
    scope.stop()
    expect(host.querySelector('canvas')).toBeNull()
    expect(field.isRunning()).toBe(false)

    const before = field.cells().map((c) => c.char)
    field.start()
    frames(6)
    expect(field.cells().map((c) => c.char)).toEqual(before)
  })
})

describe('@aihu/use/motion/useCharacterField — SSR-static path', () => {
  it('with isClient false, returns an empty inert field and creates nothing', () =>
    withSSR(
      () => import('../../src/motion/useCharacterField/index.ts'),
      (mod) => {
        let result: ReturnType<typeof mod.useCharacterField> | undefined
        expect(() => {
          result = mod.useCharacterField(null, { mode: 'drift', cellSize: 8 })
        }).not.toThrow()
        expect(result?.cells()).toEqual([])
        expect(result?.columns()).toBe(0)
        expect(result?.rows()).toBe(0)
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
