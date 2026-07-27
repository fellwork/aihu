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

import { signal } from '@aihu/signals'
import { useNow } from '@aihu/use/useNow'
import { useSwarm } from '@aihu/use/useSwarm'

export const swarm = useSwarm()

// A 1s tick, used only by swarm-header to re-evaluate "has it been >5s since
// the last frame" — the freshness check needs a clock independent of the bus.
export const clock = useNow({ interval: 1000 })

/* ---------------------------------------------------------------------------
   Tab routing — `location.hash`-based (founder brief: "sections as pages",
   `#/contracts` etc., refresh/deep-link safe). A plain module-level signal,
   NOT the `.aihu` `@state` block's `state()`/`derived()` sugar — that macro
   only exists inside a compiled SFC's `@state` block (it is a compile-time
   source transform, per the compiler's "state_wrappers scanner" this app's
   other doc comments already describe); this file is ordinary TypeScript,
   so it uses the real `@aihu/signals` primitives directly, same as
   `useWindowSize`/`useTimestamp` do internally. Consumers import `activeTab`
   (a plain `Read<TabId>` getter, exactly like `swarm.state`/`clock.now`
   above) and read it as `activeTab()` — parens required, same convention as
   every other external-getter import already used by this app's components.

   SSR-guarded like everything else in this app: `tabFromHash`/the
   `hashchange` listener only ever touch `location`/`window` behind a
   `typeof` check, so this module has no effect under SSR beyond seeding the
   default tab. --------------------------------------------------------- */

export const TAB_IDS = ['your-move', 'contracts', 'agents', 'activity'] as const
export type TabId = (typeof TAB_IDS)[number]

const DEFAULT_TAB: TabId = 'your-move'

function isTabId(value: string): value is TabId {
  return (TAB_IDS as readonly string[]).includes(value)
}

/** Hash forms accepted: `#/contracts`, `#contracts` (defensive), empty ->
 * default tab. Unrecognized fragments also fall back to the default rather
 * than rendering a blank page. */
function tabFromHash(): TabId {
  if (typeof location === 'undefined') return DEFAULT_TAB
  const raw = location.hash.replace(/^#\/?/, '')
  return isTabId(raw) ? raw : DEFAULT_TAB
}

const [activeTab, setActiveTab] = signal<TabId>(tabFromHash())

export { activeTab }

/* ---------------------------------------------------------------------------
   Pagination — one page-number signal per paginated list (founder addendum:
   "pages must not grow long" — cap rows per page, paginate INSIDE the tab).
   Each page signal resets to `1` on every tab switch (addendum: "resets on
   tab switch"); sharing the ONE `hashchange` listener below for both tab
   switching and page reset keeps them atomic — there is no frame where a
   stale page number from a previously-viewed tab could render against the
   newly-active tab's (unrelated) list.
   --------------------------------------------------------------------------- */

/** Founder-tuned: "~12-15 rows per page" for contracts; picked the lower
 * end so a full page (header + rows + pager) comfortably fits a 1440x900
 * viewport alongside the sticky header + tab bar. */
export const CONTRACTS_PAGE_SIZE = 12
/** Founder-tuned: "show the most recent ~15" for activity. */
export const ACTIVITY_PAGE_SIZE = 15
/** Founder-tuned: "usually short; cap at ~10" for your-move's review rows. */
export const REVIEWS_PAGE_SIZE = 10

const [contractsPage, setContractsPage] = signal(1)
const [activityPage, setActivityPage] = signal(1)
const [reviewsPage, setReviewsPage] = signal(1)

export { activityPage, contractsPage, reviewsPage }

export function goToContractsPage(page: number): void {
  setContractsPage(page)
}
export function goToActivityPage(page: number): void {
  setActivityPage(page)
}
export function goToReviewsPage(page: number): void {
  setReviewsPage(page)
}

if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', () => {
    setActiveTab(tabFromHash())
    setContractsPage(1)
    setActivityPage(1)
    setReviewsPage(1)
  })
}
