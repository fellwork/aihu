import { describe, expect, it } from 'vitest'
import { defineAihuConfig } from '../src/index.ts'

describe('AihuConfig.ui', () => {
  it('round-trips a ui config with prefix + target', () => {
    const cfg = defineAihuConfig({ ui: { prefix: 'acme', target: './x' } })
    expect(cfg.ui?.prefix).toBe('acme')
    expect(cfg.ui?.target).toBe('./x')
  })

  it('omitting ui is valid (no defaults applied by defineAihuConfig)', () => {
    const cfg = defineAihuConfig({})
    expect(cfg.ui).toBeUndefined()
  })

  it('does not synthesize ui defaults when ui is omitted', () => {
    const cfg = defineAihuConfig({ server: { cors: { origin: '*' } } })
    expect(cfg.ui).toBeUndefined()
  })

  it('round-trips registry, style, and prefix fields', () => {
    const cfg = defineAihuConfig({
      ui: { registry: '@aihu/ui', style: 'aihu-graphite', prefix: 'acme', target: './src/ui' },
    })
    expect(cfg.ui?.registry).toBe('@aihu/ui')
    expect(cfg.ui?.style).toBe('aihu-graphite')
    expect(cfg.ui?.prefix).toBe('acme')
    expect(cfg.ui?.target).toBe('./src/ui')
  })

  it('registries accepts an empty object (reserved v2 slot)', () => {
    const cfg = defineAihuConfig({ ui: { registries: {} } })
    expect(cfg.ui?.registries).toEqual({})
  })
})
