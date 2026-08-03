/**
 * `useCanvasSurface` — own a decorative `<canvas>`'s sizing, DPI, visibility
 * gating and rAF loop (docs/plans/2026-08-01-performative-ui-port.md Track B
 * Slice 8 — `@aihu/use/motion` wave 2, Tier-C infrastructure).
 *
 * This is the substrate every canvas-based visual effect sits on:
 * {@link useParticleField} and {@link useCharacterField} both drive their
 * simulation through it, and future canvas effects are expected to as well
 * rather than re-deriving DPI math and a rAF loop each time. It composes
 * four already-shipped CORE sensors and adds no new observer of its own:
 *
 * - `useElementSize` — the HOST container's content box, in CSS pixels.
 * - `useDevicePixelRatio` — HiDPI backing-store scale (clamped, see
 *   `maxPixelRatio`).
 * - `useElementVisibility` — the rAF loop is PAUSED outright while the host
 *   is scrolled off-screen. Not optional: a decorative background effect
 *   that keeps painting off-screen is a battery bug, and every consumer of
 *   this composable is decorative by definition.
 * - `useRafFn` — the loop driver itself.
 *
 * **This composable CREATES the canvas element.** That is a deliberate
 * departure from the rest of `@aihu/use` (every other composable only ever
 * OBSERVES a caller-supplied element), taken for two reasons. First, a
 * component would otherwise need two refs (host + canvas) for what is
 * conceptually one surface, and Slice 9-11's components are all "decorative
 * canvas fills its container". Second, and decisively: the correct HiDPI
 * dance is to measure one element and write `style.width`/`style.height`
 * onto ANOTHER. Measuring and styling the same node feeds the written style
 * straight back into the `ResizeObserver` — a resize loop. Owning the canvas
 * lets this composable measure the host and style the canvas, which is
 * loop-free by construction. The canvas is appended to the host, absolutely
 * positioned at its top-left, and `pointer-events: none` by default; **the
 * host must be positioned** (`position: relative` or similar) for that to
 * land correctly.
 *
 * Return convention (ratified): an object of named getters, signals under
 * the hood. Readers in .aihu templates MUST call getters with parens:
 * `{isRunning()}`, never bare `{isRunning}`.
 *
 * ## The reduced-motion convention (wave 2's shared contract)
 *
 * Reduced motion never means "blank". A user who asks for less motion is
 * asking for less MOTION, not for a hole in the layout — so the convention
 * every canvas effect in this family follows, established here, is **paint
 * once, never loop**:
 *
 * - `start()` under `prefersReduced()` invokes `onFrame` EXACTLY ONCE (a
 *   single static composition) and does not arm the rAF loop. `isRunning()`
 *   stays `false` — it reports whether frames are actually being produced,
 *   so a caller can trust it.
 * - The frame passed to `onFrame` carries `reducedMotion: true` on that
 *   static paint, so an effect can render its settled/at-rest state rather
 *   than frame zero of an animation (a particle field draws its seeded
 *   starfield; a character field draws its glyphs fully revealed).
 * - The check is LIVE, matching `useSequence`: flipping the preference to
 *   `reduce` mid-run stops the loop and repaints one static frame; flipping
 *   it back resumes, but only if the caller never called `stop()` in
 *   between (an explicit `stop()` always wins).
 * - `prefersReduced()` is re-exported on the return so an effect that would
 *   rather render NOTHING under reduced motion can opt out itself. The
 *   composable does not force that choice.
 *
 * SSR (`isClient === false`): `ctx()` and `canvas()` return `null`, every
 * getter is statically `0`/`false`, `start`/`stop`/`redraw` are no-ops — no
 * element is created, no observer or frame callback is ever registered.
 */
import { effect, signal, untrack } from '@aihu/signals'
import {
  isClient,
  type MaybeElementGetter,
  tryOnScopeDispose,
  unrefElement,
} from '../../shared/index.ts'
import { useDevicePixelRatio } from '../../useDevicePixelRatio/index.ts'
import { useElementSize } from '../../useElementSize/index.ts'
import { useElementVisibility } from '../../useElementVisibility/index.ts'
import { useRafFn } from '../../useRafFn/index.ts'
import { useReducedMotion } from '../useReducedMotion/index.ts'

/** One frame's worth of drawing state, handed to `onFrame`. All geometry is
 * in CSS pixels — the context is pre-scaled by `pixelRatio`, so an effect
 * draws in CSS space and gets crisp output for free. */
