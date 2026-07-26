/**
 * Config validation — unknown keys, invalid values, and the declared-but-dead
 * fields.
 *
 * The tests that matter most here are the UNKNOWN-KEY ones. Every case below
 * was silently accepted before: `defineConfig` had four hand-written `if`
 * statements and no excess-key check at all, and its own `UNKNOWN_FIELD` error
 * code was declared and never thrown. A typo'd key did nothing and said
 * nothing — which only became urgent once `aihu.config.ts` started being
 * scaffolded into every project and advertised as THE place to configure
 * things.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AIHU_CONFIG_KEYS, defineConfig } from '../src/config.ts'
import { AihuConfigError } from '../src/config-error.ts'
import { __resetWarningsForTesting } from '../src/config-validate.ts'

/** Call defineConfig and return the thrown AihuConfigError, or null. */
function err(config: unknown): AihuConfigError | null {
  try {
    defineConfig(config as never)
    return null
  } catch (e) {
    if (e instanceof AihuConfigError) return e
    throw e
  }
}

beforeEach(() => {
  __resetWarningsForTesting()
})

describe('unknown keys throw rather than being silently dropped', () => {
  it('rejects a plain typo and names the keypath', () => {
    const e = err({ outpout: 'static' })
    expect(e?.code).toBe('UNKNOWN_FIELD')
    expect(e?.field).toBe('config.outpout')
    expect(e?.message).toContain('Unexpected option config.outpout')
  })

  it('rejects a nested typo with its full keypath', () => {
    const e = err({ dir: { page: 'src/pages' } })
    expect(e?.code).toBe('UNKNOWN_FIELD')
    expect(e?.field).toBe('config.dir.page')
  })

  it('every error message links the docs', () => {
    expect(err({ nope: 1 })?.message).toContain('https://aihu.dev/docs/config')
  })
})

describe('did-you-mean targets the mistakes people actually make', () => {
  // The two config dialects share a file name AND an interface name. Until
  // they are consolidated, writing a @aihu/server field into a @aihu/app
  // config is the single most likely error, and it used to be silent.
  it.each([
    ['rendering', 'output'],
    ['agent', 'agentReadiness'],
    ['server', 'vite.server'],
  ])('maps @aihu/server field %s -> %s', (wrong, right) => {
    expect(err({ [wrong]: {} })?.message).toContain(`did you mean ${right}?`)
  })

  it.each([
    ['shadowMode', 'css.shadowMode'],
    ['bundler', 'build.bundler'],
    ['components', 'dir.components'],
    ['head', 'app.head'],
    ['integrations', 'plugins'],
  ])('maps mis-nested %s -> %s', (wrong, right) => {
    expect(err({ [wrong]: {} })?.message).toContain(`did you mean ${right}?`)
  })

  it('omits the hint when there is no good guess', () => {
    expect(err({ zzz: 1 })?.message).not.toContain('did you mean')
  })
})

describe('invalid values keep their specific error codes', () => {
  it.each([
    [{ output: 'ssr' }, 'INVALID_OUTPUT_MODE'],
    [{ css: { shadowMode: 'closed' } }, 'INVALID_CSS_SHADOW_MODE'],
    [{ build: { bundler: 'webpack' } }, 'INVALID_BUNDLER'],
    [{ compiler: { target: 'edge' } }, 'INVALID_COMPILER_TARGET'],
    [{ dev: { port: '3000' } }, 'INVALID_TYPE'],
    [{ dir: { pages: 42 } }, 'INVALID_TYPE'],
  ] as const)('%j -> %s', (config, code) => {
    expect(err(config)?.code).toBe(code)
  })

  it('reports the received value so the message is actionable', () => {
    expect(err({ output: 'ssr' })?.message).toContain('received "ssr"')
  })

  it('phrases a two-option list as "either/or"', () => {
    expect(err({ output: 'ssr' })?.message).toContain('either "spa" or "static"')
  })

  it('phrases a three-option list as "one of"', () => {
    expect(err({ compiler: { target: 'edge' } })?.message).toContain(
      'one of "client", "server" or "universal"',
    )
  })
})

describe('declared-but-not-wired fields warn instead of lying', () => {
  it('warns on router.viewTransitions but still accepts it', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(() => defineConfig({ router: { viewTransitions: true } })).not.toThrow()
    expect(warn).toHaveBeenCalledOnce()
    expect(warn.mock.calls[0]?.[0]).toContain('not yet wired up')
    warn.mockRestore()
  })

  it('warns only once per key, so a rebuild loop does not train people to ignore it', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    defineConfig({ router: { viewTransitions: true } })
    defineConfig({ router: { viewTransitions: true } })
    defineConfig({ router: { viewTransitions: true } })
    expect(warn).toHaveBeenCalledOnce()
    warn.mockRestore()
  })

  it('stays silent when the dead field is not set', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    defineConfig({ router: {} })
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })
})

describe('valid configs are accepted unchanged', () => {
  it('returns the caller object by identity — defineConfig stays an identity fn', () => {
    // Deliberate deviation from SvelteKit, whose validators also apply
    // defaults. viteAihuPlugin applies its own defaults at point of use
    // (`config?.dir?.pages ?? 'pages'`), so returning a different object here
    // would be a behaviour change unrelated to validation.
    const input = { output: 'static' } as const
    expect(defineConfig(input)).toBe(input)
  })

  it('accepts every field the schema declares', () => {
    expect(() =>
      defineConfig({
        dir: { pages: 'src/pages', layouts: 'src/layouts', components: 'src/components' },
        output: 'static',
        site: { url: 'https://example.com' },
        app: { head: { title: 'x', meta: [{ name: 'a', content: 'b' }] } },
        compiler: { islands: true, target: 'client' },
        dev: { port: 5173, host: 'localhost', open: false },
        build: { bundler: 'vite' },
        typecheck: { strictTemplates: true, project: 'tsconfig.json' },
        css: { shadowMode: 'light' },
        ui: { registry: '@aihu/ui', target: './src/components/ui' },
        agentReadiness: { name: 'demo' },
      }),
    ).not.toThrow()
  })

  it('accepts agentReadiness: false as a whole-block disable', () => {
    expect(() => defineConfig({ agentReadiness: false })).not.toThrow()
  })

  it('accepts an empty config', () => {
    expect(() => defineConfig({})).not.toThrow()
  })
})

describe('the key list is derived from the schema, not hand-maintained', () => {
  it('exposes the owned keys', () => {
    expect(AIHU_CONFIG_KEYS).toContain('agentReadiness')
    expect(AIHU_CONFIG_KEYS).toContain('compiler')
  })

  it('every declared key is actually accepted by the validator', () => {
    // Guards the drift this list exists to prevent: a key present in the type
    // but missing from the schema would throw UNKNOWN_FIELD on its own name.
    for (const key of AIHU_CONFIG_KEYS) {
      const e = err({ [key]: undefined })
      expect(e, `schema key '${key}' rejected itself`).toBeNull()
    }
  })
})
