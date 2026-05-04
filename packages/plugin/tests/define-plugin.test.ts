import { beforeEach, describe, expect, it } from 'vitest'
import {
  definePlugin,
  type LoweringResult,
  type Plugin,
  RESERVED_NAMESPACES,
  resetValidationState,
  SCRIBE_VERSION,
  validatePlugin,
} from '../src/index.ts'

describe('@scribe/plugin definePlugin + validatePlugin (spec §1, §8.1)', () => {
  beforeEach(() => {
    // Per spec §8.1: duplicate-namespace tracking spans a single registration
    // pass. Reset the tracker between tests so each starts from a clean slate.
    resetValidationState()
  })

  it('happy path: definePlugin returns a branded Plugin and validatePlugin passes (§1.1)', () => {
    const plugin = definePlugin({
      name: 'forms',
      version: '0.1.0',
      namespace: 'forms',
      contributes: {
        blocks: ['fields'],
        macros: [
          {
            name: '$field',
            validIn: ['@forms.fields'],
            lowering: () => 'createField()',
          },
        ],
      },
    })

    expect(plugin.__scribe_plugin).toBe(true)
    expect(plugin.name).toBe('forms')
    expect(plugin.namespace).toBe('forms')
    expect(validatePlugin(plugin)).toEqual({ ok: true })
  })

  it('rejects an invalid namespace — contains a slash (spec §1.3, §8.1 row 1)', () => {
    const plugin = definePlugin({
      name: 'forms',
      version: '0.1.0',
      namespace: '@scope/forms',
    })

    const result = validatePlugin(plugin)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.some((e) => e.code === 'invalid-namespace')).toBe(true)
      expect(result.errors[0]?.message).toContain('@scope/forms')
    }
  })

  it('rejects a reserved namespace — `state` is reserved by scribe (spec §1.3, §8.1 row 2)', () => {
    const plugin = definePlugin({
      name: 'fake-state',
      version: '0.1.0',
      namespace: 'state',
    })

    const result = validatePlugin(plugin)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.some((e) => e.code === 'reserved-namespace')).toBe(true)
    }
    // Sanity: the published reserved list includes the spec §1.3 names.
    expect(RESERVED_NAMESPACES).toContain('state')
    expect(RESERVED_NAMESPACES).toContain('core')
    expect(RESERVED_NAMESPACES).toContain('agent')
  })

  it('rejects a duplicate namespace within one registration pass (spec §8.1 row 3)', () => {
    const a = definePlugin({ name: 'a', version: '0.1.0', namespace: 'shared' })
    const b = definePlugin({ name: 'b', version: '0.1.0', namespace: 'shared' })

    expect(validatePlugin(a)).toEqual({ ok: true })
    const second = validatePlugin(b)
    expect(second.ok).toBe(false)
    if (!second.ok) {
      expect(second.errors.some((e) => e.code === 'duplicate-namespace')).toBe(true)
    }
  })

  it('rejects a plugin missing required fields (spec §1.2, §8.1 row 4)', () => {
    // Cast through unknown so the test is allowed to construct an invalid
    // shape that exercises the runtime guard. The validator MUST still
    // catch this — TypeScript prevents it at compile time, but the spec
    // requires runtime enforcement for compiler implementations.
    const broken = { __scribe_plugin: true } as unknown as Plugin

    const result = validatePlugin(broken)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      const missing = result.errors.find((e) => e.code === 'missing-required-field')
      expect(missing).toBeDefined()
      expect(missing?.message).toContain('name')
      expect(missing?.message).toContain('version')
      expect(missing?.message).toContain('namespace')
    }
  })

  it('rejects a scribeVersion mismatch (spec §7.3, §8.1 row 5)', () => {
    const plugin = definePlugin({
      name: 'forms',
      version: '0.1.0',
      namespace: 'forms',
      // ^2.0.0 cannot be satisfied by 0.2.0 (current SCRIBE_VERSION).
      scribeVersion: '^2.0.0',
    })

    const result = validatePlugin(plugin)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      const mismatch = result.errors.find((e) => e.code === 'scribe-version-mismatch')
      expect(mismatch).toBeDefined()
      expect(mismatch?.message).toContain('^2.0.0')
      expect(mismatch?.message).toContain(SCRIBE_VERSION)
    }
  })

  it('accepts a compatible scribeVersion range (spec §7.3 happy path)', () => {
    const plugin = definePlugin({
      name: 'forms',
      version: '0.1.0',
      namespace: 'forms-compat',
      // ^0.2.0 is compatible with 0.2.0.
      scribeVersion: '^0.2.0',
    })

    expect(validatePlugin(plugin)).toEqual({ ok: true })
  })

  it('LoweringResult accepts target field with split-bundle values (spec §5.3 + Block Structure §11.5)', () => {
    // Type-only check exercised by constructing values for each target.
    const client: LoweringResult = { code: 'a()', target: 'client' }
    const server: LoweringResult = { code: 'b()', target: 'server' }
    const universal: LoweringResult = { code: 'c()', target: 'universal' }
    const untargeted: LoweringResult = { code: 'd()' }

    expect(client.target).toBe('client')
    expect(server.target).toBe('server')
    expect(universal.target).toBe('universal')
    expect(untargeted.target).toBeUndefined()
  })

  it('definePlugin accepts a serverRuntime contribution (spec §6.5.1)', () => {
    const plugin = definePlugin({
      name: 'auth',
      version: '0.1.0',
      namespace: 'auth',
      contributes: {
        serverRuntime: {
          authenticate: './server/authenticate.ts',
          requireScope: './server/require-scope.ts',
        },
        macros: [
          {
            name: '$endpoint',
            validIn: ['@auth.routes'],
            serverOnly: true,
            lowering: () => ({ code: '/* server */', target: 'server' }),
          },
        ],
      },
    })

    expect(plugin.contributes?.serverRuntime?.authenticate).toBe('./server/authenticate.ts')
    expect(plugin.contributes?.macros?.[0]?.serverOnly).toBe(true)
    expect(validatePlugin(plugin)).toEqual({ ok: true })
  })
})