export interface UseCanvasSurfaceFrame {
  /** The 2D context, already transformed by `pixelRatio`. The previous
   * frame is NOT cleared — clearing is the effect's call, since a trail
   * effect wants the old pixels. */
  readonly ctx: CanvasRenderingContext2D
  /** Host width in CSS pixels. */
  readonly width: number
  /** Host height in CSS pixels. */
  readonly height: number
  /** Milliseconds since the previous frame (`0` on a `redraw()` paint and on
   * the loop's first frame). */
  readonly delta: number
  /** The frame's `DOMHighResTimeStamp`. */
  readonly timestamp: number
  /** The clamped device pixel ratio the backing store was sized with. */
  readonly pixelRatio: number
  /** `true` when this is a one-off static paint under reduced motion (see
   * the module doc's convention) — render the at-rest composition. */
  readonly reducedMotion: boolean
}

export interface UseCanvasSurfaceOptions {
  /** Draw callback, invoked once per animation frame while running and once
   * per `redraw()`. Omitted means the surface is sized and managed but never
   * painted. */
  onFrame?: (frame: UseCanvasSurfaceFrame) => void
  /** Called after the backing store is resized, before the repaint that
   * follows it, with the new CSS size — the hook for rebuilding
   * size-dependent state such as a particle seed or a glyph grid. */
  onResize?: (width: number, height: number) => void
  /** Start the loop as soon as a host element and context exist. Default
   * `true`. */
  immediate?: boolean
  /** Ceiling on the device pixel ratio used for the backing store. Default
   * `2`: a 3x phone display costs 2.25x the fill rate of a 2x one for detail
   * nobody can see in a decorative effect. */
  maxPixelRatio?: number
  /** Pause the loop while the host is scrolled out of view. Default `true`;
   * `false` only for a surface that must stay in sync with something
   * off-screen. */
  pauseWhenHidden?: boolean
  /** Let pointer events reach the canvas. Default `false` — decorative
   * surfaces must not eat clicks meant for the content they sit behind. */
  interactive?: boolean
  /** `alpha: false` lets the compositor skip blending when the effect paints
   * an opaque background. Default `true` (transparent). */
  alpha?: boolean
}

export interface UseCanvasSurfaceReturn {
  /** Reactive getter — the owned `<canvas>`, or `null` before the host
   * resolves (and always under SSR). */
  readonly canvas: () => HTMLCanvasElement | null
  /** Reactive getter — the 2D context, or `null` if the host has not
   * resolved or the browser refused a context. */
  readonly ctx: () => CanvasRenderingContext2D | null
  /** Reactive getter — host width in CSS pixels. */
  readonly width: () => number
  /** Reactive getter — host height in CSS pixels. */
  readonly height: () => number
  /** Reactive getter — the clamped device pixel ratio in force. */
  readonly pixelRatio: () => number
  /** Reactive getter — whether the host currently intersects the viewport. */
  readonly isVisible: () => boolean
  /** Reactive getter — whether frames are actually being produced. `false`
   * under reduced motion, while hidden, and before the host resolves, even
   * after `start()`. */
  readonly isRunning: () => boolean
  /** Reactive getter — the user's reduced-motion preference, re-exported so
   * an effect can opt out of painting entirely (see the module doc). */
  readonly prefersReduced: () => boolean
  /** Ask for frames. Under reduced motion this paints one static frame
   * instead of looping. No-op after the owning effect scope is disposed. */
  start: () => void
  /** Stop asking for frames. Idempotent, and sticky: a later visibility or
   * reduced-motion change will not resume — call `start()` again. */
  stop: () => void
  /** Paint exactly one frame right now, running or not. This is how an
   * effect renders its static reduced-motion composition on demand. */
  redraw: () => void
}

/**
 * Manage a decorative canvas filling `host`. Cleans up with the surrounding
 * effect scope — the canvas element is removed from the DOM on dispose, so a
 * scopeless caller should `stop()` and drop the host itself.
 */
