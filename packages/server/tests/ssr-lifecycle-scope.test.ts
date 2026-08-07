// @vitest-environment node
/**
 * Both render paths must supply BOTH halves of the server-render environment.
 *
 * Setup runs outside `defineComponent`, so lifecycle hooks have no owner — that
 * is what the SSR lifecycle sink covers. But `onCleanup` does not use the owner
 * pointer at all: it resolves through `getCurrentScope()`. The walker happened
 * to open an effect scope and the compiled fast path did not, so each path held
 * a different half and the same component rendered on one and threw on the
 * other. `onCleanup` is not exotic — `$stream`, `$controller`, router
 * boundaries and most composables register through it.
 *
 * Tested against `renderToString` directly rather than a compiled fixture: the
 * differential harness's `transform()` path does not auto-import lifecycle
 * names, so a compiled fixture fails on `onMount is not defined` and would
 * prove nothing about the scope.
 */

import { branch, leaf } from '@aihu/arbor'
import { onCleanup, onMount } from '@aihu/runtime'
import { describe, expect, it } from 'vitest'
import { attachSsrString, renderToString } from '../src/ssr.ts'

/** A component factory whose setup registers lifecycle hooks, like real code. */
function lifecycleComponent(): () => unknown {
  const build = () => {
    onMount(() => {})
    onCleanup(() => {})
    return branch('div', { class: 'life' }, [leaf('ok')])
  }
  return build
}

describe('the WALKER path', () => {
  it('renders a component that registers onMount and onCleanup', async () => {
    const html = await renderToString(lifecycleComponent(), { hydratable: true })
    expect(html).toContain('class="life"')
  })
})

describe('the COMPILED FAST path', () => {
  it('renders a component that registers onMount and onCleanup', async () => {
    // Mimic a compiled artifact: a factory carrying `__aihu_ssr_string__`, so
    // `renderToString` takes the fast path rather than the walker.
    const comp = lifecycleComponent()
    attachSsrString(
      comp,
      () => {
        onMount(() => {})
        onCleanup(() => {})
        return '<div class="life">ok</div>'
      },
      {},
    )
    const html = await renderToString(comp, { hydratable: true })
    expect(html).toContain('class="life"')
  })

  it('does not leave the lifecycle window open afterwards', async () => {
    const comp = lifecycleComponent()
    attachSsrString(comp, () => '<div></div>', {})
    await renderToString(comp, { hydratable: true })
    // A leaked window would silence genuine onMount misuse for the rest of the
    // process.
    expect(() => onMount(() => {})).toThrow(/no owner/)
  })
})
