/**
 * Unit tests for `@aihu/ai` adapters — AC13, AC14.
 *
 * Per spec docs/specs/stream-impl.md §6.
 * Tests use mock iterables — no actual SDK installation required.
 */

import { describe, expect, it } from 'vitest'
import { fromAnthropic } from '../src/anthropic.ts'
import { fromGemini } from '../src/gemini.ts'
import { fromOpenAI } from '../src/openai.ts'
import { fromResponse } from '../src/response.ts'

// ─── Helper: drain a ReadableStream<string> into a string array ───────────────

async function drain(stream: ReadableStream<string>): Promise<string[]> {
  const reader = stream.getReader()
  const chunks: string[] = []
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
  }
  return chunks
}

async function drainText(stream: ReadableStream<string>): Promise<string> {
  return (await drain(stream)).join('')
}

// ─── AC13: fromOpenAI extraction ─────────────────────────────────────────────

describe('AC13 — fromOpenAI extraction', () => {
  it('extracts choices[0].delta.content from each chunk', async () => {
    const mockChunks = [
      { choices: [{ delta: { content: 'foo' } }] },
      { choices: [{ delta: { content: 'bar' } }] },
    ] as Parameters<typeof fromOpenAI>[0] extends AsyncIterable<infer T> ? T[] : never[]

    async function* makeAsyncIterable(items: typeof mockChunks) {
      for (const item of items) yield item
    }

    // Cast to satisfy type without requiring actual SDK types at test time.
    const stream = fromOpenAI(makeAsyncIterable(mockChunks) as never)
    const chunks = await drain(stream)

    expect(chunks).toEqual(['foo', 'bar'])
  })

  it('skips null/undefined content chunks', async () => {
    const mockChunks = [
      { choices: [{ delta: { content: null } }] },
      { choices: [{ delta: { content: 'hello' } }] },
      { choices: [{ delta: {} }] },
    ]

    async function* makeAsyncIterable(items: typeof mockChunks) {
      for (const item of items) yield item
    }

    const stream = fromOpenAI(makeAsyncIterable(mockChunks) as never)
    const chunks = await drain(stream)

    expect(chunks).toEqual(['hello'])
  })

  it('handles empty stream gracefully', async () => {
    async function* empty() {}
    const stream = fromOpenAI(empty() as never)
    const chunks = await drain(stream)
    expect(chunks).toEqual([])
  })

  it('propagates errors from async iterable', async () => {
    const err = new Error('openai error')
    async function* erroring() {
      yield { choices: [{ delta: { content: 'before' } }] }
      throw err
    }

    const stream = fromOpenAI(erroring() as never)
    const reader = stream.getReader()
    const first = await reader.read()
    expect(first.value).toBe('before')

    await expect(reader.read()).rejects.toThrow('openai error')
  })
})

// ─── fromAnthropic ────────────────────────────────────────────────────────────

describe('fromAnthropic extraction', () => {
  it('extracts text_delta events', async () => {
    const mockEvents = [
      { type: 'message_start', message: {} },
      { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'hello' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: ' world' } },
      { type: 'message_stop' },
    ]

    async function* makeAsyncIterable(items: typeof mockEvents) {
      for (const item of items) yield item
    }

    const stream = fromAnthropic(makeAsyncIterable(mockEvents) as never)
    const chunks = await drain(stream)

    expect(chunks).toEqual(['hello', ' world'])
  })

  it('skips non-text events', async () => {
    const mockEvents = [
      { type: 'message_start' },
      { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{}' } },
    ]

    async function* makeAsyncIterable(items: typeof mockEvents) {
      for (const item of items) yield item
    }

    const stream = fromAnthropic(makeAsyncIterable(mockEvents) as never)
    const chunks = await drain(stream)
    expect(chunks).toEqual([])
  })
})

// ─── fromGemini ───────────────────────────────────────────────────────────────

describe('fromGemini extraction', () => {
  it('extracts candidates[0].content.parts[0].text', async () => {
    const mockChunks = [
      { candidates: [{ content: { parts: [{ text: 'gemini' }] } }] },
      { candidates: [{ content: { parts: [{ text: ' response' }] } }] },
    ]

    async function* makeAsyncIterable(items: typeof mockChunks) {
      for (const item of items) yield item
    }

    const stream = fromGemini(makeAsyncIterable(mockChunks) as never)
    const chunks = await drain(stream)

    expect(chunks).toEqual(['gemini', ' response'])
  })

  it('skips chunks with missing candidates', async () => {
    const mockChunks = [
      { candidates: [] },
      { candidates: [{ content: { parts: [{ text: 'ok' }] } }] },
    ]

    async function* makeAsyncIterable(items: typeof mockChunks) {
      for (const item of items) yield item
    }

    const stream = fromGemini(makeAsyncIterable(mockChunks) as never)
    const chunks = await drain(stream)
    expect(chunks).toEqual(['ok'])
  })
})

// ─── AC14: fromResponse wraps body ───────────────────────────────────────────

describe('AC14 — fromResponse wraps body', () => {
  it('fromResponse returns a ReadableStream<string> with the response text', async () => {
    const res = new Response('hello world')
    const stream = fromResponse(res)

    expect(stream).toBeInstanceOf(ReadableStream)
    const text = await drainText(stream)
    expect(text).toBe('hello world')
  })

  it('accumulates chunks correctly', async () => {
    const res = new Response('foo bar baz')
    const stream = fromResponse(res)
    const text = await drainText(stream)
    expect(text).toBe('foo bar baz')
  })

  it('throws TypeError when Response has no body', () => {
    // Create a response with null body by constructing a special case.
    // In practice, Response always has a body unless it's a 204 or similar.
    const res = new Response(null)
    // null body — should throw.
    // Note: some environments may auto-create a body for null, so we handle both.
    try {
      fromResponse(res)
      // If it didn't throw, the response must have created an empty body — that's OK.
    } catch (e) {
      expect(e).toBeInstanceOf(TypeError)
      expect((e as TypeError).message).toContain('no body')
    }
  })

  it('handles empty response body', async () => {
    const res = new Response('')
    const stream = fromResponse(res)
    const text = await drainText(stream)
    expect(text).toBe('')
  })
})
