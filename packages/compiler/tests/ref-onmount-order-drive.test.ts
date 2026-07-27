/**
 * FEL-441 / GH #637 — `$ref` is populated inside a `@state` `onMount`: RUNTIME
 * DRIVE test.
 *
 * THE TRAP (called out on the contract): assert ORDER, not eventual population.
 * The ref setter writes a SIGNAL, so an `effect`-based assertion re-runs when
 * the ref finally lands and goes green even against the defect. The only
 * assertion that distinguishes bug from fix is the ref's value AT THE MOMENT
 * the author's `@state onMount` runs — captured synchronously inside that
 * callback, into a global the test reads back after mount.
 *
 *   - Bug: the ref-setter's `onMount` is registered while building the return
 *     tree (after `macro_code`), so the `@state onMount` runs first and sees
 *     `null`.
 *   - Fix: the ref-setter's `onMount` is hoisted before `macro_code`, so it
 *     runs first and the `@state onMount` sees the element.
 *
 * Falsifiable: point `AIHU_COMPILE_BIN` at a pre-fix binary and this fails
 * (records "NULL") — a drive test that cannot fail proves nothing.
 *
 * Harness mirrors `prop-write-drive.test.ts`.
 */

import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
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
    resolve(REPO_ROOT, 'target/release/aihu-compile'),
    resolve(REPO_ROOT, 'target/debug/aihu-compile'),
    resolve(_dir, '../bin/aihu-compile'),
  ].find((p) => existsSync(p)) ??
  ''
const HAVE_COMPILER = COMPILER !== ''
const TMP_DIR = resolve(_dir, '.tmp-ref-onmount-order')

_setMount(mount as never)
_setSignal(signal)

let jsdom: JSDOM

function compile(src: string, tag: string, path: string): string {
  const out = spawnSync(COMPILER, ['--stdin', '--tag', tag, '--path', path], {
    input: src,
    encoding: 'utf8',
  })
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

describe('FEL-441 — $ref is set inside a @state onMount', () => {
  it.skipIf(!HAVE_COMPILER)(
    'the @state onMount sees the ELEMENT at the moment it runs (order, not eventual)',
    async () => {
      // The `@state onMount` records what the ref holds AT THE INSTANT it runs.
      // Under the defect this is null; only the order fix makes it the element.
      const src = `@state {
  let inputEl = state<HTMLElement | null>(null)
  onMount(() => {
    ;(globalThis as any).__fel441_refAtMount = inputEl ? (inputEl as HTMLElement).tagName : 'NULL'
  })
}

@template {
  <div>
    <input ref={inputEl} />
  </div>
}
`
      const g = globalThis as unknown as Record<string, unknown>
      g.__fel441_refAtMount = 'UNSET'

      const compiled = compile(src, 'ref-order-card', 'ref-order-card.aihu')
      await load(compiled, 'ref-order-card')
      mountEl('ref-order-card')

      // The captured value is what the author's onMount observed — it must be
      // the input element, not null. 'NULL' here is the FEL-441 defect.
      expect(g.__fel441_refAtMount).toBe('INPUT')
    },
  )
})
