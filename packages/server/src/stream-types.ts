import type { SsrOptions } from './ssr.ts'

/**
 * Describes an async data boundary that renderToStream can suspend on.
 * Track B's createResource will implement this interface.
 * Defined here to allow Track C to build and test independently.
 */
export interface DataSource<T> {
  /** Current resolution state. */
  readonly status: 'pending' | 'ready' | 'error'

  /** The resolved value. Defined only when status === 'ready'. */
  readonly value?: T

  /** The rejection reason. Defined only when status === 'error'. */
  readonly error?: unknown

  /**
   * Register a callback to be invoked exactly once when status transitions
   * to 'ready' or 'error'. Returns a dispose function that cancels the
   * registration if called before the transition fires.
   */
  onReady(cb: () => void): () => void
}

/**
 * Options for renderToStream. Extends SsrOptions with streaming-specific fields.
 *
 * v1: no new fields beyond SsrOptions. timeout is explicitly excluded from v1
 * because renderToStream does not implement per-boundary timeouts; callers that
 * need a timeout must race the returned ReadableStream externally (e.g., via
 * AbortController + Response). This is documented as a v2 concern.
 */
export interface StreamOptions extends SsrOptions {}
