/**
 * `krausest-1k-cycle` — three-phase JS-framework-benchmark-inspired cycle.
 *
 * Per Round N+1 design §3.2 row 6 and §3.5:
 * > Create 1000 rows → partial-update every 10th row → clear all.
 * > The three phases run as ONE timed op.
 *
 * Row shape: `<tr><td>{id}</td><td>{label}</td></tr>`
 *
 * Phases:
 *   1. Create 1000 rows (build + mount)
 *   2. Update rows where `i % 10 === 0` (100 rows)
 *   3. Clear all rows (dispose/unmount)
 *
 * **JSDOM-relative note.** This is a JSDOM-relative, order-of-magnitude
 * comparison only; not a direct equivalent of the krausest leaderboard which
 * measures browser layout + paint. JSDOM has no layout engine — the numbers
 * show JS execution cost only. Matches design §3.5.
 *
 * **Adapter-specific notes:**
 * - aihu: 1000 branch('tr') trees with signal-bound leaf for label.
 *   Each op: rebuild the 1000 branches (create), mount, drive 100 signal
 *   writes (partial update), dispose (clear).
 * - lit-html: create all rows in one template, render, update (re-render
 *   with changed labels for rows i%10===0), render(nothing) to clear.
 * - solid-js: create reactive rows, update signals for i%10===0, unmount.
 * - @vue/runtime-dom: create rows with refs for labels, update refs, unmount.
 * - preact: full re-renders for each phase.
 * - vanilla: createElement loops, textContent updates for partial update,
 *   removeChild loop for clear.
 *
 * **N override.** N=10 (memory phase — 1000 rows × 10 graphs = 10k live
 * row objects between phases).
 */

import { branch, leaf } from '@aihu/arbor'
import type { Signal } from '@aihu/signals'
import { signal } from '@aihu/signals'
import type { Ref } from '@vue/runtime-dom'
import { ref, h as vueH } from '@vue/runtime-dom'
import type { TemplateResult } from 'lit-html'
import { html as litHtml } from 'lit-html'
import type { VNode } from 'preact'
import { h as preactH } from 'preact'
import { createSignal } from 'solid-js'
import solidH from 'solid-js/h'

import { setLitTemplate, setLitUpdater } from '../competitors/lit.ts'
import { setPreactUpdater, setPreactVNode } from '../competitors/preact.ts'
import { setAihuHook } from '../competitors/aihu.ts'
import { setSolidComponent } from '../competitors/solid.ts'
import { setVanillaMounter } from '../competitors/vanilla.ts'
import { setVueRenderFn } from '../competitors/vue.ts'
import { getHost, releaseHost } from '../jsdom-host.ts'
import type { DomAdapter, WorkloadDefinition } from '../types.ts'

const ROW_COUNT = 1_000

/** Build an array of row data for a fresh "create" phase. */
function makeRows(count: number): Array<{ id: number; label: string }> {
  return Array.from({ length: count }, (_, i) => ({ id: i + 1, label: `item-${i + 1}` }))
}

