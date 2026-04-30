/**
 * `mount-wide-1000` — 1000 sibling branches, each with one reactive text leaf.
 *
 * Per Round N+1 design §3.2 row 3:
 * > 1000 sibling branches, each with 1 reactive leaf.
 *
 * One full mount+dispose cycle = one op.
 *
 * Stresses how adapters handle a large number of top-level sibling reactive
 * bindings. Each branch contains one signal-bound text node. The initial mount
 * fires all 1000 effects that bind signal values to DOM text nodes. This is
 * different from mount-10k-leaves (static text, wide) — here every leaf is
 * reactive even though we don't drive updates.
 *
 * For non-scribe adapters, reactive bindings are not always available at this
 * granularity. Adapters report the closest equivalent:
 * - lit-html: no signals; each branch renders a static text span.
 * - solid-js: each branch is a component with a `createSignal`; the signal
 *   fires once on mount (initial reactive binding) but is not updated.
 * - @vue/runtime-dom: each branch uses a `ref`; same initial-effect semantics.
 * - preact: no fine-grained signals; each branch renders a static span.
 * - vanilla: 1000 spans with textContent set directly.
 *
 * **N override.** N=100 (memory phase). 1000 reactive signals × 100 graphs =
 * 100k live signals — manageable but large enough to be meaningful.
 */

import { html as litHtml } from 'lit-html'
import { h as preactH } from 'preact'
import type { VNode } from 'preact'
import { createSignal } from 'solid-js'
import solidH from 'solid-js/h'
import { h as vueH, ref } from '@vue/runtime-dom'

import { branch, leaf } from '@scribe/arbor'
import { signal } from '@scribe/signals'

import { setLitTemplate } from '../competitors/lit.ts'
import { setPreactVNode } from '../competitors/preact.ts'
import { setScribeHook } from '../competitors/scribe.ts'
import { setSolidComponent } from '../competitors/solid.ts'
import { setVanillaMounter } from '../competitors/vanilla.ts'
import { setVueRenderFn } from '../competitors/vue.ts'
import { getHost, releaseHost } from '../jsdom-host.ts'
import type { DomAdapter, WorkloadDefinition } from '../types.ts'

const BRANCH_COUNT = 1_000

export const mountWide: WorkloadDefinition = {
  name: 'mount-wide-1000',
  description:
    'Mount 1000 sibling branches each with 1 reactive text leaf and dispose. One mount+dispose = 1 op.',
  n: 100,
  build(adapter: DomAdapter) {
    // ---------- scribe ----------
    if (adapter.name === '@scribe/arbor') {
      setScribeHook({
        buildTree() {
          // Each branch holds a signal-bound leaf. The signals are created
          // fresh each op (inside buildTree) so each mount has a live reactive
          // binding that fires exactly once during mount.
          const branches = Array.from({ length: BRANCH_COUNT }, (_, i) => {
            const sig = signal(String(i))
            return branch('div', undefined, [leaf(sig)])
          })
          return branch(null, undefined, branches)
        },
      })

      const host = getHost()
      const session = adapter.setup(host)
      const ctx = session.value

      return {
        run: () => {
          ctx.mount()
          ctx.dispose()
        },
        cleanup: () => {
          session.dispose()
          releaseHost(host)
        },
      }
    }

    // ---------- lit-html ----------
    // lit has no fine-grained signals. We render 1000 static text spans —
    // the mount cost is the honest measurement for lit at this workload shape.
    if (adapter.name === 'lit-html') {
      const items = Array.from({ length: BRANCH_COUNT }, (_, i) => i)
      setLitTemplate(() => litHtml`<div>${items.map((i) => litHtml`<div><span>${i}</span></div>`)}</div>`)

      const host = getHost()
      const session = adapter.setup(host)
      const ctx = session.value

      return {
        run: () => {
          ctx.mount()
          ctx.dispose()
        },
        cleanup: () => {
          session.dispose()
          releaseHost(host)
        },
      }
    }

    // ---------- solid-js ----------
    // Each branch is a component with a createSignal. The signal fires once
    // on mount (initial reactive binding). No updates are driven.
    if (adapter.name === 'solid-js') {
      setSolidComponent(() => {
        const children = Array.from({ length: BRANCH_COUNT }, (_, i) => {
          const [val] = createSignal(String(i))
          return solidH('div', null, solidH('span', null, val))
        })
        return solidH('div', null, ...children)
      })

      const host = getHost()
      const session = adapter.setup(host)
      const ctx = session.value

      return {
        run: () => {
          ctx.mount()
          ctx.dispose()
        },
        cleanup: () => {
          session.dispose()
          releaseHost(host)
        },
      }
    }

    // ---------- @vue/runtime-dom ----------
    // Each branch's render fn closes over a ref. The ref is read once during
    // mount (initial reactive binding). No updates are driven.
    if (adapter.name === '@vue/runtime-dom') {
      setVueRenderFn(() => {
        const children = Array.from({ length: BRANCH_COUNT }, (_, i) => {
          const r = ref(String(i))
          return vueH('div', null, [vueH('span', null, r.value)])
        })
        return vueH('div', null, children)
      })

      const host = getHost()
      const session = adapter.setup(host)
      const ctx = session.value

      return {
        run: () => {
          ctx.mount()
          ctx.dispose()
        },
        cleanup: () => {
          session.dispose()
          releaseHost(host)
        },
      }
    }

    // ---------- preact ----------
    // preact has no fine-grained signals in this bench. 1000 static branches.
    if (adapter.name === 'preact') {
      const children: VNode[] = Array.from({ length: BRANCH_COUNT }, (_, i) =>
        preactH('div', null, preactH('span', null, String(i))) as VNode,
      )
      setPreactVNode(() => preactH('div', null, ...children) as VNode)

      const host = getHost()
      const session = adapter.setup(host)
      const ctx = session.value

      return {
        run: () => {
          ctx.mount()
          ctx.dispose()
        },
        cleanup: () => {
          session.dispose()
          releaseHost(host)
        },
      }
    }

    // ---------- vanilla ----------
    if (adapter.name === 'vanilla') {
      setVanillaMounter((host) => {
        const frag = document.createDocumentFragment()
        for (let i = 0; i < BRANCH_COUNT; i++) {
          const div = document.createElement('div')
          const span = document.createElement('span')
          span.textContent = String(i)
          div.appendChild(span)
          frag.appendChild(div)
        }
        host.appendChild(frag)
        return {}
      })

      const host = getHost()
      const session = adapter.setup(host)
      const ctx = session.value

      return {
        run: () => {
          ctx.mount()
          ctx.dispose()
        },
        cleanup: () => {
          session.dispose()
          releaseHost(host)
        },
      }
    }

    throw new Error(`mount-wide-1000: adapter ${adapter.name} not supported`)
  },
}
