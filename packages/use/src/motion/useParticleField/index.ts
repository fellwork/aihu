/**
 * `useParticleField` — an N-particle 2D drift simulation on a managed canvas
 * (docs/plans/2026-08-01-performative-ui-port.md Track B Slice 8 —
 * `@aihu/use/motion` wave 2, Tier-C infrastructure). This is what
 * `floating-sparkles` (Slice 9) drives.
 *
 * Built entirely on {@link useCanvasSurface}, which owns the element, the
 * DPI math, the off-screen pause and the rAF loop; this file owns only the
 * particle state and the per-frame step. Deliberately NOT a physics engine —
 * constant drift, an optional uniform gravity, and an optional inverse-square
 * pointer pull is the whole model. Anything more belongs in the consuming
 * component, not in shared infrastructure.
 *
 * Return convention (ratified): an object of named getters, signals under
 * the hood. Readers in .aihu templates MUST call getters with parens:
 * `{isRunning()}`, never bare `{isRunning}`.
 *
 * **`particles()` is not reactive.** It returns the live backing array,
 * mutated in place every frame — a signal would fire 60x/second with a
 * value nothing renders from (the canvas IS the render). It is exposed for
 * tests and for effects that want to seed or perturb the field directly.
 *
 * Reduced motion: follows the convention {@link useCanvasSurface} sets —
 * the field is seeded and painted ONCE as a static composition, and the
 * per-frame integration never runs. A sparkle field under reduced motion is
 * a still starfield, not an empty box.
 *
 * SSR (`isClient === false`): `particles()` is an empty array, every getter
 * is statically `0`/`false`, mutators are no-ops — nothing is created,
 * observed, or scheduled.
 */
import { isClient, type MaybeElementGetter } from '../../shared/index.ts'
import { useMouseInElement } from '../../useMouseInElement/index.ts'
import { useCanvasSurface } from '../useCanvasSurface/index.ts'

const TAU = Math.PI * 2

/** One particle's mutable state, in CSS pixels / pixels-per-second. */
export interface Particle {
  x: number
  y: number
  /** Horizontal velocity, px/sec. */
  vx: number
  /** Vertical velocity, px/sec. */
  vy: number
  /** Draw radius in CSS pixels. */
  radius: number
  /** Base alpha before any twinkle modulation. */
  opacity: number
  /** Fill style, drawn from `colors`. */
  color: string
  /** Twinkle phase offset in radians, so the field does not pulse in unison. */
  phase: number
}

export interface UseParticleFieldOptions {
  /** How many particles. Default `48`. Snapshotted — this is not reactive;
   * a component that needs a live count should re-create the composable. */
  count?: number
  /** Fill colors, sampled per particle. Default `['#ffffff']`. A future
   * `.aihu` component prop will arrive as a comma-separated string; parsing
   * that is the COMPONENT's job (Slice 9), not this composable's — the TS
   * API takes a real array. */
  colors?: readonly string[]
  /** Smallest particle radius, CSS px. Default `1`. */
  minRadius?: number
  /** Largest particle radius, CSS px. Default `2.5`. */
  maxRadius?: number
  /** Peak drift speed, px/sec, seeded per particle in `[-speed, speed]` on
   * each axis. Default `18`. */
  speed?: number
  /** Constant downward acceleration, px/sec^2. Default `0` (weightless
   * drift). Negative floats particles upward. */
  gravity?: number
  /** Acceleration toward the pointer, px/sec^2 at 100px distance, falling
   * off with the inverse square of distance. Default `0` (off — and when
   * off, no pointer listener is registered at all). Negative repels. */
  pointerAttraction?: number
  /** Modulate each particle's alpha sinusoidally. Default `true`. */
  twinkle?: boolean
  /** Twinkle cycles per second. Default `0.4`. */
  twinkleSpeed?: number
  /** Lowest seeded base opacity. Default `0.25`. */
  minOpacity?: number
  /** Highest seeded base opacity. Default `0.9`. */
  maxOpacity?: number
  /** Randomness source, `[0, 1)`. Default `Math.random`. Injectable so tests
   * (and any future deterministic render) can seed a reproducible field. */
  random?: () => number
  /** Start animating immediately. Default `true`. */
  immediate?: boolean
  /** Forwarded to {@link useCanvasSurface}. */
  maxPixelRatio?: number
  /** Forwarded to {@link useCanvasSurface}. */
  pauseWhenHidden?: boolean
}

export interface UseParticleFieldReturn {
  /** The live particle array, mutated in place — NOT reactive (see the
   * module doc). Empty until the host has a non-zero size. */
  readonly particles: () => readonly Particle[]
  /** Reactive getter — the owned canvas, or `null` before the host
   * resolves. */
  readonly canvas: () => HTMLCanvasElement | null
  /** Reactive getter — whether frames are actually being produced. */
  readonly isRunning: () => boolean
  /** Reactive getter — the user's reduced-motion preference. */
  readonly prefersReduced: () => boolean
  /** Re-seed every particle at fresh random positions and velocities, then
   * repaint. Idempotent; no-op while the host has no size. */
  reseed: () => void
  /** Start animating (one static frame under reduced motion). */
  start: () => void
  /** Stop animating. Sticky — see {@link useCanvasSurface}. */
  stop: () => void
}

/**
 * Drift `count` particles across a canvas filling `host`. Cleans up with the
 * surrounding effect scope (the canvas is removed on dispose).
 */
