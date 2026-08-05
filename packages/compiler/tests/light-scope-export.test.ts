/**
 * `__aihu_light_scope__` — the server-target scope-id export (LDF §10 step 3).
 *
 * The plugin's transform computes a light-DOM component's `data-a` scope id
 * (`_lightScopeId(rawId)`) and (a) injects it into the client's
 * `defineElement` options — the runtime stamps the host at
 * `connectedCallback` — and (b) writes it into the emitted
 * `@scope([data-a="…"])` CSS. Server-side renders need the SAME id to stamp
 * prerendered roots (`SsrOptions.lightScopeId`), so the SERVER-consumer
 * transform additionally exports it from the compiled module. These tests pin
 * that export: present exactly when the component resolves to light mode AND
 * the transform runs for a server consumer; absent otherwise (client bundles
 * carry no extra bytes; shadow components have no scope id at all).
 *
 * Requires the compiler binary (`bin/aihu-compile`, or AIHU_COMPILE_BIN) —
 * mirrored from css-engine-hook.test.ts.
 */

import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { _lightScopeId, aihuCompilerPlugin } from '../js/index.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ext = process.platform === 'win32' ? '.exe' : ''
const compilerBin = resolve(__dirname, `../bin/aihu-compile${ext}`)
if (existsSync(compilerBin)) {
  process.env.AIHU_COMPILE_BIN ??= compilerBin
}

type TransformFn = (
  this: unknown,
  code: string,
  id: string,
) => Promise<{ code: string; map: null } | null | undefined>

const SFC = `@template {
  <div class="card">
    <p>hello</p>
  </div>
}
`

/** Run the plugin transform with a given hook `this` (Vite environment). */
async function runPlugin(
  thisArg: unknown,
  options?: Parameters<typeof aihuCompilerPlugin>[0],
): Promise<{ code: string; id: string }> {
  const tmp = mkdtempSync(join(tmpdir(), 'aihu-light-scope-'))
  try {
    const plugin = aihuCompilerPlugin(options)
    const transform = plugin.transform as unknown as TransformFn
    const id = join(tmp, 'x-card.aihu')
    const res = await transform.call(thisArg, SFC, id)
    if (res == null) throw new Error('plugin returned no result')
    return { code: res.code, id }
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}

const SERVER_ENV = { environment: { config: { consumer: 'server' } } }

describe('__aihu_light_scope__ export (server target)', () => {
  it('server consumer + light mode → exports the module’s _lightScopeId', async () => {
    const { code, id } = await runPlugin(SERVER_ENV, { shadowMode: 'light' })
    // The transform's TS-strip normalizes quote style — assert quote-agnostic.
    expect(code).toMatch(
      new RegExp(`export const __aihu_light_scope__ = ["']${_lightScopeId(id)}["']`),
    )
  })

  it('server consumer + light mode → fills the __AIHU_LIGHT_SCOPE_ID__ placeholder', async () => {
    // The Rust string renderer emits `const __AIHU_LIGHT_SCOPE_ID__ = undefined`
    // and defaults `__ssrString`'s `lightScopeId` from it — `_injectLightScopeId`
    // must replace the literal so a compiled component stamps `data-a` on its
    // own root with no caller cooperation.
    const { code, id } = await runPlugin(SERVER_ENV, { shadowMode: 'light' })
    expect(code).toMatch(new RegExp(`const __AIHU_LIGHT_SCOPE_ID__ = ["']${_lightScopeId(id)}["']`))
    expect(code).not.toContain('__AIHU_LIGHT_SCOPE_ID__ = undefined')
  })

  it('client consumer never carries the export (the runtime stamps the host instead)', async () => {
    const { code } = await runPlugin({}, { shadowMode: 'light' })
    expect(code).not.toContain('__aihu_light_scope__')
  })

  it('shadow mode has no scope id — no export even for a server consumer', async () => {
    const { code } = await runPlugin(SERVER_ENV, { shadowMode: 'shadow' })
    expect(code).not.toContain('__aihu_light_scope__')
    expect(code).not.toMatch(/__AIHU_LIGHT_SCOPE_ID__ = ["']/)
  })
})

/**
 * `__aihu_shadow__` — the server-target shadow-mode export.
 *
 * An SSR caller rendering a NESTED custom element must emit two different
 * shapes: a light component's tree is the host's own children, a shadow
 * component's tree belongs inside `<template shadowrootmode="open">`. Guessing
 * wrong is not cosmetic — light children under a host that later calls
 * `attachShadow` are discarded on upgrade, so the content paints and vanishes.
 *
 * These assert aihu's OWN vocabulary crosses the wire ('light' | 'shadow'),
 * never the DOM's ShadowRootMode ('open' | 'closed'). Those are different enums
 * sharing the word "mode"; the translation happens once, in the renderer.
 */
describe('__aihu_shadow__ export (server target)', () => {
  it("exports 'light' when the component resolves to light DOM", async () => {
    const { code } = await runPlugin(SERVER_ENV, { shadowMode: 'light' })
    expect(code).toMatch(/export const __aihu_shadow__ = ["']light["']/)
  })

  it("exports 'shadow' when the component resolves to shadow DOM", async () => {
    const { code } = await runPlugin(SERVER_ENV, { shadowMode: 'shadow' })
    expect(code).toMatch(/export const __aihu_shadow__ = ["']shadow["']/)
  })

  // The DOM's vocabulary must not leak into the module contract.
  it('never emits the DOM ShadowRootMode vocabulary', async () => {
    for (const mode of ['light', 'shadow'] as const) {
      const { code } = await runPlugin(SERVER_ENV, { shadowMode: mode })
      expect(code).not.toMatch(/__aihu_shadow__ = ["'](open|closed)["']/)
    }
  })

  // A lie a consumer would branch on: `'undefined'` is a truthy string, so an
  // unguarded emission would read as a real mode.
  it("never emits the string 'undefined'", async () => {
    const { code } = await runPlugin(SERVER_ENV, { shadowMode: 'shadow' })
    expect(code).not.toContain("__aihu_shadow__ = 'undefined'")
  })

  // Client target stamps its mode into defineElement options directly and needs
  // no export — same rule the scope-id export follows.
  it('is absent from the client target', async () => {
    const { code } = await runPlugin(
      { environment: { config: { consumer: 'client' } } },
      { shadowMode: 'shadow' },
    )
    expect(code).not.toContain('__aihu_shadow__')
  })
})
