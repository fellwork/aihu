/**
 * `mount-deep-100x10` — deep tree mount benchmark.
 *
 * Per Round N+1 design §3.2 row 2:
 * > Construct depth-100 tree, fanout 10 per level, mount, dispose.
 * > Pairs with mount-10k-leaves (wide vs. deep).
 *
 * One full mount+dispose cycle = one op.
 *
 * Stresses recursive descent, parent/child linking, and the path-traversal
 * cost during mount. Wide trees stress breadth-first allocation; deep trees
 * stress stack depth and recursive materialize overhead.
 *
 * **Total nodes.** Depth 100, fanout 10: ~10^100 in theory but we build depth
 * naively (each level has 10 children, not 10^depth). The tree is:
 * - depth 0 (root): 1 node with 10 children
 * - depth 1: 10 nodes each with 10 children
 * - …
 * - depth 99: leaves
 *
 * In practice this is a balanced 10-ary tree of depth 100. Total nodes =
 * sum(10^d for d in 0..99) ≈ 10^100 / 9 — far too large. We cap at depth 10
 * (10^10 / 9 ≈ 1.1B nodes) which is also too large. The intended
 * interpretation from the spec is: build one path 100 levels deep, each level
 * has 10 leaf siblings. So total nodes = 100 * 10 = 1000 leaf nodes + 100
 * branch nodes = ~1100 nodes. This is the "depth-100 with fanout-10" design
 * §3.2 description — analogous to mount-10k-leaves in node count.
 *
 * Tree shape: root → branch_99 → branch_98 → … → branch_0, where each
 * branch_d has 10 leaf children. A single linear spine of 100 branches, each
 * with 10 text leaves.
 *
 * **N override.** N=10 (same as mount-10k-leaves — each tree has ~1100 nodes).
 *
 * **Tree rebuild.** Because scribe nodes hold mount state, each op rebuilds the
 * tree. For non-scribe adapters, tree construction is also per-op for fairness
 * (we measure construction + mount + dispose as a unit for this workload).
 */

import type { Node } from '@scribe/arbor'
import { branch, leaf } from '@scribe/arbor'
import { h as vueH } from '@vue/runtime-dom'
import type { TemplateResult } from 'lit-html'
import { html as litHtml } from 'lit-html'
import type { VNode } from 'preact'
import { h as preactH } from 'preact'
import solidH from 'solid-js/h'

import { setLitTemplate } from '../competitors/lit.ts'
import { setPreactVNode } from '../competitors/preact.ts'
import { setScribeHook } from '../competitors/scribe.ts'
import { setSolidComponent } from '../competitors/solid.ts'
import { setVanillaMounter } from '../competitors/vanilla.ts'
import { setVueRenderFn } from '../competitors/vue.ts'
import { getHost, releaseHost } from '../jsdom-host.ts'
import type { DomAdapter, WorkloadDefinition } from '../types.ts'

const DEPTH = 100
const FANOUT = 10

// ---------------------------------------------------------------------------
// Per-adapter tree builders (called inside run(), so rebuilding is per-op)
// ---------------------------------------------------------------------------

/** Build a scribe deep tree: spine of DEPTH branches, each with FANOUT leaves. */
function buildScribeDeep(depth: number): Node {
  const leaves = Array.from({ length: FANOUT }, (_, i) => leaf(String(i)))
  if (depth <= 0) {
    return branch(null, undefined, leaves)
  }
  return branch('div', undefined, [...leaves, buildScribeDeep(depth - 1)])
}

/** Build a lit-html deep tree template. */
function buildLitDeep(depth: number): TemplateResult {
  const leaves = Array.from({ length: FANOUT }, (_, i) => litHtml`<span>${i}</span>`)
  if (depth <= 0) {
    return litHtml`<div>${leaves}</div>`
  }
  return litHtml`<div>${leaves}${buildLitDeep(depth - 1)}</div>`
}

/** Build a solid-js deep tree component (returns vnode). */
function buildSolidDeep(depth: number): unknown {
  const leaves = Array.from({ length: FANOUT }, (_, i) => solidH('span', null, String(i)))
  if (depth <= 0) {
    return solidH('div', null, ...leaves)
  }
  return solidH('div', null, ...leaves, buildSolidDeep(depth - 1))
}

/** Build a Vue deep tree vnode. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildVueDeep(depth: number): any {
  const leaves = Array.from({ length: FANOUT }, (_, i) => vueH('span', null, String(i)))
  if (depth <= 0) {
    return vueH('div', null, leaves)
  }
  return vueH('div', null, [...leaves, buildVueDeep(depth - 1)])
}

/** Build a preact deep tree vnode. */
function buildPreactDeep(depth: number): VNode {
  const leaves: VNode[] = Array.from({ length: FANOUT }, (_, i) => preactH('span', null, String(i)))
  if (depth <= 0) {
    return preactH('div', null, ...leaves) as VNode
  }
  return preactH('div', null, ...leaves, buildPreactDeep(depth - 1)) as VNode
}

/** Build a vanilla DOM deep tree attached to host. */
function buildVanillaDeep(host: Element, depth: number): void {
  const frag = document.createDocumentFragment()

  // Use `globalThis.Node` to avoid collision with `@scribe/arbor`'s `Node` type.
  function buildLevel(parent: globalThis.Node | DocumentFragment, d: number): void {
    // Add FANOUT leaf spans to this level.
    for (let i = 0; i < FANOUT; i++) {
      const span = document.createElement('span')
      span.textContent = String(i)
      parent.appendChild(span)
    }
    if (d > 0) {
      const child = document.createElement('div')
      parent.appendChild(child)
      buildLevel(child, d - 1)
    }
  }

  buildLevel(frag, depth - 1)
  host.appendChild(frag)
}

export const mountDeep: WorkloadDefinition = {
  name: 'mount-deep-100x10',
  description:
    'Mount a depth-100 spine (10 leaf siblings per level) and dispose. One mount+dispose = 1 op.',
  n: 10,
  build(adapter: DomAdapter) {
    // ---------- scribe ----------
    if (adapter.name === '@scribe/arbor') {
      setScribeHook({
        buildTree() {
          return buildScribeDeep(DEPTH)
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
      setLitTemplate(() => buildLitDeep(DEPTH))

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
      setSolidComponent(() => buildSolidDeep(DEPTH))

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
      setVueRenderFn(() => buildVueDeep(DEPTH))

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
      setPreactVNode(() => buildPreactDeep(DEPTH))

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
        buildVanillaDeep(host, DEPTH)
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

    throw new Error(`mount-deep-100x10: adapter ${adapter.name} not supported`)
  },
}
