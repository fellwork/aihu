import { leaf } from './leaf.ts'
import type { Leaf } from './types.ts'

/**
 * `slot(name?)` — creates a `<slot>` DOM element for Shadow DOM content
 * projection per Plan 1.4.
 *
 * - `slot()` → `<slot>` — default slot; projects all parent light DOM
 *   children that don't match a named slot.
 * - `slot('header')` → `<slot name="header">` — named slot; projects light
 *   DOM children with `slot="header"`.
 *
 * Shadow DOM handles projection natively — no runtime magic is required
 * beyond creating the element with the correct `name` attribute. The `<slot>`
 * element is a terminal leaf (no arbor children) and follows the same
 * lifecycle as `leaf.element()`.
 *
 * Size budget: ≤ 50 B gz added to @scribe/arbor (Plan 1.4 acceptance §6).
 */
export const slot = (name?: string): Leaf =>
  leaf.element('slot', name !== undefined ? { name } : undefined)
