/**
 * FEL-441 — `examples/todo-mvc` does what its `inputEl` comment says.
 *
 * The comment on `inputEl` reads: "the new-todo input, captured on mount so
 * actions can refocus it." This DRIVES the real example: mount it, add a todo
 * through the form, and assert the new-todo input regained focus — which only
 * works if the `$ref` was captured into `inputEl` and `addTodo` refocused it.
 *
 * NOTE ON SCOPE (the contract's trap): this is NOT the order-discriminating
 * test. `addTodo` runs on user interaction, long after mount, by which time the
 * ref is populated under BOTH the FEL-441 bug and the fix — so this passes
 * either way. Its job is to prove the EXAMPLE's documented behaviour is real
 * (MUST PASS: "todo-mvc does what its comment says"). The order proof — the ref
 * populated AT THE MOMENT a `@state onMount` runs — lives in
 * `ref-onmount-order-drive.test.ts` and is falsifiable against a pre-fix binary.
 *
 * Harness mirrors `prop-write-drive.test.ts`.
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
    resolve(REPO_ROOT, 'target/release/aihu-compile'),
    resolve(REPO_ROOT, 'target/debug/aihu-compile'),
    resolve(_dir, '../bin/aihu-compile'),
  ].find((p) => existsSync(p)) ??
  ''
const HAVE_COMPILER = COMPILER !== ''
const TMP_DIR = resolve(_dir, '.tmp-todo-mvc-refocus')

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
  jsdom = new JSDOM('<!DOCTYPE html><body></body>', { pretendToBeVisual: true, url: 'http://localhost/' })
  const g = globalThis as unknown as Record<string, unknown>
  g.window = jsdom.window as unknown
  g.document = jsdom.window.document
  g.customElements = jsdom.window.customElements
  g.HTMLElement = jsdom.window.HTMLElement
  g.HTMLInputElement = jsdom.window.HTMLInputElement
  g.CustomEvent = jsdom.window.CustomEvent
  g.Event = jsdom.window.Event
  g.localStorage = jsdom.window.localStorage
  g.CSSStyleSheet = class {
    replaceSync(): void {}
  }
})

afterAll(() => {
  rmSync(TMP_DIR, { recursive: true, force: true })
})

describe('FEL-441 — todo-mvc captures inputEl so actions can refocus it', () => {
  it.skipIf(!HAVE_COMPILER)(
    'adding a todo refocuses the new-todo input via the captured ref',
    async () => {
      const src = readFileSync(resolve(REPO_ROOT, 'examples/todo-mvc/todo-mvc.aihu'), 'utf8')
      const compiled = compile(src, 'todo-mvc-refocus', 'examples/todo-mvc/todo-mvc.aihu')
      await load(compiled, 'todo-mvc-refocus')

      const el = jsdom.window.document.createElement('todo-mvc-refocus') as HTMLElement
      jsdom.window.document.body.appendChild(el)

      const sr = root(el)
      const input = sr.querySelector('input.new-todo') as HTMLInputElement
      expect(input).toBeTruthy()

      // Type a draft and submit the form (on:submit.prevent → addTodo).
      input.focus()
      input.value = 'Buy milk'
      input.dispatchEvent(new jsdom.window.Event('input', { bubbles: true }))
      // Move focus AWAY, so a passing assertion can only come from addTodo's
      // explicit refocus through the captured ref — not from focus never moving.
      ;(sr.querySelector('h1') as HTMLElement | null)?.focus?.()
      input.blur()

      const form = sr.querySelector('form.new-todo-form') as HTMLFormElement
      form.dispatchEvent(new jsdom.window.Event('submit', { bubbles: true, cancelable: true }))

      // The todo was added …
      const items = sr.querySelectorAll('ul.todo-list li')
      expect(items.length).toBe(1)
      expect(sr.querySelector('ul.todo-list li')?.textContent).toContain('Buy milk')

      // … and the input regained focus via `inputEl().focus()` — i.e. the ref
      // was captured on mount and the action used it, exactly as documented.
      expect(sr.activeElement).toBe(input)
    },
  )
})