export function useParticleField(
  host: MaybeElementGetter,
  options: UseParticleFieldOptions = {},
): UseParticleFieldReturn {
  // Snapshot options to plain values up front (D8 — never let a later
  // mutation of a caller-owned object diverge SSR vs client).
  const {
    count = 48,
    colors = ['#ffffff'],
    minRadius = 1,
    maxRadius = 2.5,
    speed = 18,
    gravity = 0,
    pointerAttraction = 0,
    twinkle = true,
    twinkleSpeed = 0.4,
    minOpacity = 0.25,
    maxOpacity = 0.9,
    random = Math.random,
    immediate = true,
    maxPixelRatio,
    pauseWhenHidden,
  } = options

  // SSR: static getters, no surface, no pointer listener.
  if (!isClient) {
    const empty: readonly Particle[] = []
    const no = (): boolean => false
    return {
      particles: () => empty,
      canvas: () => null,
      isRunning: no,
      prefersReduced: no,
      reseed: () => {},
      start: () => {},
      stop: () => {},
    }
  }

  const palette = colors.length > 0 ? colors : ['#ffffff']
  const particles: Particle[] = []
  let seededWidth = 0
  let seededHeight = 0

  // Only registers pointer listeners when attraction is actually asked for —
  // a sparkle background should not cost a `pointermove` handler by default.
  const pointer = pointerAttraction === 0 ? undefined : useMouseInElement({ target: host })

  const between = (lo: number, hi: number): number => lo + random() * (hi - lo)

  const seed = (width: number, height: number): void => {
    particles.length = 0
    for (let i = 0; i < count; i++) {
      particles.push({
        x: random() * width,
        y: random() * height,
        vx: between(-speed, speed),
        vy: between(-speed, speed),
        radius: between(minRadius, maxRadius),
        opacity: between(minOpacity, maxOpacity),
        color: palette[Math.floor(random() * palette.length) % palette.length] as string,
        phase: random() * TAU,
      })
    }
    seededWidth = width
    seededHeight = height
  }

  /** Integrate one step. `dt` is SECONDS, clamped: a backgrounded tab
   * resumes with a multi-second delta, and integrating that unclamped
   * teleports the whole field off-canvas in a single frame. */
  const step = (dt: number, width: number, height: number): void => {
    const clamped = dt > 0.05 ? 0.05 : dt
    const px = pointer === undefined ? 0 : pointer.elementX()
    const py = pointer === undefined ? 0 : pointer.elementY()
    const pulling = pointer !== undefined && !pointer.isOutside()

    for (const p of particles) {
      if (gravity !== 0) p.vy += gravity * clamped
      if (pulling) {
        const dx = px - p.x
        const dy = py - p.y
        // `+ 1` floors the denominator: a particle sitting exactly under the
        // pointer would otherwise take an infinite impulse.
        const distSq = dx * dx + dy * dy + 1
        const pull = (pointerAttraction * 10000) / (distSq * Math.sqrt(distSq))
        p.vx += dx * pull * clamped
        p.vy += dy * pull * clamped
      }
      p.x += p.vx * clamped
      p.y += p.vy * clamped
      // Wrap rather than bounce: a field that bounces reads as a box of
      // trapped bugs, a field that wraps reads as ambient drift.
      if (p.x < -p.radius) p.x += width + p.radius * 2
      else if (p.x > width + p.radius) p.x -= width + p.radius * 2
      if (p.y < -p.radius) p.y += height + p.radius * 2
      else if (p.y > height + p.radius) p.y -= height + p.radius * 2
    }
  }

  const draw = (
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    timestamp: number,
    animate: boolean,
  ): void => {
    ctx.clearRect(0, 0, width, height)
    const t = (timestamp / 1000) * twinkleSpeed * TAU
    for (const p of particles) {
      ctx.globalAlpha =
        twinkle && animate ? p.opacity * (0.55 + 0.45 * Math.sin(p.phase + t)) : p.opacity
      ctx.fillStyle = p.color
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.radius, 0, TAU)
      ctx.fill()
    }
    // Leave the context as we found it — an effect sharing this surface
    // (or a later `redraw`) must not inherit the last particle's alpha.
    ctx.globalAlpha = 1
  }

  const surface = useCanvasSurface(host, {
    immediate,
    ...(maxPixelRatio === undefined ? {} : { maxPixelRatio }),
    ...(pauseWhenHidden === undefined ? {} : { pauseWhenHidden }),
    onResize: (width, height) => {
      // Re-seed only on the FIRST real size; a later resize keeps the field
      // it already has (re-randomizing on every resize tick would make a
      // window drag look like static).
      if (particles.length === 0) seed(width, height)
      else {
        // Rescale proportionally so nothing is stranded outside the new box.
        const sx = seededWidth > 0 ? width / seededWidth : 1
        const sy = seededHeight > 0 ? height / seededHeight : 1
        for (const p of particles) {
          p.x *= sx
          p.y *= sy
        }
        seededWidth = width
        seededHeight = height
      }
    },
    onFrame: ({ ctx, width, height, delta, timestamp, reducedMotion }) => {
      if (particles.length === 0) seed(width, height)
      // The reduced-motion contract: paint the seeded field, never integrate.
      if (!reducedMotion) step(delta / 1000, width, height)
      draw(ctx, width, height, timestamp, !reducedMotion)
    },
  })

  const reseed = (): void => {
    if (seededWidth <= 0 || seededHeight <= 0) return
    seed(seededWidth, seededHeight)
    surface.redraw()
  }

  return {
    particles: () => particles,
    canvas: surface.canvas,
    isRunning: surface.isRunning,
    prefersReduced: surface.prefersReduced,
    reseed,
    start: surface.start,
    stop: surface.stop,
  }
}