export function useCanvasSurface(
  host: MaybeElementGetter,
  options: UseCanvasSurfaceOptions = {},
): UseCanvasSurfaceReturn {
  // Snapshot options to plain values up front (D8 — never let a later
  // mutation of a caller-owned object diverge SSR vs client).
  const {
    onFrame,
    onResize,
    immediate = true,
    maxPixelRatio = 2,
    pauseWhenHidden = true,
    interactive = false,
    alpha = true,
  } = options

  // SSR: static getters, no element, no observers, no frame callback.
  if (!isClient) {
    const zero = (): number => 0
    const no = (): boolean => false
    return {
      canvas: () => null,
      ctx: () => null,
      width: zero,
      height: zero,
      pixelRatio: () => 1,
      isVisible: no,
      isRunning: no,
      prefersReduced: no,
      start: () => {},
      stop: () => {},
      redraw: () => {},
    }
  }

  const { prefersReduced } = useReducedMotion()
  const { width, height } = useElementSize({ target: host })
  const { pixelRatio: rawPixelRatio } = useDevicePixelRatio()
  const { isVisible } = useElementVisibility({ target: host })

  const [canvas, setCanvas] = signal<HTMLCanvasElement | null>(null)
  // The context is deliberately NOT a signal: it is written in the same tick
  // as `canvas` and every read of it is gated on `canvas()` anyway, so a
  // second signal would only add a redundant dependency edge.
  let context: CanvasRenderingContext2D | null = null
  let mountedHost: Element | null = null
  let wantsRunning = false
  let disposed = false

  const pixelRatio = (): number => Math.min(rawPixelRatio(), maxPixelRatio)

  /** Paint one frame. `untrack`ed because `onFrame` is caller code that may
   * read signals and `redraw()` is called from inside the effects below —
   * without this, a consumer's incidental signal read would silently become
   * a dependency of the resize/gate effect and re-enter the paint. */
  const paint = (timestamp: number, delta: number, reducedMotion: boolean): void => {
    const ctx = context
    if (ctx === null || onFrame === undefined) return
    const w = untrack(width)
    const h = untrack(height)
    if (w <= 0 || h <= 0) return
    const dpr = untrack(pixelRatio)
    untrack(() => {
      onFrame({ ctx, width: w, height: h, delta, timestamp, pixelRatio: dpr, reducedMotion })
    })
  }

  const { pause, resume, isActive } = useRafFn(
    ({ delta, timestamp }) => {
      paint(timestamp, delta, false)
    },
    { immediate: false },
  )

  const redraw = (): void => {
    if (disposed) return
    paint(performance.now(), 0, untrack(prefersReduced))
  }

  /** Re-evaluate whether the loop should be armed. Every reactive input is
   * read UNCONDITIONALLY before the decision — short-circuiting on
   * `wantsRunning` would drop the dependency edges and leave a stopped
   * surface permanently untracked. */
  const runGate = (): void => {
    const reduced = prefersReduced()
    const visible = isVisible()
    const ready = canvas() !== null && context !== null
    if (disposed) return
    if (wantsRunning && ready && !reduced && (!pauseWhenHidden || visible)) {
      resume()
    } else {
      pause()
      // Reduced motion is "paint once", not "paint nothing" — hold a static
      // frame rather than leaving whatever the loop happened to stop on.
      if (wantsRunning && ready && reduced) redraw()
    }
  }

  const detach = (): void => {
    const existing = untrack(canvas)
    if (existing !== null) existing.remove()
    context = null
    setCanvas(null)
  }

  // Host binding: a getter target (the `$ref` case — `null` until mount)
  // rebinds reactively, so the canvas follows the host element.
  const disposeHostEffect = effect(() => {
    const el = unrefElement(host) ?? null
    if (disposed || el === mountedHost) return
    pause()
    detach()
    mountedHost = el
    if (el === null) return
    const c = document.createElement('canvas')
    c.style.display = 'block'
    c.style.position = 'absolute'
    c.style.left = '0'
    c.style.top = '0'
    if (!interactive) c.style.pointerEvents = 'none'
    el.appendChild(c)
    context = c.getContext('2d', { alpha })
    setCanvas(c)
  })

  // Sizing: CSS size on the style, `size * dpr` on the backing store.
  // Writing `canvas.width`/`height` RESETS the context (transform included),
  // so the transform is re-applied here on every resize rather than once at
  // creation — with `setTransform`, not `scale`, because `scale` is relative
  // and would compound.
  const disposeSizeEffect = effect(() => {
    const c = canvas()
    const w = width()
    const h = height()
    const dpr = pixelRatio()
    if (disposed || c === null || w <= 0 || h <= 0) return
    c.style.width = `${w}px`
    c.style.height = `${h}px`
    c.width = Math.round(w * dpr)
    c.height = Math.round(h * dpr)
    context?.setTransform(dpr, 0, 0, dpr, 0, 0)
    untrack(() => {
      onResize?.(w, h)
      // The attribute write above blanked the backing store; repaint now so
      // a resize does not flash empty for a frame — and so a paused or
      // reduced-motion surface, which has no next frame coming, is restored
      // at all.
      redraw()
    })
  })

  const disposeGateEffect = effect(() => {
    runGate()
  })

  const start = (): void => {
    // A still-referenced start() must not re-arm the loop (and paint) once
    // the owning scope tore down.
    if (disposed) return
    wantsRunning = true
    runGate()
  }

  const stop = (): void => {
    if (disposed) return
    wantsRunning = false
    pause()
  }

  tryOnScopeDispose(() => {
    disposed = true
    pause()
    disposeHostEffect()
    disposeSizeEffect()
    disposeGateEffect()
    detach()
    mountedHost = null
  })

  if (immediate) start()

  return {
    canvas,
    ctx: () => (canvas() === null ? null : context),
    width,
    height,
    pixelRatio,
    isVisible,
    isRunning: isActive,
    prefersReduced,
    start,
    stop,
    redraw,
  }
}
