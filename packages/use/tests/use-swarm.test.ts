/**
 * Unit tests for `useSwarm` (effect-scope plan §5): default (pre-frame)
 * state, `onmessage`/`onerror` reactivity, `close()` teardown, and the
 * SSR-static path (no `EventSource` constructed at all). jsdom environment
 * (root vitest config) — jsdom itself has no `EventSource`, so every test
 * here supplies a minimal spy/mock via `vi.stubGlobal('EventSource', ...)`.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useSwarm } from '../src/useSwarm/index.ts'
import { withSSR } from './_ssr.ts'

type MessageHandler = ((event: { data: string }) => void) | null

/** A minimal `EventSource` stand-in: records the URL it was constructed
 * with, lets a test manually fire `onopen`/`onmessage`/`onerror`, and
 * tracks whether `close()` was called. */
class MockEventSource {
  static instances: MockEventSource[] = []
  url: string
  closed = false
  onopen: (() => void) | null = null
  onmessage: MessageHandler = null
  onerror: ((event: Event) => void) | null = null

  constructor(url: string) {
    this.url = url
    MockEventSource.instances.push(this)
  }

  emitOpen(): void {
    this.onopen?.()
  }

  emitMessage(data: unknown): void {
    this.onmessage?.({ data: JSON.stringify(data) })
  }

  emitRawMessage(data: string): void {
    this.onmessage?.({ data })
  }

  emitError(): void {
    this.onerror?.(new Event('error'))
  }

  close(): void {
    this.closed = true
  }
}

function frame(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    t: 1,
    supervisor_up: true,
    decide: [{ id: 'd1' }],
    orphan: [],
    reviews: [{ id: 'r1' }],
    errors: [],
    agents: [{ name: 'builder-a' }],
    contracts: [{ id: 'c1' }],
    activity: [{ msg: 'hi' }],
    ...overrides,
  }
}

describe('@aihu/use/useSwarm — client path', () => {
  afterEach(() => {
    MockEventSource.instances = []
    vi.unstubAllGlobals()
  })

  it("opens an EventSource against '<url>/stream' and starts disconnected", () => {
    vi.stubGlobal('EventSource', MockEventSource)
    const { connected, close } = useSwarm({ url: 'http://example.test:9' })

    expect(MockEventSource.instances).toHaveLength(1)
    expect(MockEventSource.instances[0]?.url).toBe('http://example.test:9/stream')
    expect(connected()).toBe(false)
    close()
  })

  it('defaults to the documented bus URL when none is given', () => {
    vi.stubGlobal('EventSource', MockEventSource)
    const { close } = useSwarm()
    expect(MockEventSource.instances[0]?.url).toBe('http://127.0.0.1:8791/stream')
    close()
  })

  it('onopen flips connected true', () => {
    vi.stubGlobal('EventSource', MockEventSource)
    const { connected, close } = useSwarm()
    MockEventSource.instances[0]?.emitOpen()
    expect(connected()).toBe(true)
    close()
  })

  it('an onmessage frame updates state/agents/contracts/yourMove and marks connected', () => {
    vi.stubGlobal('EventSource', MockEventSource)
    const { state, agents, contracts, yourMove, connected, close } = useSwarm()

    MockEventSource.instances[0]?.emitMessage(frame())

    expect(connected()).toBe(true)
    expect(state().supervisor_up).toBe(true)
    expect(agents()).toEqual([{ name: 'builder-a' }])
    expect(contracts()).toEqual([{ id: 'c1' }])
    expect(yourMove()).toEqual({
      decide: [{ id: 'd1' }],
      orphan: [],
      reviews: [{ id: 'r1' }],
      errors: [],
    })
    close()
  })

  it('a malformed frame is swallowed: state stays at its previous value', () => {
    vi.stubGlobal('EventSource', MockEventSource)
    const { state, close } = useSwarm()

    MockEventSource.instances[0]?.emitMessage(frame({ t: 5 }))
    expect(state().t).toBe(5)

    MockEventSource.instances[0]?.emitRawMessage('not json{')
    expect(state().t).toBe(5) // unchanged — corrupt frame ignored, not thrown

    close()
  })

  it('onerror sets connected back to false', () => {
    vi.stubGlobal('EventSource', MockEventSource)
    const { connected, close } = useSwarm()

    MockEventSource.instances[0]?.emitMessage(frame())
    expect(connected()).toBe(true)

    MockEventSource.instances[0]?.emitError()
    expect(connected()).toBe(false)

    close()
  })

  it('close() closes the underlying EventSource, sets connected false, and further frames are ignored', () => {
    vi.stubGlobal('EventSource', MockEventSource)
    const { state, connected, close } = useSwarm()
    const source = MockEventSource.instances[0]

    source?.emitMessage(frame({ t: 1 }))
    expect(state().t).toBe(1)

    close()
    expect(source?.closed).toBe(true)
    expect(connected()).toBe(false)

    // A frame arriving after close() (a real EventSource would not deliver
    // one, but the composable's own `stopped` guard must hold regardless).
    source?.emitMessage(frame({ t: 99 }))
    expect(state().t).toBe(1)
    expect(connected()).toBe(false)

    close() // idempotent — must not throw or re-open
  })
})

