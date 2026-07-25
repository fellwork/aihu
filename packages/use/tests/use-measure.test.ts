/**
 * Unit tests for `useMeasure` (effect-scope plan §5): the 8-field
 * bounding-rect getters, `box` handling, `initialRect`, no-target
 * behavior, scope cleanup (via the underlying `useResizeObserver`), and
 * the SSR-static path (simulated `!isClient` via module re-evaluation).
 * jsdom does not implement `ResizeObserver`, so it is stubbed here (same
 * pattern as `use-resize-observer.test.ts`/`use-element-size.test.ts`).
 * jsdom environment (root vitest config).
 */
import { effectScope } from '@aihu/signals'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useMeasure } from '../src/useMeasure/index.ts'
import { withSSR } from './_ssr.ts'

interface FakeEntry {
  target: Element
  contentRect: { width: number; height: number }
  contentBoxSize: Array<{ inlineSize: number; blockSize: number }>
  borderBoxSize: Array<{ inlineSize: number; blockSize: number }>
  devicePixelContentBoxSize?: Array<{ inlineSize: number; blockSize: number }>
}

class FakeResizeObserver {
  static instances: FakeResizeObserver[] = []
  cb: (entries: FakeEntry[]) => void
  observed: Element | null = null
  disconnected = false
  constructor(cb: (entries: FakeEntry[]) => void) {
    this.cb = cb
    FakeResizeObserver.instances.push(this)
  }
  observe(el: Element): void {
    this.observed = el
  }
  disconnect(): void {
    this.disconnected = true
  }
  unobserve(): void {}
  fire(
    el: Element,
    rect: { x: number; y: number; width: number; height: number },
    // Border box is padding+border larger than content box, distinct
    // values so `box: 'border-box'` vs the default is actually observable.
    borderSize: { width: number; height: number } = {
      width: rect.width + 10,
      height: rect.height + 10,
    },
    // Distinct from both content/border box so `box:
    // 'device-pixel-content-box'` is actually observable, not just falling
    // through to contentBoxSize by coincidence. `undefined` simulates an
    // engine that doesn't populate this (experimental) array.
    devicePixelSize?: { width: number; height: number },
  ): void {
    // Stub the element's getBoundingClientRect for this fire — useMeasure
    // reads x/y/top/right/bottom/left off it, not off contentRect.
    vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      top: rect.y,
      right: rect.x + rect.width,
      bottom: rect.y + rect.height,
      left: rect.x,
      toJSON: () => ({}),
    })
    this.cb([
      {
        target: el,
        contentRect: { width: rect.width, height: rect.height },
        contentBoxSize: [{ inlineSize: rect.width, blockSize: rect.height }],
        borderBoxSize: [{ inlineSize: borderSize.width, blockSize: borderSize.height }],
        ...(devicePixelSize !== undefined
          ? {
              devicePixelContentBoxSize: [
                { inlineSize: devicePixelSize.width, blockSize: devicePixelSize.height },
              ],
            }
          : {}),
      },
    ])
  }
}

describe('@aihu/use/useMeasure', () => {
  beforeEach(() => {
    FakeResizeObserver.instances = []
    vi.stubGlobal('ResizeObserver', FakeResizeObserver)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('starts at all-zero by default', () => {
    const { x, y, width, height, top, right, bottom, left } = useMeasure()
    expect([x(), y(), width(), height(), top(), right(), bottom(), left()]).toEqual([
      0, 0, 0, 0, 0, 0, 0, 0,
    ])
  })

  it('respects a custom initialRect', () => {
    const { x, width, top } = useMeasure({ initialRect: { x: 3, width: 4, top: 5 } })
    expect(x()).toBe(3)
    expect(width()).toBe(4)
    expect(top()).toBe(5)
  })

  it('reports all 8 fields after a resize fires', () => {
    const el = document.createElement('div')
    const { x, y, width, height, top, right, bottom, left } = useMeasure({ target: el })
    const observer = FakeResizeObserver.instances[0]
    observer?.fire(el, { x: 10, y: 20, width: 100, height: 50 })
    expect(x()).toBe(10)
    expect(y()).toBe(20)
    expect(width()).toBe(100)
    expect(height()).toBe(50)
    expect(top()).toBe(20)
    expect(right()).toBe(110)
    expect(bottom()).toBe(70)
    expect(left()).toBe(10)
  })

  it('no target: registers no observer and getters stay at initialRect', () => {
    const { width } = useMeasure()
    expect(FakeResizeObserver.instances).toHaveLength(0)
    expect(width()).toBe(0)
  })

  it('box: "border-box" reads the border box size', () => {
    const el = document.createElement('div')
    const { width, height } = useMeasure({ target: el, box: 'border-box' })
    const observer = FakeResizeObserver.instances[0]
    // Default borderSize is rect + 10 on each axis (see fire()'s default).
    observer?.fire(el, { x: 0, y: 0, width: 20, height: 30 })
    expect(width()).toBe(30)
    expect(height()).toBe(40)
  })

  it('box: "device-pixel-content-box" reads devicePixelContentBoxSize, not content/border box (FEL-406 #3)', () => {
    const el = document.createElement('div')
    const { width, height } = useMeasure({ target: el, box: 'device-pixel-content-box' })
    const observer = FakeResizeObserver.instances[0]
    observer?.fire(
      el,
      { x: 0, y: 0, width: 20, height: 30 },
      { width: 30, height: 40 },
      { width: 39, height: 59 },
    )
    // Must come from devicePixelContentBoxSize (39, 59), NOT contentBoxSize
    // (20, 30) or borderBoxSize (30, 40) — that silent fold to content-box
    // is exactly the bug FEL-406 #3 flags.
    expect(width()).toBe(39)
    expect(height()).toBe(59)
  })

  it('box: "device-pixel-content-box" falls back to contentRect when the engine omits devicePixelContentBoxSize', () => {
    const el = document.createElement('div')
    const { width, height } = useMeasure({ target: el, box: 'device-pixel-content-box' })
    const observer = FakeResizeObserver.instances[0]
    observer?.fire(el, { x: 0, y: 0, width: 20, height: 30 })
    expect(width()).toBe(20)
    expect(height()).toBe(30)
  })

  it('scope.stop() disconnects the underlying observer', () => {
    const el = document.createElement('div')
    const scope = effectScope()
    scope.run(() => useMeasure({ target: el }))
    const observer = FakeResizeObserver.instances[0]
    expect(observer?.disconnected).toBe(false)
    scope.stop()
    expect(observer?.disconnected).toBe(true)
  })
})

describe('@aihu/use/useMeasure — SSR-static path', () => {
  // The exhaustive zero-side-effect gate lives in ssr-safety.test.ts.

  it('with isClient false, returns static getters of initialRect and registers nothing', () =>
    withSSR(
      () => import('../src/useMeasure/index.ts'),
      (mod) => {
        const { x, width, height } = mod.useMeasure({
          initialRect: { x: 3, width: 4, height: 5 },
        })
        expect(x()).toBe(3)
        expect(width()).toBe(4)
        expect(height()).toBe(5)
      },
    ))
})
