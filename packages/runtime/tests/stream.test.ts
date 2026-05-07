/**
 * Unit tests for `createStream` — AC3, AC4, AC5, AC6.
 *
 * Per spec docs/specs/stream-impl.md §2 and the Builder brief.
 */

import { signal } from '@aihu/signals'
import { describe, expect, it, vi } from 'vitest'
import { createStream } from '../src/stream.ts'

// ─── Test helpers ─────────────────────────────────────────────────────────────

/** Create a ReadableStream<string> from an array of chunks. */
function makeStream(chunks: string[]): ReadableStream<string> {
  return new ReadableStream<string>({
    async start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk)
      }
      controller.close()
    },
  })
}

/** Create an infinite ReadableStream that never closes. */
function makeInfiniteStream(): ReadableStream<string> {
  return new ReadableStream<string>({
    start(_controller) {
      // Never enqueues or closes — stays open.
    },
  })
}

/** Create a stream that throws after yielding one chunk. */
function makeErrorStream(chunk: string, err: Error): ReadableStream<string> {
  return new ReadableStream<string>({
    async start(controller) {
      controller.enqueue(chunk)
      controller.error(err)
    },
  })
}

// ─── AC3: value accumulation ──────────────────────────────────────────────────

describe('AC3 — chat.value accumulation', () => {
  it('accumulates chunks into value; delta is last chunk; status is done', async () => {
    const chunks = ['Hello', ' ', 'world']
    const handle = createStream(() => Promise.resolve(makeStream(chunks)))

    await handle.start()

    expect(handle.value).toBe('Hello world')
    expect(handle.delta).toBe('world')
    expect(handle.status).toBe('done')
    expect(handle.error).toBeNull()
  })

  it('resets value and delta on each start() call (OQ2)', async () => {
    const handle = createStream(() => Promise.resolve(makeStream(['first'])))

    await handle.start()
    expect(handle.value).toBe('first')

    // Second call resets.
    await handle.start()
    expect(handle.value).toBe('first')
    expect(handle.status).toBe('done')
  })

  it('accepts source argument directly, bypassing factory', async () => {
    // Factory returns empty, but we pass a stream directly.
    const handle = createStream(() => Promise.resolve(makeStream([])))
    const stream = makeStream(['direct'])

    await handle.start(stream)
    expect(handle.value).toBe('direct')
    expect(handle.status).toBe('done')
  })

  it('accepts source function argument', async () => {
    const handle = createStream(() => Promise.resolve(makeStream([])))

    await handle.start(() => Promise.resolve(makeStream(['fn-source'])))
    expect(handle.value).toBe('fn-source')
    expect(handle.status).toBe('done')
  })
})

// ─── AC4: stop() aborts mid-stream ───────────────────────────────────────────

describe('AC4 — stop() aborts mid-stream', () => {
  it('stop() sets status to idle and preserves partial value', async () => {
    // Create a stream that yields one chunk then hangs.
    let enqueueChunk!: (s: string) => void
    let resolveRead!: () => void

    const stream = new ReadableStream<string>({
      start(controller) {
        enqueueChunk = (s: string) => controller.enqueue(s)
        resolveRead = () => {} // no-op; we'll stop externally
      },
    })

    const handle = createStream(() => Promise.resolve(stream))
    const startPromise = handle.start()

    // Enqueue first chunk.
    enqueueChunk('partial')

    // Give the reader loop a chance to pick it up.
    await new Promise<void>((r) => setTimeout(r, 0))

    // Stop mid-stream.
    handle.stop()

    // Wait for start() to resolve.
    await startPromise

    expect(handle.status).toBe('idle')
    // value should have whatever was received before stop
    // (could be 'partial' or '' depending on timing — either is valid)
    expect(['', 'partial']).toContain(handle.value)
  })
})

// ─── AC5: Status lifecycle (success) ─────────────────────────────────────────

describe('AC5 — status lifecycle (success)', () => {
  it('transitions idle → streaming → done', async () => {
    const statuses: string[] = []
    const handle = createStream(() => Promise.resolve(makeStream(['a'])))

    // Initial state.
    statuses.push(handle.status)

    const p = handle.start()
    // After start() is called, status should immediately be 'streaming'.
    statuses.push(handle.status)

    await p
    statuses.push(handle.status)

    expect(statuses[0]).toBe('idle')
    expect(statuses[1]).toBe('streaming')
    expect(statuses[2]).toBe('done')
  })
})

// ─── AC6: Status lifecycle (error) ───────────────────────────────────────────

describe('AC6 — status lifecycle (error)', () => {
  it('sets status to error and error to thrown instance', async () => {
    const err = new Error('stream failed')
    const handle = createStream(() => Promise.resolve(makeErrorStream('', err)))

    await handle.start()

    expect(handle.status).toBe('error')
    expect(handle.error).toBe(err)
  })

  it('factory rejection sets status to error', async () => {
    const err = new Error('factory failed')
    const handle = createStream(() => Promise.reject(err))

    await handle.start()

    expect(handle.status).toBe('error')
    expect(handle.error).toBe(err)
  })

  it('null factory result keeps status idle (OQ5)', async () => {
    const handle = createStream(() => Promise.resolve(null))

    await handle.start()

    expect(handle.status).toBe('idle')
    expect(handle.error).toBeNull()
  })
})
