import { describe, expect, it } from 'vitest'
import { defineScribeConfig } from '../src/index.ts'

describe('@scribe/server config', () => {
  it('defineScribeConfig returns the config object unchanged', () => {
    const cfg = { server: { cors: { origin: '*' as const } } }
    expect(defineScribeConfig(cfg)).toBe(cfg)
  })

  it('ScribeConfig accepts all valid origin shapes', () => {
    const a = defineScribeConfig({ server: { cors: { origin: 'https://example.com' } } })
    const b = defineScribeConfig({
      server: { cors: { origin: ['https://a.com', 'https://b.com'] } },
    })
    const c = defineScribeConfig({ server: { cors: { origin: '*' } } })
    expect(a.server?.cors?.origin).toBe('https://example.com')
    expect(Array.isArray(b.server?.cors?.origin)).toBe(true)
    expect(c.server?.cors?.origin).toBe('*')
  })

  it('ServerConfig fields are all optional', () => {
    const cfg = defineScribeConfig({ server: {} })
    expect(cfg.server?.maxBodySize).toBeUndefined()
    expect(cfg.server?.basePath).toBeUndefined()
  })

  it('ScribeConfig.agent round-trips AgentReadinessConfig', () => {
    const cfg = defineScribeConfig({
      agent: { name: 'Test App', version: '1.0.0', endpoint: 'https://test.example.com/mcp' },
    })
    expect(cfg.agent?.name).toBe('Test App')
    expect(cfg.agent?.endpoint).toBe('https://test.example.com/mcp')
  })
})