describe('@aihu/use/useSwarm — SSR-static path (isClient no-op invariant)', () => {
  afterEach(() => {
    MockEventSource.instances = []
    vi.unstubAllGlobals()
  })

  it('constructs NO EventSource and returns the static default, even when EventSource IS globally available', () =>
    withSSR(
      () => {
        // Stub EventSource BEFORE the fresh import so its absence cannot be
        // the reason nothing connects — only the `isClient` gate can be.
        vi.stubGlobal('EventSource', MockEventSource)
        return import('../src/useSwarm/index.ts')
      },
      (mod) => {
        const { state, agents, contracts, yourMove, connected, close } = mod.useSwarm()

        expect(MockEventSource.instances).toHaveLength(0)
        expect(state()).toEqual({
          t: 0,
          supervisor_up: false,
          decide: [],
          orphan: [],
          reviews: [],
          errors: [],
          agents: [],
          contracts: [],
          activity: [],
        })
        expect(agents()).toEqual([])
        expect(contracts()).toEqual([])
        expect(yourMove()).toEqual({ decide: [], orphan: [], reviews: [], errors: [] })
        expect(connected()).toBe(false)
        expect(() => close()).not.toThrow()
        expect(MockEventSource.instances).toHaveLength(0) // close() didn't lazily connect either
      },
    ))

  it('MUST-FAIL-DIRECTION: the identical stub, called with the SSR guard NOT in effect (isClient true), DOES construct an EventSource — proving the guard above is load-bearing, not decorative', async () => {
    // No withSSR here — real jsdom globals are present, so the module's
    // module-level `isClient` (computed at import time) is `true`. This is
    // the exact same MockEventSource stub used in the SSR test above; the
    // only variable that changed is whether the isClient gate is active.
    vi.stubGlobal('EventSource', MockEventSource)
    const { useSwarm: useSwarmClient } = await import('../src/useSwarm/index.ts')

    const { close } = useSwarmClient({ url: 'http://example.test' })

    expect(MockEventSource.instances).toHaveLength(1)
    expect(MockEventSource.instances[0]?.url).toBe('http://example.test/stream')
    close()
  })
})

describe('useSwarm no-op guard — the other two documented triggers', () => {
  afterEach(() => {
    MockEventSource.instances = []
    vi.unstubAllGlobals()
  })

  it('an explicit `window: undefined` forces the no-op path even with a DOM present', () => {
    // Review finding: the original destructuring default made this
    // documented contract unimplementable — explicit undefined fell through
    // to the real window. MUST-FAIL direction: with EventSource available
    // and isClient true, only the explicit-undefined option stops the
    // connection.
    vi.stubGlobal('EventSource', MockEventSource)
    const { state, connected, close } = useSwarm({ window: undefined })
    expect(MockEventSource.instances).toHaveLength(0)
    expect(state().t).toBe(0)
    expect(connected()).toBe(false)
    close()
  })

  it('a DOM without EventSource support takes the no-op path instead of throwing', () => {
    // jsdom ships no EventSource; deliberately do NOT stub one.
    const { state, connected, close } = useSwarm()
    expect(state().t).toBe(0)
    expect(connected()).toBe(false)
    close()
  })
})
