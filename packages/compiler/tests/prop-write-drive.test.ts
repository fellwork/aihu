/**
 * CO1 — `$prop` write rewriting: RUNTIME DRIVE test (spec §8.3).
 *
 * The acceptance criterion is explicit: "cookbook/aihu-counter.aihu compiles AND
 * increment/decrement/reset mutate state without throwing. Drive it — do not
 * merely compile it." Compiling is not enough, and neither is `check:emit-parses`:
 *
 *   - Before CO1, `count++` emitted an assignment to a `const`, which throws
 *     `TypeError: Assignment to constant variable` on the FIRST CLICK. Nothing
 *     short of clicking observes that.
 *   - Over-application is invisible to a parse check BY CONSTRUCTION. A wrongly
 *     rewritten shadowed local emits `.set` on a number — `(1).set(2)` parses
 *     fine and throws only at runtime. That is why step 7 below exists.
 *
 * Model: `packages/agent-server/tests/headless-compiled-dispatch.test.ts`.
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

// BINARY HYGIENE (spec §1.2). `check-emit-parses.ts` picks the NEWEST binary
// deliberately; this harness — like the Vite plugin — uses FIXED precedence, so
// a stale `target/release` silently drives the OLD compiler and produces
// phantom failures. Debug is listed first because that is what `cargo build`
// writes; rebuild before every verification pass.
//
// `AIHU_COMPILE_BIN` overrides the search. It exists so this suite can be
// pointed at a PRE-CO1 binary to confirm it actually fails there — a drive test
// that cannot be falsified proves nothing.
const COMPILER =
  process.env.AIHU_COMPILE_BIN ??
  [
    resolve(REPO_ROOT, 'target/debug/aihu-compile'),
    resolve(REPO_ROOT, 'target/release/aihu-compile'),
    resolve(_dir, '../bin/aihu-compile'),
  ].find((p) => existsSync(p)) ??
  ''
const HAVE_COMPILER = COMPILER !== ''
const TMP_DIR = resolve(_dir, '.tmp-prop-write-drive')

_setMount(mount as never)
_setSignal(signal)

let jsdom: JSDOM

/** Compile an SFC source string to a browser-target module. */
function compile(src: string, tag: string, path?: string): string {
  const args = ['--stdin', '--tag', tag]
  if (path) args.push('--path', path)
  const out = spawnSync(COMPILER, args, { input: src, encoding: 'utf8' })
  if (out.status !== 0) throw new Error(`aihu-compile failed (${out.status}): ${out.stderr}`)
  return out.stdout
}

/** Write the emitted module to disk and import it (registers the element). */
async function load(compiled: string, tag: string): Promise<void> {
  mkdirSync(TMP_DIR, { recursive: true })
  const modPath = resolve(TMP_DIR, `${tag}.ts`)
  writeFileSync(modPath, compiled, 'utf8')
  await import(/* @vite-ignore */ modPath)
}

/** Mount a registered element into the jsdom document and return it. */
function mountEl(tag: string): HTMLElement {
  const el = jsdom.window.document.createElement(tag) as HTMLElement
  jsdom.window.document.body.appendChild(el)
  return el
}

/**
 * The component renders into a shadow root (`ctx.host as ShadowRoot`), so every
 * query goes through `shadowRoot` — querying the light DOM would find nothing
 * and the test would vacuously "pass" on an empty NodeList.
 */
function root(el: HTMLElement): ShadowRoot {
  const sr = el.shadowRoot
  if (!sr) throw new Error('component did not attach a shadow root')
  return sr as unknown as ShadowRoot
}

function countText(el: HTMLElement): string {
  return root(el).querySelector('output.count')?.textContent?.trim() ?? ''
}

/** Click a button by its rendered label. */
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
  // jsdom has no CONSTRUCTABLE stylesheets: it defines `CSSStyleSheet`, but the
  // constructor is unusable and there is no `replaceSync`. The emit calls
  // `new CSSStyleSheet()` + `.replaceSync(…)` unconditionally whenever the SFC
  // has an `@style` block, so the stub must be installed UNCONDITIONALLY — a
  // `?? fallback` never fires, because the jsdom binding does exist. CO1 is
  // about behavior, not CSS; this only has to not abort setup.
  g.CSSStyleSheet = class {
    replaceSync(): void {}
  }
})

