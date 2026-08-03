/**
 * `useCharacterField` — an animated grid of character glyphs on a managed
 * canvas (docs/plans/2026-08-01-performative-ui-port.md Track B Slice 8 —
 * `@aihu/use/motion` wave 2, Tier-C infrastructure). This is what
 * `ascii-hero` (Slice 10) drives.
 *
 * Built entirely on {@link useCanvasSurface}, which owns the element, the
 * DPI math, the off-screen pause and the rAF loop; this file owns only the
 * cell grid and the per-frame update. The grid is derived from the host's
 * size and `cellSize`, so it re-flows on resize without the consumer doing
 * anything.
 *
 * Three animation modes, deliberately a closed enum rather than a callback —
 * the point of Tier-C infrastructure is that Slice 10's component picks a
 * mode, not that it reimplements one:
 *
 * - `'drift'` (default) — each cell advances through the character set at
 *   its own seeded rate, so the field shimmers between glyphs.
 * - `'pulse'` — glyphs are fixed; per-cell alpha breathes on a sine with a
 *   seeded phase offset.
 * - `'reveal'` — a one-shot typewriter wipe: cells appear in reading order
 *   over `revealDuration`, then hold. Does not loop.
 *
 * Return convention (ratified): an object of named getters, signals under
 * the hood. Readers in .aihu templates MUST call getters with parens:
 * `{columns()}`, never bare `{columns}`.
 *
 * **`cells()` is not reactive** — it returns the live backing array, mutated
 * in place every frame (the canvas IS the render). Exposed for tests and for
 * effects that want to inspect or overwrite glyphs directly. `columns()` and
 * `rows()` ARE reactive: the grid shape changes rarely (on resize) and a
 * component may legitimately want to render off it.
 *
 * Reduced motion: follows the convention {@link useCanvasSurface} sets —
 * the field is painted ONCE in its at-rest composition and never stepped.
 * At rest means: `'drift'` shows its seeded glyphs, `'pulse'` shows full
 * opacity, and `'reveal'` shows every cell already revealed (the wipe's END
 * state, never a half-finished frame).
 *
 * SSR (`isClient === false`): `cells()` is empty, every getter is statically
 * `0`/`false`, mutators are no-ops — nothing is created, observed, or
 * scheduled.
 */
import { signal } from '@aihu/signals'
import { isClient, type MaybeElementGetter } from '../../shared/index.ts'
import { useCanvasSurface } from '../useCanvasSurface/index.ts'

const TAU = Math.PI * 2

/** How the field animates. See the module doc. */
export type CharacterFieldMode = 'drift' | 'pulse' | 'reveal'

/** One grid cell's mutable state. `x`/`y` are the cell's CENTER in CSS px. */
export interface FieldCell {
  column: number
  row: number
  x: number
  y: number
  /** The glyph currently drawn — mutated in place by `'drift'`. */
  char: string
  /** Index into the resolved character set, the drift base. */
  index: number
  /** Phase offset in radians, so the field does not animate in unison. */
  phase: number
  /** Per-cell speed multiplier, `[0.5, 1.5)`. */
  rate: number
  /** Alpha last drawn with. */
  opacity: number
}

