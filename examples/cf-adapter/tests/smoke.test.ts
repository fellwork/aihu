/**
 * EX-10 cf-adapter smoke test.
 *
 * Verifies (per m2-a2 round-6 brief):
 *   A6-1: cf-adapter-demo.aihu contains `@agent`
 *   A6-2: cf-adapter-demo.aihu contains `$expose`
 *   A6-3: cf-adapter-demo.aihu contains `workerName`
 *   A6-4: cf-adapter-demo.aihu contains `@media (max-width: 480px)`
 *   A6-5: aihu.config.ts contains `cloudflare(`
 *   A6-6: aihu.config.ts contains `cf-adapter-demo`
 *   A6-7: wrangler.toml contains `name = "cf-adapter-demo"`
 *   A6-8: registerAgentMetadata() can be called without throwing
 *          (registry simulation — same pattern as EX-06 weather-card,
 *           EX-09 blog-loader, EX-12 realtime-scores, EX-07 agent-hub)
 *
 * Harness: source-text + registry simulation. DOM-mount assertions deferred to M4
 * per arch-2 §6. No network calls. Offline-safe.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { getAllAgentMetadata, registerAgentMetadata } from '@aihu/agent'
import { beforeEach, describe, expect, it } from 'vitest'

// @ts-expect-error — internal test reset not on public types
import { __resetRegistryForTesting } from '../../../packages/agent/src/registry.ts'

const SFC_PATH = resolve(__dirname, '../src/cf-adapter-demo.aihu')
const CONFIG_PATH = resolve(__dirname, '../aihu.config.ts')
const WRANGLER_PATH = resolve(__dirname, '../wrangler.toml')

// ---------------------------------------------------------------------------
// Source-text checks — A6-1 through A6-4 (SFC)
// ---------------------------------------------------------------------------

describe('EX-10 cf-adapter — SFC source-text checks', () => {
  const sfcSrc = readFileSync(SFC_PATH, 'utf8')

  it('A6-1: SFC source contains @agent block', () => {
    expect(sfcSrc).toContain('@agent')
  })

  it('A6-2: SFC source contains $expose', () => {
    expect(sfcSrc).toContain('$expose')
  })

  it('A6-3: SFC source contains workerName', () => {
    expect(sfcSrc).toContain('workerName')
  })

  it('A6-4: SFC source contains @media (max-width: 480px)', () => {
    expect(sfcSrc).toContain('@media (max-width: 480px)')
  })
})

// ---------------------------------------------------------------------------
// Source-text checks — A6-5 through A6-6 (aihu.config.ts)
// ---------------------------------------------------------------------------

describe('EX-10 cf-adapter — aihu.config.ts source-text checks', () => {
  const configSrc = readFileSync(CONFIG_PATH, 'utf8')

  it('A6-5: aihu.config.ts contains cloudflare(', () => {
    expect(configSrc).toContain('cloudflare(')
  })

  it('A6-6: aihu.config.ts contains cf-adapter-demo', () => {
    expect(configSrc).toContain('cf-adapter-demo')
  })
})

// ---------------------------------------------------------------------------
// Source-text check — A6-7 (wrangler.toml)
// ---------------------------------------------------------------------------

describe('EX-10 cf-adapter — wrangler.toml source-text checks', () => {
  const wranglerSrc = readFileSync(WRANGLER_PATH, 'utf8')

  it('A6-7: wrangler.toml contains name = "cf-adapter-demo"', () => {
    expect(wranglerSrc).toContain('name = "cf-adapter-demo"')
  })
})

// ---------------------------------------------------------------------------
// A6-8: Registry simulation — registerAgentMetadata() does not throw
// ---------------------------------------------------------------------------

describe('EX-10 cf-adapter — agent metadata registry', () => {
  beforeEach(() => {
    __resetRegistryForTesting()
  })

  it('A6-8: registers cf-adapter-demo agent metadata without throwing', () => {
    expect(() => {
      registerAgentMetadata({
        tag: 'cf-adapter-demo',
        describes: 'EX-10: Cloudflare Workers adapter demo',
        state: {
          workerName: 'Cloudflare Worker name used in wrangler.toml and adapter config',
          deployMode:
            'Deployment target: "workers" (Cloudflare Workers) or "pages" (Cloudflare Pages)',
        },
        actions: {
          getConfig: { returns: {} },
        },
      })
    }).not.toThrow()

    const entries = getAllAgentMetadata()
    expect(entries).toHaveLength(1)
    expect(entries[0].tag).toBe('cf-adapter-demo')
    expect(entries[0].state?.workerName).toBeDefined()
    expect(entries[0].state?.deployMode).toBeDefined()
    expect(entries[0].actions?.getConfig).toBeDefined()
  })
})
