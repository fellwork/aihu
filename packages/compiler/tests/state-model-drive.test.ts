/**
 * #487 Phase 1 — the @state reactive-declaration model: RUNTIME DRIVE test
 * (state-model spec §8 items 2 and 6).
 *
 * The acceptance criterion is behavioral: `let count = state(0)` + a plain
 * `count++` in an action updates the template — no setter anywhere in
 * authored source, and a `derived` recomputes. Compiling is not enough:
 * before the §4.3 write-rewrite pass a plain write would assign to the
 * getter binding and change nothing (or throw). So: click it.
 *
 * Model: `tests/prop-write-drive.test.ts` (CO1's drive harness).
 */

import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mount } from '@aihu/arbor'
import { _setMount, _setSignal } from '@aihu/runtime'
import { signal } from '@aihu/signals'
import { JSDOM } from 'jsdom'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const _dir = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(_dir, '../../..')

const COMPILER =
  process.env.AIHU_COMPILE_BIN ??
  [
    resolve(REPO_ROOT, 'target/debug/aihu-compile'),
    resolve(REPO_ROOT, 'target/release/aihu-compile'),
    resolve(_dir, '../bin/aihu-compile'),
  ].find((p) => existsSync(p)) ??
  ''
const HAVE_COMPILER = COMPILER !== ''
const TMP_DIR = resolve(_dir, '.tmp-state-model-drive')

_setMount(mount as never)
_setSignal(signal)

let jsdom: JSDOM

function compile(src: string, tag: string, path?: string): string {
  const args = ['--stdin', '--tag', tag]
  if (path) args.push('--path', path)
  const out = spawnSync(COMPILER, args, { input: src, encoding: 'utf8' })
  if (out.status !== 0) throw new Error(`aihu-compile failed (${out.status}): ${out.stderr}`)
  return out.stdout
}

async function load(compiled: string, tag: string): Promise<void> {
  mkdirSync(TMP_DIR, { recursive: true })
  const modPath = resolve(TMP_DIR, `${tag}.ts`)
  writeFileSync(modPath, compiled, 'utf8')
  await import(/* @vite-ignore */ modPath)
}

function mountEl(tag: string): HTMLElement {
  const el = jsdom.window.document.createElement(tag) as HTMLElement
  jsdom.window.document.body.appendChild(el)
  return el
}

function root(el: HTMLElement): ShadowRoot {
  const sr = el.shadowRoot
  if (!sr) throw new Error('component did not attach a shadow root')
  return sr as unknown as ShadowRoot
}

function text(el: HTMLElement, sel: string): string {
  return root(el).querySelector(sel)?.textContent?.trim() ?? ''
}

function click(el: HTMLElement, label: string): void {
  const btn = [...root(el).querySelectorAll('button')].find(
    (b) => (b.textContent ?? '').trim() === label,
  )
  if (!btn) throw new Error(`no button labelled "${label}"`)
  ;(btn as HTMLElement).click()
}

beforeAll(() => {
  if (!HAVE_COMPILER) return
  jsdom = new JSDOM('<!DOCTYPE html><body></body>', { pretendToBeVisual: true })
  const g = globalThis as unknown as Record<string, unknown>
  g.window = jsdom.window as unknown
  g.document = jsdom.window.document
  g.customElements = jsdom.window.customElements
  g.HTMLElement = jsdom.window.HTMLElement
  g.CustomEvent = jsdom.window.CustomEvent
  g.CSSStyleSheet = class {
    replaceSync(): void {}
  }
})

afterAll(() => {
  rmSync(TMP_DIR, { recursive: true, force: true })
})

describe('#487 — state() writes drive real reactivity at runtime', () => {
  it.skipIf(!HAVE_COMPILER)(
    'counter-new: plain assignment updates the template; derived recomputes',
    async () => {
      const src = readFileSync(resolve(_dir, 'fixtures/state-model/counter-new.aihu'), 'utf8')
      const compiled = compile(src, 'drive-state-counter')

      // No setter appears anywhere in AUTHORED source (spec §8.2) — the
      // compiler synthesized it.
      expect(src).not.toContain('.set(')
      expect(src).not.toContain('__count_set')
      expect(compiled).toContain('const [count, __count_set] = signal(0);')
      // The §4.3 fast path (numeric-literal initializer + statement position).
      expect(compiled).toContain('__count_set(count() + 1)')
      expect(compiled).not.toContain('__aihu_state_upd')

      await load(compiled, 'drive-state-counter')
      const el = mountEl('drive-state-counter')
      const errors: unknown[] = []
      jsdom.window.addEventListener('error', (e: unknown) => errors.push(e))

      // Drive: `count++` / `count -= 1` / `count = 0` / a handler-position
      // `count = count + 10` all reactively update BOTH the plain read and
      // the derived.
      expect(text(el, 'p.value')).toBe('Count: 0')
      expect(text(el, 'p.doubled')).toBe('Doubled: 0')
      click(el, '+')
      expect(text(el, 'p.value')).toBe('Count: 1')
      expect(text(el, 'p.doubled')).toBe('Doubled: 2')
      click(el, '+10')
      expect(text(el, 'p.value')).toBe('Count: 11')
      expect(text(el, 'p.doubled')).toBe('Doubled: 22')
      click(el, '-')
      expect(text(el, 'p.value')).toBe('Count: 10')
      click(el, '0')
      expect(text(el, 'p.value')).toBe('Count: 0')
      expect(text(el, 'p.doubled')).toBe('Doubled: 0')

      expect(errors).toEqual([])
    },
  )

  it.skipIf(!HAVE_COMPILER)('multi-write action coalesces in one batch', async () => {
    const src = `@state {
  let a = state(0)
  let b = state(0)
  const bump = action(() => { a++; b = a + 1 })
}

@template {
  <div>
    <output class="a">{a}</output>
    <output class="b">{b}</output>
    <button on:click={bump}>go</button>
  </div>
}
`
    const compiled = compile(src, 'drive-state-batch')
    // Zero-config action keeps the batch wrap (spec §2.4).
    expect(compiled).toContain('return batch(() => {')
    await load(compiled, 'drive-state-batch')
    const el = mountEl('drive-state-batch')
    expect(text(el, 'output.a')).toBe('0')
    click(el, 'go')
    // Read-after-write inside the batch: `b = a + 1` sees the fresh `a`.
    expect(text(el, 'output.a')).toBe('1')
    expect(text(el, 'output.b')).toBe('2')
  })
})