export interface UseCharacterFieldOptions {
  /** The glyphs to draw from, densest-last by convention. Default
   * `' .:-=+*#%@'`. A string is split per code unit; pass an array for
   * multi-code-unit glyphs. */
  characters?: string | readonly string[]
  /** Grid pitch in CSS pixels — the cell width AND height. Default `14`. */
  cellSize?: number
  /** Fraction of cells that carry a glyph at all, `[0, 1]`. Default `1`.
   * Below 1 the field is sparse, which reads as texture rather than a
   * filled block. */
  density?: number
  /** Animation mode. Default `'drift'`. */
  mode?: CharacterFieldMode
  /** Fill color for the glyphs. Default `'#ffffff'`. */
  color?: string
  /** Font family. Default `'monospace'` — a proportional font in a fixed
   * grid looks broken, so this should stay monospaced. */
  fontFamily?: string
  /** Font size in CSS px. Default `cellSize`, which fills the cell. */
  fontSize?: number
  /** Animation rate multiplier: glyph changes/sec in `'drift'`, cycles/sec
   * in `'pulse'`. Ignored by `'reveal'`. Default `4`. */
  speed?: number
  /** Base alpha before per-mode modulation. Default `0.85`. */
  opacity?: number
  /** `'reveal'` wipe duration in ms. Default `1500`. */
  revealDuration?: number
  /** Randomness source, `[0, 1)`. Default `Math.random`. Injectable so tests
   * can seed a reproducible field. */
  random?: () => number
  /** Start animating immediately. Default `true`. */
  immediate?: boolean
  /** Forwarded to {@link useCanvasSurface}. */
  maxPixelRatio?: number
  /** Forwarded to {@link useCanvasSurface}. */
  pauseWhenHidden?: boolean
}

export interface UseCharacterFieldReturn {
  /** The live cell array, mutated in place — NOT reactive (see the module
   * doc). Empty until the host has a non-zero size. */
  readonly cells: () => readonly FieldCell[]
  /** Reactive getter — grid columns. */
  readonly columns: () => number
  /** Reactive getter — grid rows. */
  readonly rows: () => number
  /** Reactive getter — the owned canvas, or `null` before the host
   * resolves. */
  readonly canvas: () => HTMLCanvasElement | null
  /** Reactive getter — whether frames are actually being produced. */
  readonly isRunning: () => boolean
  /** Reactive getter — the user's reduced-motion preference. */
  readonly prefersReduced: () => boolean
  /** Rebuild the grid with fresh random glyphs/phases and repaint. In
   * `'reveal'` mode this also restarts the wipe. No-op while the host has
   * no size. */
  reseed: () => void
  /** Start animating (one static frame under reduced motion). */
  start: () => void
  /** Stop animating. Sticky — see {@link useCanvasSurface}. */
  stop: () => void
}

/**
 * Animate a grid of glyphs across a canvas filling `host`. Cleans up with
 * the surrounding effect scope (the canvas is removed on dispose).
 */
