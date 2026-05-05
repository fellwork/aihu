import { describe, expect, it } from 'vitest'
import { defineAihuConfig } from '../src/index.ts'

describe('@aihu/server config', () => {
  it('defineAihuConfig returns the config object unchanged', () => {
    const cfg = { server: { cors: { origin: '*' as const } } }
    expect(defineAihuConfig(cfg)).toBe(cfg)
  })

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
