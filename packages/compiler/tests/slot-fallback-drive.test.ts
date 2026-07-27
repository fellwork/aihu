/**
 * FEL-GH478 — `<$slot>fallback</$slot>` fallback content must survive compilation
 * and RENDER when no content is slotted: RUNTIME DRIVE test.
 *
 * The defect: `createSlotBoundary = (o, b) => slot(o?.name ?? undefined)` ignored
 * the fallback-children fn `b`, so authored fallback was discarded at compile
 * time — the emitted `<slot>` had no children in any shadow mode.
 *
 * The fix emits the fallback as the `<slot>`'s children, which is exactly how
 * native Shadow DOM fallback works: a `<slot>` renders its own children when it
 * has no assigned nodes, and the assigned nodes override them otherwise. Both
 * directions are asserted below.
 *
 * Falsifiable: against a pre-fix binary, direction 1 fails (the slot is empty).
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
const TMP_DIR = resolve(_dir, '.tmp-slot-fallback')

_setMount(mount as never)
_setSignal(signal)

let jsdom: JSDOM

function compile(src: string, tag: string, path: string): string {
  const out = spawnSync(COMPILER, ['--stdin', '--tag', tag, '--path', path, '--target', 'client'], {
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

function root(el: HTMLElement): ShadowRoot {
  const sr = el.shadowRoot
  if (!sr) throw new Error('component did not attach a shadow root')
  return sr as unknown as ShadowRoot
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

describe('FEL-GH478 — <$slot> fallback content renders and is overridable', () => {
  it.skipIf(!HAVE_COMPILER)(
    'a default <$slot>fallback</$slot> renders the fallback when nothing is slotted',
    async () => {
      const src = `@template {
  <div class="wrap">
    <slot>fallback text</slot>
  </div>
}
`
      const compiled = compile(src, 'slot-default-fb', 'slot-default-fb.aihu')
      await load(compiled, 'slot-default-fb')

      // No light-DOM children supplied → the slot has no assigned nodes, so the
      // browser renders the slot's OWN children (the fallback). Under the defect
      // the compiled <slot> is empty and this is the empty string.
      const el = jsdom.window.document.createElement('slot-default-fb') as HTMLElement
      jsdom.window.document.body.appendChild(el)

      const slotEl = root(el).querySelector('slot') as HTMLSlotElement | null
      expect(slotEl).toBeTruthy()
      expect(slotEl!.assignedNodes().length).toBe(0) // nothing slotted
      expect(slotEl!.textContent).toContain('fallback text') // fallback survived
    },
  )

  it.skipIf(!HAVE_COMPILER)(
    'supplying slotted content overrides the fallback',
    async () => {
      const src = `@template {
  <div class="wrap">
    <slot>fallback text</slot>
  </div>
}
`
      const compiled = compile(src, 'slot-override-fb', 'slot-override-fb.aihu')
      await load(compiled, 'slot-override-fb')

      const el = jsdom.window.document.createElement('slot-override-fb') as HTMLElement
      const real = jsdom.window.document.createElement('span')
      real.textContent = 'real content'
      el.appendChild(real) // light-DOM child → assigned to the default slot
      jsdom.window.document.body.appendChild(el)

      const slotEl = root(el).querySelector('slot') as HTMLSlotElement
      const assigned = slotEl.assignedNodes()
      // The assigned node is the projected content; it overrides the fallback.
      expect(assigned.length).toBe(1)
      expect(assigned[0].textContent).toBe('real content')
      // Fallback children still exist in the slot (native: hidden while assigned).
      expect(slotEl.textContent).toContain('fallback text')
    },
  )
})
