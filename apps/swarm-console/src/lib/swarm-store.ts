/**
 * Shared module-level singleton for the swarm bus connection — the
 * componentized console's one and only call site for `useSwarm()`/`useNow()`.
 *
 * The console used to be a single `.aihu` SFC (`components/swarm-console.aihu`)
 * that called `useSwarm()` once and rendered everything itself. It is now
 * split into 6 components (this file's consumers: swarm-header, your-move,
 * contracts-ledger, agents-roster, activity-log, and the swarm-console root
 * shell), each of which needs the SAME live state.
 *
 * `useSwarm()` opens a real `EventSource` per call (see
 * `@aihu/use/useSwarm`'s own module doc) — calling it once per component
 * would open 6 duplicate SSE connections to the bus. The framework DOES have
 * a real component-prop mechanism (`$prop`, plain-curly `<Comp prop={v}>` per
 * docs/superpowers/specs/2026-05-02-spec-template-attribute-syntax.md §3.3,
 * §10.2's `<UserCard user={u} count={n} />`), which is the "actual
 * props/composition mechanism" this rebuild's brief asks to prefer. It was
 * deliberately NOT used here: propagating one large, multi-field reactive
 * object (`SwarmState`, ~7 arrays) down through 6 new component boundaries is
 * untested reactivity-propagation surface on a compiler with known rough
 * edges THIS EXACT APP already hit once (see the original swarm-console.aihu
 * history: a `derived()` that failed to lower, and an object-literal property
 * with a bare ternary that the compiler misread as a state declaration).
 * Risking a NEW untested path on top of those known traps, for a
 * single-operator internal ops tool with no other consumer, was judged not
 * worth it — this is the documented fallback the brief itself sanctions:
 * "root calls once and children read a shared module-level instance."
 *
 * ES modules evaluate their top level exactly once no matter how many files
 * import them, so `useSwarm()`/`useNow()` below run ONE time for the whole
 * app regardless of how many components import `swarm`/`clock` from here —
 * there is exactly one `EventSource` connection, same as the pre-split
 * single-SFC version. Each component reads this shared instance directly and
 * derives its own slice of state from it (mirroring exactly how the
 * pre-split file derived each section's rows inline).
 */

import { useNow } from '@aihu/use/useNow'
import { useSwarm } from '@aihu/use/useSwarm'

export const swarm = useSwarm()

// A 1s tick, used only by swarm-header to re-evaluate "has it been >5s since
// the last frame" — the freshness check needs a clock independent of the bus.
export const clock = useNow({ interval: 1000 })
