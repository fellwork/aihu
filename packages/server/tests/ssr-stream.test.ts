import { describe, expect, it } from 'vitest'
import { renderToStream } from '../src/ssr.ts'
import type { DataSource } from '../src/stream-types.ts'

// ---------------------------------------------------------------------------
// Helper: drain a ReadableStream<string> to a single concatenated string
// ---------------------------------------------------------------------------
async function drain(stream: ReadableStream<string>): Promise<string> {
  const chunks: string[] = []
  const reader = stream.getReader()
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  return chunks.join('')
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('@aihu/server renderToStream', () => {
  it('synchronous { toHtml() } component yields full output', async () => {
    const stream = renderToStream({ toHtml: () => '<p>Hello</p>' }, { head: { title: 'Test' } })
    const result = await drain(stream)
    expect(result).toMatch(/^<!DOCTYPE html>/)
    expect(result).toContain('<title>Test</title>')
    expect(result).toContain('<p>Hello</p>')
    expect(result).toContain('</body></html>')
  })

  it("branch with status:'ready' DataSource streams without suspension", async () => {
    const readySource: DataSource<string> = {
      status: 'ready',
      value: 'resolved content',
      error: undefined,
      onReady: () => () => {},
    }
    const stream = renderToStream(() => ({
      kind: 'branch',
      tag: 'div',
      attrs: {},
      children: [{ kind: 'leaf', leafKind: 'text', value: 'inner text' }],
      dataSource: readySource,
    }))
    const result = await drain(stream)
    expect(result).toContain('<div')
    expect(result).not.toContain('pending')
    expect(result).toContain('inner text')
  })

  it('pending DataSource: pre-boundary HTML arrives before resolution, post-boundary HTML arrives after', async () => {
    let resolve!: () => void
    const source: DataSource<null> = {
      status: 'pending' as 'pending' | 'ready' | 'error',
      value: undefined,
      error: undefined,
      onReady(cb) {
        resolve = () => {
          ;(source as unknown as Record<string, unknown>).status = 'ready'
          cb()
        }
        return () => {}
      },
    }

    const stream = renderToStream(
      () => ({
        kind: 'branch',
        tag: 'div',
        attrs: {},
        children: [{ kind: 'leaf', leafKind: 'text', value: 'async content' }],
        dataSource: source,
      }),
      { head: { title: 'Async' } },
    )

    // Collect chunks as they arrive — capture order rather than draining all at once
    const chunks: string[] = []
    const reader = stream.getReader()

    // Read first chunk (preamble — emitted synchronously before the async boundary)
    const first = await reader.read()
    if (first.value) chunks.push(first.value)

    // Now resolve the pending source
    resolve()

    // Drain the rest
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (value) chunks.push(value)
    }
    reader.releaseLock()

    expect(chunks[0]).toContain('<!DOCTYPE html>') // preamble arrived first
    expect(chunks.join('')).toContain('async content') // resolved content present
    expect(chunks.join('')).toContain('</body></html>') // document closed
  })

  it('component factory that throws causes stream error, not unhandled rejection', async () => {
    const stream = renderToStream(() => {
      throw new Error('factory exploded')
    })
    const reader = stream.getReader()
    await expect(reader.read()).rejects.toThrow('factory exploded')
    reader.releaseLock()
  })

  it('opts.head produces <!DOCTYPE html>, <html>, <head>, <body> in correct order', async () => {
    const result = await drain(
      renderToStream(
        { toHtml: () => '<main>content</main>' },
        {
          head: {
            title: 'Full Doc',
            lang: 'en',
            meta: [{ name: 'viewport', content: 'width=device-width' }],
            links: [{ rel: 'stylesheet', href: '/app.css' }],
          },
        },
      ),
    )
    expect(result).toMatch(/^<!DOCTYPE html><html lang="en">/)
    const headStart = result.indexOf('<head>')
    const headEnd = result.indexOf('</head>')
    const bodyStart = result.indexOf('<body>')
    expect(headStart).toBeLessThan(headEnd)
    expect(headEnd).toBeLessThan(bodyStart)
    expect(result.slice(headStart, headEnd)).toContain('<title>Full Doc</title>')
    expect(result.slice(headStart, headEnd)).toContain('name="viewport"')
    expect(result.slice(headStart, headEnd)).toContain('rel="stylesheet"')
    expect(result).toMatch(/<\/body><\/html>$/)
  })

  it('opts.hydratable: true emits data-aihu-path on branch nodes', async () => {
    const result = await drain(
      renderToStream(
        () => ({
          kind: 'branch',
          tag: 'section',
          attrs: {},
          children: [
            {
              kind: 'branch',
              tag: 'p',
              attrs: {},
              children: [{ kind: 'leaf', leafKind: 'text', value: 'hi' }],
            },
          ],
        }),
        { hydratable: true },
      ),
    )
    expect(result).toContain('data-aihu-path="0"')
    expect(result).toContain('data-aihu-path="0.0"')
  })

  // Same text-leaf coalescing guard as the sync renderer, on the streaming path.
  it('opts.hydratable: true inserts a boundary comment between adjacent text leaves', async () => {
    const result = await drain(
      renderToStream(
        () => ({
          kind: 'branch',
          tag: 'p',
          attrs: {},
          children: [
            { kind: 'leaf', leafKind: 'text', value: 'a' },
            { kind: 'leaf', leafKind: 'text', value: 'b' },
          ],
        }),
        { hydratable: true },
      ),
    )
    expect(result).toContain('a<!--|-->b')
  })
})
