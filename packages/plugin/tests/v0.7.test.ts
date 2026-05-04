import { beforeEach, describe, expect, it } from 'vitest'
import { definePlugin, resetValidationState, validatePlugin } from '../src/index.ts'

// ---------------------------------------------------------------------------
// v0.7.3 — Plugin Contract §6.5 serverOnly + contributes.middleware
// ---------------------------------------------------------------------------

describe('@scribe/plugin v0.7.3 — serverOnly + contributes.middleware', () => {
  beforeEach(() => {
    resetValidationState()
  })

  it('definePlugin accepts serverOnly: true and passes validation', () => {
    const plugin = definePlugin({
      name: 'my-server-plugin',
      version: '0.1.0',
      namespace: 'my-server-plugin',
      serverOnly: true,
    })
    expect(plugin.serverOnly).toBe(true)
    expect(validatePlugin(plugin)).toEqual({ ok: true })
  })

  it('definePlugin with serverOnly + contributes.middleware passes validation', () => {
    const plugin = definePlugin({
      name: 'auth-middleware',
      version: '0.2.0',
      namespace: 'auth-middleware',
      serverOnly: true,
      contributes: {
        middleware: [
          { name: 'auth', stage: 'before-handler', handler: './server/auth-handler.ts' },
          { name: 'error-reporter', stage: 'on-error', handler: './server/error-handler.ts' },
        ],
      },
    })

    expect(plugin.serverOnly).toBe(true)
    expect(plugin.contributes?.middleware).toHaveLength(2)
    expect(plugin.contributes?.middleware?.[0]?.name).toBe('auth')
    expect(plugin.contributes?.middleware?.[0]?.stage).toBe('before-handler')
    expect(plugin.contributes?.middleware?.[1]?.stage).toBe('on-error')
    expect(validatePlugin(plugin)).toEqual({ ok: true })
  })

  it('all three middleware stages are accepted', () => {
    const plugin = definePlugin({
      name: 'full-lifecycle',
      version: '0.1.0',
      namespace: 'full-lifecycle',
      serverOnly: true,
      contributes: {
        middleware: [
          { name: 'before', stage: 'before-handler', handler: './before.ts' },
          { name: 'after', stage: 'after-handler', handler: './after.ts' },
          { name: 'onerr', stage: 'on-error', handler: './error.ts' },
        ],
      },
    })
    const stages = plugin.contributes?.middleware?.map((m) => m.stage) ?? []
    expect(stages).toContain('before-handler')
    expect(stages).toContain('after-handler')
    expect(stages).toContain('on-error')
    expect(validatePlugin(plugin)).toEqual({ ok: true })
  })
})
