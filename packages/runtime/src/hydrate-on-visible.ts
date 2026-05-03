/** @internal */
export const _hydrateOnVisible = (element: HTMLElement, hydrate: () => void): void => {
  const obs: IntersectionObserver = new IntersectionObserver(([e]) => {
    e?.isIntersecting && (obs.disconnect(), hydrate())
  })
  obs.observe(element)
}
