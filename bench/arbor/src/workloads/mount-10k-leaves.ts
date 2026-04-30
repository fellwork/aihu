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
 * **Per-op shape.** Each op rebuilds the static `branch()` tree from the
 * pre-allocated children array (cheap; `branch()` is a constructor) and runs
 * one full mount + dispose cycle. The children array itself is allocated
 * once outside the timed path so we measure mount throughput, not
 * `Array.from` allocation.
 */

import { branch, leaf } from '@scribe/arbor'

import { setScribeHook } from '../competitors/scribe.ts'
import { getHost, releaseHost } from '../jsdom-host.ts'
import type { DomAdapter, WorkloadDefinition } from '../types.ts'

const LEAF_COUNT = 10_000

export const mountTenK: WorkloadDefinition = {
  name: 'mount-10k-leaves',
  description:
    'Mount 10k static text leaves under a fragment and dispose. One mount+dispose = 1 op.',
  n: 10,
  build(adapter: DomAdapter) {
    // Pre-allocate the children array once. Building a fresh `Leaf` per op
    // is included in the timed path (`Leaf` construction is part of the
    // workload), but keeping `Array.from` outside avoids measuring the
    // allocator's amortized growth pattern.
    const children = Array.from({ length: LEAF_COUNT }, (_, i) => leaf(String(i)))

    // Spawn 1 only wires the scribe adapter. The hook handshake is scribe-
    // specific; spawn 2 generalizes per-adapter setup paths (lit and vanilla
    // skip the hook; solid/vue/preact use a similar but lib-specific shape).
    if (adapter.name !== '@scribe/arbor') {
      throw new Error(`mount-10k-leaves: adapter ${adapter.name} not implemented in spawn 1`)
    }

    setScribeHook({
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
  },
}