afterAll(() => {
  rmSync(TMP_DIR, { recursive: true, force: true })
})

describe('CO1 — $prop writes drive real state at runtime', () => {
  it.skipIf(!HAVE_COMPILER)(
    'cookbook/aihu-counter: increment/decrement/reset mutate state without throwing',
    async () => {
      // ── 1. Compile the REAL cookbook fixture (not a hand-written stand-in). ──
      const src = await import('node:fs').then((fs) =>
        fs.readFileSync(resolve(REPO_ROOT, 'cookbook/aihu-counter.aihu'), 'utf8'),
      )
      const compiled = compile(src, 'drive-counter', 'cookbook/aihu-counter.aihu')

      // The §4.5 inline fast path: statement position + numeric-literal
      // `default:` prove ToNumeric is identity, so no helper is loaded.
      expect(compiled).toContain('count.set(count() + 1)')
      expect(compiled).toContain('count.set(count() - 1)')
      expect(compiled).toContain('count.set(0)')
      expect(compiled).not.toContain('__aihu_prop_upd')

      // ── 2/3. Load + mount. ────────────────────────────────────────────────
      await load(compiled, 'drive-counter')
      const el = mountEl('drive-counter')

      // Any TypeError thrown from a click handler surfaces as an unhandled
      // error inside the listener; capture them so step 5 is a real assertion
      // rather than a hope.
      const errors: unknown[] = []
      jsdom.window.addEventListener('error', (e: unknown) => errors.push(e))

      // ── 4. Drive it. This is the whole point. ─────────────────────────────
      expect(countText(el)).toBe('0')
      click(el, '+')
      expect(countText(el)).toBe('1')
      click(el, '+')
      expect(countText(el)).toBe('2')
      click(el, '−')
      expect(countText(el)).toBe('1')
      click(el, 'Reset')
      expect(countText(el)).toBe('0')

      // ── 5. No TypeError at any step. ──────────────────────────────────────
      expect(errors).toEqual([])
    },
  )

  it.skipIf(!HAVE_COMPILER)('double_increment_in_one_batch_increments_twice', async () => {
    // Spec §4.10: `batch` defers subscriber NOTIFICATION, not the write —
    // the value is stored immediately, so read-after-write inside one batch
    // is safe and two increments advance by two. If `batch` deferred the
    // WRITE, both `count()` reads would see 0 and this would land on 1.
    const src = `@state {
  $prop: { count: { type: Number, default: 0 } }
  $action: { bump2: () => { count++; count++ } }
}

@template {
  <div>
    <output class="count">{count}</output>
    <button on:click={bump2}>go</button>
  </div>
}
`
    const compiled = compile(src, 'drive-batch')
    await load(compiled, 'drive-batch')
    const el = mountEl('drive-batch')

    expect(countText(el)).toBe('0')
    click(el, 'go')
    expect(countText(el)).toBe('2')
  })

  it.skipIf(!HAVE_COMPILER)(
    'over_application_drive: a shadowed local sharing a prop name is untouched',
    async () => {
      // THE guard that no parse check can provide (spec §8.3 step 7). If the
      // rewrite wrongly fired on the shadowed `let count`, the body would read
      // `let count = 1; count.set(count() + 1)` — which PARSES CLEANLY and
      // throws `count.set is not a function` only when clicked. The prop must
      // also still hold its default, proving the local write never reached it.
      const src = `@state {
  $prop: { count: { type: Number, default: 7 } }
  $action: {
    probe: () => { let count = 1; count++; document.title = String(count) },
  }
}

@template {
  <div>
    <output class="count">{count}</output>
    <button on:click={probe}>probe</button>
  </div>
}
`
      const compiled = compile(src, 'drive-shadow')
      // The shadowed local must survive as authored — no `.set`, no helper.
      expect(compiled).toContain('let count = 1; count++')
      expect(compiled).not.toContain('count.set')
      expect(compiled).not.toContain('__aihu_prop_upd')

      await load(compiled, 'drive-shadow')
      const el = mountEl('drive-shadow')

      expect(countText(el)).toBe('7')
      click(el, 'probe') // would throw if `count++` had been rewritten
      // The local incremented to 2 …
      expect(jsdom.window.document.title).toBe('2')
      // … and the PROP is untouched at its default.
      expect(countText(el)).toBe('7')
    },
  )
})
