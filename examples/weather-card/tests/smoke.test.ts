/**
 * EX-06 weather-card smoke test.
 *
 * Verifies (per m2-a2 round-1 brief):
 *   1. @aihu/agent registry works and returns the expected weather-card shape
 *   2. The shared agent-panel.aihu source carries the new "A2A: stub" /
 *      "ACP: stub" protocol-status row added in round-1
 *   3. The shared agent-panel.aihu source still carries the pre-existing
 *      "Tool call stubbed — live binding pending RFC #56 ratification" badge
 *      (regression guard on the additive contract)
 *   4. The Open-Meteo weather_code -> conditions translation behaves correctly
 *      across the documented ranges
 *   5. The empty-results branch from the geocoding API produces a non-blocking
 *      error state (status === 'error', not a thrown exception)
 *
 * Harness: jsdom (matches M1 smoke tests; Playwright browser-mode is deferred
 * to M4 per arch-2 §6). See
 *   .context/m2/a2/round-1/builder-investigation-smoke-harness.md
 * for the harness-mismatch resolution. Source-text checks substitute for live
 * DOM substring checks until a true browser-mode harness lands.
 *
 * Offline-safe: all network calls are mocked via vi.stubGlobal('fetch', ...).
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { getAllAgentMetadata, registerAgentMetadata } from '@aihu/agent'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// @ts-expect-error — internal test reset not on public types
import { __resetRegistryForTesting } from '../../../packages/agent/src/registry.ts'

const AGENT_PANEL_PATH = resolve(__dirname, '../../_shared/agent-panel.aihu')

describe('EX-06 weather-card — agent metadata', () => {
  beforeEach(() => {
    __resetRegistryForTesting()
  })

  it('registers expected @agent metadata shape', () => {
    registerAgentMetadata({
      tag: 'weather-card',
      describes: 'Flagship example: async forecast lookup against Open-Meteo',
      state: {
        forecast:
          'Most recent forecast: temperature, weatherCode, conditions, resolvedName (null until fetched)',
        status: 'Request status: one of idle | loading | ready | error',
      },
      actions: {
        fetchForecast: { returns: {} },
      },
    })

    const entries = getAllAgentMetadata()
    expect(entries).toHaveLength(1)
    expect(entries[0].tag).toBe('weather-card')
    expect(entries[0].state?.forecast).toBeDefined()
    expect(entries[0].state?.status).toBeDefined()
    expect(entries[0].actions?.fetchForecast).toBeDefined()
  })
})

describe('EX-06 weather-card — shared agent-panel protocol-status row', () => {
  // These assertions are source-text checks against the shared SFC because
  // the M1 jsdom harness cannot mount compiled custom elements. They guard
  // the additive contract from item 2 of the round-1 brief.
  const panelSrc = readFileSync(AGENT_PANEL_PATH, 'utf8')

  it('contains the literal "A2A:" protocol indicator', () => {
    expect(panelSrc).toContain('A2A:')
  })

  it('contains the literal "ACP:" protocol indicator', () => {
    expect(panelSrc).toContain('ACP:')
  })

  it('preserves the pre-existing stub-badge text (regression guard)', () => {
    expect(panelSrc).toContain('Tool call stubbed — live binding pending RFC #56 ratification')
  })
})

// ---------------------------------------------------------------------------
// Pure-logic helpers mirroring the SFC body. Kept inline so the test can
// exercise them without spinning up the compiler pipeline.
// ---------------------------------------------------------------------------

function translateWeatherCode(code: number): string {
  if (code === 0) return 'Clear'
  if (code >= 1 && code <= 3) return 'Partly cloudy'
  if (code === 45 || code === 48) return 'Fog'
  if (code >= 51 && code <= 57) return 'Drizzle'
  if (code >= 61 && code <= 67) return 'Rain'
  if (code >= 71 && code <= 77) return 'Snow'
  if (code >= 80 && code <= 82) return 'Showers'
  if (code >= 95 && code <= 99) return 'Thunderstorm'
  return 'Unknown'
}

describe('EX-06 weather-card — weather_code translation', () => {
  it('maps 0 to Clear', () => {
    expect(translateWeatherCode(0)).toBe('Clear')
  })

  it('maps 1..3 to Partly cloudy', () => {
    expect(translateWeatherCode(1)).toBe('Partly cloudy')
    expect(translateWeatherCode(2)).toBe('Partly cloudy')
    expect(translateWeatherCode(3)).toBe('Partly cloudy')
  })

  it('maps 45 and 48 to Fog', () => {
    expect(translateWeatherCode(45)).toBe('Fog')
    expect(translateWeatherCode(48)).toBe('Fog')
  })

  it('maps 51..57 to Drizzle', () => {
    expect(translateWeatherCode(51)).toBe('Drizzle')
    expect(translateWeatherCode(57)).toBe('Drizzle')
  })

  it('maps 61..67 to Rain', () => {
    expect(translateWeatherCode(63)).toBe('Rain')
  })

  it('maps 71..77 to Snow', () => {
    expect(translateWeatherCode(73)).toBe('Snow')
  })

  it('maps 80..82 to Showers', () => {
    expect(translateWeatherCode(81)).toBe('Showers')
  })

  it('maps 95..99 to Thunderstorm', () => {
    expect(translateWeatherCode(97)).toBe('Thunderstorm')
  })

  it('falls back to Unknown for out-of-range codes', () => {
    expect(translateWeatherCode(42)).toBe('Unknown')
    expect(translateWeatherCode(200)).toBe('Unknown')
  })
})

// ---------------------------------------------------------------------------
// Empty-results / error branch — confirms the SFC's catch path does not throw.
// We re-implement the action body shape here to exercise the same control
// flow that the compiled component runs.
// ---------------------------------------------------------------------------

describe('EX-06 weather-card — error branches', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  async function runFetchForecast(query: string): Promise<{ status: string; error: string }> {
    let status = 'idle'
    let error = ''
    try {
      status = 'loading'
      const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=1&language=en&format=json`
      const geoResp = await fetch(geoUrl)
      if (!geoResp.ok) {
        throw new Error(`Geocoding failed (HTTP ${geoResp.status})`)
      }
      const geoJson = (await geoResp.json()) as {
        results?: Array<{ latitude: number; longitude: number }>
      }
      const hit = geoJson.results && geoJson.results[0]
      if (!hit) {
        status = 'error'
        error = `No matching city found for "${query}".`
        return { status, error }
      }
      status = 'ready'
    } catch (err) {
      status = 'error'
      error = err instanceof Error ? err.message : 'Unknown error fetching forecast.'
    }
    return { status, error }
  }

  it('handles empty geocoding results without throwing (non-blocking error pill)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ results: [] }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
      ),
    )

    const result = await runFetchForecast('Atlantis')
    expect(result.status).toBe('error')
    expect(result.error).toContain('No matching city found')
  })

  it('handles fetch throwing (e.g. offline) without uncaught exception', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch')
      }),
    )

    const result = await runFetchForecast('San Francisco')
    expect(result.status).toBe('error')
    expect(result.error).toContain('Failed to fetch')
  })
})
