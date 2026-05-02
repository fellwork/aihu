/**
 * `_hydrateOnVisible` — defer hydration until an element scrolls into view.
 *
 * Plan 3.3 (Islands): when a custom element opts into deferred hydration
 * via the `defer` attribute, the runtime registers an `IntersectionObserver`
 * on it. The supplied `hydrate` callback fires exactly once, the first time
 * the element intersects the viewport.
 *
 * Tree-shakeable: this module is only imported by the Vite plugin's
 * defer-aware emit path, so static islands and eager interactive islands
 * never pay for the IntersectionObserver code in their bundle.
 *
 * Falls back to immediate hydration when `IntersectionObserver` is missing
 * (older browsers, jsdom without polyfill, server-side prerender). The
 * fallback keeps semantics correct at the cost of the perf benefit.
 *
 * @internal
 */
export const _hydrateOnVisible = (element: HTMLElement, hydrate: () => void): void => {
  const obs: IntersectionObserver = new IntersectionObserver(([e]) => {
    e?.isIntersecting && (obs.disconnect(), hydrate())
  })
  obs.observe(element)
}
