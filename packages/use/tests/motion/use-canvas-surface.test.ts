/**
 * Unit tests for `useCanvasSurface` (`@aihu/use/motion` wave 2 —
 * performativeUI port doc, Track B Slice 8): canvas ownership, HiDPI backing
 * store math, the off-screen pause, the reduced-motion "paint once, never
 * loop" convention (including the LIVE preference flip), scope cleanup, and
 * the SSR-static path. jsdom environment — `ResizeObserver`,
 * `IntersectionObserver` and `getContext('2d')` are all faked (see
 * `./_canvas.ts`), and jsdom's `requestAnimationFrame` runs on a real
 * macrotask timer so these tests use fake timers and step it via
 * `vi.advanceTimersToNextFrame`.
 */
import { effectScope, signal } from '@aihu/signals'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useCanvasSurface } from '../../src/motion/useCanvasSurface/index.ts'
import { fireMatchMediaChange, installMatchMediaPolyfill } from '../_match-media.ts'
import { withSSR } from '../_ssr.ts'
import { type CanvasHarness, createHost, installCanvasEnv, uninstallCanvasEnv } from './_canvas.ts'

installMatchMediaPolyfill()

describe('@aihu/use/motion/useCanvasSurface', () => {
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

  it('creates and appends a canvas into the host', () => {
    const host = createHost()
    const { canvas, ctx } = useCanvasSurface(host)
    const el = canvas()
    expect(el).toBeInstanceOf(HTMLCanvasElement)
    expect(el?.parentElement).toBe(host)
    expect(ctx()).not.toBeNull()
    // Decorative by default — must not eat clicks meant for content behind it.
    expect(el?.style.pointerEvents).toBe('none')
    expect(el?.style.position).toBe('absolute')
  })

  it('interactive: true leaves pointer events alone', () => {
    const host = createHost()
    const { canvas } = useCanvasSurface(host, { interactive: true })
    expect(canvas()?.style.pointerEvents).toBe('')
  })

  it('no host element: creates nothing and never runs', () => {
    const { canvas, ctx, isRunning } = useCanvasSurface(null)
    expect(canvas()).toBeNull()
    expect(ctx()).toBeNull()
    expect(isRunning()).toBe(false)
  })

  it('a getter host binds the canvas reactively once the ref resolves', () => {
    // The `$ref` case: null until mount, then the element. The host effect
    // must rebind without the composable being re-created.
    const [hostEl, setHostEl] = signal<HTMLElement | null>(null)
    const { canvas } = useCanvasSurface(hostEl)
    expect(canvas()).toBeNull()

    const first = createHost()
    setHostEl(first)
    expect(canvas()?.parentElement).toBe(first)

    // And it FOLLOWS a later rebind, leaving no orphan canvas behind.
    const second = createHost()
    setHostEl(second)
    expect(first.querySelector('canvas')).toBeNull()
    expect(canvas()?.parentElement).toBe(second)

    setHostEl(null)
    expect(canvas()).toBeNull()
    expect(second.querySelector('canvas')).toBeNull()
  })

  it('sizes the backing store by the device pixel ratio and the style box in CSS px', () => {
    const host = createHost()
    const { canvas, width, height, pixelRatio } = useCanvasSurface(host)
    env.show(300, 150)
    expect(width()).toBe(300)
    expect(height()).toBe(150)
    // jsdom reports devicePixelRatio 1; the clamp leaves it alone.
    expect(pixelRatio()).toBe(1)
    const el = canvas()
    expect(el?.style.width).toBe('300px')
    expect(el?.style.height).toBe('150px')
    expect(el?.width).toBe(300)
    expect(el?.height).toBe(150)
  })

  it('clamps the device pixel ratio to maxPixelRatio and re-applies the transform on resize', () => {
    const host = createHost()
    // jsdom's devicePixelRatio is 1, so exercise the clamp from the other
    // side: a maxPixelRatio BELOW 1 must win.
    const { canvas, pixelRatio } = useCanvasSurface(host, { maxPixelRatio: 0.5 })
    env.show(200, 100)
    expect(pixelRatio()).toBe(0.5)
    expect(canvas()?.width).toBe(100)
    expect(canvas()?.height).toBe(50)
    const ctx = env.contexts[0]
    // setTransform (not scale) so repeated resizes cannot compound.
    expect(ctx?.transforms.at(-1)).toEqual([0.5, 0, 0, 0.5, 0, 0])
    env.resize().fire(400, 200)
    expect(canvas()?.width).toBe(200)
    expect(ctx?.transforms.at(-1)).toEqual([0.5, 0, 0, 0.5, 0, 0])
    expect(ctx?.transforms.length).toBe(2)
  })

  it('does not run while the host is off-screen, and starts when it scrolls in', () => {
    const host = createHost()
    const onFrame = vi.fn()
    const { isRunning, isVisible } = useCanvasSurface(host, { onFrame })
    env.resize().fire(200, 100)
    expect(isVisible()).toBe(false)
    expect(isRunning()).toBe(false)
    const framesWhileHidden = onFrame.mock.calls.length
    vi.advanceTimersToNextFrame()
    expect(onFrame.mock.calls.length).toBe(framesWhileHidden)

    env.intersect().fire(true)
    expect(isRunning()).toBe(true)
    vi.advanceTimersToNextFrame()
    expect(onFrame.mock.calls.length).toBeGreaterThan(framesWhileHidden)
  })

  it('pauses again when the host scrolls back out of view', () => {
    const host = createHost()
    const onFrame = vi.fn()
    const { isRunning } = useCanvasSurface(host, { onFrame })
    env.show(200, 100)
    vi.advanceTimersToNextFrame()
    expect(isRunning()).toBe(true)

    env.intersect().fire(false)
    expect(isRunning()).toBe(false)
    const frozen = onFrame.mock.calls.length
    for (let i = 0; i < 5; i++) vi.advanceTimersToNextFrame()
    expect(onFrame.mock.calls.length).toBe(frozen)
  })

  it('pauseWhenHidden: false runs regardless of visibility', () => {
    const host = createHost()
    const { isRunning } = useCanvasSurface(host, { pauseWhenHidden: false, onFrame: () => {} })
    env.resize().fire(200, 100)
    expect(isRunning()).toBe(true)
  })

  it('immediate: false does not run until start()', () => {
    const host = createHost()
    const { isRunning, start } = useCanvasSurface(host, { immediate: false, onFrame: () => {} })
    env.show(200, 100)
    expect(isRunning()).toBe(false)
    start()
    expect(isRunning()).toBe(true)
  })

  it('stop() is sticky — a later visibility change does not resume it', () => {
    const host = createHost()
    const { isRunning, stop } = useCanvasSurface(host, { onFrame: () => {} })
    env.show(200, 100)
    expect(isRunning()).toBe(true)
    stop()
    expect(isRunning()).toBe(false)
    env.intersect().fire(false)
    env.intersect().fire(true)
    expect(isRunning()).toBe(false)
  })

  it('onResize fires with the CSS size before the repaint', () => {
    const host = createHost()
    const seen: Array<[number, number]> = []
    useCanvasSurface(host, { onResize: (w, h) => seen.push([w, h]), onFrame: () => {} })
    env.show(320, 240)
    env.resize().fire(100, 50)
    expect(seen).toEqual([
      [320, 240],
      [100, 50],
    ])
  })

  it('redraw() paints exactly one frame whether or not the loop is running', () => {
    const host = createHost()
    const onFrame = vi.fn()
    const { redraw, stop } = useCanvasSurface(host, { onFrame })
    env.show(200, 100)
    stop()
    const before = onFrame.mock.calls.length
    redraw()
    expect(onFrame.mock.calls.length).toBe(before + 1)
    expect(onFrame.mock.lastCall?.[0]).toMatchObject({ width: 200, height: 100, delta: 0 })
  })

  it('never paints while the host has no size', () => {
    const host = createHost()
    const onFrame = vi.fn()
    const { redraw } = useCanvasSurface(host, { onFrame })
    env.intersect().fire(true)
    redraw()
    expect(onFrame).not.toHaveBeenCalled()
  })

  // --- the reduced-motion convention -------------------------------------

  it('honors reduced motion: paints one static frame and never arms the loop', () => {
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)')
    fireMatchMediaChange(mql, true)
    const host = createHost()
    const onFrame = vi.fn()
    const { isRunning, prefersReduced } = useCanvasSurface(host, { onFrame })
    env.show(200, 100)

    expect(prefersReduced()).toBe(true)
    expect(isRunning()).toBe(false)
    expect(onFrame).toHaveBeenCalled()
    expect(onFrame.mock.lastCall?.[0]).toMatchObject({ reducedMotion: true })

    const painted = onFrame.mock.calls.length
    for (let i = 0; i < 5; i++) vi.advanceTimersToNextFrame()
    expect(onFrame.mock.calls.length).toBe(painted)
  })

  it('reduced motion is LIVE: flipping to reduce mid-run stops the loop and repaints once', () => {
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)')
    const host = createHost()
    const onFrame = vi.fn()
    const { isRunning } = useCanvasSurface(host, { onFrame })
    env.show(200, 100)
    vi.advanceTimersToNextFrame()
    expect(isRunning()).toBe(true)

    fireMatchMediaChange(mql, true)
    expect(isRunning()).toBe(false)
    expect(onFrame.mock.lastCall?.[0]).toMatchObject({ reducedMotion: true })

    const painted = onFrame.mock.calls.length
    for (let i = 0; i < 5; i++) vi.advanceTimersToNextFrame()
    expect(onFrame.mock.calls.length).toBe(painted)
  })

  it('reduced motion is LIVE: clearing the preference resumes the loop', () => {
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)')
    fireMatchMediaChange(mql, true)
    const host = createHost()
    const { isRunning } = useCanvasSurface(host, { onFrame: () => {} })
    env.show(200, 100)
    expect(isRunning()).toBe(false)

    fireMatchMediaChange(mql, false)
    expect(isRunning()).toBe(true)
  })

  it('an explicit stop() still wins over a reduced-motion preference change', () => {
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)')
    fireMatchMediaChange(mql, true)
    const host = createHost()
    const { isRunning, stop } = useCanvasSurface(host, { onFrame: () => {} })
    env.show(200, 100)
    stop()
    fireMatchMediaChange(mql, false)
    expect(isRunning()).toBe(false)
  })

  // --- teardown ----------------------------------------------------------

  it('disposing the owning scope stops the loop and removes the canvas', () => {
    const host = createHost()
    const onFrame = vi.fn()
    const scope = effectScope()
    let surface!: ReturnType<typeof useCanvasSurface>
    scope.run(() => {
      surface = useCanvasSurface(host, { onFrame })
    })
    env.show(200, 100)
    vi.advanceTimersToNextFrame()
    expect(host.querySelector('canvas')).not.toBeNull()

    scope.stop()
    expect(host.querySelector('canvas')).toBeNull()
    expect(surface.canvas()).toBeNull()
    expect(surface.isRunning()).toBe(false)

    const frozen = onFrame.mock.calls.length
    for (let i = 0; i < 5; i++) vi.advanceTimersToNextFrame()
    surface.start()
    surface.redraw()
    for (let i = 0; i < 5; i++) vi.advanceTimersToNextFrame()
    expect(onFrame.mock.calls.length).toBe(frozen)
  })

  it('survives a browser that refuses a 2D context', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    const host = createHost()
    const onFrame = vi.fn()
    const { ctx, isRunning, redraw } = useCanvasSurface(host, { onFrame })
    expect(() => {
      env.show(200, 100)
      redraw()
    }).not.toThrow()
    expect(ctx()).toBeNull()
    expect(isRunning()).toBe(false)
    expect(onFrame).not.toHaveBeenCalled()
  })
})

describe('@aihu/use/motion/useCanvasSurface — SSR-static path', () => {
  it('with isClient false, returns an inert surface and creates nothing', () =>
    withSSR(
      () => import('../../src/motion/useCanvasSurface/index.ts'),
      (mod) => {
        let result: ReturnType<typeof mod.useCanvasSurface> | undefined
        expect(() => {
          result = mod.useCanvasSurface(null, { onFrame: () => {} })
        }).not.toThrow()
        expect(result?.canvas()).toBeNull()
        expect(result?.ctx()).toBeNull()
        expect(result?.width()).toBe(0)
        expect(result?.height()).toBe(0)
        expect(result?.pixelRatio()).toBe(1)
        expect(result?.isRunning()).toBe(false)
        expect(result?.isVisible()).toBe(false)
        expect(result?.prefersReduced()).toBe(false)
        expect(() => {
          result?.start()
          result?.redraw()
          result?.stop()
        }).not.toThrow()
      },
    ))
})
