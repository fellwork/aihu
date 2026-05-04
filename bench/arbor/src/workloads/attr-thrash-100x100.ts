/**
 * `attr-thrash-100x100` — 100 elements × 100 reactive attributes each.
 *
 * Per Round N+1 design §3.2 row 5:
 * > 100 elements × 100 reactive attrs each. Cycle every signal once.
 *
 * One full cycle (all 10k signal writes) = one op.
 *
 * Stresses reactive attribute binding throughput. After mounting once, each
 * op writes all 10k signals, which should each trigger one `el.setAttribute`
 * call via the reactive binding.
 *
 * **Scribe implementation.** Uses `branch('div', attrMap)` where `attrMap`
 * contains 100 reactive attrs (`Signal<unknown>` values in AttrMap). The
 * Signal tuple shape `[Read, Write]` is what `@scribe/arbor`'s `_applyAttrs`
 * detects as reactive (per spec §1.2 + §2.4: `Array.isArray(value)`).
 *
 * **Adapter-specific notes:**
 * - scribe: 100 branches each with 100 signal-keyed attrs. 10k signal writes
 *   per op, each triggering one effect re-run and one setAttribute call.
 * - lit-html: no fine-grained signals. Full re-render per op with new attr
 *   values. Reported as-is per design §5.3.
 * - solid-js: 100 components each with 100 `createSignal` bindings. Fine-
 *   grained: one signal write → one setAttribute. 10k writes per op.
 * - @vue/runtime-dom: 100 components each with 100 `ref` bindings. Vue may
 *   batch; the measurement captures the write cost.
 * - preact: no fine-grained signals. Full re-render per op. Reported as-is.
 * - vanilla: direct `element.setAttribute(key, String(v))` in a loop.
 *   Zero framework overhead — the theoretical minimum.
 *
 * **N override.** N=10 (memory phase). 100×100 signals × 10 graphs = 100k
 * live signals — large but within reason for the memory phase.
 */

import type { AttrMap, Node } from '@scribe/arbor'
import { branch } from '@scribe/arbor'
import type { Signal as GenericSignal } from '@scribe/signals'
import { signal } from '@scribe/signals'
import { ref, h as vueH } from '@vue/runtime-dom'
import { html as litHtml } from 'lit-html'
import type { VNode } from 'preact'
import { h as preactH } from 'preact'
import { createSignal } from 'solid-js'
import solidH from 'solid-js/h'

import { setLitTemplate, setLitUpdater } from '../competitors/lit.ts'
import { setPreactUpdater, setPreactVNode } from '../competitors/preact.ts'
import { setScribeHook } from '../competitors/scribe.ts'
import { setSolidComponent, setSolidSignalSetter } from '../competitors/solid.ts'
import { setVanillaMounter } from '../competitors/vanilla.ts'
import { setVueRefSetter, setVueRenderFn } from '../competitors/vue.ts'
import { getHost, releaseHost } from '../jsdom-host.ts'
import type { DomAdapter, WorkloadDefinition } from '../types.ts'

const ELEMENT_COUNT = 100
const ATTR_COUNT = 100

/** Generate an attr key safe for setAttribute: e.g. "data-a0" */
function attrKey(i: number): string {
  return `data-a${i}`
}

