import { definePlugin } from '@aihu/plugin'
import { describe, expect, it } from 'vitest'
import { defineAihuConfig } from '../src/index.ts'

describe('@aihu/server defineAihuConfig.plugins (v0.2.1, spec §7.1)', () => {
  it('accepts an empty plugins array', () => {
    const cfg = defineAihuConfig({ plugins: [] })
    expect(cfg.plugins).toEqual([])
    expect(cfg.plugins?.length).toBe(0)
  })

  it('accepts an array containing a valid plugin (spec §7.1)', () => {
    const forms = definePlugin({
      name: 'forms',
      version: '0.1.0',
      namespace: 'forms',
      contributes: { blocks: ['fields'] },
    })

    const cfg = defineAihuConfig({ plugins: [forms] })
    expect(cfg.plugins).toHaveLength(1)
    expect(cfg.plugins?.[0]?.namespace).toBe('forms')
    expect(cfg.plugins?.[0]?.__aihu_plugin).toBe(true)
  })

  it('remains backward compatible when plugins is omitted', () => {
    // v0.2.0 callers that never set `plugins` MUST still type-check and pass
    // through unchanged. This exercises the "type-only, no dispatcher" stance
    // for v0.2.1: admitting the field is non-breaking.
    const cfg = defineAihuConfig({ server: { cors: { origin: '*' } } })
    expect(cfg.plugins).toBeUndefined()
    expect(cfg.server?.cors?.origin).toBe('*')
  })
})
