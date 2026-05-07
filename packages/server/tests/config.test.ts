import { describe, expect, it } from 'vitest'
import { defineAihuConfig } from '../src/index.ts'

describe('@aihu/server config', () => {
  it('AihuConfig accepts all valid origin shapes', () => {
    const a = defineAihuConfig({ server: { cors: { origin: 'https://example.com' } } })
    const b = defineAihuConfig({
      server: { cors: { origin: ['https://a.com', 'https://b.com'] } },
    })
    const c = defineAihuConfig({ server: { cors: { origin: '*' } } })
    expect(a.server?.cors?.origin).toBe('https://example.com')
    expect(Array.isArray(b.server?.cors?.origin)).toBe(true)
    expect(c.server?.cors?.origin).toBe('*')
  })

  it('ServerConfig fields are all optional', () => {
    const cfg = defineAihuConfig({ server: {} })
    expect(cfg.server?.maxBodySize).toBeUndefined()
    expect(cfg.server?.basePath).toBeUndefined()
  })

  it('AihuConfig.agent round-trips AgentReadinessConfig', () => {
    const cfg = defineAihuConfig({
      agent: { name: 'Test App', version: '1.0.0', endpoint: 'https://test.example.com/mcp' },
    })
    expect(cfg.agent?.name).toBe('Test App')
    expect(cfg.agent?.endpoint).toBe('https://test.example.com/mcp')
  })
})

describe('defineAihuConfig — rendering defaults', () => {
  it('defaults to SSR mode when no rendering field is provided', () => {
    const cfg = defineAihuConfig({})
    expect(cfg.rendering?.mode).toBe('ssr')
  })

  it('defaults hydratable to true when no rendering field is provided', () => {
    const cfg = defineAihuConfig({})
    expect(cfg.rendering?.hydratable).toBe(true)
  })

  it('SSR default applies even when other top-level fields are set', () => {
    const cfg = defineAihuConfig({ server: { cors: { origin: '*' } } })
    expect(cfg.rendering?.mode).toBe('ssr')
    expect(cfg.rendering?.hydratable).toBe(true)
  })

  it('user can override mode to spa', () => {
    const cfg = defineAihuConfig({ rendering: { mode: 'spa' } })
    expect(cfg.rendering?.mode).toBe('spa')
  })

  it('spa mode still inherits hydratable default (true)', () => {
    const cfg = defineAihuConfig({ rendering: { mode: 'spa' } })
    expect(cfg.rendering?.hydratable).toBe(true)
  })

  it('user can override mode to hybrid', () => {
    const cfg = defineAihuConfig({ rendering: { mode: 'hybrid' } })
    expect(cfg.rendering?.mode).toBe('hybrid')
    expect(cfg.rendering?.hydratable).toBe(true)
  })

  it('user can disable hydratable in ssr mode', () => {
    const cfg = defineAihuConfig({ rendering: { mode: 'ssr', hydratable: false } })
    expect(cfg.rendering?.mode).toBe('ssr')
    expect(cfg.rendering?.hydratable).toBe(false)
  })

  it('partial override: only mode, hydratable stays true', () => {
    const cfg = defineAihuConfig({ rendering: { mode: 'hybrid' } })
    expect(cfg.rendering?.mode).toBe('hybrid')
    expect(cfg.rendering?.hydratable).toBe(true)
  })

  it('partial override: only hydratable, mode stays ssr', () => {
    const cfg = defineAihuConfig({ rendering: { hydratable: false } })
    expect(cfg.rendering?.mode).toBe('ssr')
    expect(cfg.rendering?.hydratable).toBe(false)
  })

  it('full explicit ssr config round-trips correctly', () => {
    const cfg = defineAihuConfig({ rendering: { mode: 'ssr', hydratable: true } })
    expect(cfg.rendering?.mode).toBe('ssr')
    expect(cfg.rendering?.hydratable).toBe(true)
  })
})
