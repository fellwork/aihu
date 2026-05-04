/**
 * `update-1-of-10k-leaves` — single reactive update in a 10k-leaf tree.
 *
 * Per Round N+1 design §3.2 row 4:
 * > After mounting the 10k-leaf tree (warmup), write the signal backing one
 * > specific leaf 1000 times. One write = one op.
 *
 * This is NOT a mount+dispose workload. The tree is mounted ONCE in `build()`
 * (warm-up); each timed op is a single signal write that propagates to one
 * DOM text node.
 *
 * Stresses fine-grained update propagation: how cheaply can each library
 * patch one DOM text node in a 10k-node tree?
 *
 * **Adapter-specific notes:**
 * - scribe: writes a `signal()` whose value is bound to leaf[0]. One signal
 *   write → one effect re-run → one DOM text patch.
 * - lit-html: no fine-grained reactivity. Each update re-renders the full
 *   10k-leaf template with the new value for leaf[0]. Reported as-is.
 * - solid-js: `createSignal` inside the component; setter captured. One
 *   signal write → one DOM text patch via solid's fine-grained scheduler.
 * - @vue/runtime-dom: `ref` inside the component; setter captured. Vue may
 *   batch micro-task flushes — the measurement captures the write cost.
 * - preact: no fine-grained signals. Full re-render on each update. Reported
 *   as-is per design §5.3.
 * - vanilla: direct `span.textContent = String(v)`. One DOM write, zero
 *   framework overhead — this is the theoretical minimum.
 *
 * **N override.** N=1. The memory phase measures one live 10k-leaf tree.
 */

import { branch, leaf } from '@scribe/arbor'
import { signal } from '@scribe/signals'
import { ref, h as vueH } from '@vue/runtime-dom'
import type { TemplateResult } from 'lit-html'
import { html as litHtml } from 'lit-html'
import type { VNode } from 'preact'
import { h as preactH } from 'preact'
import { createSignal } from 'solid-js'
import solidH from 'solid-js/h'

import { setLitTemplate, setLitUpdater } from '../competitors/lit.ts'
import { setPreactUpdater, setPreactVNode } from '../competitors/preact.ts'
import { setScribeHook } from '../competitors/scribe.ts'
import { setSolidComponent } from '../competitors/solid.ts'
import { setVanillaMounter } from '../competitors/vanilla.ts'
import { setVueRefSetter, setVueRenderFn } from '../competitors/vue.ts'
import { getHost, releaseHost } from '../jsdom-host.ts'
import type { DomAdapter, WorkloadDefinition } from '../types.ts'

const LEAF_COUNT = 10_000

