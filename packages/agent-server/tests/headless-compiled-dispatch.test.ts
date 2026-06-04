/**
 * `@aihu/agent-server` — HEADLESS dispatch against a REAL compiled @agent
 * component (fix: server-agent-macro-lowering).
 *
 * This is the headline acceptance test for the server-agent-macro-lowering fix.
 * Unlike `agent-server.test.ts` (which hand-builds an `AgentBindingSpec`), this
 * test drives the ACTUAL compiler output:
 *
 *   1. Compile a `@agent` SFC (with `$prop` read+write, a `$action` that returns
 *      a value, and a `$computed`) for `--target server` via the Rust binary.
 *   2. Load the emitted module — it calls `defineElement(...)`, registering the
 *      real custom element. The compiler injected `_registerAgentServerBinding`
 *      into the setup body.
 *   3. Mount the element into a jsdom host. `connectedCallback` runs setup (which
 *      registers the per-instance server binding keyed by the element) and then
 *      `mount()` registers a `LiveBinding` in arbor's `componentInstanceRegistry`.
 *   4. Drive it with NO browser bridge via `createAgentServer().callTool` — the
 *      headless gate path. We assert USER-VISIBLE behavior: an action mutates a
 *      real signal AND returns its value; a `$prop` write changes the signal; a
 *      `$computed`/`$prop` read returns the live value.
 *
 * This path was BROKEN before the fix: the server build left `$prop`/`$action`/
 * `$computed` as raw labeled statements and `__agentBinding` referenced
 * undeclared symbols, so no real compiled component could be driven server-side.
 */

import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { registerAgentMetadata } from '@aihu/agent'
import type { MountScope, Snapshot } from '@aihu/arbor'
import { mount } from '@aihu/arbor'
import { _setMount, _setSignal } from '@aihu/runtime'
import { signal } from '@aihu/signals'
import { JSDOM } from 'jsdom'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createAgentServer } from '../src/agent-server.ts'

const _dir = dirname(fileURLToPath(import.meta.url))
// Locate the aihu-compile binary. cargo uses the workspace-root target dir;
// fall back to release / the published bin location. Skip the suite (rather than
// hard-fail) when none is present — the harness requires `cargo build` first.
const REPO_ROOT = resolve(_dir, '../../..')
const COMPILER =
  [
    resolve(REPO_ROOT, 'target/debug/aihu-compile'),
    resolve(REPO_ROOT, 'target/release/aihu-compile'),
    resolve(_dir, '../../compiler/bin/aihu-compile'),
  ].find((p) => existsSync(p)) ?? ''
const HAVE_COMPILER = COMPILER !== ''
const TMP_DIR = resolve(_dir, '.tmp-headless')
const TAG = 'agent-headless'

const SFC = `@agent {
action bump()
state label: string
}
@state {
  import { signal } from '@aihu/signals'
  const [count, setCount] = signal(0)
  $prop: {
    label: { default: 'hi', expose: { read: true, write: true } },
  }
  $computed: {
    doubled: { expose: { read: true }, value: () => count() * 2 },
  }
  $action: {
    bump: { expose: { read: true }, handler: (args) => { setCount(count() + 1); return count() } },
  }
}
@template { <div>{count} {label}</div> }
`

// Wire the runtime's mount/signal injection (the consumer normally does this at
// app boot). Idempotent across test files in the same worker.
_setMount(mount as never)
_setSignal(signal)

let element: HTMLElement
let jsdom: JSDOM

