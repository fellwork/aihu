/**
 * `mount-10k-leaves` — the canonical wide-tree mount benchmark.
 *
 * Per Round N+1 design §3.2 row 1:
 * > Construct 10k static text leaves under a fragment, mount to host, dispose.
 * > One full cycle = one op.
 *
 * Stresses allocation throughput, attach throughput, and fragment handling.
 * This workload promotes the existing `tests/bench.test.ts` JSDOM smoke gate
 * (400 ms threshold for one mount) into a proper bench cell with comparator
 * runs.
 *
 * **N override (memory phase, spawn 3).** N=10. 10k leaves × 1000 graphs would
 * be 10M nodes — easily multi-GB. Documented per design §8.8.
 *
 * **Per-op shape.** Each op rebuilds the static tree from pre-allocated data
 * (cheap) and runs one full mount + dispose cycle. For aihu, the children
 * array is pre-allocated; `branch()` itself is the only per-op allocation on
 * the aihu path. For other adapters, the per-op cost includes their own
 * vnode/template allocation semantics (lit TemplateResult array, etc.).
 *
 * **Adapter-specific notes:**
 * - aihu: branch(null, undefined, children) — static leaf array pre-built.
 * - lit-html: array of html`<span>` TemplateResults pre-built outside timed path.
 * - solid-js: h('div', null, [...children]) — children array pre-built.
 * - @vue/runtime-dom: h('div', null, [...children]) — children array pre-built.
 * - preact: h('div', null, [...children]) — children array pre-built.
 * - vanilla: DocumentFragment built per-op (createDocumentFragment is O(1);
 *   the span creation IS part of what we measure for vanilla).
 */

import { branch, leaf } from '@aihu/arbor'
import { h as vueH } from '@vue/runtime-dom'
import type { TemplateResult } from 'lit-html'
import { html as litHtml } from 'lit-html'
import type { VNode } from 'preact'
import { h as preactH } from 'preact'
import solidH from 'solid-js/h'

import { setLitTemplate } from '../competitors/lit.ts'
import { setPreactVNode } from '../competitors/preact.ts'
import { setAihuHook } from '../competitors/aihu.ts'
import { setSolidComponent } from '../competitors/solid.ts'
import { setVanillaMounter } from '../competitors/vanilla.ts'
import { setVueRenderFn } from '../competitors/vue.ts'
import { getHost, releaseHost } from '../jsdom-host.ts'
import type { DomAdapter, WorkloadDefinition } from '../types.ts'

const LEAF_COUNT = 10_000

export const mountTenK: WorkloadDefinition = {
  name: 'mount-10k-leaves',
  description:
    'Mount 10k static text leaves under a fragment and dispose. One mount+dispose = 1 op.',
  n: 10,
  build(adapter: DomAdapter) {
    // ---------- aihu ----------
    if (adapter.name === '@aihu/arbor') {
      // Pre-allocate the children array once. Building a fresh `Leaf` per op
      // is included in the timed path (`Leaf` construction is part of the
      // workload), but keeping `Array.from` outside avoids measuring the
      // allocator's amortized growth pattern.
      const children = Array.from({ length: LEAF_COUNT }, (_, i) => leaf(String(i)))

      setAihuHook({
        buildTree() {
          return branch(null, undefined, children)
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
    if (adapter.name === 'lit-html') {
      // Build the children TemplateResult array once outside the timed path.
      // lit handles arrays of TemplateResults natively (renders each in order).
      const litChildren: TemplateResult[] = Array.from(
        { length: LEAF_COUNT },
        (_, i) => litHtml`<span>${i}</span>`,
      )

      setLitTemplate(() => litHtml`<div>${litChildren}</div>`)

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
    if (adapter.name === 'solid-js') {
      // Build the children h() array once outside the timed path.
      const solidChildren = Array.from({ length: LEAF_COUNT }, (_, i) =>
        solidH('span', null, String(i)),
      )

      setSolidComponent(() => solidH('div', null, ...solidChildren))

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
    if (adapter.name === '@vue/runtime-dom') {
      // Build the children vnode array once outside the timed path.
      const vueChildren = Array.from({ length: LEAF_COUNT }, (_, i) =>
        vueH('span', null, String(i)),
      )

      setVueRenderFn(() => vueH('div', null, vueChildren))

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
    if (adapter.name === 'preact') {
      // Build the children vnode array once outside the timed path.
      const preactChildren: VNode[] = Array.from({ length: LEAF_COUNT }, (_, i) =>
        preactH('span', null, String(i)),
      )

      setPreactVNode(() => preactH('div', null, ...preactChildren) as VNode)

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
      // For vanilla, span creation is part of each op (it IS the DOM work we
      // measure). We still set up the mounter outside the timed path; the
      // fragment build loop runs inside mount() on each op.
      setVanillaMounter((host) => {
        const frag = document.createDocumentFragment()
        for (let i = 0; i < LEAF_COUNT; i++) {
          const span = document.createElement('span')
          span.textContent = String(i)
          frag.appendChild(span)
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

    throw new Error(`mount-10k-leaves: adapter ${adapter.name} not supported`)
  },
}