export const krausest1k: WorkloadDefinition = {
  name: 'krausest-1k-cycle',
  description:
    'Create 1000 rows, partial-update every 10th, clear. Three-phase timed as one op. JSDOM-relative.',
  n: 10,
  build(adapter: DomAdapter) {
    // ---------- aihu ----------
    if (adapter.name === '@aihu/arbor') {
      const host = getHost()

      // Label signals are rebuilt each op (create phase).
      let labelSignals: Signal<string>[] = []

      setAihuHook({
        buildTree() {
          labelSignals = Array.from({ length: ROW_COUNT }, (_, i) => signal(`item-${i + 1}`))
          const rows = Array.from({ length: ROW_COUNT }, (_, i) => {
            const id = i + 1
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            return branch('tr', undefined, [
              branch('td', undefined, [leaf(String(id))]),
              branch('td', undefined, [leaf(labelSignals[i]!)]),
            ])
          })
          return branch(null, undefined, rows)
        },
      })

      const session = adapter.setup(host)
      const ctx = session.value

      return {
        run: () => {
          // Phase 1: create — mounts the tree (buildTree runs here via mount())
          ctx.mount()
          // Phase 2: partial update — update every 10th row's label signal
          for (let i = 0; i < ROW_COUNT; i += 10) {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            labelSignals[i]?.[1](`updated-${i + 1}`)
          }
          // Phase 3: clear — dispose tears down all effects and removes DOM
          ctx.dispose()
        },
        cleanup: () => {
          session.dispose()
          releaseHost(host)
        },
      }
    }

    // ---------- lit-html ----------
    // JSDOM-relative. Three render() calls = three full template diffs.
    if (adapter.name === 'lit-html') {
      const host = getHost()

      const makeTemplate = (rows: Array<{ id: number; label: string }>): TemplateResult =>
        litHtml`<table><tbody>${rows.map(
          (r) => litHtml`<tr><td>${r.id}</td><td>${r.label}</td></tr>`,
        )}</tbody></table>`

      // Initial template (irrelevant; replaced each op)
      setLitTemplate(() => makeTemplate(makeRows(ROW_COUNT)))
      setLitUpdater(() => makeTemplate(makeRows(ROW_COUNT)))

      const session = adapter.setup(host)
      const ctx = session.value

      return {
        run: () => {
          // Phase 1: create
          const rows = makeRows(ROW_COUNT)
          ctx.update(rows) // re-renders with initial rows (uses updater slot)

          // Phase 2: partial update — update labels in-place and re-render
          for (let i = 0; i < ROW_COUNT; i += 10) {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            rows[i]!.label = `updated-${i + 1}`
          }
          ctx.update(rows)

          // Phase 3: clear
          ctx.dispose()
        },
        cleanup: () => {
          session.dispose()
          releaseHost(host)
        },
      }
    }

    // ---------- solid-js ----------
    // Fine-grained: signal per row label. Partial update writes 100 signals.
    if (adapter.name === 'solid-js') {
      const host = getHost()
      let labelSetters: Array<(v: string) => void> = []

      setSolidComponent(() => {
        labelSetters = []
        const rows = Array.from({ length: ROW_COUNT }, (_, i) => {
          const [label, setLabel] = createSignal(`item-${i + 1}`)
          labelSetters.push(setLabel)
          const id = i + 1
          return solidH('tr', null, solidH('td', null, String(id)), solidH('td', null, label))
        })
        return solidH('table', null, solidH('tbody', null, ...rows))
      })

      const session = adapter.setup(host)
      const ctx = session.value

      return {
        run: () => {
          // Phase 1: create
          ctx.mount()
          // Phase 2: partial update
          for (let i = 0; i < ROW_COUNT; i += 10) {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            labelSetters[i]?.(`updated-${i + 1}`)
          }
          // Phase 3: clear
          ctx.dispose()
        },
        cleanup: () => {
          session.dispose()
          releaseHost(host)
        },
      }
    }

    // ---------- @vue/runtime-dom ----------
    // Ref per row label. Partial update writes 100 refs.
    if (adapter.name === '@vue/runtime-dom') {
      const host = getHost()
      const labelRefs: Ref<string>[] = Array.from(
        { length: ROW_COUNT },
        (_, i) => ref(`item-${i + 1}`) as Ref<string>,
      )

      setVueRenderFn(() => {
        const rows = Array.from({ length: ROW_COUNT }, (_, i) => {
          const id = i + 1
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          return vueH('tr', null, [
            vueH('td', null, String(id)),
            vueH('td', null, labelRefs[i]?.value),
          ])
        })
        return vueH('table', null, [vueH('tbody', null, rows)])
      })

      const session = adapter.setup(host)
      const ctx = session.value

      return {
        run: () => {
          // Phase 1: create — reset refs and mount
          for (let i = 0; i < ROW_COUNT; i++) {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            labelRefs[i]!.value = `item-${i + 1}`
          }
          ctx.mount()
          // Phase 2: partial update
          for (let i = 0; i < ROW_COUNT; i += 10) {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            labelRefs[i]!.value = `updated-${i + 1}`
          }
          // Phase 3: clear
          ctx.dispose()
        },
        cleanup: () => {
          session.dispose()
          releaseHost(host)
        },
      }
    }

    // ---------- preact ----------
    // Full re-render for each phase. JSDOM-relative.
    if (adapter.name === 'preact') {
      const host = getHost()

      const makeVNode = (rows: Array<{ id: number; label: string }>): VNode =>
        preactH(
          'table',
          null,
          preactH(
            'tbody',
            null,
            ...rows.map((r) =>
              preactH('tr', null, preactH('td', null, String(r.id)), preactH('td', null, r.label)),
            ),
          ),
        ) as VNode

      setPreactVNode(() => makeVNode(makeRows(ROW_COUNT)))
      setPreactUpdater((v) => makeVNode(v as Array<{ id: number; label: string }>))

      const session = adapter.setup(host)
      const ctx = session.value

      return {
        run: () => {
          // Phase 1: create
          const rows = makeRows(ROW_COUNT)
          ctx.update(rows)
          // Phase 2: partial update
          for (let i = 0; i < ROW_COUNT; i += 10) {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            rows[i]!.label = `updated-${i + 1}`
          }
          ctx.update(rows)
          // Phase 3: clear
          ctx.dispose()
        },
        cleanup: () => {
          session.dispose()
          releaseHost(host)
        },
      }
    }

    // ---------- vanilla ----------
    // createElement loops, textContent for partial update, removeChild for clear.
    if (adapter.name === 'vanilla') {
      const host = getHost()
      let tdLabels: Element[] = []

      setVanillaMounter((host) => {
        tdLabels = []
        const table = document.createElement('table')
        const tbody = document.createElement('tbody')
        for (let i = 0; i < ROW_COUNT; i++) {
          const tr = document.createElement('tr')
          const tdId = document.createElement('td')
          tdId.textContent = String(i + 1)
          const tdLabel = document.createElement('td')
          tdLabel.textContent = `item-${i + 1}`
          tdLabels.push(tdLabel as unknown as Element)
          tr.appendChild(tdId)
          tr.appendChild(tdLabel)
          tbody.appendChild(tr)
        }
        table.appendChild(tbody)
        host.appendChild(table)
        return {
          update: (_v: unknown) => {
            // v is ignored; partial update writes every 10th label
            for (let i = 0; i < ROW_COUNT; i += 10) {
              // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
              tdLabels[i]!.textContent = `updated-${i + 1}`
            }
          },
        }
      })

      const session = adapter.setup(host)
      const ctx = session.value

      return {
        run: () => {
          // Phase 1: create
          ctx.mount()
          // Phase 2: partial update
          ctx.update(null)
          // Phase 3: clear
          ctx.dispose()
        },
        cleanup: () => {
          session.dispose()
          releaseHost(host)
        },
      }
    }

    throw new Error(`krausest-1k-cycle: adapter ${adapter.name} not supported`)
  },
}