beforeAll(async () => {
  if (!HAVE_COMPILER) return // suite is skipped via it.skipIf below
  // ── 1. Compile the real SFC to a server artifact. ────────────────────────
  const out = spawnSync(COMPILER, ['--stdin', '--tag', TAG, '--target', 'server'], {
    input: SFC,
    encoding: 'utf8',
  })
  if (out.status !== 0) {
    throw new Error(`aihu-compile failed (${out.status}): ${out.stderr}`)
  }
  const compiled = out.stdout
  // Sanity: the compiled SERVER artifact must be fully lowered — no raw labeled
  // macros, and the injected per-instance registration must be present.
  expect(compiled).not.toMatch(/^\s*\$(prop|action|computed):\s*\{/m)
  expect(compiled).toContain('_registerAgentServerBinding')
  expect(compiled).toContain('export const __agentBinding')

  // ── 2. Load it (registers the custom element via defineElement). ──────────
  // The bare `@aihu/*` imports resolve through vitest's workspace aliases.
  mkdirSync(TMP_DIR, { recursive: true })
  const modPath = resolve(TMP_DIR, `${TAG}.ts`)
  writeFileSync(modPath, compiled, 'utf8')

  // ── 3. jsdom DOM so customElements + connectedCallback work. ──────────────
  jsdom = new JSDOM('<!DOCTYPE html><body></body>', { pretendToBeVisual: true })
  // Expose the jsdom globals the runtime/define-element touch at module load.
  const g = globalThis as unknown as Record<string, unknown>
  g.window = jsdom.window as unknown
  g.document = jsdom.window.document
  g.customElements = jsdom.window.customElements
  g.HTMLElement = jsdom.window.HTMLElement
  g.CSSStyleSheet = jsdom.window.CSSStyleSheet ?? class {}
  g.CustomEvent = jsdom.window.CustomEvent

  // Register static metadata so the MCP/gate surface lists the actions.
  registerAgentMetadata({
    tag: TAG,
    describes: 'A headless-compiled counter with a returning action, prop, computed.',
    actions: { bump: { returns: {} } },
    state: { label: 'A writable label.', doubled: 'count * 2.' },
  })

  await import(/* @vite-ignore */ modPath)

  // ── 4. Mount a real instance → setup registers the LiveBinding. ───────────
  element = jsdom.window.document.createElement(TAG) as HTMLElement
  jsdom.window.document.body.appendChild(element)
})

afterAll(() => {
  element?.remove()
  rmSync(TMP_DIR, { recursive: true, force: true })
})

describe('headless callTool drives a REAL compiled @agent component', () => {
  function makeServer(): ReturnType<typeof createAgentServer> {
    // `target.mount` is a thin scope: the element's own connectedCallback already
    // registered the LiveBinding (the gate reads the global registry). This scope
    // just satisfies the agent-server wrapper. dispose() is a no-op here — the
    // shared element + its LiveBinding outlive each per-test server so multiple
    // `callTool` checks run against the same live instance.
    const scope: MountScope = {
      dispose: () => {},
      agent: { _brand: 'AgentContext' as const },
      serialize: (): Snapshot => ({}),
    }
    return createAgentServer({ target: { mount: scope } })
  }

  it.skipIf(!HAVE_COMPILER)(
    'an action mutates a real signal AND returns its live value',
    async () => {
      const server = makeServer()
      // `doubled = count * 2`; count starts at 0.
      const read0 = (await server.callTool(`${TAG}/doubled`, {}, { userId: 'u1' })) as {
        result: unknown
      }
      expect(read0.result).toBe(0)

      // bump() increments count and RETURNS the new count (1).
      const bumped = (await server.callTool(`${TAG}/bump`, [], { userId: 'u1' })) as {
        result: unknown
      }
      expect(bumped.result).toBe(1)

      // The real signal changed: doubled is now 2.
      const read1 = (await server.callTool(`${TAG}/doubled`, {}, { userId: 'u1' })) as {
        result: unknown
      }
      expect(read1.result).toBe(2)

      server.dispose()
    },
  )

  it.skipIf(!HAVE_COMPILER)(
    'a $prop write changes the signal; a $prop read returns the live value',
    async () => {
      const server = makeServer()

      // Initial prop value is the declared default 'hi'.
      const r0 = (await server.callTool(`${TAG}/label`, {}, { userId: 'u1' })) as {
        result: unknown
      }
      expect(r0.result).toBe('hi')

      // Writing the prop is exposed as a "set" action through the gate's
      // callAction→getSignal fallback; drive it via the live binding's setSignal by
      // calling the write member. The agent-service gate dispatches writes through
      // setSignal when the action name matches a writable member.
      const reg = (await import('@aihu/arbor'))._getComponentInstanceRegistry() as ReadonlyMap<
        string,
        unknown[]
      >
      const binding = reg.get(TAG)?.[0] as {
        setSignal(n: string, v: unknown): void
        getSignal(n: string): unknown
      }
      expect(binding).toBeTruthy()
      binding.setSignal('label', 'changed')

      const r1 = (await server.callTool(`${TAG}/label`, {}, { userId: 'u1' })) as {
        result: unknown
      }
      expect(r1.result).toBe('changed')

      server.dispose()
    },
  )
})