export const updateOneOfTenK: WorkloadDefinition = {
  name: 'update-1-of-10k-leaves',
  description:
    'Mount 10k-leaf tree once, then write the signal for leaf[0] on each op. One signal write = 1 op.',
  n: 1,
  build(adapter: DomAdapter) {
    // ---------- scribe ----------
    if (adapter.name === '@scribe/arbor') {
      const targetSig = signal('0')
      const staticLeaves = Array.from({ length: LEAF_COUNT - 1 }, (_, i) => leaf(String(i + 1)))

      setScribeHook({
        buildTree() {
          return branch(null, undefined, [leaf(targetSig), ...staticLeaves])
        },
      })

      const host = getHost()
      const session = adapter.setup(host)
      session.value.mount()

      let counter = 0
      return {
        run: () => {
          // Write the signal — one effect re-run, one DOM text patch.
          targetSig[1](String(++counter))
        },
        cleanup: () => {
          session.value.dispose()
          session.dispose()
          releaseHost(host)
        },
      }
    }

    // ---------- lit-html ----------
    // lit has no fine-grained reactivity. Each update triggers a full re-render
    // of the entire 10k-leaf template with a new value for leaf[0].
    // Reported honestly — this is lit's real update cost for this workload shape.
    if (adapter.name === 'lit-html') {
      const staticItems = Array.from({ length: LEAF_COUNT - 1 }, (_, i) => i + 1)
      const staticTemplates: TemplateResult[] = staticItems.map((i) => litHtml`<span>${i}</span>`)

      setLitTemplate(() => litHtml`<div>${litHtml`<span>0</span>`}${staticTemplates}</div>`)
      setLitUpdater(
        (v) => litHtml`<div>${litHtml`<span>${String(v)}</span>`}${staticTemplates}</div>`,
      )

      const host = getHost()
      const session = adapter.setup(host)
      session.value.mount()

      let counter = 0
      return {
        run: () => {
          session.value.update(++counter)
        },
        cleanup: () => {
          session.value.dispose()
          session.dispose()
          releaseHost(host)
        },
      }
    }

    // ---------- solid-js ----------
    // createSignal inside the component; setter captured before mount.
    // One signal write → one DOM text patch via solid's fine-grained scheduler.
    if (adapter.name === 'solid-js') {
      let setter: ((v: string) => void) | null = null

      setSolidComponent(() => {
        const [val, setVal] = createSignal('0')
        setter = setVal
        const staticChildren = Array.from({ length: LEAF_COUNT - 1 }, (_, i) =>
          solidH('span', null, String(i + 1)),
        )
        return solidH('div', null, solidH('span', null, val), ...staticChildren)
      })

      const host = getHost()
      const session = adapter.setup(host)
      session.value.mount()

      let counter = 0
      return {
        run: () => {
          if (setter) setter(String(++counter))
        },
        cleanup: () => {
          session.value.dispose()
          session.dispose()
          releaseHost(host)
        },
      }
    }

    // ---------- @vue/runtime-dom ----------
    // ref inside the render fn; setter captured before mount via setVueRefSetter.
    if (adapter.name === '@vue/runtime-dom') {
      const r = ref('0')
      setVueRefSetter((v) => {
        r.value = String(v)
      })

      const staticChildren = Array.from({ length: LEAF_COUNT - 1 }, (_, i) =>
        vueH('span', null, String(i + 1)),
      )

      setVueRenderFn(() => vueH('div', null, [vueH('span', null, r.value), ...staticChildren]))

      const host = getHost()
      const session = adapter.setup(host)
      session.value.mount()

      let counter = 0
      return {
        run: () => {
          session.value.update(++counter)
        },
        cleanup: () => {
          session.value.dispose()
          session.dispose()
          releaseHost(host)
        },
      }
    }

    // ---------- preact ----------
    // preact has no fine-grained signals. Each update re-renders the entire
    // 10k-leaf template with a new value for leaf[0]. Reported as-is.
    if (adapter.name === 'preact') {
      const staticChildren: VNode[] = Array.from(
        { length: LEAF_COUNT - 1 },
        (_, i) => preactH('span', null, String(i + 1)) as VNode,
      )

      setPreactVNode(
        () => preactH('div', null, preactH('span', null, '0'), ...staticChildren) as VNode,
      )
      setPreactUpdater(
        (v) => preactH('div', null, preactH('span', null, String(v)), ...staticChildren) as VNode,
      )

      const host = getHost()
      const session = adapter.setup(host)
      session.value.mount()

      let counter = 0
      return {
        run: () => {
          session.value.update(++counter)
        },
        cleanup: () => {
          session.value.dispose()
          session.dispose()
          releaseHost(host)
        },
      }
    }

    // ---------- vanilla ----------
    // Direct textContent write on span[0]. Zero framework overhead — the
    // theoretical minimum for one DOM text patch.
    if (adapter.name === 'vanilla') {
      let targetSpan: HTMLSpanElement | null = null

      setVanillaMounter((host) => {
        const frag = document.createDocumentFragment()
        const first = document.createElement('span')
        first.textContent = '0'
        frag.appendChild(first)
        targetSpan = first as unknown as HTMLSpanElement

        for (let i = 1; i < LEAF_COUNT; i++) {
          const span = document.createElement('span')
          span.textContent = String(i)
          frag.appendChild(span)
        }
        host.appendChild(frag)
        return {
          update: (v: unknown) => {
            if (targetSpan) targetSpan.textContent = String(v)
          },
        }
      })

      const host = getHost()
      const session = adapter.setup(host)
      session.value.mount()

      let counter = 0
      return {
        run: () => {
          session.value.update(++counter)
        },
        cleanup: () => {
          session.value.dispose()
          session.dispose()
          releaseHost(host)
        },
      }
    }

    throw new Error(`update-1-of-10k-leaves: adapter ${adapter.name} not supported`)
  },
}
