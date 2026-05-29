/**
 * EX-09 blog-loader smoke test.
 *
 * Verifies (per m2-a2 round-2 brief):
 *   A5-1: registerAgentMetadata() for blog-loader-post runs without throw
 *   A5-2: [slug].aihu source contains `@aihu/context` import
 *   A5-3: [slug].aihu source contains `@agent` block
 *   A5-4: [slug].aihu source contains `getPost` in agent expose surface
 *   A5-5: [slug].aihu source contains `listPosts` in agent expose surface
 *   A5-6: [slug].loader.ts source contains `@aihu/context/ssr` import
 *   A5-7: [slug].loader.ts source contains `ReadingContext` type/interface
 *   A5-8: [slug].loader.ts source still contains `export const loader`
 *         (regression guard — defineLoader must not be removed or renamed)
 *
 * Harness: source-text + registry simulation (same pattern as EX-06 weather-card
 * round-1). DOM-mount assertions deferred to M4 per arch-2 §6 and the
 * Director's Part-4 decision in round-1.5.
 *
 * Offline-safe: no network calls. All assertions are against file content
 * or in-memory registry state.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { getAllAgentMetadata, registerAgentMetadata } from '@aihu/agent'
import { beforeEach, describe, expect, it } from 'vitest'

// @ts-expect-error — internal test reset not on public types
import { __resetRegistryForTesting } from '../../../packages/agent/src/registry.ts'

const SLUG_AIHU_PATH = resolve(__dirname, '../src/pages/posts/[slug].aihu')
const SLUG_LOADER_PATH = resolve(__dirname, '../src/pages/posts/[slug].loader.ts')

// ---------------------------------------------------------------------------
// A5-1: registerAgentMetadata() for blog-loader-post runs without throw
// ---------------------------------------------------------------------------

describe('EX-09 blog-loader — agent metadata registry', () => {
  beforeEach(() => {
    __resetRegistryForTesting()
  })

  it('A5-1: registers blog-loader-post agent metadata without throwing', () => {
    expect(() => {
      registerAgentMetadata({
        tag: 'blog-loader-post',
        describes:
          'Server-rendered blog post page with defineLoader, @aihu/context demo, and @agent block',
        state: {
          getPost: 'Current post: title, body, readingTimeMs sourced from route.data',
          listPosts: 'Known post slugs: hello, meta, agents',
        },
      })
    }).not.toThrow()

    const entries = getAllAgentMetadata()
    expect(entries).toHaveLength(1)
    expect(entries[0].tag).toBe('blog-loader-post')
  })
})

// ---------------------------------------------------------------------------
// A5-2 through A5-5: [slug].aihu source-text assertions
// ---------------------------------------------------------------------------

describe('EX-09 blog-loader — [slug].aihu source-text checks', () => {
  const sfcSrc = readFileSync(SLUG_AIHU_PATH, 'utf8')

  it('A5-2: [slug].aihu contains @aihu/context import (context demo is wired)', () => {
    expect(sfcSrc).toContain('@aihu/context')
  })

  it('A5-3: [slug].aihu contains @agent block', () => {
    expect(sfcSrc).toContain('@agent')
  })

  it('A5-4: [slug].aihu exposes getPost in agent surface', () => {
    expect(sfcSrc).toContain('getPost')
  })

  it('A5-5: [slug].aihu exposes listPosts in agent surface', () => {
    expect(sfcSrc).toContain('listPosts')
  })
})

// ---------------------------------------------------------------------------
// A5-6 through A5-8: [slug].loader.ts source-text assertions
// ---------------------------------------------------------------------------

describe('EX-09 blog-loader — [slug].loader.ts source-text checks', () => {
  const loaderSrc = readFileSync(SLUG_LOADER_PATH, 'utf8')

  it('A5-6: loader contains @aihu/context/ssr import (server-side context provision)', () => {
    expect(loaderSrc).toContain('@aihu/context/ssr')
  })

  it('A5-7: loader contains ReadingContext type/interface', () => {
    expect(loaderSrc).toContain('ReadingContext')
  })

  it('A5-8: loader still exports const loader (defineLoader regression guard)', () => {
    expect(loaderSrc).toContain('export const loader')
  })
})
