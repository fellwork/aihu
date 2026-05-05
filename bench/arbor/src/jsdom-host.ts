/**
 * JSDOM host helpers for the arbor bench harness.
 *
 * Each (workload × competitor × op) cycle wants a fresh `<div>` to mount into.
 * Reusing a host across cycles risks measurement contamination — orphaned
 * children, lingering event listeners, document-level observers. This module
 * gives every cell a clean root.
 *
 * One `JSDOM` instance is reused for the whole runner process; creating a new
 * `JSDOM` per cell would dominate the timing budget. The reused document is
 * the standard pattern lit and solid use in their own JSDOM-driven tests.
 *
 * `globalThis.document` is exposed because some libraries (preact, lit-html)
 * read `document` directly off the global. Spawn 1's aihu adapter doesn't,
 * but we set up the global once here so spawn 2 doesn't have to re-litigate it.
 */

import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://bench.local/',
  pretendToBeVisual: false,
})

// Expose the JSDOM document/window as globals so libs that resolve `document`
// off `globalThis` (preact, lit, htm) work without per-adapter shimming.
const g = globalThis as unknown as {
  window?: typeof dom.window
  document?: Document
  HTMLElement?: typeof HTMLElement
  Element?: typeof Element
  Node?: typeof Node
  Text?: typeof Text
}
g.window = dom.window
g.document = dom.window.document as unknown as Document
g.HTMLElement = dom.window.HTMLElement as unknown as typeof HTMLElement
g.Element = dom.window.Element as unknown as typeof Element
g.Node = dom.window.Node as unknown as typeof Node
g.Text = dom.window.Text as unknown as typeof Text

/** Returns a fresh `<div>` attached to `document.body`. */
export function getHost(): Element {
  const host = dom.window.document.createElement('div')
  dom.window.document.body.appendChild(host)
  return host as unknown as Element
}

/** Detach + clear `host`. Call after the workload's adapter has disposed. */
export function releaseHost(host: Element): void {
  // Defensive: clear children even though dispose() should have done so.
  while (host.firstChild) host.removeChild(host.firstChild)
  if (host.parentNode) host.parentNode.removeChild(host)
}
