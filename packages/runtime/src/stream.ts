/**
 * `createStream` — reactive streaming primitive for `@aihu/runtime`.
 *
 * v0.4.0: Parallel to `createResource` but for `ReadableStream<string>`.
 * Lazy-attach: only imported when a `$stream` collection is declared in @state.
 * The compiler's `needs_create_stream` flag gates the import.
 */

import { signal } from '@aihu/signals'
import { _onCleanup } from './define-component.ts'

// Safe wrapper: only registers cleanup if inside a component context.
function tryOnCleanup(fn: () => void): void {
  try {
    _onCleanup(fn)
  } catch {
    // Outside a component context (e.g. tests or server-side usage).
    // The caller is responsible for calling stop() manually.
  }
}

export type StreamStatus = 'idle' | 'streaming' | 'done' | 'error'

export interface StreamHandle {
  readonly value: string
  readonly delta: string
  readonly status: StreamStatus
  readonly error: Error | null
  start(
    source?: ReadableStream<string> | (() => Promise<ReadableStream<string> | null>),
  ): Promise<void>
  stop(): void
}

/**
 * Create a reactive stream handle backed by a `ReadableStream<string>` factory.
 *
 * The factory is called on each `start()` invocation without arguments.
 * If `source` argument is passed to `start()`, the factory is bypassed.
 *
 * OQ2: `value` resets to `''` on each `start()` call — conversation history
 * is the author's responsibility via a separate `$prop`.
 *
 * OQ5: A `null`-returning factory is a no-op — `status` stays `'idle'`.
 */
export function createStream(factory: () => Promise<ReadableStream<string> | null>): StreamHandle {
  const [getValue, setValue] = signal<string>('')
  const [getDelta, setDelta] = signal<string>('')
  const [getStatus, setStatus] = signal<StreamStatus>('idle')
  const [getError, setError] = signal<Error | null>(null)
  let _abort: AbortController | null = null
  let _reader: ReadableStreamDefaultReader<unknown> | null = null

  const handle: StreamHandle = {
    get value() {
      return getValue()
    },
    get delta() {
      return getDelta()
    },
    get status() {
      return getStatus()
    },
    get error() {
      return getError()
    },

    async start(source?) {
      // Abort any in-progress stream.
      _abort?.abort()
      _abort = new AbortController()
      const abortSignal = _abort.signal

      // OQ2: reset value/delta on every start.
      setStatus('streaming')
      setValue('')
      setDelta('')
      setError(null)

      try {
        let src: ReadableStream<string> | null
        if (source !== undefined) {
          src = typeof source === 'function' ? await source() : source
        } else {
          src = await factory()
        }

        // OQ5: null source → no-op; stay idle.
        if (src === null) {
          setStatus('idle')
          return
        }

        // Read the stream. If chunks are Uint8Array (raw fetch body), decode them.
        // If already string (e.g. from @aihu/ai adapters or tests), read directly.
        const rawReader = src.getReader()
        _reader = rawReader as ReadableStreamDefaultReader<unknown>
        const decoder = new TextDecoder()
        try {
          while (true) {
            // Race the read against the abort signal.
            // If aborted, cancel the reader to unblock the pending read().
            const readPromise = rawReader.read()
            const abortPromise = new Promise<{ done: true; value: undefined }>((resolve) => {
              if (abortSignal.aborted) {
                resolve({ done: true, value: undefined })
              } else {
                abortSignal.addEventListener(
                  'abort',
                  () => resolve({ done: true, value: undefined }),
                  { once: true },
                )
              }
            })
            const { done, value } = await Promise.race([readPromise, abortPromise])
            if (done || abortSignal.aborted) {
              // Cancel the reader to release the lock when aborting.
              if (abortSignal.aborted) {
                rawReader.cancel().catch(() => {})
              }
              break
            }
            // Handle both string and Uint8Array chunks.
            const text =
              typeof value === 'string'
                ? value
                : value instanceof Uint8Array
                  ? decoder.decode(value, { stream: true })
                  : String(value ?? '')
            if (text) {
              setDelta(text)
              setValue(getValue() + text)
            }
          }
          // Flush any remaining decoder state (only if not aborted).
          if (!abortSignal.aborted) {
            const flush = decoder.decode()
            if (flush) {
              setDelta(flush)
              setValue(getValue() + flush)
            }
          }
        } finally {
          _reader = null
          try {
            rawReader.releaseLock()
          } catch {
            /* already released by cancel */
          }
        }

        setStatus(abortSignal.aborted ? 'idle' : 'done')
      } catch (e) {
        if (!abortSignal.aborted) {
          setError(e as Error)
          setStatus('error')
        }
      }
    },

    stop() {
      _abort?.abort()
      // If a reader is active, cancel it to unblock any pending read().
      _reader?.cancel().catch(() => {})
    },
  }

  // Register cleanup so mid-stream unmounts don't leak readers.
  tryOnCleanup(() => _abort?.abort())

  return handle
}