export const attrThrash: WorkloadDefinition = {
  name: 'attr-thrash-100x100',
  description: '100 elements × 100 reactive attrs each. Write all 10k signals once per op.',
  n: 10,
  build(adapter: DomAdapter) {
    // ---------- scribe ----------
    if (adapter.name === '@scribe/arbor') {
      // Build 100 branches each with 100 signal-keyed attrs.
      // Signals are created once (outside timed path); the tree is rebuilt per
      // op (setScribeHook.buildTree) but signals are shared across ops.
      const allSignals: GenericSignal<string>[] = Array.from(
        { length: ELEMENT_COUNT * ATTR_COUNT },
        (_, i) => signal(String(i)),
      )

      setScribeHook({
        buildTree(): Node {
          const elements = Array.from({ length: ELEMENT_COUNT }, (_, ei) => {
            const attrs: AttrMap = {}
            for (let ai = 0; ai < ATTR_COUNT; ai++) {
              // Safe: allSignals has ELEMENT_COUNT * ATTR_COUNT entries, indices
              // are bounded by the same constants.
              // Cast Signal<string> → Signal<unknown> for AttrMap compatibility.
              // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
              attrs[attrKey(ai)] = allSignals[ei * ATTR_COUNT + ai]! as GenericSignal<unknown>
            }
            return branch('div', attrs)
          })
          return branch(null, undefined, elements)
        },
      })

      const host = getHost()
      const session = adapter.setup(host)
      session.value.mount()

      let counter = 0
      return {
        run: () => {
          const v = String(++counter)
          for (let i = 0; i < allSignals.length; i++) {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            allSignals[i]?.[1](v)
          }
        },
        cleanup: () => {
          session.value.dispose()
          session.dispose()
          releaseHost(host)
        },
      }
    }

    // ---------- lit-html ----------
    // No fine-grained signals. Full re-render on each op with all new attr values.
    if (adapter.name === 'lit-html') {
      const currentAttrs = Array.from({ length: ELEMENT_COUNT * ATTR_COUNT }, (_, i) => String(i))

      setLitTemplate(
        () =>
          litHtml`<div>${Array.from({ length: ELEMENT_COUNT }, (_, ei) => {
            const attrs: Record<string, string> = {}
            for (let ai = 0; ai < ATTR_COUNT; ai++) {
              // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
              attrs[attrKey(ai)] = currentAttrs[ei * ATTR_COUNT + ai]!
            }
            // Build an element with data attrs via a static template
            return litHtml`<div .dataset=${attrs}></div>`
          })}</div>`,
      )

      setLitUpdater(
        (v) =>
          litHtml`<div>${Array.from({ length: ELEMENT_COUNT }, (_, _ei) => {
            const attrs: Record<string, string> = {}
            for (let ai = 0; ai < ATTR_COUNT; ai++) {
              attrs[attrKey(ai)] = String(v)
            }
            return litHtml`<div .dataset=${attrs}></div>`
          })}</div>`,
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
    // 100 × 100 = 10k createSignal bindings. Fine-grained: one write per attr.
    if (adapter.name === 'solid-js') {
      const setters: Array<(v: string) => void> = []

      setSolidComponent(() => {
        const elements = Array.from({ length: ELEMENT_COUNT }, (_e) => {
          const attrSignals = Array.from({ length: ATTR_COUNT }, (_, ai) => {
            const [get, set] = createSignal(String(ai))
            setters.push(set)
            return { key: attrKey(ai), get }
          })
          // Build props object with signal getters
          const props: Record<string, () => string> = {}
          for (const { key, get } of attrSignals) {
            props[key] = get
          }
          return solidH('div', props)
        })
        return solidH('div', null, ...elements)
      })

      // setSolidSignalSetter is used for a single setter; here we batch via run()
      setSolidSignalSetter(() => {
        /* not used — we batch via run() directly */
      })

      const host = getHost()
      const session = adapter.setup(host)
      session.value.mount()

      let counter = 0
      return {
        run: () => {
          const v = String(++counter)
          for (const set of setters) set(v)
        },
        cleanup: () => {
          session.value.dispose()
          session.dispose()
          releaseHost(host)
        },
      }
    }

    // ---------- @vue/runtime-dom ----------
    // 100 × 100 = 10k ref bindings. Vue may batch micro-task flushes.
    if (adapter.name === '@vue/runtime-dom') {
      const allRefs = Array.from({ length: ELEMENT_COUNT * ATTR_COUNT }, (_, i) => ref(String(i)))

      setVueRenderFn(() => {
        const elements = Array.from({ length: ELEMENT_COUNT }, (_, ei) => {
          const props: Record<string, string> = {}
          for (let ai = 0; ai < ATTR_COUNT; ai++) {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            props[attrKey(ai)] = allRefs[ei * ATTR_COUNT + ai]!.value
          }
          return vueH('div', props)
        })
        return vueH('div', null, elements)
      })

      setVueRefSetter(() => {
        /* not used — we batch via run() directly */
      })

      const host = getHost()
      const session = adapter.setup(host)
      session.value.mount()

      let counter = 0
      return {
        run: () => {
          const v = String(++counter)
          for (const r of allRefs) r.value = v
        },
        cleanup: () => {
          session.value.dispose()
          session.dispose()
          releaseHost(host)
        },
      }
    }

    // ---------- preact ----------
    // No fine-grained signals. Full re-render per op. Reported as-is.
    if (adapter.name === 'preact') {
      setPreactVNode(() => {
        const elements: VNode[] = Array.from({ length: ELEMENT_COUNT }, (_, ei) => {
          const props: Record<string, string> = {}
          for (let ai = 0; ai < ATTR_COUNT; ai++) {
            props[attrKey(ai)] = String(ei * ATTR_COUNT + ai)
          }
          return preactH('div', props) as VNode
        })
        return preactH('div', null, ...elements) as VNode
      })

      setPreactUpdater((v) => {
        const elements: VNode[] = Array.from({ length: ELEMENT_COUNT }, () => {
          const props: Record<string, string> = {}
          for (let ai = 0; ai < ATTR_COUNT; ai++) {
            props[attrKey(ai)] = String(v)
          }
          return preactH('div', props) as VNode
        })
        return preactH('div', null, ...elements) as VNode
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

    // ---------- vanilla ----------
    // Direct setAttribute loop — zero framework overhead, theoretical minimum.
    if (adapter.name === 'vanilla') {
      const elements: Element[] = []

      setVanillaMounter((host) => {
        const frag = document.createDocumentFragment()
        for (let ei = 0; ei < ELEMENT_COUNT; ei++) {
          const div = document.createElement('div')
          for (let ai = 0; ai < ATTR_COUNT; ai++) {
            div.setAttribute(attrKey(ai), String(ei * ATTR_COUNT + ai))
          }
          frag.appendChild(div)
          elements.push(div as unknown as Element)
        }
        host.appendChild(frag)
        return {
          update: (v: unknown) => {
            const str = String(v)
            for (const el of elements) {
              for (let ai = 0; ai < ATTR_COUNT; ai++) {
                el.setAttribute(attrKey(ai), str)
              }
            }
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

    throw new Error(`attr-thrash-100x100: adapter ${adapter.name} not supported`)
  },
}
