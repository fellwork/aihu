/**
 * `useRoutePath` — the active pathname, reactively, for active-nav state.
 *
 * WHY THIS EXISTS. `site-header.aihu` and `docs.aihu` each carried a
 * byte-identical copy of this block in their `@state`:
 *
 *   let path = state('')
 *   onMount(() => {
 *     if (typeof location !== 'undefined') path = location.pathname
 *     if (typeof window !== 'undefined') {
 *       window.addEventListener('popstate', () => { path = location.pathname })
 *     }
 *   })
 *
 * Two copies is the threshold for extracting. But the duplication was also
 * hiding a BUG, which is the better argument: `popstate` fires only for
 * back/forward, NOT for the `pushState` navigation the SPA router actually
 * performs. `docs.aihu` accidentally compensated with a separate
 * `afterNavigate(syncPath)`; `site-header.aihu` had nothing, so the header's
 * active underline went stale the moment you clicked any in-app nav link and
 * stayed stale until a reload. Duplicated logic drifts, and one copy here had
 * silently drifted into being wrong.
 *
 * WHY IT DOES NOT READ `RouteContext`. The obvious implementation is
 * `inject(RouteContext)` + `ctx.current().pathname`, mirroring
 * `@aihu/use`'s `useRouteParams`. That does not work in this app, and the
 * reason is worth recording: `@aihu/app`'s `createApp()` never calls
 * `provideRouteContext`, so `inject(RouteContext)` resolves to `null` in every
 * `createApp`-based app. Tried it, and every nav link silently lost its active
 * class with no error at all. Filed against the framework separately — until
 * that is fixed, a router-context composable is a no-op here.
 *
 * So this tracks `location` directly, as a module-level singleton: ONE
 * `popstate` listener and one `pushState`/`replaceState` patch for the whole
 * app, no matter how many components call it. Patching the history methods is
 * how VueUse's `useBrowserLocation` solves the same problem — `pushState`
 * fires no event, so there is nothing else to listen to.
 *
 * Everything is exposed as FUNCTIONS so templates call `isActive('/guides')` /
 * `is(href)`. A bare getter compared with `===` in a template would compare
 * the function object and be silently always-false.
 */
import { signal } from '@aihu/signals'

const isBrowser = typeof window !== 'undefined' && typeof location !== 'undefined'

// Starts EMPTY even in the browser, then syncs on a microtask. That looks
// redundant but is load-bearing: a `class:active={...}` binding inside an
// `each` loop is applied on CHANGE, not re-evaluated at hydration, so a value
// that is already correct when the loop first renders never gets applied and
// the sidebar renders with nothing active. The previous per-component code
// worked precisely because it started at `''` and changed after `onMount`.
// Keeping that transition preserves the behavior while still being shared and
// pushState-aware.
const [pathname, setPathname] = signal('')

if (isBrowser) {
  const sync = (): void => setPathname(location.pathname)
  queueMicrotask(sync)

  // Back/forward only — pushState deliberately fires nothing.
  window.addEventListener('popstate', sync)

  // …so patch the two history methods the SPA router uses. Wrapped once at
  // module scope; the original is always called first so this stays
  // transparent to the router (and to anything else patching after us).
  for (const method of ['pushState', 'replaceState'] as const) {
    const original = history[method]
    history[method] = function patched(
      this: History,
      ...args: Parameters<History['pushState']>
    ): void {
      original.apply(this, args)
      sync()
    }
  }
}

export interface UseRoutePathReturn {
  /** The active pathname, e.g. `/guides/getting-started`. `''` during SSR. */
  readonly path: () => string
  /** `true` when the active path starts with `prefix` — for section nav. */
  readonly isActive: (prefix: string) => boolean
  /** `true` on an exact match — for individual links. */
  readonly is: (href: string) => boolean
}

/** Read the active pathname, updating on every navigation — pushState included. */
export function useRoutePath(): UseRoutePathReturn {
  return {
    path: pathname,
    isActive: (prefix: string) => pathname().startsWith(prefix),
    is: (href: string) => pathname() === href,
  }
}
