/**
 * Shared jsdom harness for the wave-2 canvas composables (`useCanvasSurface`,
 * `useParticleField`, `useCharacterField` — performativeUI port doc, Track B
 * Slice 8).
 *
 * jsdom implements NONE of the three browser APIs these composables stand on:
 * `ResizeObserver` and `IntersectionObserver` are absent entirely, and
 * `HTMLCanvasElement.prototype.getContext` returns `null` (it needs the
 * optional `canvas` native package, which this repo deliberately does not
 * depend on). So all three are faked here, in the same shape the CORE sensor
 * tests already use (`use-element-size.test.ts`, `use-element-visibility.test.ts`)
 * — this file only adds the canvas half and bundles the three into one
 * install/teardown pair.
 *
 * Not a `.test.ts` file: the vitest `include` glob only picks up `*.test.ts`,
 * matching the existing `_ssr.ts` / `_match-media.ts` precedent.
 */
import { vi } from 'vitest'

type ROCallback = (entries: Array<{ contentRect: { width: number; height: number } }>) => void
type IOCallback = (entries: Array<{ isIntersecting: boolean }>) => void

export class FakeResizeObserver {
  static instances: FakeResizeObserver[] = []
  cb: ROCallback
  observed: Element | null = null
  disconnected = false
  constructor(cb: ROCallback) {
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
  fire(width: number, height: number): void {
    this.cb([{ contentRect: { width, height } }])
  }
}

export class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = []
  cb: IOCallback
  observed: Element | null = null
  disconnected = false
  constructor(cb: IOCallback) {
    this.cb = cb
    FakeIntersectionObserver.instances.push(this)
  }
  observe(el: Element): void {
    this.observed = el
  }
  disconnect(): void {
    this.disconnected = true
  }
  unobserve(): void {}
  fire(isIntersecting: boolean): void {
    this.cb([{ isIntersecting }])
  }
}

/** A recording stand-in for `CanvasRenderingContext2D`. Only the surface the
 * three composables actually touch is implemented; `ops` is an ordered log so
 * a test can assert WHAT was drawn, not merely that something was. */
export interface FakeContext2D {
  ops: string[]
  texts: string[]
  arcs: Array<{ x: number; y: number; r: number }>
  alphas: number[]
  transforms: number[][]
  globalAlpha: number
  fillStyle: string
  font: string
  textAlign: string
  textBaseline: string
  clearRect: (x: number, y: number, w: number, h: number) => void
  beginPath: () => void
  arc: (x: number, y: number, r: number, a: number, b: number) => void
  fill: () => void
  fillText: (text: string, x: number, y: number) => void
  setTransform: (a: number, b: number, c: number, d: number, e: number, f: number) => void
}

function createFakeContext(): FakeContext2D {
  const ctx: FakeContext2D = {
    ops: [],
    texts: [],
    arcs: [],
    alphas: [],
    transforms: [],
    globalAlpha: 1,
    fillStyle: '',
    font: '',
    textAlign: '',
    textBaseline: '',
    clearRect: () => {
      ctx.ops.push('clearRect')
    },
    beginPath: () => {
      ctx.ops.push('beginPath')
    },
    arc: (x, y, r) => {
      ctx.ops.push('arc')
      ctx.arcs.push({ x, y, r })
    },
    fill: () => {
      ctx.ops.push('fill')
      ctx.alphas.push(ctx.globalAlpha)
    },
    fillText: (text) => {
      ctx.ops.push('fillText')
      ctx.texts.push(text)
      ctx.alphas.push(ctx.globalAlpha)
    },
    setTransform: (a, b, c, d, e, f) => {
      ctx.ops.push('setTransform')
      ctx.transforms.push([a, b, c, d, e, f])
    },
  }
  return ctx
}

export interface CanvasHarness {
  /** Every context handed out by the patched `getContext`, in creation order. */
  contexts: FakeContext2D[]
  /** The `ResizeObserver` watching the host (there is exactly one per surface). */
  resize: () => FakeResizeObserver
  /** The `IntersectionObserver` watching the host. */
  intersect: () => FakeIntersectionObserver
  /** Drive the host to `width` x `height` CSS px AND scroll it into view —
   * the two events every surface needs before it will paint. */
  show: (width: number, height: number) => void
}

/**
 * Install the fakes. Call from `beforeEach`; pair with
 * {@link uninstallCanvasEnv} in `afterEach`.
 */
export function installCanvasEnv(): CanvasHarness {
  FakeResizeObserver.instances = []
  FakeIntersectionObserver.instances = []
  const contexts: FakeContext2D[] = []

  vi.stubGlobal('ResizeObserver', FakeResizeObserver)
  vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver)
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(((type: string) => {
    if (type !== '2d') return null
    const ctx = createFakeContext()
    contexts.push(ctx)
    return ctx as unknown as CanvasRenderingContext2D
  }) as typeof HTMLCanvasElement.prototype.getContext)

  const resize = (): FakeResizeObserver => {
    const observer = FakeResizeObserver.instances[0]
    if (observer === undefined) throw new Error('no ResizeObserver was registered')
    return observer
  }
  const intersect = (): FakeIntersectionObserver => {
    const observer = FakeIntersectionObserver.instances[0]
    if (observer === undefined) throw new Error('no IntersectionObserver was registered')
    return observer
  }

  return {
    contexts,
    resize,
    intersect,
    show: (width, height) => {
      intersect().fire(true)
      resize().fire(width, height)
    },
  }
}

export function uninstallCanvasEnv(): void {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
}

/** A host element already in the document, positioned as the composables'
 * doc requires. */
export function createHost(): HTMLDivElement {
  const host = document.createElement('div')
  host.style.position = 'relative'
  document.body.appendChild(host)
  return host
}

/** Deterministic `[0, 1)` source — a plain LCG, so a seeded field is
 * byte-identical across runs and a test can assert exact coordinates. */
export function seededRandom(seed = 1): () => number {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 0x100000000
  }
}
