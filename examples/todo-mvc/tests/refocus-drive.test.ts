/**
 * EX-04 todo-mvc — ref refocus DRIVE test (FEL-441 / GH #637).
 *
 * The `inputEl` comment promises the new-todo input is "captured on mount so
 * actions can refocus it." The existing smoke tests simulate logic in isolation
 * and never mount the component, so they cannot observe whether the ref is
 * captured or usable. This test compiles the REAL SFC, mounts it, submits a
 * todo, and asserts the `addTodo` action refocused the input THROUGH the
 * captured ref — i.e. the comment describes behavior the component actually has.
 *
 * Uses the ambient jsdom environment (vitest.config.ts) + the from-source
 * compiler (AIHU_COMPILE_BIN, else target/{release,debug}).
 */

import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mount } from '@aihu/arbor'
import { _setMount, _setSignal } from '@aihu/runtime'
import { signal } from '@aihu/signals'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const _dir = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(_dir, '../../..')

const COMPILER =
  process.env.AIHU_COMPILE_BIN ??
  [
    resolve(REPO_ROOT, 'target/release/aihu-compile'),
    resolve(REPO_ROOT, 'target/debug/aihu-compile'),
    resolve(REPO_ROOT, 'packages/compiler/bin/aihu-compile'),
  ].find((p) => existsSync(p)) ??
  ''
const HAVE_COMPILER = COMPILER !== ''
const TMP_DIR = resolve(_dir, '.tmp-refocus-drive')

_setMount(mount as never)
_setSignal(signal)

function root(el: HTMLElement): ShadowRoot {
  const sr = el.shadowRoot
  if (!sr) throw new Error('todo-mvc did not attach a shadow root')
  return sr as unknown as ShadowRoot
}

beforeAll(() => {
  // jsdom defines CSSStyleSheet but its constructor/replaceSync are unusable;
  // the @style block calls `new CSSStyleSheet().replaceSync(…)` unconditionally.
  // Stub it so component setup does not abort (this test is about focus, not CSS).
  ;(globalThis as unknown as Record<string, unknown>).CSSStyleSheet = class {
    replaceSync(): void {}
  }
})

afterAll(() => {
  rmSync(TMP_DIR, { recursive: true, force: true })
})

describe('EX-04 todo-mvc — the captured ref refocuses the input (FEL-441)', () => {
  it.skipIf(!HAVE_COMPILER)('addTodo refocuses the new-todo input via inputEl', async () => {
    const src = await import('node:fs').then((fs) =>
      fs.readFileSync(resolve(_dir, '../todo-mvc.aihu'), 'utf8'),
    )
    const out = spawnSync(COMPILER, ['--stdin', '--tag', 'todo-mvc', '--path', 'todo-mvc.aihu'], {
      input: src,
      encoding: 'utf8',
    })
    if (out.status !== 0) throw new Error(`aihu-compile failed (${out.status}): ${out.stderr}`)

    mkdirSync(TMP_DIR, { recursive: true })
    const modPath = resolve(TMP_DIR, 'todo-mvc.ts')
    writeFileSync(modPath, out.stdout, 'utf8')
    await import(/* @vite-ignore */ modPath)

    const host = document.createElement('todo-mvc')
    document.body.appendChild(host)

    const input = root(host).querySelector('input.new-todo') as HTMLInputElement | null
    if (!input) throw new Error('new-todo input not found')
    const form = root(host).querySelector('form.new-todo-form') as HTMLFormElement | null
    if (!form) throw new Error('new-todo form not found')

    // Move focus AWAY so the assertion cannot pass on `autofocus` alone — only
    // an explicit refocus through the captured ref can restore it.
    input.blur()
    expect(root(host).activeElement).not.toBe(input)

    // Type a draft (bind:value) and submit the form (on:submit.prevent → addTodo).
    input.value = 'write the ref test'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))

    // The todo landed (addTodo ran) …
    expect(root(host).querySelectorAll('ul.todo-list li').length).toBe(1)
    // … and the input regained focus THROUGH the captured ref (`inputEl?.focus()`).
    expect(root(host).activeElement).toBe(input)
  })
})