export function useCharacterField(
  host: MaybeElementGetter,
  options: UseCharacterFieldOptions = {},
): UseCharacterFieldReturn {
  // Snapshot options to plain values up front (D8 — never let a later
  // mutation of a caller-owned object diverge SSR vs client).
  const {
    characters = ' .:-=+*#%@',
    cellSize = 14,
    density = 1,
    mode = 'drift',
    color = '#ffffff',
    fontFamily = 'monospace',
    fontSize = cellSize,
    speed = 4,
    opacity = 0.85,
    revealDuration = 1500,
    random = Math.random,
    immediate = true,
    maxPixelRatio,
    pauseWhenHidden,
  } = options

  // SSR: static getters, no surface.
  if (!isClient) {
    const empty: readonly FieldCell[] = []
    const zero = (): number => 0
    const no = (): boolean => false
    return {
      cells: () => empty,
      columns: zero,
      rows: zero,
      canvas: () => null,
      isRunning: no,
      prefersReduced: no,
      reseed: () => {},
      start: () => {},
      stop: () => {},
    }
  }

  const charset = typeof characters === 'string' ? [...characters] : characters
  const glyphs = charset.length > 0 ? charset : [' ']
  const pitch = cellSize > 0 ? cellSize : 14

  const cells: FieldCell[] = []
  const [columns, setColumns] = signal(0)
  const [rows, setRows] = signal(0)
  /** `undefined` until the first frame after a (re)seed — `'reveal'` measures
   * its wipe from then, not from composable construction, so a field that
   * scrolls into view wipes on arrival rather than arriving finished. */
  let revealStart: number | undefined

  const build = (width: number, height: number): void => {
    const cols = Math.max(1, Math.floor(width / pitch))
    const rowCount = Math.max(1, Math.floor(height / pitch))
    cells.length = 0
    for (let row = 0; row < rowCount; row++) {
      for (let column = 0; column < cols; column++) {
        if (density < 1 && random() > density) continue
        const index = Math.floor(random() * glyphs.length) % glyphs.length
        cells.push({
          column,
          row,
          x: column * pitch + pitch / 2,
          y: row * pitch + pitch / 2,
          char: glyphs[index] as string,
          index,
          phase: random() * TAU,
          rate: 0.5 + random(),
          opacity,
        })
      }
    }
    setColumns(cols)
    setRows(rowCount)
    revealStart = undefined
  }

  /** Advance cell state for `timestamp`. Never called under reduced motion —
   * `atRest` below is that path's counterpart. */
  const step = (timestamp: number): void => {
    const seconds = timestamp / 1000
    if (mode === 'drift') {
      for (const cell of cells) {
        // `cell.index` IS the per-cell offset (it is where the cell started),
        // so drift needs no phase term — mixing the radian `phase` in here
        // would be a unit error dressed up as jitter.
        const advance = Math.floor(seconds * speed * cell.rate)
        const i = (((cell.index + advance) % glyphs.length) + glyphs.length) % glyphs.length
        cell.char = glyphs[i] as string
        cell.opacity = opacity
      }
      return
    }
    if (mode === 'pulse') {
      for (const cell of cells) {
        cell.opacity = opacity * (0.45 + 0.55 * Math.sin(cell.phase + seconds * speed))
      }
      return
    }
    // 'reveal' — a one-shot wipe in reading order (cells are built row-major,
    // so array order IS reading order).
    if (revealStart === undefined) revealStart = timestamp
    const progress =
      revealDuration <= 0 ? 1 : Math.min((timestamp - revealStart) / revealDuration, 1)
    const revealed = progress * cells.length
    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i] as FieldCell
      // Fade each cell in over roughly one cell's worth of the wipe, so the
      // leading edge is a soft gradient rather than a hard bar.
      cell.opacity = opacity * Math.max(0, Math.min(1, revealed - i))
    }
  }

  /** The at-rest composition (see the module doc's reduced-motion note). */
  const atRest = (): void => {
    for (const cell of cells) {
      cell.char = glyphs[cell.index] as string
      cell.opacity = opacity
    }
  }

  const draw = (ctx: CanvasRenderingContext2D, width: number, height: number): void => {
    ctx.clearRect(0, 0, width, height)
    ctx.font = `${fontSize}px ${fontFamily}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = color
    for (const cell of cells) {
      if (cell.opacity <= 0) continue
      ctx.globalAlpha = cell.opacity
      ctx.fillText(cell.char, cell.x, cell.y)
    }
    // Leave the context as we found it — a later `redraw` must not inherit
    // the last cell's alpha.
    ctx.globalAlpha = 1
  }

  const surface = useCanvasSurface(host, {
    immediate,
    ...(maxPixelRatio === undefined ? {} : { maxPixelRatio }),
    ...(pauseWhenHidden === undefined ? {} : { pauseWhenHidden }),
    // Unlike the particle field, the grid MUST be rebuilt on every resize:
    // its cell count is a function of the box, not just its coordinates.
    onResize: (width, height) => build(width, height),
    onFrame: ({ ctx, width, height, timestamp, reducedMotion }) => {
      if (cells.length === 0) build(width, height)
      if (reducedMotion) atRest()
      else step(timestamp)
      draw(ctx, width, height)
    },
  })

  const reseed = (): void => {
    const width = surface.width()
    const height = surface.height()
    if (width <= 0 || height <= 0) return
    build(width, height)
    surface.redraw()
  }

  return {
    cells: () => cells,
    columns,
    rows,
    canvas: surface.canvas,
    isRunning: surface.isRunning,
    prefersReduced: surface.prefersReduced,
    reseed,
    start: surface.start,
    stop: surface.stop,
  }
}
